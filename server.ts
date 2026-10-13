import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { dbService } from './server/dbService';
import { keyManager } from './server/keyManager';
import { geminiService } from './server/geminiService';
import { groqService } from './server/groqService';
import { generateCsv, parseCsv } from './server/csvService';
import { calculateSeoScore } from './src/utils/seoEngine';
import { validateAndSanitizeMetadata } from './server/metadataValidator';
import { requireAuth, optionalAuth, AuthenticatedRequest } from './server/authMiddleware';
import { parseKeysFromText } from './src/utils/keyParser';

dotenv.config();

const app = express();
const PORT = 3000;

// Increase JSON payload limit for image thumbnails/base64 uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Allow the packaged Chrome extension to call this API from its extension origin.
// Web deployments remain same-origin; browser extension requests receive explicit CORS headers.
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const configuredExtensionOrigin = process.env.EXTENSION_ORIGIN || '';
  const isChromeExtensionOrigin = origin.startsWith('chrome-extension://');
  const isConfiguredOrigin = configuredExtensionOrigin && origin === configuredExtensionOrigin;

  if (isChromeExtensionOrigin || isConfiguredOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// 1. Health check
app.get('/api/health', (req, res) => {
  const geminiKeys = keyManager.getAvailableKeys('gemini');
  const groqKeys = keyManager.getAvailableKeys('groq');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasGeminiKey: geminiKeys.length > 0,
    hasGroqKey: groqKeys.length > 0,
  });
});

// API Key Management Endpoints
app.post('/api/keys/:id/active', (req, res) => {
  const success = dbService.setActiveApiKey(req.params.id);
  if (success) res.json({ success: true });
  else res.status(404).json({ error: 'Key not found' });
});

app.patch('/api/keys/:id', (req, res) => {
  const success = dbService.updateApiKey(req.params.id, { label: req.body.label });
  if (success) res.json({ success: true });
  else res.status(404).json({ error: 'Key not found' });
});

app.post('/api/ai/verify-gemini-key', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ valid: false, error: 'API key is required.' });
  const result = await geminiService.verifyKeyOnly(apiKey);
  res.json(result);
});

app.post('/api/ai/verify-groq-key', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ valid: false, error: 'API key is required.' });
  const result = await groqService.verifyKeyOnly(apiKey);
  res.json(result);
});

app.post('/api/ai/models/groq', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ models: [] });
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    if (!response.ok) return res.json({ models: [] });
    const data = await response.json();
    if (!Array.isArray(data.data)) return res.json({ models: [] });
    
    const models = data.data
      .filter((m: any) => m.active !== false && !m.id.includes('deprecated') && !m.id.includes('decommissioned'))
      .map((m: any) => ({
        id: m.id,
        name: m.id.split('/').pop() || m.id,
        provider: 'groq',
        description: `Groq LPU model (${m.id})`,
        isVisionCapable: m.id.includes('vision') || m.id.includes('qwen'),
        isRecommended: m.id.includes('qwen/qwen3.8-27b') || m.id.includes('3.2-11b'),
      }));
    res.json({ models });
  } catch (e) {
    res.json({ models: [] });
  }
});

app.post('/api/ai/models/gemini', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ models: [] });
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`
    );
    if (!response.ok) return res.json({ models: [] });
    const data = await response.json();
    if (!Array.isArray(data.models)) return res.json({ models: [] });
    
    const models = data.models
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => {
        const id = m.name?.replace(/^models\//, '') || '';
        return {
          id,
          name: m.displayName || id,
          provider: 'gemini',
          description: m.description || 'Google Gemini Model',
          isVisionCapable: true,
          isRecommended: id.includes('3.5') || id.includes('3.8') || id.includes('flash'),
        };
      });
    res.json({ models });
  } catch (e) {
    res.json({ models: [] });
  }
});

// 2. Fetch latest stock search trends
app.get('/api/trends', async (req, res) => {
  try {
    const keys = keyManager.getAvailableKeys('gemini');
    const rawKey = keys.length > 0 ? keys[0].rawKey : undefined;
    const trends = await geminiService.fetchStockTrends(rawKey);
    res.json({ trends });
  } catch (err) {
    console.error('[API Trends Error]:', err);
    res.status(500).json({ error: 'Failed to fetch search trends' });
  }
});

// 3. Generate metadata for an image
app.post('/api/generate', optionalAuth, async (req, res) => {
  try {
    const { imageBase64, mimeType, options, provider, model, keyId, clientKeys, autoFallback } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    const userId = (req as any).user?.id || 'guest';
    const result = await keyManager.executeGeneration(
      imageBase64,
      mimeType || 'image/jpeg',
      options || {
        marketplace: 'generic',
        assetType: 'photo',
        titleSettings: { mode: 'seo_balanced', length: 'medium' },
        keywordSettings: { targetCount: 40, minCount: 25, maxCount: 49, strategy: 'balanced' },
      },
      provider,
      model,
      keyId,
      clientKeys,
      autoFallback,
      userId
    );

    res.json({
      ...result,
      providerUsed: result.providerUsed || result.provider,
      modelUsed: result.modelUsed || result.model,
      keyIdUsed: result.keyIdUsed,
    });
  } catch (err: any) {
    console.error('Error generating metadata:', err);
    const status = err.status || err.statusCode || (err.message?.includes('401') ? 401 : err.message?.includes('429') ? 429 : 500);
    res.status(status).json({
      error: err.message || 'Metadata generation failed. Please check your API keys or try again.',
      status,
    });
  }
});

// 3. Quick Title Optimizer
app.post('/api/optimize-title', optionalAuth, async (req, res) => {
  try {
    const { currentTitle, context, provider } = req.body;
    const geminiKey = keyManager.getAvailableKeys('gemini')[0];
    if (!geminiKey) {
      return res.status(400).json({ error: 'No active Gemini API key available for optimization.' });
    }

    const optimized = await geminiService.optimizeTitle(currentTitle, context || {}, geminiKey.rawKey);
    res.json({ optimizedTitle: optimized });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Title optimization failed' });
  }
});

// 4. Quick Description Optimizer
app.post('/api/optimize-description', optionalAuth, async (req, res) => {
  try {
    const { currentDescription, title } = req.body;
    const geminiKey = keyManager.getAvailableKeys('gemini')[0];
    if (!geminiKey) {
      return res.status(400).json({ error: 'No active Gemini API key available for optimization.' });
    }

    const optimized = await geminiService.optimizeDescription(currentDescription, title || '', geminiKey.rawKey);
    res.json({ optimizedDescription: optimized });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Description optimization failed' });
  }
});

// 5. SEO score calculation endpoint
app.post('/api/seo-score', optionalAuth, (req, res) => {
  try {
    const { metadata, marketplace } = req.body;
    const result = calculateSeoScore(metadata || {}, marketplace || 'generic');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'SEO calculation error' });
  }
});

// 6. Project endpoints (User-Scoped / Guest Friendly)
app.get('/api/projects', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || 'guest';
    const projs = dbService.getProjects(userId);
    res.json(Array.isArray(projs) ? projs : []);
  } catch (err: any) {
    console.error('Error in GET /api/projects:', err);
    res.json([]);
  }
});

app.get('/api/projects/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || 'guest';
    const proj = dbService.getProject(req.params.id, userId);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    res.json(proj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const proj = req.body;
    if (!proj || typeof proj !== 'object') {
      return res.status(400).json({ error: 'Project data is required' });
    }
    const userId = req.user?.id || 'guest';
    if (!proj.id) proj.id = `proj-${Date.now()}`;
    if (!proj.name) proj.name = 'Untitled Project';
    const saved = dbService.saveProject(proj, userId);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/projects/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const proj = req.body;
    proj.id = req.params.id;
    const userId = req.user?.id || 'guest';
    const saved = dbService.saveProject(proj, userId);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || 'guest';
    const ok = dbService.deleteProject(req.params.id, userId);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper for bulk key extraction and cleaning
function parseKeysInput(input: string | string[]): string[] {
  if (Array.isArray(input)) {
    return input.map((k) => String(k).trim()).filter(Boolean);
  }
  if (!input || typeof input !== 'string') return [];
  return parseKeysFromText(input).tokens;
}

// 7. API Keys management endpoints (Authenticated & User-Scoped)
app.get('/api/keys', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const keys = dbService.getClientApiKeys(userId);
    res.json(Array.isArray(keys) ? keys : []);
  } catch (err: any) {
    console.error('Error in GET /api/keys:', err);
    res.json([]);
  }
});

// Bulk API key import endpoint
app.post('/api/keys/bulk', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { provider, keysText, keys, labelPrefix } = req.body;
    if (!provider || (provider !== 'gemini' && provider !== 'groq')) {
      return res.status(400).json({ error: 'Valid provider (gemini or groq) is required' });
    }

    const rawCandidates = parseKeysInput(keysText || keys || '');
    const userId = req.user?.id;

    const result = dbService.addApiKeysBulk(provider, rawCandidates, userId, labelPrefix);

    res.json({
      totalDetected: result.totalDetected,
      added: result.added.length,
      duplicatesSkipped: result.duplicatesSkipped,
      invalidKeysSkipped: result.invalidKeysSkipped,
      addedKeys: result.added.map((k) => ({
        id: k.id,
        userId: k.userId,
        provider: k.provider,
        label: k.label,
        maskedKey: k.maskedKey,
        enabled: k.enabled,
        status: k.status,
        requestCount: k.requestCount,
        successCount: k.successCount,
        failureCount: k.failureCount,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Bulk key import failed' });
  }
});

app.post('/api/keys', requireAuth, (req: AuthenticatedRequest, res) => {
  console.log('POST /api/keys received:', req.body);
  try {
    const { id, provider, label, key } = req.body;
    if (!key || !provider) {
      console.log('Missing key or provider:', req.body);
      return res.status(400).json({ error: 'Provider and Key are required' });
    }
    const userId = req.user?.id;
    const added = dbService.addApiKey(provider, label || '', key, userId, id);
    console.log('Key added successfully:', added.id);
    res.json({
      id: added.id,
      userId: added.userId,
      provider: added.provider,
      label: added.label,
      maskedKey: added.maskedKey,
      enabled: added.enabled,
      status: added.status,
    });
  } catch (err: any) {
    console.error('Error in POST /api/keys:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/keys/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const ok = dbService.updateApiKey(req.params.id, req.body, userId);
  res.json({ success: ok });
});

app.delete('/api/keys/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const ok = dbService.deleteApiKey(req.params.id, userId);
  res.json({ success: ok });
});

app.delete('/api/keys', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const provider = req.query.provider as ('gemini' | 'groq' | 'openai') | undefined;
    const count = dbService.deleteAllApiKeys(provider, userId);
    res.json({ success: true, deletedCount: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/keys/test', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id, rawKey, provider: bodyProvider } = req.body;
    const userId = req.user?.id;

    let targetKey = '';
    let targetProvider: 'gemini' | 'groq' = bodyProvider === 'groq' ? 'groq' : 'gemini';
    let keyObj: any = null;

    if (id) {
      keyObj = dbService.getRawApiKeys(userId).find((k) => k.id === id);
      if (keyObj) {
        targetKey = keyObj.rawKey;
        targetProvider = keyObj.provider;
      } else if (rawKey && typeof rawKey === 'string') {
        targetKey = rawKey.trim();
      } else {
        return res.status(404).json({ error: 'Key not found' });
      }
    } else if (rawKey && typeof rawKey === 'string') {
      targetKey = rawKey.trim();
    } else {
      return res.status(400).json({ error: 'Either key id or rawKey is required.' });
    }

    const clean = targetKey.trim();
    let testSuccess = false;
    let testMessage = '';
    let testError = '';
    let discoveredModels: string[] = [];

    // Wrong Provider Detection using actual APIs and formats
    if (targetProvider === 'gemini') {
      if (clean.startsWith('gsk_')) {
        testSuccess = false;
        testError = 'Wrong provider. This appears to be a Groq API key.';
      } else {
        const geminiRes = await geminiService.verifyKey(clean);
        testSuccess = geminiRes.success;
        if (testSuccess) {
          testMessage = 'Google Gemini API key verified and operational!';
          discoveredModels = await geminiService.discoverModels(clean);
        } else {
          // Double check if it is a Groq key
          const isGroq = await groqService.verifyKeyOnly(clean).then(r => r.valid).catch(() => false);
          if (isGroq) {
            testError = 'Wrong provider. This appears to be a Groq API key.';
          } else {
            testError = geminiRes.error || 'Gemini API key verification failed.';
          }
        }
      }
    } else { // groq
      if (clean.startsWith('AIzaSy')) {
        testSuccess = false;
        testError = 'Wrong provider. This appears to be a Gemini API key.';
      } else {
        const groqRes = await groqService.verifyKeyOnly(clean);
        testSuccess = groqRes.valid;
        if (testSuccess) {
          testMessage = 'Groq key is valid and operational!';
          discoveredModels = await groqService.discoverModels(clean);
        } else {
          // Double check if it is a Gemini key
          const isGemini = await geminiService.verifyKeyOnly(clean).then(r => r.valid).catch(() => false);
          if (isGemini) {
            testError = 'Wrong provider. This appears to be a Gemini API key.';
          } else {
            testError = groqRes.error || 'Groq API key verification failed.';
          }
        }
      }
    }

    if (testSuccess) {
      const nowStr = new Date().toISOString();
      const defaultModel = targetProvider === 'gemini' ? 'gemini-3.8-flash' : 'llama-3.2-11b-vision-preview';
      
      if (keyObj) {
        dbService.updateApiKey(keyObj.id, {
          status: 'active',
          lastTested: nowStr,
          discoveredModels,
          selectedModel: keyObj.selectedModel || discoveredModels[0] || defaultModel,
          lastError: undefined
        }, userId);
        dbService.recordKeyUsage(keyObj.id, true);
      }
      res.json({ success: true, message: testMessage, discoveredModels });
    } else {
      if (keyObj) {
        dbService.updateApiKey(keyObj.id, {
          status: 'error',
          lastTested: new Date().toISOString(),
          lastError: testError
        }, userId);
        dbService.recordKeyUsage(keyObj.id, false, testError);
      }
      res.status(400).json({ success: false, error: testError || 'Key test failed' });
    }
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Key test failed' });
  }
});

// 8. Statistics and settings (Authenticated)
app.get('/api/stats', requireAuth, (req, res) => {
  res.json(dbService.getStats());
});

app.post('/api/stats/reset', requireAuth, (req, res) => {
  res.json(dbService.resetStats());
});

app.get('/api/settings', requireAuth, (req, res) => {
  res.json(dbService.getSettings());
});

app.put('/api/settings', requireAuth, (req, res) => {
  const updated = dbService.updateSettings(req.body);
  res.json(updated);
});

// 9. CSV Export endpoint (Authenticated)
app.post('/api/csv/export', requireAuth, (req, res) => {
  try {
    const { assets, marketplace } = req.body;
    if (!Array.isArray(assets)) {
      return res.status(400).json({ error: 'Assets array required' });
    }

    const csvContent = generateCsv(assets, marketplace || 'generic');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="stock_metadata_${marketplace || 'generic'}.csv"`);
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. CSV Import endpoint (Authenticated)
app.post('/api/csv/import', requireAuth, (req, res) => {
  try {
    const { csvText } = req.body;
    if (!csvText) {
      return res.status(400).json({ error: 'CSV text is required' });
    }
    const result = parseCsv(csvText);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vite middleware / production serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Stock Metadata Pro AI server running on http://localhost:${PORT}`);
  });
}

// Global Error Handler to catch uncaught exceptions and return JSON
app.use((err: any, req: any, res: any, next: any) => {
  console.error('[Global Server Error]:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'An unexpected server error occurred.',
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });
});

// Automatically start server in standalone / container / Cloud Run mode.
// In Vercel serverless functions, the exported app is handled by api/index.ts.
const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION);
if (!isVercel) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
  });
}

export { app };
export default app;
