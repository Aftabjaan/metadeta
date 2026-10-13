import {
  PromptBuildOptions,
  buildSystemInstruction,
  buildUserPrompt,
  validateAndSanitizeMetadata,
  populateMarketplaceAwareMetadata,
} from '../src/utils/metadataEngine';
import { StockMetadata } from '../src/types';
import { parseRetryDelayMs } from './dbService';
import {
  GROQ_BASE_URL,
  testGroqKeyReal,
  resolveGroqVisionModel,
  isGroqVisionModel,
  mapGroqError,
  maskKey,
} from '../src/utils/groqUtils';

export class GroqService {
  private baseUrl = GROQ_BASE_URL;

  public async generateMetadata(
    imageBase64: string,
    mimeType: string,
    options: PromptBuildOptions,
    apiKey: string,
    modelName: string = 'llama-3.2-11b-vision-preview'
  ): Promise<StockMetadata> {
    if (!apiKey || !apiKey.trim()) {
      throw new Error(
        'Groq API key is missing. Please add your own Groq API key in AI Settings.'
      );
    }

    const cleanKey = apiKey.trim();
    const systemInstruction = buildSystemInstruction(options);
    const userPrompt = buildUserPrompt(options);

    let dataUrl = imageBase64;
    if (!imageBase64.startsWith('data:')) {
      dataUrl = `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`;
    }

    let currentModel = await resolveGroqVisionModel(cleanKey, modelName);

    console.log(
      `[Stock Pro AI Server] Provider: Groq Vision | Model: ${currentModel} | Key: ${maskKey(cleanKey)} | Status: Generating`
    );

    let retries = 2;
    let delay = 1000;
    let lastError: any = null;
    let useJsonObject = true;
    let currentMaxTokens = currentModel.includes('3.6') || currentModel.includes('qwen') ? 380 : 420;

    while (retries >= 0) {
      try {
        const payload: any = {
          model: currentModel,
          messages: [
            {
              role: 'system',
              content: systemInstruction,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: userPrompt,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: dataUrl,
                  },
                },
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

        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cleanKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const rawErrMsg = errData?.error?.message || `Groq API returned HTTP ${res.status}`;
          const mappedErrMsg = mapGroqError(res.status, rawErrMsg);

          // Handle Groq strict JSON validator failure or reasoning format conflict by falling back to natural JSON prompt
          const isJsonValidationError =
            res.status === 400 &&
            (rawErrMsg.includes('Failed to validate JSON') ||
              rawErrMsg.includes('json_validate_failed') ||
              rawErrMsg.includes('reasoning_format') ||
              rawErrMsg.includes('Structured Outputs'));

          if (isJsonValidationError && retries > 0) {
            console.warn(
              `[Stock Pro AI] Groq strict JSON validation constraint failed for ${currentModel}. Retrying without json_object constraint...`
            );
            useJsonObject = false;
            retries--;
            continue;
          }

          // Handle output tokens per minute (OTPM) / max_tokens limits dynamically
          const isTokenLimitExceeded =
            rawErrMsg.includes('reduce max_tokens') ||
            rawErrMsg.includes('output tokens per minute') ||
            rawErrMsg.includes('OTPM') ||
            rawErrMsg.includes('expected output tokens exceed');

          if (isTokenLimitExceeded && retries > 0) {
            const match = rawErrMsg.match(/Limit\s+(\d+),\s*Requested\s+(\d+)/i);
            const targetLimit = match ? parseInt(match[1], 10) : 1000;
            const safeReduced = Math.max(200, Math.min(400, Math.floor(targetLimit * 0.45)));
            console.warn(
              `[Stock Pro AI] Groq OTPM limit hit on ${currentModel} (Limit ${targetLimit}). Dynamically reducing max_tokens from ${currentMaxTokens} to ${safeReduced} and retrying...`
            );
            currentMaxTokens = safeReduced;
            retries--;
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }

          if (res.status === 429) {
            const retryWait = parseRetryDelayMs({ message: rawErrMsg });
            const isLongWait = retryWait > 65000;
            if (isLongWait) {
              console.warn(
                `[Stock Pro AI] Groq rate limit wait is too long (${(retryWait / 1000).toFixed(1)}s) for ${currentModel}. Skipping retries on this key so rotation can try another key...`
              );
              throw new Error(mappedErrMsg);
            }

            const waitMs = Math.max(retryWait, delay);
            console.warn(
              `[Stock Pro AI] Groq rate limit on ${currentModel}. Waiting ${(waitMs / 1000).toFixed(1)}s for quota window to reset...`
            );
            await new Promise((r) => setTimeout(r, waitMs));
            delay *= 1.5;

            retries--;
            continue;
          }

          if (
            res.status === 404 ||
            rawErrMsg.includes('model_not_found') ||
            rawErrMsg.includes('does not exist') ||
            rawErrMsg.includes('decommissioned')
          ) {
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
                  console.warn(
                    `[Stock Pro AI Server] Model ${currentModel} unavailable. Dynamically switching to active vision model ${foundVision.id}...`
                  );
                  currentModel = foundVision.id;
                  retries--;
                  continue;
                }
              }
            } catch {}

            throw new Error(`Selected Groq model "${currentModel}" is unavailable or deprecated.`);
          }

          throw new Error(mappedErrMsg);
        }

        const data = await res.json();
        const rawContent = data.choices?.[0]?.message?.content || '{}';

        let parsed: any;
        try {
          parsed = JSON.parse(rawContent);
        } catch {
          const match = rawContent.match(/```(?:json)?([\s\S]*?)```/);
          if (match) {
            parsed = JSON.parse(match[1].trim());
          } else {
            throw new Error('Groq failed to return valid JSON metadata');
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
        return finalMeta;
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);

        if (
          (msg.includes('Failed to validate JSON') ||
            msg.includes('json_validate_failed') ||
            msg.includes('Strict Schema')) &&
          retries > 0 &&
          useJsonObject
        ) {
          console.warn(
            `[Stock Pro AI] Groq JSON validation error caught in catch block for ${currentModel}. Retrying without json_object constraint...`
          );
          useJsonObject = false;
          retries--;
          continue;
        }

        if (msg.includes('429') || msg.includes('Rate limit') || msg.includes('Quota')) {
          const retryWait = parseRetryDelayMs(err);
          const isLongWait = retryWait > 65000;
          if (isLongWait) {
            console.warn(
              `[Stock Pro AI] Groq rate limit wait is too long (${(retryWait / 1000).toFixed(1)}s) for ${currentModel}. Failing fast so rotation tries next key...`
            );
            break;
          }

          const waitMs = Math.max(retryWait, delay);
          console.warn(
            `[Stock Pro AI] Groq rate limit in catch block on ${currentModel}. Waiting ${(waitMs / 1000).toFixed(1)}s...`
          );
          await new Promise((r) => setTimeout(r, waitMs));
          delay *= 1.5;

          retries--;
          continue;
        }
        break;
      }
    }

    throw lastError || new Error(`Groq metadata generation failed for model ${currentModel}.`);
  }

  public async verifyKey(
    apiKey: string
  ): Promise<{ success: boolean; message?: string; error?: string; availableModel?: string }> {
    return testGroqKeyReal(apiKey);
  }

  public async verifyKeyOnly(apiKey: string): Promise<{ valid: boolean; provider: 'groq'; error?: string }> {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      return { valid: false, provider: 'groq', error: 'Groq API key is required.' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok || response.status === 429) {
        return { valid: true, provider: 'groq' };
      }

      let errorMsg = 'Invalid Groq API key';
      if (response.status === 403) {
        errorMsg = 'Groq API key is not authorized for this request';
      } else if (response.status === 429) {
        errorMsg = 'Groq API rate limit reached';
      } else if (response.status >= 500) {
        errorMsg = 'Groq service temporarily unavailable';
      } else if (response.status === 401) {
        errorMsg = 'Invalid Groq API key';
      }

      return { valid: false, provider: 'groq', error: errorMsg };
    } catch (err) {
      return { valid: false, provider: 'groq', error: 'Unable to reach Groq API' };
    }
  }

  public async discoverModels(apiKey: string): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      if (!Array.isArray(data.data)) return [];
      return data.data
        .filter((m: any) => m.active !== false && !m.id.includes('deprecated') && !m.id.includes('decommissioned'))
        .map((m: any) => m.id)
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}

export const groqService = new GroqService();
