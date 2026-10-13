import {
  Project,
  ApiKeyEntry,
  ApiUsageStats,
  ProcessingSettings,
  StockAsset,
  Marketplace,
  PromptBuildOptions,
  StockMetadata,
  AIProvider,
  BulkImportResult,
} from '../types';
import { resolveEffectiveModel } from './aiModelService';
import {
  getClientApiKeys,
  saveClientApiKey,
  saveClientApiKeysBulk,
  updateClientApiKey,
  deleteClientApiKey,
  getActiveClientKey,
  getRotatedClientKeys,
  recordClientKeyUsage,
  getClientRawKey,
  setActiveStorageUserId,
  deleteAllClientApiKeys,
  setActiveClientApiKey,
} from './clientKeyStorage';

export {
  getClientRawKey,
  getClientApiKeys,
  getActiveClientKey,
  getRotatedClientKeys,
};
import {
  verifyGeminiKeyClient,
  verifyGroqKeyClient,
  generateMetadataClientWithGemini,
  generateMetadataClientWithGroq,
  optimizeTitleClient,
  optimizeDescriptionClient,
} from './clientAiService';
import { executeAIProviderGeneration } from './aiAdapters';
import { downloadCsvClientDirect } from './csvClientService';
import { supabase, isSupabaseConfigured } from './supabaseClient';


/** Resolve API routes for both the hosted web app and the packaged Chrome extension.
 * The extension stores its backend origin in localStorage from options.html.
 * The URL must be an HTTPS origin, not a path.
 */
export function apiUrl(path: string): string {
  const route = path.startsWith('/') ? path : `/${path}`;
  let configured = '';
  try {
    if (typeof localStorage !== 'undefined') {
      configured = (localStorage.getItem('stock_pro_api_base_url') || '').trim();
    }
  } catch { /* storage may be unavailable */ }
  if (!configured && typeof window !== 'undefined' && window.location.protocol !== 'chrome-extension:') {
    return route;
  }
  if (!configured) {
    throw new Error('Backend URL is not configured. Open Stock Metadata Pro AI Extension settings and enter your deployed HTTPS backend URL.');
  }
  const normalized = configured.replace(/\/+$/, '');
  if (!/^https:\/\//i.test(normalized)) {
    throw new Error('Backend URL must start with https://');
  }
  return `${normalized}${route}`;
}

const LOCAL_PROJECTS_KEY = 'stock_pro_projects_backup';
const LOCAL_SETTINGS_KEY = 'stock_pro_settings_backup';

let currentAuthToken: string | null = null;
let currentUserId: string | null = null;

export function setAuthToken(token: string | null, userId?: string | null) {
  currentAuthToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('stock_pro_auth_token', token);
    } else {
      localStorage.removeItem('stock_pro_auth_token');
    }
  }
  if (userId) {
    currentUserId = userId;
  } else if (token?.startsWith('smp_token_')) {
    const parts = token.split('_');
    currentUserId = parts.slice(2, -1).join('_') || parts[2] || null;
  } else if (!token) {
    currentUserId = null;
  }
  setActiveStorageUserId(currentUserId);
}

export function getAuthToken(): string | null {
  return currentAuthToken || (typeof window !== 'undefined' ? localStorage.getItem('stock_pro_auth_token') : null);
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}

export function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = currentAuthToken || (typeof window !== 'undefined' ? localStorage.getItem('stock_pro_auth_token') : null) || 'smp_token_guest_client';
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

type AuthExpirationHandler = (message: string) => void;
let authExpirationHandler: AuthExpirationHandler | null = null;

export function setOnAuthExpired(handler: AuthExpirationHandler | null) {
  authExpirationHandler = handler;
}

export function handleAuthResponse(res: Response): boolean {
  if (res.status === 401) {
    if (authExpirationHandler) {
      authExpirationHandler('Your session has expired. Please log in again.');
    }
    return false;
  }
  return true;
}

function getUserProjectsKey(): string {
  return currentUserId ? `stock_pro_projects_${currentUserId}` : LOCAL_PROJECTS_KEY;
}

let isServerAvailableCached: boolean | null = null;
let lastServerCheckTime = 0;
const SERVER_CHECK_COOLDOWN_MS = 10000; // 10 seconds cooldown

export async function isServerRunning(): Promise<boolean> {
  const now = Date.now();
  if (isServerAvailableCached !== null && (now - lastServerCheckTime < SERVER_CHECK_COOLDOWN_MS)) {
    return isServerAvailableCached;
  }

  try {
    const res = await fetch(apiUrl('/api/health'), { method: 'GET' });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json().catch(() => null);
      if (data && data.status === 'ok') {
        isServerAvailableCached = true;
        lastServerCheckTime = now;
        return true;
      }
    }
  } catch {
    // Network error or server not reachable
  }

  isServerAvailableCached = false;
  lastServerCheckTime = now;
  return false;
}

export async function checkApiHealth() {
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/health'));
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {}
  }

  const geminiKey = getActiveClientKey('gemini');
  const groqKey = getActiveClientKey('groq');
  return {
    status: 'ok',
    mode: 'client',
    hasGeminiKey: Boolean(geminiKey),
    hasGroqKey: Boolean(groqKey),
  };
}

import { metadataCache } from './metadataCache';

export async function requestGenerateMetadata(
  imageBase64: string,
  mimeType: string,
  options: PromptBuildOptions,
  provider?: AIProvider,
  model?: string,
  keyId?: string
): Promise<{ metadata: StockMetadata; provider: string; keyLabel: string; model?: string; providerUsed?: string; modelUsed?: string; keyIdUsed?: string }> {
  const targetProvider: AIProvider = provider === 'groq' ? 'groq' : 'gemini';
  
  let autoFallback = false;
  let autoRotation = true;
  let selectedModel: string | undefined = model;
  let targetKeyId: string | undefined = keyId;

  try {
    const saved = localStorage.getItem('stock_pro_settings_backup');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.autoFallback !== undefined) autoFallback = parsed.autoFallback;
      if (parsed.autoRotation !== undefined) autoRotation = parsed.autoRotation;
      if (!selectedModel) {
        if (targetProvider === 'gemini') selectedModel = parsed.geminiModel;
        else if (targetProvider === 'groq') selectedModel = parsed.groqModel;
      }
    }
  } catch (e) {}

  if (!targetKeyId) {
    const activeKey = getActiveClientKey(targetProvider);
    if (activeKey) {
      targetKeyId = activeKey.entry.id;
    }
  }

  selectedModel = resolveEffectiveModel(targetProvider, selectedModel);

  // Check client metadata cache for instant response without API roundtrip
  const hashKey = options.fileContentHash || imageBase64.slice(0, 120);
  const cacheKey = metadataCache.generateKey(hashKey, options, targetProvider, selectedModel);
  if (!options.bypassCache) {
    const cached = metadataCache.get(cacheKey);
    if (cached) {
      return {
        metadata: cached.metadata,
        provider: cached.provider,
        providerUsed: cached.provider,
        keyLabel: `${cached.keyLabel} (Cached)`,
        model: cached.model,
        modelUsed: cached.model,
      };
    }
  }

  const serverActive = await isServerRunning();
  let lastServerError: any = null;

  // Attempt server generation if an Express backend is active
  if (serverActive) {
    let serverAttempts = 0;
    const maxServerAttempts = 3;

    while (serverAttempts < maxServerAttempts) {
      serverAttempts++;
      try {
        const clientGeminiKeys = getRotatedClientKeys('gemini').map((k) => ({
          provider: 'gemini',
          id: k.entry.id,
          label: k.entry.label,
          rawKey: k.rawKey,
        }));
        const clientGroqKeys = getRotatedClientKeys('groq').map((k) => ({
          provider: 'groq',
          id: k.entry.id,
          label: k.entry.label,
          rawKey: k.rawKey,
        }));
        const clientKeys = [...clientGeminiKeys, ...clientGroqKeys];

        const res = await fetch(apiUrl('/api/generate'), {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            imageBase64,
            mimeType,
            options,
            provider: targetProvider,
            model: selectedModel,
            keyId: targetKeyId,
            clientKeys,
            autoFallback,
          }),
        });

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const result = await res.json();
          if (result && result.metadata) {
            metadataCache.set(cacheKey, result.metadata, result.provider || targetProvider, result.keyLabel || 'Server', result.model || selectedModel);
          }
          return {
            ...result,
            providerUsed: result.providerUsed || result.provider || targetProvider,
            modelUsed: result.modelUsed || result.model || selectedModel,
          };
        }

        if (contentType.includes('application/json')) {
          const json = await res.json().catch(() => ({}));
          if (json && json.error) {
            throw new Error(json.error);
          }
        }

        if (res.status === 404 || res.status === 405) {
          isServerAvailableCached = false;
          break; // Don't retry non-recoverable routes or missing server endpoints
        }

        if (!contentType.includes('application/json')) {
          throw new Error(`HTTP ${res.status} (Non-JSON response)`);
        }

        throw new Error(`HTTP ${res.status}`);
      } catch (err: any) {
        lastServerError = err;
        const msg = err?.message || '';
        const isNetworkError =
          msg.includes('fetch') ||
          msg.includes('NetworkError') ||
          msg.includes('Failed to fetch') ||
          msg.includes('timeout') ||
          msg.includes('HTTP 502') ||
          msg.includes('HTTP 503') ||
          msg.includes('HTTP 504');

        if (!isNetworkError) {
          throw err; // Fail-fast for logic/auth/rate limit errors so KeyManager can rotate/retry
        }

        if (serverAttempts < maxServerAttempts) {
          console.warn(`[Stock Pro AI] Server fetch failed (Attempt ${serverAttempts}/${maxServerAttempts}). Retrying in ${serverAttempts * 1.5}s...`);
          await new Promise((resolve) => setTimeout(resolve, serverAttempts * 1500));
        } else {
          isServerAvailableCached = null; // Clear cache so health check re-runs next time
        }
      }
    }
  }

  // --- CLIENT-SIDE GENERATION FALLBACK ---
  console.log('[Stock Pro AI] Running client-side metadata generation...');
  let candidateKeys = getRotatedClientKeys(targetProvider);
  if (!autoRotation && candidateKeys.length > 0) {
    candidateKeys = [candidateKeys[0]];
  }

  const fallbackProvider = targetProvider === 'gemini' ? 'groq' : 'gemini';
  let fallbackKeys = getRotatedClientKeys(fallbackProvider);
  if (!autoRotation && fallbackKeys.length > 0) {
    fallbackKeys = [fallbackKeys[0]];
  }

  let keysToTry = [...candidateKeys];
  if (targetKeyId) {
    const specificKey = getRotatedClientKeys(targetProvider).find(k => k.entry.id === targetKeyId) ||
                       getRotatedClientKeys(fallbackProvider).find(k => k.entry.id === targetKeyId);
    if (specificKey) {
      keysToTry = [specificKey, ...keysToTry.filter(k => k.entry.id !== targetKeyId)];
    }
  }

  if (autoFallback) {
    keysToTry = [...keysToTry, ...fallbackKeys.filter(fk => !keysToTry.some(k => k.entry.id === fk.entry.id))];
  }

  if (keysToTry.length === 0) {
    throw lastServerError || new Error(
      'No active API key found. Please open AI Settings and add your API key.'
    );
  }

  let lastClientError: any = null;
  for (const activeKey of keysToTry) {
    try {
      const activeProvider = activeKey.entry.provider as 'gemini' | 'groq';
      let modelToUse = selectedModel;
      if (activeProvider !== targetProvider) {
        try {
          const saved = localStorage.getItem('stock_pro_settings_backup');
          if (saved) {
            const parsed = JSON.parse(saved);
            modelToUse = activeProvider === 'gemini' ? parsed.geminiModel : parsed.groqModel;
          }
        } catch {}
      }
      modelToUse = resolveEffectiveModel(activeProvider, modelToUse);

      let metadata: StockMetadata;
      if (activeProvider === 'groq') {
        metadata = await generateMetadataClientWithGroq(
          imageBase64,
          mimeType,
          options,
          activeKey.rawKey,
          modelToUse
        );
      } else {
        metadata = await generateMetadataClientWithGemini(
          imageBase64,
          mimeType,
          options,
          activeKey.rawKey,
          modelToUse
        );
      }

      recordClientKeyUsage(activeKey.entry.id, true);
      metadataCache.set(cacheKey, metadata, activeProvider, activeKey.entry.label, modelToUse);

      return {
        metadata,
        provider: activeProvider,
        providerUsed: activeProvider,
        keyLabel: activeKey.entry.label,
        model: modelToUse,
        modelUsed: modelToUse,
        keyIdUsed: activeKey.entry.id,
      };
    } catch (err: any) {
      lastClientError = err;
      recordClientKeyUsage(activeKey.entry.id, false, err?.message);
      console.warn(
        `Client key ${activeKey.entry.label} failed (${err?.message || err}). Trying next...`
      );
      if (!autoRotation && !autoFallback) {
        break;
      }
    }
  }

  throw lastClientError || lastServerError || new Error('All configured client API keys failed.');
}

export async function requestOptimizeTitle(
  currentTitle: string,
  context: { category?: string; keywords?: string[]; marketplace?: string }
): Promise<string> {
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/optimize-title'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ currentTitle, context }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const json = await res.json();
        return json.optimizedTitle;
      }
    } catch {
      isServerAvailableCached = null;
    }
  }

  const activeKey = getActiveClientKey('gemini');
  if (activeKey) {
    return optimizeTitleClient(currentTitle, context, activeKey.rawKey);
  }
  return currentTitle;
}

export async function requestOptimizeDescription(
  currentDescription: string,
  title: string
): Promise<string> {
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/optimize-description'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ currentDescription, title }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const json = await res.json();
        return json.optimizedDescription;
      }
    } catch {
      isServerAvailableCached = null;
    }
  }

  const activeKey = getActiveClientKey('gemini');
  if (activeKey) {
    return optimizeDescriptionClient(currentDescription, title, activeKey.rawKey);
  }
  return currentDescription;
}

export async function fetchProjects(): Promise<Project[]> {
  // 1. Supabase Cloud Database (Isolated by User via RLS)
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        const mapped: Project[] = data.map((row: any) => ({
          id: row.id,
          userId: row.user_id,
          name: row.name,
          description: row.description || '',
          marketplace: row.marketplace || 'generic',
          assetType: row.asset_type || 'photo',
          titleSettings: row.title_settings || { maxLength: 70 },
          keywordSettings: row.keyword_settings || { targetCount: 30 },
          items: Array.isArray(row.items) ? row.items : [],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
        try {
          localStorage.setItem(getUserProjectsKey(), JSON.stringify(mapped));
        } catch {}
        return mapped;
      }
    } catch (err) {
      console.warn('Supabase projects fetch error, falling back:', err);
    }
  }

  // 2. Express Server with Auth Header
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/projects'), {
        headers: getAuthHeaders(),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          try {
            localStorage.setItem(getUserProjectsKey(), JSON.stringify(data));
          } catch {}
          return data;
        }
      }
    } catch (err) {
      console.warn('Could not fetch projects from server, checking local backup:', err);
    }
  }

  // 3. User-Scoped Local Storage Cache
  try {
    const saved = localStorage.getItem(getUserProjectsKey());
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  return [];
}

export async function saveProjectApi(project: Project): Promise<Project> {
  // Always update client-side user-scoped backup
  try {
    const existing = await fetchProjects();
    const idx = existing.findIndex((p) => p.id === project.id);
    let updated: Project[];
    if (idx >= 0) {
      updated = [...existing];
      updated[idx] = project;
    } else {
      updated = [project, ...existing];
    }
    localStorage.setItem(getUserProjectsKey(), JSON.stringify(updated));
  } catch {}

  // Save to Supabase Cloud Database if configured
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id || currentUserId;
      if (userId) {
        await supabase.from('projects').upsert({
          id: project.id,
          user_id: userId,
          name: project.name,
          description: project.description || '',
          marketplace: project.marketplace,
          asset_type: project.assetType,
          title_settings: project.titleSettings,
          keyword_settings: project.keywordSettings,
          items: project.items || [],
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('Could not upsert project to Supabase:', err);
    }
  }

  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl(`/api/projects/${project.id}`), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(project),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch (err) {
      console.warn('Could not sync project with server, kept local copy:', err);
    }
  }

  return project;
}

export async function deleteProjectApi(id: string): Promise<boolean> {
  try {
    const saved = localStorage.getItem(getUserProjectsKey());
    if (saved) {
      const parsed: Project[] = JSON.parse(saved);
      const filtered = parsed.filter((p) => p.id !== id);
      localStorage.setItem(getUserProjectsKey(), JSON.stringify(filtered));
    }
  } catch {}

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('projects').delete().eq('id', id);
    } catch (err) {
      console.warn('Could not delete project from Supabase:', err);
    }
  }

  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl(`/api/projects/${id}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch {
      return true;
    }
  }

  return true;
}

export async function fetchApiKeys(): Promise<ApiKeyEntry[]> {
  const clientKeys = getClientApiKeys();
  const serverActive = await isServerRunning();

  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/keys'), {
        headers: getAuthHeaders(),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const serverKeys = await res.json();
        if (Array.isArray(serverKeys)) {
          // Merge server keys with any custom client keys
          const merged = [...serverKeys];
          for (const ck of clientKeys) {
            const isDuplicate = merged.some((sk) => {
              if (sk.id === ck.id) return true;
              if (sk.provider === ck.provider && sk.maskedKey === ck.maskedKey) return true;
              return false;
            });
            if (!isDuplicate) {
              merged.push(ck);
            }
          }
          return merged;
        }
      }
    } catch (err) {
      console.warn('Could not fetch API keys from server, using client keys:', err);
    }
  }

  return clientKeys;
}

export async function addApiKeyApi(
  provider: 'gemini' | 'groq' | 'openai',
  label: string,
  key: string
): Promise<ApiKeyEntry> {
  const cleanKey = key.trim();
  if (!cleanKey) {
    throw new Error('API key cannot be empty');
  }

  // 1. Always save in client storage first to guarantee persistence
  const clientEntry = saveClientApiKey(provider, label, cleanKey);

  // 2. Also sync to server if running
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/keys'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: clientEntry.id, provider, label, key: cleanKey }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const serverKey = await res.json();
        return serverKey;
      }
    } catch (err) {
      console.warn('Could not sync key to server, preserved locally:', err);
    }
  }

  return clientEntry;
}

import { parseKeysFromText } from './keyParser';

export function parseRawKeysText(input: string): string[] {
  return parseKeysFromText(input).tokens;
}

export async function addApiKeysBulkApi(
  provider: 'gemini' | 'groq',
  keysText: string,
  labelPrefix?: string
): Promise<BulkImportResult> {
  const candidates = parseRawKeysText(keysText);
  if (candidates.length === 0) {
    return {
      totalDetected: 0,
      added: 0,
      duplicatesSkipped: 0,
      invalidKeysSkipped: 0,
      addedKeys: [],
    };
  }

  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/keys/bulk'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          provider,
          keys: candidates,
          labelPrefix,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const result: BulkImportResult = await res.json();
        return result;
      }
    } catch (err) {
      console.warn('Server bulk key import failed, falling back to client storage:', err);
    }
  }

  // Fallback to client-side bulk storage
  return saveClientApiKeysBulk(provider, candidates, labelPrefix);
}

export async function updateApiKeyApi(
  id: string,
  updates: Partial<{ label: string; enabled: boolean; status: string; lastError?: string }>
): Promise<boolean> {
  // Update client storage if it's a client key
  updateClientApiKey(id, updates as any);

  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl(`/api/keys/${id}`), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(updates),
      });
      return res.ok;
    } catch {
      return true;
    }
  }

  return true;
}

export async function deleteApiKeyApi(id: string): Promise<boolean> {
  // Delete from client storage
  deleteClientApiKey(id);

  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl(`/api/keys/${id}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch {
      return true;
    }
  }

  return true;
}

export async function restoreDefaultApiKeysApi(): Promise<ApiKeyEntry[]> {
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/keys/restore-defaults'), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {}
  }

  return getClientApiKeys();
}

export async function testApiKeyApi(
  id: string
): Promise<{ success: boolean; message?: string; error?: string; discoveredModels?: string[] }> {
  try {
    const res = await fetch(apiUrl('/api/keys/test'), {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      return {
        success: true,
        message: data.message,
        discoveredModels: data.discoveredModels,
      };
    } else {
      if (contentType.includes('application/json')) {
        const data = await res.json();
        return {
          success: false,
          error: data.error || `Key test failed (HTTP ${res.status})`,
        };
      }
      if (res.status === 404) {
        return { success: false, error: 'API route not found (HTTP 404). Please verify your Vercel routing configuration.' };
      }
      if (res.status === 401) {
        return { success: false, error: 'Unauthorized (HTTP 401). Invalid key or expired session.' };
      }
      if (res.status === 403) {
        return { success: false, error: 'Forbidden (HTTP 403). Access denied.' };
      }
      if (res.status === 429) {
        return { success: false, error: 'Rate limit exceeded (HTTP 429). Please try again later.' };
      }
      return { success: false, error: `Server error (HTTP ${res.status}). Could not complete key test.` };
    }
  } catch (err: any) {
    return { success: false, error: `Could not contact server to test key: ${err.message || err}` };
  }
}

export async function testRawApiKeyApi(
  rawKey: string,
  provider: 'gemini' | 'groq'
): Promise<{ success: boolean; message?: string; error?: string; discoveredModels?: string[] }> {
  try {
    const res = await fetch(apiUrl('/api/keys/test'), {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ rawKey, provider }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      return {
        success: true,
        message: data.message,
        discoveredModels: data.discoveredModels,
      };
    } else {
      if (contentType.includes('application/json')) {
        const data = await res.json();
        return {
          success: false,
          error: data.error || `Key test failed (HTTP ${res.status})`,
        };
      }
      if (res.status === 404) {
        return { success: false, error: 'API route not found (HTTP 404). Please verify your Vercel routing configuration.' };
      }
      if (res.status === 401) {
        return { success: false, error: 'Unauthorized (HTTP 401). Invalid key or expired session.' };
      }
      if (res.status === 403) {
        return { success: false, error: 'Forbidden (HTTP 403). Access denied.' };
      }
      if (res.status === 429) {
        return { success: false, error: 'Rate limit exceeded (HTTP 429). Please try again later.' };
      }
      return { success: false, error: `Server error (HTTP ${res.status}). Could not complete key test.` };
    }
  } catch (err: any) {
    return { success: false, error: `Could not contact server to test key: ${err.message || err}` };
  }
}

export async function fetchUsageStats(): Promise<ApiUsageStats> {
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/stats'), {
        headers: getAuthHeaders(),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {}
  }

  return {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitedRequests: 0,
    imagesProcessed: 0,
    avgProcessingTimeMs: 0,
  };
}

export async function resetUsageStats(): Promise<ApiUsageStats> {
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/stats/reset'), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {}
  }
  return fetchUsageStats();
}

export async function fetchSettingsApi(): Promise<ProcessingSettings> {
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/settings'), {
        headers: getAuthHeaders(),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {}
  }

  try {
    const saved = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}

  return {
    concurrency: 3,
    retryCount: 2,
    preferredProvider: 'gemini',
    groqModel: 'llama-3.2-11b-vision-preview',
    geminiModel: 'gemini-3.8-flash',
    autoRotation: true,
    autoFallback: true,
  };
}

export async function updateSettingsApi(
  settings: Partial<ProcessingSettings>
): Promise<ProcessingSettings> {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}

  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/settings'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(settings),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {}
  }

  return settings as ProcessingSettings;
}

/**
 * Downloads CSV file. If server export is unavailable (Vercel, Netlify),
 * creates and downloads directly in browser.
 */
export async function downloadCsvFile(
  assets: StockAsset[],
  marketplace: Marketplace,
  customFileName?: string
) {
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/csv/export'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ assets, marketplace }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const fileName =
          customFileName || `stock_metadata_${marketplace}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.setAttribute('download', fileName);
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return;
      }
    } catch {}
  }

  // Fallback to pure client-side CSV generation
  downloadCsvClientDirect(assets, marketplace, customFileName);
}

export async function importCsvApi(csvText: string) {
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const res = await fetch(apiUrl('/api/csv/import'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ csvText }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {}
  }

  return { parsedRows: 0, matchedAssets: 0 };
}

export async function setActiveApiKeyApi(id: string): Promise<boolean> {
  // Update local storage instantly for offline resilience and snappiness
  setActiveClientApiKey(id);

  const serverActive = await isServerRunning();
  if (serverActive) {
    const res = await fetch(apiUrl(`/api/keys/${id}/active`), {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return res.ok;
  }
  return true;
}

export async function renameApiKeyApi(id: string, label: string): Promise<boolean> {
  const serverActive = await isServerRunning();
  if (serverActive) {
    const res = await fetch(apiUrl(`/api/keys/${id}`), {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ label }),
    });
    return res.ok;
  }
  return false;
}

export async function deleteAllKeysApi(provider?: 'gemini' | 'groq' | 'openai'): Promise<boolean> {
  // 1. Purge from client localStorage first
  deleteAllClientApiKeys(provider);

  // 2. Also delete from server if running
  const serverActive = await isServerRunning();
  if (serverActive) {
    try {
      const url = provider ? `/api/keys?provider=${provider}` : '/api/keys';
      const res = await fetch(apiUrl(url), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.warn('Could not delete keys from server, cleaned locally:', err);
      return true;
    }
  }
  return true;
}
