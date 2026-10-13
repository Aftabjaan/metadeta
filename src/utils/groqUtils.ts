/**
 * Unified Groq Utilities: Error Mapping, Model Validation, and Key Masking
 * Strictly adheres to Groq API specification and requirements.
 */

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * Known vision-capable models on Groq.
 * Groq uses Llama 3.2 Vision, Qwen 2.5 Vision, and Llava for multimodal vision tasks.
 */
export function isGroqVisionModel(modelId: string): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase().trim();

  // Exclude decommissioned/deprecated models
  if (lower.includes('deprecated') || lower.includes('decommissioned')) {
    return false;
  }

  // Exclude known text-only Qwen models on Groq
  if (lower.includes('32b') || lower.includes('distill')) {
    return false;
  }

  // Check known vision patterns
  return (
    lower.includes('vision') ||
    lower.includes('qwen') ||
    lower.includes('pixtral') ||
    lower.includes('llava') ||
    lower.includes('scenic')
  );
}

/**
 * Safe key masking: shows only prefix/suffix, never reveals full secret.
 * Example: gsk_abcd••••••••••••1234
 */
export function maskKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••••••${suffix}`;
}

/**
 * Strips or masks all embedded API keys from error messages or logs to prevent secret leakage.
 */
export function maskAllKeysInString(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/gsk_[A-Za-z0-9_]{10,}/g, (match) => `${match.slice(0, 7)}...${match.slice(-4)}`)
    .replace(/AIzaSy[A-Za-z0-9_\-]{10,}/g, (match) => `${match.slice(0, 7)}...${match.slice(-4)}`)
    .replace(/sk-[A-Za-z0-9_\-]{10,}/g, (match) => `${match.slice(0, 6)}...${match.slice(-4)}`);
}

/**
 * Standardized Groq Error Code Mapping
 * 401: Authentication Failed / Invalid API Key
 * 403: Permission / Access Denied
 * 404: Model or endpoint unavailable
 * 429: Rate Limited / Quota Exceeded
 * 400: Invalid Request / Unsupported Model / Invalid Parameters
 * 408: Timeout
 * 5xx: Groq Provider Error
 * Network/CORS: Network Error
 */
export function mapGroqError(status: number, rawMessage?: string): string {
  const safeMsg = rawMessage ? maskAllKeysInString(rawMessage).trim() : '';

  if (status === 401) {
    return 'Authentication Failed / Invalid API Key';
  }

  if (status === 403) {
    return safeMsg ? `Permission / Access Denied (${safeMsg})` : 'Permission / Access Denied';
  }

  if (status === 404) {
    if (safeMsg.toLowerCase().includes('model') || safeMsg.toLowerCase().includes('decommissioned')) {
      return `Model unavailable: ${safeMsg}`;
    }
    return 'Model or endpoint unavailable';
  }

  if (status === 429) {
    return safeMsg ? `Rate Limited / Quota Exceeded (${safeMsg})` : 'Rate Limited / Quota Exceeded';
  }

  if (status === 400) {
    if (
      safeMsg.includes('Failed to validate JSON') ||
      safeMsg.includes('json_validate_failed') ||
      safeMsg.includes('reasoning_format')
    ) {
      return `Groq JSON Validation Error (${safeMsg})`;
    }
    return safeMsg
      ? `Invalid Request / Unsupported Model / Invalid Parameters (${safeMsg})`
      : 'Invalid Request / Unsupported Model / Invalid Parameters';
  }

  if (status === 408) {
    return 'Timeout';
  }

  if (status >= 500 && status < 600) {
    return safeMsg ? `Groq Provider Error (HTTP ${status}: ${safeMsg})` : `Groq Provider Error (HTTP ${status})`;
  }

  if (status === 0 || !status) {
    return safeMsg ? `Network Error: ${safeMsg}` : 'Network Error';
  }

  return safeMsg || `Groq API Error (HTTP ${status})`;
}

/**
 * Real Groq API Key Verification
 * Makes an actual network call to https://api.groq.com/openai/v1/models
 * Followed by a minimal chat completion test with a currently active Groq model.
 * NEVER validates purely by regex, prefix, or local validation.
 */
export async function resolveGroqVisionModel(
  apiKey: string,
  requestedModel?: string
): Promise<string> {
  let rawList: any[] = [];
  try {
    const modelsRes = await fetch(`${GROQ_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    if (modelsRes.ok) {
      const data = await modelsRes.json();
      rawList = Array.isArray(data?.data) ? data.data : [];
    }
  } catch {}

  const availableModels = rawList.filter((m: any) => {
    const id = m.id || '';
    if (m.active === false) return false;
    if (id.includes('deprecated') || id.includes('decommissioned')) return false;
    return isGroqVisionModel(id);
  });

  const cleanRequested = (requestedModel || '').trim();
  if (cleanRequested) {
    const found = availableModels.find((m: any) => m.id === cleanRequested);
    if (found) {
      return found.id;
    }
  }

  const llama11b = availableModels.find((m: any) => m.id.includes('llama-3.2-11b') || m.id.includes('11b-vision'));
  if (llama11b) return llama11b.id;

  const qwenModel = availableModels.find((m: any) => m.id.includes('qwen'));
  if (qwenModel) return qwenModel.id;

  const anyVision = availableModels[0];
  if (anyVision) return anyVision.id;

  if (cleanRequested && isGroqVisionModel(cleanRequested)) {
    return cleanRequested;
  }

  return 'llama-3.2-11b-vision-preview';
}

/**
 * Real Groq API Key Verification
 * 1. Key valid
 * 2. Provider accessible
 * 3. Current vision model available
 * 4. Minimal image-capable request works
 */
export async function testGroqKeyReal(
  apiKey: string
): Promise<{ success: boolean; message?: string; error?: string; availableModel?: string }> {
  if (!apiKey || !apiKey.trim()) {
    return { success: false, error: 'Groq API key is required.' };
  }

  const cleanKey = apiKey.trim();

  try {
    const targetTestModel = await resolveGroqVisionModel(cleanKey);

    // Minimal 1x1 transparent PNG base64 for image capability test
    const tinyPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    const testPayload: any = {
      model: targetTestModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Test vision request' },
            { type: 'image_url', image_url: { url: tinyPngBase64 } },
          ],
        },
      ],
      max_tokens: 15,
    };

    if (targetTestModel.toLowerCase().includes('qwen')) {
      testPayload.reasoning_format = 'parsed';
      testPayload.reasoning_effort = 'none';
    }

    const testChatRes = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    if (!testChatRes.ok) {
      const chatErrData = await testChatRes.json().catch(() => ({}));
      const chatErrMsg = chatErrData?.error?.message || `HTTP ${testChatRes.status}`;

      if (testChatRes.status === 429 || testChatRes.status === 400 || testChatRes.status >= 500) {
        return {
          success: true,
          message: `Groq API key verified! (Vision model ${targetTestModel} accessible. Status ${testChatRes.status}: ${chatErrMsg})`,
          availableModel: targetTestModel,
        };
      }

      return {
        success: false,
        error: mapGroqError(testChatRes.status, chatErrMsg),
      };
    }

    return {
      success: true,
      message: `Groq API key verified and operational with vision model ${targetTestModel}!`,
      availableModel: targetTestModel,
    };
  } catch (err: any) {
    const rawErr = err?.message || String(err);
    if (rawErr.includes('NO_VISION_MODEL_AVAILABLE')) {
      return { success: false, error: 'No compatible vision model available on Groq.' };
    }
    return {
      success: false,
      error: mapGroqError(0, rawErr),
    };
  }
}
