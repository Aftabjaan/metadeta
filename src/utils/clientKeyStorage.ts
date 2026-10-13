import { ApiKeyEntry, BulkImportResult, AIProvider } from '../types';
import { maskKey } from './metadataEngine';
import { isValidKeyToken } from './keyParser';
import { detectProviderFromKeyPattern } from './keyValidation';

let activeStorageUserId: string = 'default';

export function setActiveStorageUserId(userId?: string | null) {
  activeStorageUserId = userId ? userId.trim() : 'default';
}

function getKeysListKey(): string {
  return `stock_pro_client_api_keys_${activeStorageUserId}`;
}

const RAW_KEY_PREFIX = 'stock_pro_raw_key_';

/**
 * Migration & Sanitizer: Purges any legacy system/environment/demo keys
 * so only legitimate user-added BYOK keys remain.
 */
function sanitizeStoredKeys(keys: any[]): ApiKeyEntry[] {
  if (!Array.isArray(keys)) return [];
  return keys.filter((k) => {
    if (!k || typeof k !== 'object') return false;
    if (k.isEnvKey === true) return false;
    if (typeof k.id === 'string' && k.id.startsWith('env-')) return false;
    if (typeof k.label === 'string' && (k.label.includes('Env Secret') || k.label.includes('Primary (Env') || k.label.includes('System Key'))) return false;
    return true;
  });
}

export function getClientApiKeys(): ApiKeyEntry[] {
  try {
    const raw = localStorage.getItem(getKeysListKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeStoredKeys(parsed);
    
    // Dynamic mismatch scanner & auto-repairer
    let modified = false;
    for (const k of sanitized) {
      if (!k || typeof k !== 'object') continue;
      const rKey = localStorage.getItem(RAW_KEY_PREFIX + k.id);
      if (rKey) {
        const pattern = detectProviderFromKeyPattern(rKey);
        if (k.provider === 'gemini' && pattern === 'groq') {
          if (k.status !== 'error' || !k.lastError?.includes('belongs to Groq')) {
            k.status = 'error';
            k.lastError = 'Provider mismatch — this key belongs to Groq, not Gemini.';
            modified = true;
          }
        } else if (k.provider === 'groq' && pattern === 'gemini') {
          if (k.status !== 'error' || !k.lastError?.includes('belongs to Gemini')) {
            k.status = 'error';
            k.lastError = 'Provider mismatch — this key belongs to Gemini, not Groq.';
            modified = true;
          }
        }
      }
    }

    if (modified || sanitized.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
      localStorage.setItem(getKeysListKey(), JSON.stringify(sanitized));
    }
    return sanitized;
  } catch {
    return [];
  }
}

export function getClientRawKey(id: string): string | null {
  try {
    return localStorage.getItem(RAW_KEY_PREFIX + id);
  } catch {
    return null;
  }
}

export function saveClientApiKey(
  provider: 'gemini' | 'groq' | 'openai',
  label: string,
  rawKey: string
): ApiKeyEntry {
  const cleanKey = rawKey.trim();
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const id = `client-${provider}-${uuid}`;

  const entry: ApiKeyEntry = {
    id,
    provider,
    label: label.trim() || `${provider === 'gemini' ? 'Google Gemini' : (provider === 'groq' ? 'Groq' : 'OpenAI')} Key`,
    maskedKey: maskKey(cleanKey),
    enabled: true,
    isEnvKey: false,
    status: 'untested',
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
  };

  try {
    localStorage.setItem(RAW_KEY_PREFIX + id, cleanKey);
    const existing = getClientApiKeys().filter((k) => k.id !== id);
    const updated = [entry, ...existing];
    localStorage.setItem(getKeysListKey(), JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save key in client localStorage:', err);
  }

  return entry;
}

export function setActiveClientApiKey(id: string): boolean {
  try {
    const keys = getClientApiKeys();
    const targetKey = keys.find((k) => k.id === id);
    if (!targetKey) return false;

    keys.forEach((k) => {
      if (k.provider === targetKey.provider) {
        k.active = (k.id === id);
      }
    });

    localStorage.setItem(getKeysListKey(), JSON.stringify(keys));
    return true;
  } catch {
    return false;
  }
}

export function validateKeyFormatClient(key: string, provider: 'gemini' | 'groq' | 'openai'): boolean {
  if (!key || typeof key !== 'string') return false;
  if (provider === 'openai') {
    return key.trim().startsWith('sk-');
  }
  return isValidKeyToken(key).valid;
}

export function saveClientApiKeysBulk(
  provider: 'gemini' | 'groq' | 'openai',
  rawKeys: string[],
  labelPrefix?: string
): BulkImportResult {
  const totalDetected = rawKeys.length;
  let duplicatesSkipped = 0;
  let invalidKeysSkipped = 0;
  const added: ApiKeyEntry[] = [];

  const existingKeys = getClientApiKeys();
  const existingRawKeys = new Set<string>();

  for (const k of existingKeys) {
    if (k.provider === provider) {
      const raw = getClientRawKey(k.id);
      if (raw) existingRawKeys.add(raw.trim());
    }
  }

  const seenInBatch = new Set<string>();
  let currentCount = existingKeys.filter((k) => k.provider === provider).length;
  const newEntries: ApiKeyEntry[] = [];

  for (const item of rawKeys) {
    const cleanKey = item.trim();
    if (!cleanKey) continue;

    if (!validateKeyFormatClient(cleanKey, provider)) {
      invalidKeysSkipped++;
      continue;
    }

    if (seenInBatch.has(cleanKey) || existingRawKeys.has(cleanKey)) {
      duplicatesSkipped++;
      continue;
    }

    seenInBatch.add(cleanKey);
    existingRawKeys.add(cleanKey);
    currentCount++;

    const id = `client-${provider}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const label = labelPrefix
      ? `${labelPrefix} #${currentCount}`
      : `${provider === 'gemini' ? 'Gemini' : (provider === 'groq' ? 'Groq' : 'OpenAI')} Key ${currentCount}`;

    const entry: ApiKeyEntry = {
      id,
      provider,
      label,
      maskedKey: maskKey(cleanKey),
      enabled: true,
      isEnvKey: false,
      status: 'untested',
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
    };

    try {
      localStorage.setItem(RAW_KEY_PREFIX + id, cleanKey);
    } catch (err) {
      console.error('Failed to save raw key in client localStorage:', err);
    }

    newEntries.push(entry);
    added.push(entry);
  }

  if (newEntries.length > 0) {
    const updated = [...newEntries, ...existingKeys];
    try {
      localStorage.setItem(getKeysListKey(), JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to update keys list in client localStorage:', err);
    }
  }

  return {
    totalDetected,
    added: added.length,
    duplicatesSkipped,
    invalidKeysSkipped,
    addedKeys: added,
  };
}

export function updateClientApiKey(
  id: string,
  updates: Partial<ApiKeyEntry>
): boolean {
  try {
    const keys = getClientApiKeys();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx === -1) return false;
    keys[idx] = { ...keys[idx], ...updates };
    localStorage.setItem(getKeysListKey(), JSON.stringify(keys));
    return true;
  } catch {
    return false;
  }
}

export function deleteClientApiKey(id: string): boolean {
  try {
    localStorage.removeItem(RAW_KEY_PREFIX + id);
    const keys = getClientApiKeys().filter((k) => k.id !== id);
    localStorage.setItem(getKeysListKey(), JSON.stringify(keys));

    // Also remove from all potential stock_pro_client_api_keys_* partitions
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey && (storageKey.startsWith('stock_pro_client_api_keys_') || storageKey === 'stock_pro_client_api_keys')) {
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const updated = list.filter((k: any) => k.id !== id);
              localStorage.setItem(storageKey, JSON.stringify(updated));
            }
          }
        } catch {}
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function deleteAllClientApiKeys(provider?: 'gemini' | 'groq' | 'openai'): number {
  try {
    let deletedCount = 0;
    const allStorageKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('stock_pro_client_api_keys_') || k === 'stock_pro_client_api_keys')) {
        allStorageKeys.push(k);
      }
    }

    if (!allStorageKeys.includes(getKeysListKey())) {
      allStorageKeys.push(getKeysListKey());
    }

    for (const storageKey of allStorageKeys) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) continue;
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) continue;

        const toDelete = provider ? list.filter((k: any) => k.provider === provider) : [...list];
        const toKeep = provider ? list.filter((k: any) => k.provider !== provider) : [];

        for (const k of toDelete) {
          deletedCount++;
          try {
            if (k.id) {
              localStorage.removeItem(RAW_KEY_PREFIX + k.id);
            }
          } catch {}
        }

        localStorage.setItem(storageKey, JSON.stringify(toKeep));
      } catch {}
    }

    // Clean up any lingering raw keys
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(RAW_KEY_PREFIX)) {
          if (!provider) {
            localStorage.removeItem(key);
          } else if (key.includes(`-${provider}-`)) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch {}

    return deletedCount;
  } catch (err) {
    console.error('Failed to delete all client API keys:', err);
    return 0;
  }
}

let clientGeminiIndex = 0;
let clientGroqIndex = 0;
let clientOpenAIIndex = 0;

export function getRotatedClientKeys(
  provider: 'gemini' | 'groq' | 'openai'
): { entry: ApiKeyEntry; rawKey: string }[] {
  const keys = getClientApiKeys();
  const enabledKeys = keys.filter((k) => k.provider === provider && k.enabled);
  if (enabledKeys.length === 0) return [];

  // Prefer keys not in error state
  let targetKeys = enabledKeys.filter((k) => k.status !== 'error');
  // Fall back to all enabled keys if all keys are currently marked as error
  if (targetKeys.length === 0) {
    targetKeys = enabledKeys;
  }

  const available: { entry: ApiKeyEntry; rawKey: string }[] = [];
  for (const entry of targetKeys) {
    const raw = getClientRawKey(entry.id);
    if (raw && raw.trim()) {
      const pattern = detectProviderFromKeyPattern(raw);
      // Double check prefix mismatch to strictly avoid using wrong-provider keys
      if (entry.provider === 'gemini' && pattern === 'groq') continue;
      if (entry.provider === 'groq' && pattern === 'gemini') continue;
      if (entry.provider === 'openai' && (pattern === 'gemini' || pattern === 'groq')) continue;
      if ((entry.provider === 'gemini' || entry.provider === 'groq') && pattern === 'openai') continue;
      available.push({ entry, rawKey: raw.trim() });
    }
  }

  if (available.length <= 1) return available;

  let currentIndex = 0;
  if (provider === 'gemini') currentIndex = clientGeminiIndex;
  else if (provider === 'groq') currentIndex = clientGroqIndex;
  else currentIndex = clientOpenAIIndex;

  const startIdx = currentIndex % available.length;

  if (provider === 'gemini') {
    clientGeminiIndex = (clientGeminiIndex + 1) % available.length;
  } else if (provider === 'groq') {
    clientGroqIndex = (clientGroqIndex + 1) % available.length;
  } else {
    clientOpenAIIndex = (clientOpenAIIndex + 1) % available.length;
  }

  return [...available.slice(startIdx), ...available.slice(0, startIdx)];
}

export function getActiveClientKey(
  provider: 'gemini' | 'groq' | 'openai'
): { entry: ApiKeyEntry; rawKey: string } | null {
  const rotated = getRotatedClientKeys(provider);
  return rotated.length > 0 ? rotated[0] : null;
}

export function recordClientKeyUsage(
  id: string,
  success: boolean,
  errorMessage?: string
): void {
  try {
    const keys = getClientApiKeys();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx === -1) return;

    const item = keys[idx];
    item.requestCount = (item.requestCount || 0) + 1;
    item.lastUsed = new Date().toISOString();

    if (success) {
      item.successCount = (item.successCount || 0) + 1;
      item.status = 'active';
      item.lastError = undefined;
    } else {
      item.failureCount = (item.failureCount || 0) + 1;
      item.lastError = errorMessage;

      const isAuthErr = errorMessage && (
        errorMessage.toLowerCase().includes('invalid api key') ||
        errorMessage.toLowerCase().includes('authentication failed') ||
        errorMessage.toLowerCase().includes('api_key_invalid') ||
        errorMessage.toLowerCase().includes('api key not found') ||
        errorMessage.toLowerCase().includes('invalid_key') ||
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('401')
      );

      if (isAuthErr) {
        item.status = 'error';
        item.enabled = false;
      } else if (item.failureCount >= 3) {
        item.status = 'cooldown';
      }
    }

    localStorage.setItem(getKeysListKey(), JSON.stringify(keys));
  } catch (err) {
    console.warn('Could not record client key usage:', err);
  }
}
