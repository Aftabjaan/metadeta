import { StockMetadata, PromptBuildOptions, AIProvider } from '../types';
import {
  buildSystemInstruction,
  buildUserPrompt,
  validateAndSanitizeMetadata,
  populateMarketplaceAwareMetadata,
} from './metadataEngine';
import {
  AiModelOption,
  fetchDynamicGeminiModels,
  fetchDynamicGroqModels,
  FALLBACK_GEMINI_MODELS,
  FALLBACK_GROQ_MODELS,
  isValidModel,
  resolveEffectiveModel,
  CURRENT_GEMINI_MODEL,
} from './aiModelService';
import { getRotatedClientKeys, recordClientKeyUsage, getActiveClientKey } from './clientKeyStorage';
import { testGroqKeyReal, isGroqVisionModel, mapGroqError, GROQ_BASE_URL } from './groqUtils';

export interface AIProviderAdapter {
  readonly provider: 'gemini' | 'groq';
  readonly displayName: string;
  getModels(apiKey?: string, force?: boolean): Promise<AiModelOption[]>;
  testKey(apiKey: string): Promise<{ success: boolean; message?: string; error?: string }>;
  generateMetadata(
    imageBase64: string,
    mimeType: string,
    options: PromptBuildOptions,
    apiKey: string,
    modelId: string
  ): Promise<StockMetadata>;
}

export function parseRetryDelayMs(err: any): number {
  const defaultDelay = 5000;
  try {
    const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
    const match = msg.match(/(?:retry|try again) in (\d+(?:\.\d+)?)s/i);
    if (match && match[1]) {
      const seconds = parseFloat(match[1]);
      if (!isNaN(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000) + 1000; // Add 1s safety buffer
      }
    }
  } catch {}
  return defaultDelay;
}

/**
 * Safe logging helper that completely sanitizes API keys and tokens.
 * NEVER logs full secrets, tokens, or auth headers.
 */
export function logSafeEngineRequest(provider: string, model: string, apiKey: string, status: string) {
  const clean = apiKey ? apiKey.trim() : '';
  const masked = clean.length > 4 ? `••••••••••••${clean.slice(-4)}` : '••••••••';
  console.log(`[Stock Pro AI] Provider: ${provider} | Model: ${model} | Key: ${masked} | Status: ${status}`);
}

/**
 * Google Gemini Provider Adapter
 * Strict adherence to user's selected Gemini model, user's key, and centralized prompt.
 */
export class GeminiProviderAdapter implements AIProviderAdapter {
  public readonly provider = 'gemini' as const;
  public readonly displayName = 'Google Gemini';

  public async getModels(apiKey?: string, force = false): Promise<AiModelOption[]> {
    return fetchDynamicGeminiModels(apiKey, force);
  }

  public async testKey(apiKey: string): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'Gemini API key is required.' };
    }
    const cleanKey = apiKey.trim();

    // 1. Try server verification first (Node.js SDK, avoids browser CORS/tracking blocks)
    try {
      const serverRes = await fetch('/api/ai/verify-gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: cleanKey }),
      });
      if (serverRes.ok) {
        const json = await serverRes.json();
        return { success: json.valid, message: json.valid ? 'Google Gemini API key verified and operational!' : undefined, error: !json.valid ? json.error : undefined };
      }
      const errData = await serverRes.json().catch(() => ({}));
      if (errData?.error && !errData.error.includes('Route') && !errData.error.includes('Cannot POST')) {
        return { success: false, error: errData.error };
      }
    } catch {
      // Server not reachable or network offline, proceed to direct client verification fallback
    }

    // 2. Direct client verification fallback
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`
      );
      if (res.ok) {
        return { success: true, message: 'Google Gemini API key verified and operational!' };
      }
      const data = await res.json().catch(() => ({}));
      const message =
        data?.error?.message ||
        (res.status === 400
          ? 'Invalid API key format. Please copy a valid key from Google AI Studio.'
          : res.status === 403
          ? 'API key does not have permissions or has been restricted in Google Cloud.'
          : `Google API returned status ${res.status}`);
      return { success: false, error: message };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error connecting to Google Gemini API.' };
    }
  }

  public async generateMetadata(
    imageBase64: string,
    mimeType: string,
    options: PromptBuildOptions,
    apiKey: string,
    modelId: string = CURRENT_GEMINI_MODEL
  ): Promise<StockMetadata> {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('No Gemini API key configured. Please add your own Gemini API key in AI Settings.');
    }

    const cleanKey = apiKey.trim();
    const systemInstruction = buildSystemInstruction(options);
    const prompt = buildUserPrompt(options);

    let rawBase64 = imageBase64;
    let finalMime = mimeType || 'image/jpeg';
    if (imageBase64.includes(';base64,')) {
      const parts = imageBase64.split(';base64,');
      finalMime = parts[0].replace('data:', '') || 'image/jpeg';
      rawBase64 = parts[1];
    }

    const primaryModel = resolveEffectiveModel('gemini', modelId).replace(/^models\//, '');
    const candidateModels = Array.from(
      new Set([
        primaryModel,
        CURRENT_GEMINI_MODEL,
        'gemini-2.5-flash',
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
      ])
    );

    let lastError: any = null;

    for (const selectedModel of candidateModels) {
      logSafeEngineRequest('Google Gemini', selectedModel, cleanKey, 'Generating');

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(
        cleanKey
      )}`;

      const body = {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: finalMime,
                  data: rawBase64,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      };

      let retries = 2;
      let delay = 1000;

      while (retries >= 0) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            const msg = errJson?.error?.message || `Google API HTTP ${res.status}`;

            if (res.status === 404 || msg.includes('not found') || msg.includes('models/')) {
              console.warn(`[Stock Pro AI] Gemini model ${selectedModel} not found. Trying fallback model...`);
              lastError = new Error(`Gemini model ${selectedModel} is unavailable or deprecated.`);
              break; // break inner while to try next model in candidateModels
            }

            const isHighDemand503 =
              res.status === 503 ||
              msg.includes('503') ||
              msg.includes('high demand') ||
              msg.includes('UNAVAILABLE') ||
              msg.includes('overloaded');

            if (isHighDemand503) {
              if (retries > 0) {
                console.warn(`[Stock Pro AI Client] Gemini model ${selectedModel} experiencing high demand (503). Retrying in ${delay}ms...`);
                await new Promise((r) => setTimeout(r, delay));
                delay *= 1.5;
                retries--;
                continue;
              }
              console.warn(`[Stock Pro AI Client] Gemini model ${selectedModel} experiencing high demand (503). Switching to fallback model...`);
              lastError = new Error(`[GEMINI Error] {"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}`);
              break; // try next candidate model
            }

            if (
              res.status === 403 ||
              msg.includes('permission') ||
              msg.includes('PERMISSION_DENIED') ||
              msg.includes('does not have permission')
            ) {
              throw new Error(
                'Gemini API key permission error ("The caller does not have permission"). Please check your Gemini API key in [API Keys]. Ensure your key is valid and has permission for Google AI Studio.'
              );
            }

            const isRateLimit =
              res.status === 429 ||
              msg.includes('429') ||
              msg.includes('quota') ||
              msg.includes('RESOURCE_EXHAUSTED') ||
              msg.includes('Rate limit') ||
              msg.includes('Too Many Requests');

            if (isRateLimit) {
              const retryWait = parseRetryDelayMs(errJson?.error || msg);
              // Distinguish short RPM limits (usually under 90s) from true daily quota exhausted errors.
              // Do not treat 'FreeTier' metric name or small retry delays as daily quota limits.
              const isDailyQuotaOrLongWait =
                retryWait > 90000 ||
                (msg.includes('PerDay') &&
                 !msg.toLowerCase().includes('retry in') &&
                 !msg.toLowerCase().includes('try again in'));

              if (isDailyQuotaOrLongWait) {
                lastError = new Error(`Gemini Free Tier daily quota reached (${msg}). Please add another Gemini/Groq key in [API Keys] or try again later.`);
                break;
              }

              if (retries > 0) {
                const waitMs = Math.max(retryWait, delay);
                console.warn(`[Stock Pro AI Client] Gemini short rate limit hit. Waiting ${(waitMs / 1000).toFixed(1)}s before retry...`);
                await new Promise((r) => setTimeout(r, waitMs));
                delay *= 1.5;
                retries--;
                continue;
              }
            }

            throw new Error(msg);
          }

          const resData = await res.json();
          const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

          let parsed: any;
          try {
            parsed = JSON.parse(rawText);
          } catch {
            const match = rawText.match(/```(?:json)?([\s\S]*?)```/);
            if (match) {
              parsed = JSON.parse(match[1].trim());
            } else {
              throw new Error('Failed to parse Gemini output as structured JSON.');
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
          finalMeta.aiModel = selectedModel;
          finalMeta.commercialIntent = parsed.commercialIntent || 'Commercial Stock Photography / Digital Asset';

          return finalMeta;
        } catch (err: any) {
          lastError = err;
          const msg = err?.message || String(err);
          const isRateLimit =
            msg.includes('429') ||
            msg.includes('quota') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('Rate limit') ||
            msg.includes('Too Many Requests');

          if (isRateLimit && retries > 0) {
            const retryWait = parseRetryDelayMs(err);
            const waitMs = Math.max(retryWait, delay);
            await new Promise((r) => setTimeout(r, waitMs));
            delay *= 1.5;
            retries--;
            continue;
          }
          break;
        }
      }
    }

    throw lastError || new Error(`Gemini metadata generation failed across all models.`);
  }
}

/**
 * Groq Vision Provider Adapter
 * Strict adherence to user's selected Groq model, user's key, and centralized prompt.
 */
export class GroqProviderAdapter implements AIProviderAdapter {
  public readonly provider = 'groq' as const;
  public readonly displayName = 'Groq Vision';

  public async getModels(apiKey?: string, force = false): Promise<AiModelOption[]> {
    return fetchDynamicGroqModels(apiKey, force);
  }

  public async testKey(apiKey: string): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'Groq API key is required.' };
    }
    const cleanKey = apiKey.trim();

    // 1. Try server verification first (Node.js SDK, avoids browser CORS/tracking blocks)
    try {
      const serverRes = await fetch('/api/ai/verify-groq-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: cleanKey }),
      });
      if (serverRes.ok) {
        const json = await serverRes.json();
        return { success: json.valid, message: json.valid ? 'Groq API key verified and operational!' : undefined, error: !json.valid ? json.error : undefined };
      }
      const errData = await serverRes.json().catch(() => ({}));
      if (errData?.error && !errData.error.includes('Route') && !errData.error.includes('Cannot POST')) {
        return { success: false, error: errData.error };
      }
    } catch {
      // Server not reachable or network offline, proceed to direct client verification fallback
    }

    return testGroqKeyReal(apiKey);
  }

  public async generateMetadata(
    imageBase64: string,
    mimeType: string,
    options: PromptBuildOptions,
    apiKey: string,
    modelId: string = 'llama-3.2-11b-vision-preview'
  ): Promise<StockMetadata> {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('No Groq API key configured. Please add your own Groq API key in AI Settings.');
    }

    const cleanKey = apiKey.trim();
    const effectiveOptions = { ...options, minimizeLayout: true };
    const systemInstruction = buildSystemInstruction(effectiveOptions);
    const prompt = buildUserPrompt(effectiveOptions);

    let formattedImage = imageBase64;
    if (!imageBase64.startsWith('data:')) {
      formattedImage = `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`;
    }

    let currentModel =
      modelId &&
      modelId.trim() &&
      !modelId.includes('deprecated') &&
      !modelId.includes('decommissioned')
        ? modelId.trim()
        : 'llama-3.2-11b-vision-preview';

    // Vision Capability Check: Do not send image data to text-only models
    if (!isGroqVisionModel(currentModel)) {
      console.warn(
        `[Groq Vision Check] Selected Groq model "${currentModel}" does not support image analysis. Automatically selecting compatible vision model "llama-3.2-11b-vision-preview".`
      );
      currentModel = 'llama-3.2-11b-vision-preview';
    }

    logSafeEngineRequest('Groq Vision', currentModel, cleanKey, 'Generating');

    let retries = 2;
    let delay = 1000;
    let useJsonObject = true;
    let currentMaxTokens = currentModel.includes('3.6') ? 380 : 420;
    let rawText = '{}';

    while (retries >= 0) {
      const payload: any = {
        model: currentModel,
        messages: [
          { role: 'system', content: systemInstruction },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: formattedImage } },
            ],
          },
        ],
        max_tokens: currentMaxTokens,
        temperature: 0.2,
      };

      // For Qwen reasoning models on Groq:
      // 1. Groq requires reasoning_format to be 'parsed' or 'hidden' when JSON mode is used, else throws 400 "Failed to validate JSON"
      // 2. Set reasoning_effort to 'none' to disable thinking tokens completely, saving ~500 tokens/request and staying far below 1,000 OTPM
      if (currentModel.toLowerCase().includes('qwen') && (currentModel.toLowerCase().includes('r1') || currentModel.toLowerCase().includes('deepseek'))) {
        payload.reasoning_format = 'parsed';
        payload.reasoning_effort = 'none';
      }

      if (useJsonObject) {
        payload.response_format = { type: 'json_object' };
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `Groq API returned HTTP ${res.status}`;

        // Handle strict JSON validation failures by retrying with relaxed formatting
        const isJsonValidationError =
          res.status === 400 &&
          (msg.includes('Failed to validate JSON') ||
            msg.includes('json_validate_failed') ||
            msg.includes('reasoning_format') ||
            msg.includes('Structured Outputs'));

        if (isJsonValidationError && retries > 0) {
          console.warn(`[Stock Pro AI] Client Groq strict JSON validation failed. Retrying without json_object constraint for ${currentModel}...`);
          useJsonObject = false;
          retries--;
          continue;
        }

        // Handle output tokens per minute (OTPM) / max_tokens limits dynamically
        const isTokenLimitExceeded =
          msg.includes('reduce max_tokens') ||
          msg.includes('output tokens per minute') ||
          msg.includes('OTPM') ||
          msg.includes('expected output tokens exceed');

        if (isTokenLimitExceeded && retries > 0) {
          const match = msg.match(/Limit\s+(\d+),\s*Requested\s+(\d+)/i);
          const targetLimit = match ? parseInt(match[1], 10) : 1000;
          const safeReduced = Math.max(200, Math.min(400, Math.floor(targetLimit * 0.45)));
          console.warn(
            `[Stock Pro AI] Client Groq OTPM limit hit on ${currentModel} (Limit ${targetLimit}). Dynamically reducing max_tokens from ${currentMaxTokens} to ${safeReduced} and retrying...`
          );
          currentMaxTokens = safeReduced;
          retries--;
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }

        if (res.status === 429) {
          if (retries > 0) {
            const retryWait = parseRetryDelayMs(msg);
            if (retryWait <= 65000) {
              const waitMs = Math.max(retryWait, delay);
              console.warn(`[Stock Pro AI] Client Groq rate limit on ${currentModel}. Waiting ${(waitMs / 1000).toFixed(1)}s before retry...`);
              await new Promise((r) => setTimeout(r, waitMs));
              delay *= 1.5;
              retries--;
              continue;
            }
          }
        }

        if (res.status === 404 || msg.includes('model_not_found') || msg.includes('does not exist') || msg.includes('decommissioned')) {
          try {
            const modelsRes = await fetch(`${GROQ_BASE_URL}/models`, {
              headers: { Authorization: `Bearer ${cleanKey}` },
            });
            if (modelsRes.ok) {
              const modelsData = await modelsRes.json();
              const rawList = Array.isArray(modelsData?.data) ? modelsData.data : [];
              const foundVision = rawList.find(
                (m: any) =>
                  m.active !== false &&
                  isGroqVisionModel(m.id) &&
                  !m.id.includes('deprecated') &&
                  !m.id.includes('decommissioned') &&
                  m.id !== currentModel
              );
              if (foundVision) {
                console.warn(`[Stock Pro AI] Model ${currentModel} unavailable. Dynamically switching to active vision model ${foundVision.id}...`);
                currentModel = foundVision.id;
                retries--;
                continue;
              }
            }
          } catch {}

          throw new Error(
            `Selected Groq model "${currentModel}" is unavailable. Click [Refresh Models] or select another model in AI Settings.`
          );
        }

        throw new Error(mapGroqError(res.status, msg));
      }

      const data = await res.json();
      rawText = data?.choices?.[0]?.message?.content || '{}';
      break;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/```(?:json)?([\s\S]*?)```/);
      if (match) {
        parsed = JSON.parse(match[1].trim());
      } else {
        throw new Error('Failed to parse Groq response as structured JSON.');
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
    finalMeta.aiProvider = 'Groq Vision';
    finalMeta.aiModel = currentModel;
    finalMeta.commercialIntent = parsed.commercialIntent || 'Commercial Stock Photography / Digital Asset';

    return finalMeta;
  }
}

export const geminiProviderAdapter = new GeminiProviderAdapter();
export const groqProviderAdapter = new GroqProviderAdapter();

export function getProviderAdapter(provider: 'gemini' | 'groq'): AIProviderAdapter {
  if (provider === 'groq') return groqProviderAdapter;
  return geminiProviderAdapter;
}

/**
 * Centralized Provider + Model Generation Dispatcher
 * Strictly executes metadata generation for the selected provider & model with key rotation.
 */
export async function executeAIProviderGeneration(
  imageBase64: string,
  mimeType: string,
  options: PromptBuildOptions,
  selectedProvider: AIProvider = 'gemini',
  selectedModel?: string,
  autoFallback = false,
  autoRotation = true
): Promise<{ metadata: StockMetadata; provider: string; keyLabel: string; model: string }> {
  const concreteProvider: 'gemini' | 'groq' =
    selectedProvider === 'groq' ? 'groq' : 'gemini';

  const primaryAdapter = getProviderAdapter(concreteProvider);
  const primaryKeys = getRotatedClientKeys(concreteProvider);

  if (primaryKeys.length === 0) {
    throw new Error(
      `No ${primaryAdapter.displayName} API key configured. Please add your own API key in AI Settings.`
    );
  }

  // Model resolution: ensure explicit user selection is honored
  let requestedModel = selectedModel;
  if (!requestedModel) {
    try {
      const saved = localStorage.getItem('stock_pro_settings_backup');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (concreteProvider === 'gemini') requestedModel = parsed.geminiModel;
        else if (concreteProvider === 'groq') requestedModel = parsed.groqModel;
      }
    } catch {}
  }
  const effectiveModel = resolveEffectiveModel(concreteProvider, requestedModel);

  const keysToTry = autoRotation ? primaryKeys : [primaryKeys[0]];
  let lastError: any = null;

  // 1. Try primary provider with all configured keys (maintaining the exact model)
  for (const keyItem of keysToTry) {
    try {
      const metadata = await primaryAdapter.generateMetadata(
        imageBase64,
        mimeType,
        options,
        keyItem.rawKey,
        effectiveModel
      );
      recordClientKeyUsage(keyItem.entry.id, true);
      return {
        metadata,
        provider: concreteProvider,
        keyLabel: keyItem.entry.label,
        model: effectiveModel,
      };
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      recordClientKeyUsage(keyItem.entry.id, false, errMsg);
      console.warn(
        `Key ${keyItem.entry.label} (${keyItem.entry.maskedKey}) failed: "${errMsg}". Trying next key...`
      );
    }
  }

  // 2. If autoFallback is enabled and primary failed on all keys, try other user-configured providers:
  if (autoFallback) {
    const providers: ('gemini' | 'groq')[] = ['gemini', 'groq'];
    const fallbacks = providers.filter((p) => p !== concreteProvider);

    for (const fProvider of fallbacks) {
      const fallbackAdapter = getProviderAdapter(fProvider);
      const fallbackKeys = getRotatedClientKeys(fProvider);

      if (fallbackKeys.length > 0) {
        let rawFallbackModel: string | undefined;
        try {
          const saved = localStorage.getItem('stock_pro_settings_backup');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (fProvider === 'gemini') rawFallbackModel = parsed.geminiModel;
            else if (fProvider === 'groq') rawFallbackModel = parsed.groqModel;
          }
        } catch {}
        const fallbackModel = resolveEffectiveModel(fProvider, rawFallbackModel);

        console.warn(
          `All keys for ${primaryAdapter.displayName} exhausted. Falling back to ${fallbackAdapter.displayName} (${fallbackModel})...`
        );

        for (const fKey of fallbackKeys) {
          try {
            const metadata = await fallbackAdapter.generateMetadata(
              imageBase64,
              mimeType,
              options,
              fKey.rawKey,
              fallbackModel
            );
            recordClientKeyUsage(fKey.entry.id, true);
            return {
              metadata,
              provider: fProvider,
              keyLabel: fKey.entry.label,
              model: fallbackModel,
            };
          } catch (fErr: any) {
            lastError = fErr;
            recordClientKeyUsage(fKey.entry.id, false, fErr?.message);
          }
        }
      }
    }
  }

  throw lastError || new Error(`Generation failed with ${primaryAdapter.displayName}. Check API keys.`);
}
