import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import {
  PromptBuildOptions,
  buildSystemInstruction,
  buildUserPrompt,
  validateAndSanitizeMetadata,
  populateMarketplaceAwareMetadata,
} from '../src/utils/metadataEngine';
import { StockMetadata } from '../src/types';

export const ACTIVE_GEMINI_MODEL = 'gemini-3.8-flash';
export const CURRENT_GEMINI_MODEL = ACTIVE_GEMINI_MODEL;

/**
 * Extracts recommended retry delay from Gemini rate limit (429) errors.
 * Gemini free tier gives rate limit errors specifying e.g. "Please retry in 4.375909753s".
 */
export function parseRetryDelayMs(err: any): number {
  const defaultDelay = 5000;
  try {
    const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
    const match = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
    if (match && match[1]) {
      const seconds = parseFloat(match[1]);
      if (!isNaN(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000) + 600; // Add 600ms safety buffer
      }
    }
    if (err?.details && Array.isArray(err.details)) {
      for (const item of err.details) {
        if (item?.retryDelay) {
          const secs = parseFloat(String(item.retryDelay).replace('s', ''));
          if (!isNaN(secs) && secs > 0) {
            return Math.ceil(secs * 1000) + 600;
          }
        }
      }
    }
  } catch {}
  return defaultDelay;
}

export class GeminiService {
  /**
   * Generates comprehensive stock metadata using Google Gemini Vision models
   */
  public async generateMetadata(
    imageBase64: string,
    mimeType: string,
    options: PromptBuildOptions,
    apiKey?: string,
    modelName: string = CURRENT_GEMINI_MODEL
  ): Promise<StockMetadata> {
    const effectiveKey = (apiKey && apiKey.trim()) || (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
    if (!effectiveKey) {
      throw new Error('No Google Gemini API key configured. Please add your own API key in AI Settings.');
    }

    const ai = new GoogleGenAI({
      apiKey: effectiveKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    const systemInstruction = buildSystemInstruction(options);
    const prompt = buildUserPrompt(options);

    // Format Base64 Payload cleanly
    let rawBase64 = imageBase64;
    let finalMime = mimeType;
    if (imageBase64.includes(';base64,')) {
      const parts = imageBase64.split(';base64,');
      finalMime = parts[0].replace('data:', '') || 'image/jpeg';
      rawBase64 = parts[1];
    }

    const imagePart = {
      inlineData: {
        mimeType: finalMime || 'image/jpeg',
        data: rawBase64,
      },
    };

    const textPart = {
      text: prompt,
    };

    let primaryModel = modelName && modelName.trim() ? modelName.trim() : CURRENT_GEMINI_MODEL;
    if (primaryModel.startsWith('models/')) {
      primaryModel = primaryModel.replace(/^models\//, '');
    }
    const lower = primaryModel.toLowerCase();
    
    // Remap any deprecated, experimental, or invalid Gemini model name to CURRENT_GEMINI_MODEL
    if (
      primaryModel.includes('qwen') ||
      primaryModel.includes('llama') ||
      primaryModel.includes('2.0') ||
      primaryModel.includes('2.5') ||
      primaryModel.includes('1.5') ||
      lower.includes('1.0') ||
      lower === 'gemini-pro'
    ) {
      primaryModel = CURRENT_GEMINI_MODEL;
    }

    const candidateModels = Array.from(
      new Set([
        primaryModel,
        CURRENT_GEMINI_MODEL,
        'gemini-2.5-flash',
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest'
      ])
    );
    
    const clean = effectiveKey;
    const masked = clean.length > 4 ? `••••••••••••${clean.slice(-4)}` : '••••••••';
    console.log(`[Stock Pro AI Server] Provider: Google Gemini | Primary Model: ${primaryModel} | Key: ${masked} | Status: Generating`);

    let lastError: any = null;

    for (const currentModel of candidateModels) {
      let retries = 2;
      let delay = 1000;

      while (retries >= 0) {
        try {
          const response: GenerateContentResponse = await ai.models.generateContent({
            model: currentModel,
            contents: { parts: [imagePart, textPart] },
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              temperature: 0.3,
            },
          });

          const rawText = response.text || '{}';
          let parsed: any;
          try {
            parsed = JSON.parse(rawText);
          } catch (jsonErr) {
            const match = rawText.match(/```(?:json)?([\s\S]*?)```/);
            if (match) {
              parsed = JSON.parse(match[1].trim());
            } else {
              throw new Error(`Failed to parse AI output as JSON: ${rawText.slice(0, 100)}...`);
            }
          }

          const sanitized = validateAndSanitizeMetadata(parsed, {
            marketplace: options.marketplace,
            defaultAssetType: options.assetType,
            defaultAiGenerated: options.aiGeneratedFlag,
            backgroundAnalysis: options.backgroundAnalysis,
            titleSettings: options.titleSettings,
            keywordSettings: options.keywordSettings,
          });

          const selected =
            options.selectedMarketplaces && options.selectedMarketplaces.length > 0
              ? options.selectedMarketplaces
              : [options.marketplace];

          const finalMeta = populateMarketplaceAwareMetadata(sanitized, selected, options.marketplace);
          finalMeta.aiProvider = 'Google Gemini';
          finalMeta.aiModel = currentModel;
          return finalMeta;
        } catch (err: any) {
          lastError = err;
          const msg = err?.message || String(err);

          // Handle 503 Service Unavailable / High Demand with retry and fallback model
          const isHighDemand503 =
            msg.includes('503') ||
            msg.includes('high demand') ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('overloaded');

          if (isHighDemand503) {
            if (retries > 0) {
              console.warn(`[Stock Pro AI Server] Gemini model ${currentModel} experiencing high demand (503). Retrying in ${delay}ms...`);
              await new Promise((r) => setTimeout(r, delay));
              delay *= 1.5;
              retries--;
              continue;
            }
            console.warn(`[Stock Pro AI Server] Gemini model ${currentModel} experiencing high demand (503). Switching to next candidate model...`);
            break; // Proceed immediately to next candidateModel
          }

          const isTransient =
            msg.includes('429') ||
            msg.includes('quota') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('Rate limit') ||
            msg.includes('Too Many Requests');

          if (isTransient) {
            const retryWait = parseRetryDelayMs(err);
            
            // If we have other candidate models to try, and this is a quota/429 issue,
            // immediately break and try the next model rather than waiting on this one.
            const hasMoreCandidates = candidateModels.indexOf(currentModel) < candidateModels.length - 1;
            if (hasMoreCandidates) {
              console.warn(`[Stock Pro AI] Gemini quota/429 hit for ${currentModel}. Immediately trying next fallback model...`);
              break;
            }

            // Distinguish short RPM limits (usually under 90s) from true daily quota exhausted errors.
            const isDailyQuotaOrLongWait =
              retryWait > 90000 ||
              (msg.includes('PerDay') &&
               !msg.toLowerCase().includes('retry in') &&
               !msg.toLowerCase().includes('try again in'));

            if (isDailyQuotaOrLongWait) {
              console.warn(`[Stock Pro AI] Gemini daily/quota limit hit for ${currentModel}. Trying fallback model or key...`);
              break; 
            }

            if (retries > 0) {
              const waitMs = Math.max(retryWait, delay);
              console.warn(`[Stock Pro AI] Gemini short rate limit on ${currentModel}. Waiting ${(waitMs / 1000).toFixed(1)}s before retry...`);
              await new Promise((r) => setTimeout(r, waitMs));
              delay *= 1.5;
              retries--;
              continue;
            }
          }
          break;
        }
      }
    }

    if (lastError) {
      const lastMsg = lastError.message || String(lastError);
      if (lastMsg.includes('permission') || lastMsg.includes('PERMISSION_DENIED') || lastMsg.includes('403')) {
        throw new Error('Google Gemini API permission error ("The caller does not have permission"). Please check that your API key is valid and active in Google AI Studio.');
      }
      throw lastError;
    }
    throw new Error(`Gemini metadata generation failed with model ${primaryModel}.`);
  }

  /**
   * Optimize Title for microstock SEO
   */
  public async optimizeTitle(
    currentTitle: string,
    context: { category?: string; keywords?: string[]; marketplace?: string },
    apiKey?: string
  ): Promise<string> {
    const effectiveKey = (apiKey && apiKey.trim()) || (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
    if (!effectiveKey) return currentTitle;

    const ai = new GoogleGenAI({
      apiKey: effectiveKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const prompt = `Refine this stock title for maximum commercial click-through on microstock agencies (Adobe Stock, Shutterstock):
Original Title: "${currentTitle}"
Category: ${context.category || 'General'}
Keywords: ${(context.keywords || []).slice(0, 5).join(', ')}

Rules: Return ONLY the refined title as plain text. No quotes, no markdown, no filler.`;

    try {
      const response = await ai.models.generateContent({
        model: CURRENT_GEMINI_MODEL,
        contents: prompt,
      });
      return response.text?.trim()?.replace(/^["']|["']$/g, '') || currentTitle;
    } catch {
      return currentTitle;
    }
  }

  /**
   * Optimize Description for stock agencies
   */
  public async optimizeDescription(
    currentDescription: string,
    title: string,
    apiKey?: string
  ): Promise<string> {
    const effectiveKey = (apiKey && apiKey.trim()) || (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
    if (!effectiveKey) return currentDescription;

    const ai = new GoogleGenAI({
      apiKey: effectiveKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const prompt = `Rewrite this stock photo description to be clear, descriptive, professional, and SEO-friendly:
Title: "${title}"
Current Description: "${currentDescription}"

Rules: Return ONLY the refined description (1-2 sentences) as plain text. No quotes, no markdown.`;

    try {
      const response = await ai.models.generateContent({
        model: CURRENT_GEMINI_MODEL,
        contents: prompt,
      });
      return response.text?.trim()?.replace(/^["']|["']$/g, '') || currentDescription;
    } catch {
      return currentDescription;
    }
  }

  /**
   * Fetch latest stock photography search trends using Google Search grounding
   */
  public async fetchStockTrends(apiKey?: string): Promise<any[]> {
    const effectiveKey = (apiKey && apiKey.trim()) || (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
    if (!effectiveKey) return [];

    const ai = new GoogleGenAI({
      apiKey: effectiveKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const prompt = `Identify the top 8 currently rising or popular search trends specifically for stock photography and videography. 
Focus on seasonal topics, emerging visual styles, and high-demand commercial subjects.
For each trend, provide:
1. topic: A short, catchy name for the trend.
2. description: A brief explanation of why it's rising.
3. growth: A percentage string (e.g., "+120%") indicating recent interest surge.
4. keywords: 3-5 relevant keywords for this trend.

Return the result as a JSON array of objects.`;

    const modelsToTry = [CURRENT_GEMINI_MODEL];
    let lastError: any = null;

    for (const modelId of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelId,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            tools: [{ googleSearch: {} }],
            temperature: 0.7,
          },
        });

        const rawText = response.text || '[]';
        try {
          const parsed = JSON.parse(rawText);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {
          const match = rawText.match(/```(?:json)?([\s\S]*?)```/);
          if (match) {
            const secondTry = JSON.parse(match[1].trim());
            if (Array.isArray(secondTry) && secondTry.length > 0) return secondTry;
          }
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini Trends] Model ${modelId} failed:`, err.message);
        if (err.message?.includes('not found') || err.message?.includes('404')) continue;
        // If it's a transient error, we could retry but for trends we just try next model
        continue;
      }
    }

    if (lastError) console.error('[Gemini Trends] Final error:', lastError);
    return [];
  }

  public async verifyKeyOnly(apiKey: string): Promise<{ valid: boolean; provider: 'gemini'; error?: string }> {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      return { valid: false, provider: 'gemini', error: 'Gemini API key is required.' };
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`
      );
      if (res.ok) {
        return { valid: true, provider: 'gemini' };
      }
      
      let errorMsg = 'Invalid Gemini API key';
      const data = await res.json().catch(() => ({}));
      const msg = data?.error?.message || '';

      if (res.status === 400 || msg.includes('API_KEY_INVALID')) {
        errorMsg = 'Invalid Gemini API key format';
      } else if (res.status === 403 || msg.includes('PERMISSION_DENIED')) {
        errorMsg = 'Gemini API key permission error';
      } else if (res.status === 429 || msg.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = 'Gemini API quota reached';
      }

      return { valid: false, provider: 'gemini', error: errorMsg };
    } catch (err) {
      return { valid: false, provider: 'gemini', error: 'Unable to reach Gemini API' };
    }
  }

  /**
   * Verify an API key with detailed status response
   */
  public async verifyKey(
    apiKey: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'Gemini API key is required.' };
    }
    const cleanKey = apiKey.trim();

    // 1. Light-weight REST check first (extremely fast, avoids launching model generations)
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`
      );
      if (res.ok) {
        return { success: true, message: 'Google Gemini API key verified and operational!' };
      }
      const data = await res.json().catch(() => ({}));
      const msg = data?.error?.message || `Google API status ${res.status}`;
      
      if (res.status === 400) {
        return {
          success: false,
          error: 'Invalid API key format. Please copy a valid Gemini key from Google AI Studio.',
        };
      }
      if (res.status === 403 || msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
        return {
          success: false,
          error: 'Gemini API key permission error ("The caller does not have permission"). Please check Google AI Studio project permissions.',
        };
      }
      if (res.status === 429 || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        return {
          success: true,
          message: 'Gemini API key is valid (temporarily rate limited or quota reached).',
        };
      }
    } catch {
      // If REST fetch failed (e.g. network/offline), proceed to the SDK fallback
    }

    // 2. SDK fallback
    try {
      const ai = new GoogleGenAI({ apiKey: cleanKey });
      const response = await ai.models.generateContent({
        model: CURRENT_GEMINI_MODEL,
        contents: 'ping',
      });
      if (response && response.text) {
        return { success: true, message: 'Google Gemini API key verified and operational!' };
      }
      return { success: true, message: 'Gemini API responded successfully.' };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('Rate limit')
      ) {
        return {
          success: true,
          message: 'Gemini API key is valid (temporarily rate limited or quota reached).',
        };
      }
      if (
        msg.includes('API_KEY_INVALID') ||
        msg.includes('API key not valid') ||
        msg.includes('400')
      ) {
        return {
          success: false,
          error: 'Invalid API key format. Please copy a valid Gemini key from Google AI Studio.',
        };
      }
      if (msg.includes('PERMISSION_DENIED') || msg.includes('403') || msg.includes('permission')) {
        return {
          success: false,
          error: 'Gemini API key permission error ("The caller does not have permission"). Please check Google AI Studio project permissions.',
        };
      }
      return {
        success: false,
        error: msg || 'Gemini API key verification failed.',
      };
    }
  }

  public async discoverModels(apiKey: string): Promise<string[]> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`
      );
      if (!response.ok) return [];
      const data = await response.json();
      if (!Array.isArray(data.models)) return [];
      return data.models
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => m.name?.replace(/^models\//, ''))
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}

export const geminiService = new GeminiService();
