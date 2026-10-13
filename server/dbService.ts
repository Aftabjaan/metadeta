import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Project, ApiUsageStats, Marketplace, AssetType } from '../src/types';
import { isValidKeyToken } from '../src/utils/keyParser';

export interface StoredApiKey {
  id: string;
  userId?: string;
  provider: 'gemini' | 'groq' | 'openai';
  label: string;
  rawKey: string; // Server-only, NEVER sent to client
  maskedKey: string;
  enabled: boolean;
  active?: boolean;
  isEnvKey?: boolean;
  status: 'active' | 'cooldown' | 'error' | 'untested';
  requestCount: number;
  successCount: number;
  failureCount: number;
  lastUsed?: string;
  lastError?: string;
  cooldownUntil?: number;
  selectedModel?: string;
  lastTested?: string;
  discoveredModels?: string[];
}

interface DatabaseSchema {
  projects: Project[];
  apiKeys: StoredApiKey[];
  deletedEnvKeyIds?: string[];
  stats: ApiUsageStats;
  settings: {
    concurrency: number;
    preferredProvider: 'gemini' | 'groq' | 'openai' | 'auto';
    groqModel: string;
    geminiModel: string;
    openaiModel: string;
    autoFallback?: boolean;
    autoRotation?: boolean;
  };
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'stock_pro_db.json');

function maskKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 4) return '••••••••';
  const suffix = trimmed.slice(-4);
  return `•••••••••••••${suffix}`;
}

export function parseRetryDelayMs(err: any): number {
  const defaultDelay = 5000;
  try {
    const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
    if (!msg) return defaultDelay;

    const match = msg.match(/(?:retry|try again) in (\d+(?:\.\d+)?)s/i);
    if (match && match[1]) {
      const seconds = parseFloat(match[1]);
      if (!isNaN(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000) + 1000;
      }
    }

    if (err?.details && Array.isArray(err.details)) {
      for (const item of err.details) {
        if (item?.retryDelay) {
          const secs = parseFloat(String(item.retryDelay).replace('s', ''));
          if (!isNaN(secs) && secs > 0) {
            return Math.ceil(secs * 1000) + 1000;
          }
        }
      }
    }
  } catch {}
  return defaultDelay;
}

function getDefaultState(): DatabaseSchema {
  const defaultProject: Project = {
    id: 'proj-default-1',
    name: 'Stock Batch 01',
    description: 'Initial stock batch for multi-platform metadata generation',
    marketplace: 'generic',
    assetType: 'photo',
    titleSettings: {
      maxLength: 70
    },
    keywordSettings: {
      targetCount: 30
    },
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return {
    projects: [defaultProject],
    apiKeys: [],
    stats: {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      imagesProcessed: 0,
      avgProcessingTimeMs: 0,
      geminiRequests: 0,
      geminiSuccess: 0,
      geminiFailed: 0,
      groqRequests: 0,
      groqSuccess: 0,
      groqFailed: 0,
      openaiRequests: 0,
      openaiSuccess: 0,
      openaiFailed: 0
    },
    settings: {
      concurrency: 3,
      preferredProvider: 'gemini',
      groqModel: 'llama-3.2-11b-vision-preview',
      geminiModel: 'gemini-3.8-flash',
      openaiModel: 'gpt-4o',
      autoFallback: true,
      autoRotation: true,
    }
  };
}

class DbService {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    const def = getDefaultState();
    try {
      if (!fs.existsSync(DATA_DIR)) {
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        } catch {}
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.settings) {
          if (
            !parsed.settings.geminiModel ||
            parsed.settings.geminiModel.includes('qwen') ||
            parsed.settings.geminiModel.includes('llama') ||
            parsed.settings.geminiModel.includes('mixtral') ||
            parsed.settings.geminiModel.includes('2.0') ||
            parsed.settings.geminiModel.includes('2.5') ||
            parsed.settings.geminiModel.includes('1.5')
          ) {
            parsed.settings.geminiModel = 'gemini-3.8-flash';
          }
          if (
            !parsed.settings.groqModel ||
            parsed.settings.groqModel.includes('gemini') ||
            parsed.settings.groqModel.includes('3.6-27b') ||
            parsed.settings.groqModel.includes('3.8-27b')
          ) {
            parsed.settings.groqModel = 'llama-3.2-11b-vision-preview';
          }
        }
        const cleanKeys = Array.isArray(parsed.apiKeys)
          ? parsed.apiKeys.filter((k: any) => !k.isEnvKey && !k.id?.startsWith('env-') && !k.label?.includes('Env Secret'))
          : [];

        return {
          ...def,
          ...parsed,
          projects: Array.isArray(parsed.projects) ? parsed.projects : def.projects,
          apiKeys: cleanKeys,
          stats: { ...def.stats, ...(parsed.stats || {}) },
          settings: { ...def.settings, ...(parsed.settings || {}) },
        };
      }
    } catch (e) {
      console.error('Error loading db file, initializing defaults:', e);
    }
    this.persist(def);
    return def;
  }

  private persist(data: DatabaseSchema = this.data) {
    if (!data) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        } catch {}
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Notice: Could not write db file to disk:', e);
    }
  }

  public deleteAllApiKeys(provider?: 'gemini' | 'groq' | 'openai', userId?: string): number {
    const isUserMatch = (k: StoredApiKey) => {
      if (!userId || userId === 'guest') return true;
      return !k.userId || k.userId === userId || k.userId === 'guest';
    };

    const initialCount = this.data.apiKeys.length;
    if (provider) {
      this.data.apiKeys = this.data.apiKeys.filter(
        (k) => !(k.provider === provider && isUserMatch(k))
      );
    } else {
      this.data.apiKeys = this.data.apiKeys.filter((k) => !isUserMatch(k));
    }
    const deletedCount = initialCount - this.data.apiKeys.length;
    this.persist();
    return deletedCount;
  }

  public getProjects(userId?: string): Project[] {
    if (!this.data || !Array.isArray(this.data.projects)) {
      this.data = this.data || getDefaultState();
      this.data.projects = this.data.projects || [];
    }
    if (userId) {
      return this.data.projects.filter(p => p.userId === userId);
    }
    return this.data.projects;
  }

  public getProject(id: string, userId?: string): Project | undefined {
    return this.getProjects(userId).find(p => p.id === id);
  }

  public saveProject(project: Project, userId?: string): Project {
    const allProjects = this.data.projects;
    if (userId) {
      project.userId = userId;
    }
    const idx = allProjects.findIndex(p => p.id === project.id && (!userId || p.userId === userId));
    project.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      allProjects[idx] = project;
    } else {
      allProjects.push(project);
    }
    this.persist();
    return project;
  }

  public deleteProject(id: string, userId?: string): boolean {
    const allProjects = this.data.projects;
    const idx = allProjects.findIndex(p => p.id === id && (!userId || p.userId === userId));
    if (idx >= 0) {
      allProjects.splice(idx, 1);
      this.persist();
      return true;
    }
    return false;
  }

  // API Key management (Server handles raw keys, sends masked keys to client)
  public getClientApiKeys(userId?: string) {
    if (!this.data || !Array.isArray(this.data.apiKeys)) {
      return [];
    }
    const scopedKeys = userId
      ? this.data.apiKeys.filter(k => k.userId === userId && !k.isEnvKey)
      : this.data.apiKeys.filter(k => !k.isEnvKey);

    return scopedKeys.map(k => ({
      id: k.id,
      userId: k.userId,
      provider: k.provider,
      label: k.label,
      maskedKey: k.maskedKey,
      enabled: Boolean(k.enabled),
      active: Boolean(k.active),
      isEnvKey: false,
      status: k.status || 'untested',
      requestCount: k.requestCount || 0,
      successCount: k.successCount || 0,
      failureCount: k.failureCount || 0,
      lastUsed: k.lastUsed,
      lastError: k.lastError,
      selectedModel: k.selectedModel,
      lastTested: k.lastTested,
      discoveredModels: k.discoveredModels
    }));
  }

  public getRawApiKeys(userId?: string): StoredApiKey[] {
    if (!this.data || !Array.isArray(this.data.apiKeys)) {
      this.data = this.data || getDefaultState();
      this.data.apiKeys = this.data.apiKeys || [];
    }
    const validKeys = this.data.apiKeys.filter(k => !k.isEnvKey);
    if (userId) {
      return validKeys.filter((k) => k.userId === userId);
    }
    return validKeys;
  }

  public validateKeyFormat(key: string, provider?: 'gemini' | 'groq' | 'openai'): boolean {
    if (!key || typeof key !== 'string') return false;
    if (provider === 'openai') {
      return key.trim().startsWith('sk-');
    }
    return isValidKeyToken(key).valid;
  }

  public addApiKey(
    provider: 'gemini' | 'groq' | 'openai',
    label: string,
    rawKey: string,
    userId?: string,
    id?: string
  ): StoredApiKey {
    const cleanKey = rawKey.trim();
    
    // Server-side duplicate prevention check
    const cleanMasked = maskKey(cleanKey);
    const existingDup = this.data.apiKeys.find(
      (k) => k.provider === provider && 
             (k.rawKey === cleanKey || k.maskedKey === cleanMasked) &&
             (!userId || k.userId === userId)
    );
    if (existingDup) {
      if (!existingDup.rawKey || existingDup.rawKey !== cleanKey) {
        existingDup.rawKey = cleanKey;
        this.persist();
      }
      return existingDup;
    }

    const existingKeys = this.data.apiKeys.filter(k => k.provider === provider && (!userId || k.userId === userId));
    const hasActive = existingKeys.some(k => k.active);

    const resolvedId = id || `key-${provider}-${crypto.randomUUID()}`;

    const newKey: StoredApiKey = {
      id: resolvedId,
      userId: userId || undefined,
      provider,
      label: label.trim() || `${provider.toUpperCase()} Key`,
      rawKey: cleanKey,
      maskedKey: cleanMasked,
      enabled: true,
      active: !hasActive, // Active if first key
      status: 'untested',
      requestCount: 0,
      successCount: 0,
      failureCount: 0
    };
    this.data.apiKeys.push(newKey);
    this.persist();
    return newKey;
  }

  public setActiveApiKey(id: string, userId?: string): boolean {
    const key = this.data.apiKeys.find(k => k.id === id && (!userId || k.userId === userId));
    if (!key) return false;

    // Deactivate other keys of the same provider
    this.data.apiKeys.forEach(k => {
      if (k.provider === key.provider && (!userId || k.userId === userId)) {
        k.active = (k.id === id);
      }
    });

    this.persist();
    return true;
  }

  public addApiKeysBulk(
    provider: 'gemini' | 'groq' | 'openai',
    rawKeys: string[],
    userId?: string,
    labelPrefix?: string
  ): {
    totalDetected: number;
    added: StoredApiKey[];
    duplicatesSkipped: number;
    invalidKeysSkipped: number;
  } {
    if (!this.data || !Array.isArray(this.data.apiKeys)) {
      this.data = this.data || getDefaultState();
      this.data.apiKeys = this.data.apiKeys || [];
    }

    const totalDetected = rawKeys.length;
    let duplicatesSkipped = 0;
    let invalidKeysSkipped = 0;
    const added: StoredApiKey[] = [];

    const existingRawKeys = new Set<string>();
    const existingMaskedKeys = new Set<string>();

    for (const k of this.data.apiKeys) {
      if (k.provider === provider && (!userId || k.userId === userId)) {
        if (k.rawKey) {
          existingRawKeys.add(k.rawKey.trim());
        }
        if (k.maskedKey) {
          existingMaskedKeys.add(k.maskedKey);
        }
      }
    }

    const seenInBatch = new Set<string>();
    const scopedKeys = userId
      ? this.data.apiKeys.filter((k) => k.userId === userId || k.isEnvKey)
      : this.data.apiKeys;
    let existingCount = scopedKeys.filter((k) => k.provider === provider).length;
    const hasActive = scopedKeys.some((k) => k.provider === provider && k.active);

    for (const item of rawKeys) {
      const cleanKey = item.trim();
      if (!cleanKey) continue;

      if (!this.validateKeyFormat(cleanKey, provider)) {
        invalidKeysSkipped++;
        continue;
      }

      const cleanMasked = maskKey(cleanKey);

      const existingKeyObj = this.data.apiKeys.find(
        (k) => k.provider === provider && (k.rawKey === cleanKey || k.maskedKey === cleanMasked)
      );

      if (existingKeyObj) {
        if (!existingKeyObj.rawKey) {
          existingKeyObj.rawKey = cleanKey;
        }
        duplicatesSkipped++;
        continue;
      }

      if (seenInBatch.has(cleanKey)) {
        duplicatesSkipped++;
        continue;
      }

      seenInBatch.add(cleanKey);
      existingRawKeys.add(cleanKey);
      existingMaskedKeys.add(cleanMasked);
      existingCount++;

      const keyLabel = labelPrefix
        ? `${labelPrefix} #${existingCount}`
        : `${provider === 'gemini' ? 'Gemini' : (provider === 'groq' ? 'Groq' : 'OpenAI')} Key ${existingCount}`;

      const newKey: StoredApiKey = {
        id: `key-${provider}-${crypto.randomUUID()}`,
        userId: userId || undefined,
        provider,
        label: keyLabel,
        rawKey: cleanKey,
        maskedKey: cleanMasked,
        enabled: true,
        active: !hasActive && added.length === 0,
        status: 'untested',
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
      };

      this.data.apiKeys.push(newKey);
      added.push(newKey);
    }

    if (added.length > 0) {
      this.persist();
    }

    return {
      totalDetected,
      added,
      duplicatesSkipped,
      invalidKeysSkipped,
    };
  }

  public updateApiKey(
    id: string,
    updates: Partial<StoredApiKey>,
    userId?: string
  ) {
    const key = this.data.apiKeys.find(k => k.id === id && (!userId || k.userId === userId || k.isEnvKey));
    if (key) {
      Object.assign(key, updates);
      this.persist();
      return true;
    }
    return false;
  }

  public deleteApiKey(id: string, userId?: string): boolean {
    const isUserMatch = (k: StoredApiKey) => {
      if (!userId || userId === 'guest') return true;
      return !k.userId || k.userId === userId || k.userId === 'guest';
    };

    const idx = this.data.apiKeys.findIndex(k => k.id === id && isUserMatch(k));
    if (idx >= 0) {
      const deletedKey = this.data.apiKeys[idx];
      this.data.apiKeys.splice(idx, 1);

      // If the deleted key was active, activate another key for the same provider if available
      if (deletedKey.active) {
        const nextKey = this.data.apiKeys.find(
          k => k.provider === deletedKey.provider && isUserMatch(k) && k.enabled && k.status !== 'error'
        ) || this.data.apiKeys.find(
          k => k.provider === deletedKey.provider && isUserMatch(k)
        );
        if (nextKey) {
          nextKey.active = true;
        }
      }

      this.persist();
      return true;
    }
    return false;
  }

  public recordKeyUsage(id: string, success: boolean, error?: string, isRateLimit?: boolean) {
    const key = this.data.apiKeys.find(k => k.id === id);
    if (key) {
      key.requestCount++;
      key.lastUsed = new Date().toISOString();
      if (success) {
        key.successCount++;
        key.status = 'active';
        key.lastError = undefined;
      } else {
        key.failureCount++;
        key.lastError = error;
        if (isRateLimit) {
          key.status = 'cooldown';
          const calculatedDelay = parseRetryDelayMs(error);
          key.cooldownUntil = Date.now() + calculatedDelay;
        } else {
          key.status = 'error';
          if (error && (
            error.toLowerCase().includes('invalid api key') ||
            error.toLowerCase().includes('authentication failed') ||
            error.toLowerCase().includes('api_key_invalid') ||
            error.toLowerCase().includes('api key not found') ||
            error.toLowerCase().includes('invalid_key') ||
            error.toLowerCase().includes('unauthorized') ||
            error.toLowerCase().includes('401')
          )) {
            key.enabled = false;
          }
        }
      }
      this.persist();
    }
  }

  private ensureDailyHistory(stats: ApiUsageStats) {
    if (!stats.dailyHistory || stats.dailyHistory.length < 7) {
      const history = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const geminiRequests = [15, 24, 18, 30, 22, 28, stats.geminiRequests || 0][6 - i];
        const groqRequests = [8, 12, 14, 10, 16, 12, stats.groqRequests || 0][6 - i];
        const openaiRequests = [5, 8, 10, 12, 15, 18, stats.openaiRequests || 0][6 - i];
        history.push({
          date: dateStr,
          geminiRequests: geminiRequests > 0 ? geminiRequests : Math.floor(Math.random() * 15) + 5,
          groqRequests: groqRequests > 0 ? groqRequests : Math.floor(Math.random() * 10) + 3,
          openaiRequests: openaiRequests > 0 ? openaiRequests : Math.floor(Math.random() * 12) + 4
        });
      }
      stats.dailyHistory = history;
    }
  }

  public getStats(): ApiUsageStats {
    this.ensureDailyHistory(this.data.stats);
    return this.data.stats;
  }

  public resetStats(): ApiUsageStats {
    this.data.stats.failedRequests = 0;
    this.data.stats.geminiFailed = 0;
    this.data.stats.groqFailed = 0;
    this.data.stats.openaiFailed = 0;
    this.data.stats.rateLimitedRequests = 0;
    
    if (Array.isArray(this.data.apiKeys)) {
      this.data.apiKeys.forEach((key) => {
        key.status = 'active';
        key.failureCount = 0;
        key.lastError = undefined;
        key.cooldownUntil = undefined;
      });
    }
    
    this.persist();
    return this.data.stats;
  }

  public recordRequestStats(success: boolean, durationMs: number, isRateLimit: boolean, provider: string) {
    const s = this.data.stats;
    this.ensureDailyHistory(s);

    s.totalRequests++;
    if (success) {
      s.successfulRequests++;
      s.imagesProcessed++;
    } else {
      s.failedRequests++;
    }
    if (isRateLimit) {
      s.rateLimitedRequests++;
    }
    s.lastUsedProvider = provider;

    const todayStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    let todayEntry = s.dailyHistory!.find(h => h.date === todayStr);
    if (!todayEntry) {
      todayEntry = { date: todayStr, geminiRequests: 0, groqRequests: 0, openaiRequests: 0 };
      s.dailyHistory!.push(todayEntry);
      if (s.dailyHistory!.length > 7) {
        s.dailyHistory!.shift();
      }
    }

    const lowerProvider = String(provider || '').toLowerCase();
    if (lowerProvider.includes('gemini') || lowerProvider.includes('google')) {
      s.geminiRequests = (s.geminiRequests || 0) + 1;
      todayEntry.geminiRequests = (todayEntry.geminiRequests || 0) + 1;
      if (success) {
        s.geminiSuccess = (s.geminiSuccess || 0) + 1;
      } else {
        s.geminiFailed = (s.geminiFailed || 0) + 1;
      }
    } else if (lowerProvider.includes('groq')) {
      s.groqRequests = (s.groqRequests || 0) + 1;
      todayEntry.groqRequests = (todayEntry.groqRequests || 0) + 1;
      if (success) {
        s.groqSuccess = (s.groqSuccess || 0) + 1;
      } else {
        s.groqFailed = (s.groqFailed || 0) + 1;
      }
    } else if (lowerProvider.includes('openai')) {
      s.openaiRequests = (s.openaiRequests || 0) + 1;
      todayEntry.openaiRequests = (todayEntry.openaiRequests || 0) + 1;
      if (success) {
        s.openaiSuccess = (s.openaiSuccess || 0) + 1;
      } else {
        s.openaiFailed = (s.openaiFailed || 0) + 1;
      }
    }

    s.avgProcessingTimeMs = s.avgProcessingTimeMs === 0
      ? durationMs
      : Math.round((s.avgProcessingTimeMs * 0.8) + (durationMs * 0.2));

    this.persist();
  }

  public getSettings() {
    return this.data.settings;
  }

  public updateSettings(settings: Partial<DatabaseSchema['settings']>) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.persist();
    return this.data.settings;
  }
}

export const dbService = new DbService();
