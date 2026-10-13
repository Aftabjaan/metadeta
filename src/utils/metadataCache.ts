import { StockMetadata, PromptBuildOptions } from '../types';

interface CachedEntry {
  metadata: StockMetadata;
  provider: string;
  keyLabel: string;
  model: string;
  timestamp: number;
}

const LOCAL_METADATA_CACHE_KEY = 'stock_pro_metadata_cache_store';

class MetadataCacheManager {
  private memoryCache = new Map<string, CachedEntry>();
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days persistent TTL

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(LOCAL_METADATA_CACHE_KEY);
      if (raw) {
        const parsed: Record<string, CachedEntry> = JSON.parse(raw);
        const now = Date.now();
        let hasEmptyOrStale = false;
        const cleaned: Record<string, CachedEntry> = {};

        for (const [k, v] of Object.entries(parsed)) {
          const isEmpty = v.metadata && (!v.metadata.title && (!v.metadata.keywords || v.metadata.keywords.length === 0));
          const isStale = now - v.timestamp >= this.CACHE_TTL_MS;
          
          if (!isEmpty && !isStale) {
            this.memoryCache.set(k, v);
            cleaned[k] = v;
          } else {
            hasEmptyOrStale = true;
          }
        }

        if (hasEmptyOrStale) {
          localStorage.setItem(LOCAL_METADATA_CACHE_KEY, JSON.stringify(cleaned));
        }
      }
    } catch (e) {
      console.warn('[MetadataCache] Error loading persistent cache:', e);
    }
  }

  private persistToStorage() {
    if (typeof window === 'undefined') return;
    try {
      const obj: Record<string, CachedEntry> = {};
      this.memoryCache.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem(LOCAL_METADATA_CACHE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('[MetadataCache] Error persisting cache:', e);
    }
  }

  /**
   * Generates a deterministic cache key based on file hash and generation parameters.
   */
  public generateKey(
    fileContentHash: string,
    options: PromptBuildOptions,
    provider: string,
    model: string
  ): string {
    const markets = options.selectedMarketplaces?.join(',') || options.marketplace || 'generic';
    const assetType = options.assetType || 'photo';
    const titleLen = options.titleSettings?.maxLength || 70;
    const kwTarget = options.keywordSettings?.targetCount || 30;
    return `${fileContentHash}_${provider}_${model}_${markets}_${assetType}_${titleLen}_${kwTarget}`;
  }

  public get(key: string): CachedEntry | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.memoryCache.delete(key);
      this.persistToStorage();
      return null;
    }
    return entry;
  }

  public set(
    key: string,
    metadata: StockMetadata,
    provider: string,
    keyLabel: string,
    model: string
  ): void {
    // Never cache metadata if both title and keywords are empty
    if (!metadata || (!metadata.title && (!metadata.keywords || metadata.keywords.length === 0))) {
      return;
    }

    if (this.memoryCache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }

    this.memoryCache.set(key, {
      metadata: JSON.parse(JSON.stringify(metadata)),
      provider,
      keyLabel,
      model,
      timestamp: Date.now(),
    });

    this.persistToStorage();
  }

  public clear(): number {
    const clearedCount = this.memoryCache.size;
    this.memoryCache.clear();
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(LOCAL_METADATA_CACHE_KEY);
      } catch {}
    }
    return clearedCount;
  }

  public getStats(): { count: number; formattedSize: string } {
    const count = this.memoryCache.size;
    let sizeBytes = 0;
    try {
      const raw = localStorage.getItem(LOCAL_METADATA_CACHE_KEY);
      if (raw) sizeBytes = raw.length * 2;
    } catch {}

    const kb = (sizeBytes / 1024).toFixed(1);
    const mb = (sizeBytes / (1024 * 1024)).toFixed(2);
    const formattedSize = sizeBytes > 1024 * 1024 ? `${mb} MB` : `${kb} KB`;

    return { count, formattedSize };
  }
}

export const metadataCache = new MetadataCacheManager();
