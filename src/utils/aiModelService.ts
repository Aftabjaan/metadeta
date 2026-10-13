import { isGroqVisionModel } from './groqUtils';

export interface AiModelOption {
  id: string;
  name: string;
  provider: 'gemini' | 'groq';
  description?: string;
  isVisionCapable: boolean;
  isRecommended?: boolean;
}

export const ACTIVE_GEMINI_MODEL = 'gemini-3.8-flash';
export const CURRENT_GEMINI_MODEL = ACTIVE_GEMINI_MODEL;

export const FALLBACK_GEMINI_MODELS: AiModelOption[] = [
  {
    id: CURRENT_GEMINI_MODEL,
    name: 'Gemini 3.8 Flash',
    provider: 'gemini',
    description: 'Latest recommended production model',
    isVisionCapable: true,
    isRecommended: true,
  },
];

export const DEPRECATED_GEMINI_MODELS = [
  'gemini-1.0-pro',
  'gemini-pro',
  'gemini-1.0-ultra',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-pro-exp-02-05',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

export function isDeprecatedGeminiModel(modelId?: string | null): boolean {
  if (!modelId || typeof modelId !== 'string') return false;
  const lower = modelId.toLowerCase().trim().replace(/^models\//, '');
  if (DEPRECATED_GEMINI_MODELS.some((m) => lower === m || lower.endsWith(m) || lower.includes('2.0') || lower.includes('2.5') || lower.includes('1.5'))) return true;
  return false;
}

export function isValidModel(modelId: string | undefined | null, provider: 'gemini' | 'groq'): boolean {
  if (!modelId || typeof modelId !== 'string') return false;
  const clean = modelId.trim().replace(/^models\//, '');
  if (provider === 'gemini') {
    if (clean.includes('qwen') || clean.includes('llama') || clean.includes('mixtral') || clean.includes('2.0') || clean.includes('1.5')) return false;
    if (isDeprecatedGeminiModel(clean)) return false;
    return true;
  } else {
    if (clean.includes('deprecated') || clean.includes('decommissioned') || clean.includes('gemini')) return false;
    return true;
  }
}

export function resolveEffectiveModel(provider: 'gemini' | 'groq', requestedModel?: string): string {
  if (provider === 'gemini') {
    if (requestedModel && requestedModel.trim()) {
      const clean = requestedModel.trim().replace(/^models\//, '');
      if (isValidModel(clean, 'gemini')) {
        return clean;
      }
    }
    return CURRENT_GEMINI_MODEL;
  }
  if (requestedModel && requestedModel.trim() && isValidModel(requestedModel, provider)) {
    return requestedModel.trim();
  }
  return 'llama-3.2-11b-vision-preview';
}

export const FALLBACK_GROQ_MODELS: AiModelOption[] = [
  {
    id: 'llama-3.2-11b-vision-preview',
    name: 'Llama 3.2 11B Vision',
    provider: 'groq',
    description: 'High-performance multimodal vision model on Groq LPU',
    isVisionCapable: true,
    isRecommended: true,
  },
  {
    id: 'llama-3.2-90b-vision-preview',
    name: 'Llama 3.2 90B Vision',
    provider: 'groq',
    description: 'Advanced vision model on Groq LPU',
    isVisionCapable: true,
  },
];

let cachedGeminiModels: AiModelOption[] | null = null;
let cachedGroqModels: AiModelOption[] | null = null;

export async function fetchDynamicGeminiModels(apiKey?: string, force = false): Promise<AiModelOption[]> {
  if (cachedGeminiModels && !force) {
    return cachedGeminiModels;
  }

  // If apiKey provided or stored, attempt direct query to Gemini API via backend
  if (apiKey && apiKey.trim()) {
    try {
      const res = await fetch('/api/ai/models/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models) && data.models.length > 0) {
          cachedGeminiModels = data.models;
          return data.models;
        }
      }
    } catch (e) {
      console.warn('Dynamic Gemini model discovery via backend failed, using curated catalog:', e);
    }
  }

  // Try server model endpoint if available
  try {
    const res = await fetch('/api/models/gemini');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models) && data.models.length > 0) {
        cachedGeminiModels = data.models;
        return data.models;
      }
    }
  } catch {}

  cachedGeminiModels = FALLBACK_GEMINI_MODELS;
  return FALLBACK_GEMINI_MODELS;
}

export async function fetchDynamicGroqModels(apiKey?: string, force = false): Promise<AiModelOption[]> {
  if (cachedGroqModels && !force) {
    return cachedGroqModels;
  }

  if (apiKey && apiKey.trim()) {
    try {
      const res = await fetch('/api/ai/models/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models) && data.models.length > 0) {
          cachedGroqModels = data.models;
          return data.models;
        }
      }
    } catch (e) {
      console.warn('Dynamic Groq model discovery via backend failed, using curated catalog:', e);
    }
  }

  // Try server model endpoint if available
  try {
    const res = await fetch('/api/models/groq');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models) && data.models.length > 0) {
        cachedGroqModels = data.models;
        return data.models;
      }
    }
  } catch {}

  cachedGroqModels = FALLBACK_GROQ_MODELS;
  return FALLBACK_GROQ_MODELS;
}
