import { useEffect, useState } from 'react';
import { ApiKeyEntry, BulkImportResult } from '../types';
import {
  getClientApiKeys,
  getClientRawKey,
  saveClientApiKey,
  saveClientApiKeysBulk,
  updateClientApiKey,
  deleteClientApiKey,
  deleteAllClientApiKeys,
  recordClientKeyUsage,
  setActiveStorageUserId,
} from './clientKeyStorage';
import {
  verifyGeminiKeyClient,
  verifyGroqKeyClient,
} from './clientAiService';
import { getAuthHeaders } from './apiClient';
import { parseKeysFromText } from './keyParser';
import { detectProviderFromKeyPattern, verifyKeyProvider } from './keyValidation';

export interface KeyCounts {
  geminiTotal: number;
  geminiActive: number;
  geminiUser: number;
  geminiSystem: number;
  groqTotal: number;
  groqActive: number;
  groqUser: number;
  groqSystem: number;
  openaiTotal: number;
  openaiActive: number;
  openaiUser: number;
  openaiSystem: number;
  totalSystem: number;
  totalUser: number;
  totalKeys: number;
  totalActive: number;
}

type Listener = () => void;

class ApiProviderStore {
  private listeners = new Set<Listener>();
  private geminiRotationIndex = 0;
  private groqRotationIndex = 0;

  constructor() {
    // Initial setup
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.error('Error in aiProviderStore listener:', err);
      }
    }
  }

  public setUserId(userId: string | null | undefined) {
    setActiveStorageUserId(userId);
    this.notify();
  }

  public syncFromServer(): Promise<void> {
    this.notify();
    return Promise.resolve();
  }

  /**
   * Returns all user-configured BYOK keys.
   */
  public getAllKeys(): ApiKeyEntry[] {
    return getClientApiKeys();
  }

  public getGeminiKeys(): ApiKeyEntry[] {
    return this.getAllKeys().filter((k) => k.provider === 'gemini');
  }

  public getGroqKeys(): ApiKeyEntry[] {
    return this.getAllKeys().filter((k) => k.provider === 'groq');
  }

  public getGeminiUserKeys(): ApiKeyEntry[] {
    return this.getGeminiKeys();
  }

  public getGroqUserKeys(): ApiKeyEntry[] {
    return this.getGroqKeys();
  }

  public getUserKeys(provider?: 'gemini' | 'groq'): ApiKeyEntry[] {
    const keys = this.getAllKeys();
    if (!provider) return keys;
    return keys.filter((k) => k.provider === provider);
  }

  public getSystemKeys(provider?: 'gemini' | 'groq'): ApiKeyEntry[] {
    // No system keys exist - strict BYOK
    return [];
  }

  public getGeminiSystemKeyStatus(): 'active' | 'not_configured' {
    return 'not_configured';
  }

  public getGroqSystemKeyStatus(): 'active' | 'not_configured' {
    return 'not_configured';
  }

  public getAllUserKeys(): ApiKeyEntry[] {
    return this.getAllKeys();
  }

  public getTotalConfiguredKeys(): number {
    return this.getAllKeys().length;
  }

  /**
   * Single unified key counts calculation.
   */
  public getKeyCounts(): KeyCounts {
    const all = this.getAllKeys();
    const gemini = all.filter((k) => k.provider === 'gemini');
    const groq = all.filter((k) => k.provider === 'groq');
    const openai = all.filter((k) => k.provider === 'openai');

    const geminiTotal = gemini.length;
    const geminiActive = gemini.filter((k) => k.enabled && k.status !== 'error').length;

    const groqTotal = groq.length;
    const groqActive = groq.filter((k) => k.enabled && k.status !== 'error').length;

    const openaiTotal = openai.length;
    const openaiActive = openai.filter((k) => k.enabled && k.status !== 'error').length;

    const totalKeys = geminiTotal + groqTotal + openaiTotal;
    const totalActive = geminiActive + groqActive + openaiActive;

    return {
      geminiTotal,
      geminiActive,
      geminiUser: geminiTotal,
      geminiSystem: 0,
      groqTotal,
      groqActive,
      groqUser: groqTotal,
      groqSystem: 0,
      openaiTotal,
      openaiActive,
      openaiUser: openaiTotal,
      openaiSystem: 0,
      totalSystem: 0,
      totalUser: totalKeys,
      totalKeys,
      totalActive,
    };
  }

  /**
   * Get rotated healthy keys for client execution.
   */
  public getRotatedKeys(provider: 'gemini' | 'groq'): { entry: ApiKeyEntry; rawKey: string }[] {
    const valid = this.getAllKeys().filter(
      (k) => k.provider === provider && k.enabled && k.status !== 'error'
    );

    const available: { entry: ApiKeyEntry; rawKey: string }[] = [];
    for (const entry of valid) {
      const raw = getClientRawKey(entry.id);
      if (raw && raw.trim()) {
        available.push({ entry, rawKey: raw.trim() });
      }
    }

    if (available.length <= 1) return available;

    const currentIndex = provider === 'gemini' ? this.geminiRotationIndex : this.groqRotationIndex;
    const startIdx = currentIndex % available.length;

    if (provider === 'gemini') {
      this.geminiRotationIndex = (this.geminiRotationIndex + 1) % available.length;
    } else {
      this.groqRotationIndex = (this.groqRotationIndex + 1) % available.length;
    }

    return [...available.slice(startIdx), ...available.slice(0, startIdx)];
  }

  public getActiveKey(provider: 'gemini' | 'groq' | 'openai'): ApiKeyEntry | null {
    const pool = this.getAllKeys().filter(
      (k) => k.provider === provider && k.enabled && k.status !== 'error'
    );
    return pool.length > 0 ? pool[0] : null;
  }

  public parseKeyInput(text: string): string[] {
    const res = parseKeysFromText(text);
    return res.tokens;
  }

  public addKey(provider: 'gemini' | 'groq', rawKey: string, label?: string): ApiKeyEntry {
    const cleanKey = rawKey.trim().replace(/^["'`]|["'`]$/g, '');
    if (!cleanKey || cleanKey.length < 16) {
      throw new Error('API key must be at least 16 characters');
    }

    const pattern = detectProviderFromKeyPattern(cleanKey);
    if (provider === 'gemini' && pattern === 'groq') {
      throw new Error('This is a Groq API key. Please enter a Gemini API key.');
    }
    if (provider === 'groq' && pattern === 'gemini') {
      throw new Error('This is a Gemini API key. Please enter a Groq API key.');
    }

    // Check duplicate
    const existing = this.getUserKeys(provider);
    for (const k of existing) {
      const existingRaw = getClientRawKey(k.id);
      if (existingRaw && existingRaw.trim() === cleanKey) {
        // Return existing key so frontend can re-test it
        return k;
      }
    }

    const entry = saveClientApiKey(provider, label || '', cleanKey);
    this.notify();
    return entry;
  }

  public addGeminiKey(rawKey: string, label?: string): ApiKeyEntry {
    return this.addKey('gemini', rawKey, label);
  }

  public addGroqKey(rawKey: string, label?: string): ApiKeyEntry {
    return this.addKey('groq', rawKey, label);
  }

  public importBulkKeys(
    provider: 'gemini' | 'groq',
    text: string,
    labelPrefix?: string
  ): BulkImportResult {
    const parseRes = parseKeysFromText(text);
    
    // Filter out pattern mismatch tokens before saving bulk keys
    const validTokens: string[] = [];
    let mismatchCount = 0;
    for (const token of parseRes.tokens) {
      const pattern = detectProviderFromKeyPattern(token);
      if (provider === 'gemini' && pattern === 'groq') {
        mismatchCount++;
        continue;
      }
      if (provider === 'groq' && pattern === 'gemini') {
        mismatchCount++;
        continue;
      }
      validTokens.push(token);
    }

    const res = saveClientApiKeysBulk(provider, validTokens, labelPrefix);
    const totalDuplicates = parseRes.duplicateCount + res.duplicatesSkipped;
    const totalInvalid = res.invalidKeysSkipped + parseRes.rejectedTokens.length + mismatchCount;

    const finalResult: BulkImportResult = {
      totalDetected: parseRes.totalDetected,
      added: res.added,
      duplicatesSkipped: totalDuplicates,
      invalidKeysSkipped: totalInvalid,
      addedKeys: res.addedKeys,
    };
    this.notify();
    return finalResult;
  }

  public removeKey(id: string): boolean {
    const ok = deleteClientApiKey(id);
    this.notify();
    return ok;
  }

  public removeGeminiKey(id: string): boolean {
    return this.removeKey(id);
  }

  public removeGroqKey(id: string): boolean {
    return this.removeKey(id);
  }

  public deleteAllGeminiKeys(): number {
    return this.deleteAllUserKeys('gemini');
  }

  public deleteAllGroqKeys(): number {
    return this.deleteAllUserKeys('groq');
  }

  public deleteAllUserKeys(provider?: 'gemini' | 'groq'): number {
    const deletedCount = deleteAllClientApiKeys(provider);

    // Reset rotation indices
    if (!provider || provider === 'gemini') {
      this.geminiRotationIndex = 0;
    }
    if (!provider || provider === 'groq') {
      this.groqRotationIndex = 0;
    }

    // Sync deletion to server if running
    try {
      const url = provider ? `/api/keys?provider=${provider}` : '/api/keys';
      fetch(url, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }).catch(() => {});
    } catch {}

    this.notify();
    return deletedCount;
  }

  public deleteAllKeys(): number {
    return this.deleteAllUserKeys();
  }

  public toggleKey(id: string, enabled: boolean): boolean {
    const ok = updateClientApiKey(id, { enabled });
    this.notify();
    return ok;
  }

  public async testKey(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const raw = getClientRawKey(id);
    const userKey = this.getAllKeys().find((k) => k.id === id);

    if (raw && userKey) {
      const res = await verifyKeyProvider(raw, userKey.provider);

      if (res.success) {
        updateClientApiKey(id, { status: 'active', lastError: undefined });
      } else {
        const isRateLimit =
          res.error?.includes('429') ||
          res.error?.includes('quota') ||
          res.error?.includes('RESOURCE_EXHAUSTED');
        updateClientApiKey(id, {
          status: isRateLimit ? 'cooldown' : 'error',
          lastError: res.error,
        });
      }
      this.notify();
      return res;
    }

    return { success: false, error: 'Key not found in local vault.' };
  }

  public putKeyInCooldown(id: string, durationMs = 60000, errorMsg?: string) {
    recordClientKeyUsage(id, false, errorMsg);
    updateClientApiKey(id, { status: 'cooldown', lastError: errorMsg });
    this.notify();

    setTimeout(() => {
      const current = this.getAllKeys().find((k) => k.id === id);
      if (current && current.status === 'cooldown') {
        updateClientApiKey(id, { status: 'active', lastError: undefined });
        this.notify();
      }
    }, durationMs);
  }

  public recordKeyUsage(id: string, success: boolean, errorMsg?: string) {
    recordClientKeyUsage(id, success, errorMsg);
    this.notify();
  }
}

export const apiKeyStore = new ApiProviderStore();

/**
 * React Hook that provides real-time reactive access to the unified ApiProviderStore.
 */
export function useAiProviderStore() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = apiKeyStore.subscribe(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  return {
    allKeys: apiKeyStore.getAllKeys(),
    geminiKeys: apiKeyStore.getGeminiKeys(),
    groqKeys: apiKeyStore.getGroqKeys(),
    userKeys: apiKeyStore.getUserKeys(),
    geminiUserKeys: apiKeyStore.getGeminiUserKeys(),
    groqUserKeys: apiKeyStore.getGroqUserKeys(),
    geminiSystemStatus: apiKeyStore.getGeminiSystemKeyStatus(),
    groqSystemStatus: apiKeyStore.getGroqSystemKeyStatus(),
    systemKeys: apiKeyStore.getSystemKeys(),
    keyCounts: apiKeyStore.getKeyCounts(),
    totalConfiguredKeys: apiKeyStore.getTotalConfiguredKeys(),
    activeGeminiKey: apiKeyStore.getActiveKey('gemini'),
    activeGroqKey: apiKeyStore.getActiveKey('groq'),
    addKey: (provider: 'gemini' | 'groq', key: string, label?: string) =>
      apiKeyStore.addKey(provider, key, label),
    addGeminiKey: (key: string, label?: string) => apiKeyStore.addGeminiKey(key, label),
    addGroqKey: (key: string, label?: string) => apiKeyStore.addGroqKey(key, label),
    importBulk: (provider: 'gemini' | 'groq', text: string, prefix?: string) =>
      apiKeyStore.importBulkKeys(provider, text, prefix),
    removeKey: (id: string) => apiKeyStore.removeKey(id),
    removeGeminiKey: (id: string) => apiKeyStore.removeKey(id),
    removeGroqKey: (id: string) => apiKeyStore.removeKey(id),
    deleteAllGeminiKeys: () => apiKeyStore.deleteAllGeminiKeys(),
    deleteAllGroqKeys: () => apiKeyStore.deleteAllGroqKeys(),
    deleteAllUserKeys: (provider?: 'gemini' | 'groq') => apiKeyStore.deleteAllUserKeys(provider),
    deleteAllKeys: () => apiKeyStore.deleteAllKeys(),
    toggleKey: (id: string, enabled: boolean) => apiKeyStore.toggleKey(id, enabled),
    testKey: (id: string) => apiKeyStore.testKey(id),
    syncFromServer: () => apiKeyStore.syncFromServer(),
  };
}
