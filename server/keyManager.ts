import { dbService, StoredApiKey } from './dbService';
import { geminiService } from './geminiService';
import { groqService } from './groqService';
import { AIProvider, PromptBuildOptions, StockMetadata } from '../src/types';

function resolveEffectiveModelLocal(provider: 'gemini' | 'groq', requested?: string): string {
  const clean = requested && typeof requested === 'string' ? requested.trim().replace(/^models\//, '') : '';
  if (provider === 'gemini') {
    if (!clean) return 'gemini-3.8-flash';
    const lower = clean.toLowerCase();
    if (
      clean.includes('qwen') ||
      clean.includes('llama') ||
      clean.includes('mixtral') ||
      clean.includes('scenic') ||
      clean.includes('2.0') ||
      clean.includes('2.5') ||
      clean.includes('1.5') ||
      lower.includes('1.0') ||
      lower === 'gemini-pro'
    ) {
      return 'gemini-3.8-flash';
    }
    return clean;
  } else {
    if (!clean || clean.includes('deprecated') || clean.includes('decommissioned') || clean.includes('gemini')) {
      return 'llama-3.2-11b-vision-preview';
    }
    return clean;
  }
}

export class KeyManager {
  private geminiIndex = 0;
  private groqIndex = 0;

  public getAvailableKeys(provider: 'gemini' | 'groq', allowErrors = false, userId = 'guest'): StoredApiKey[] {
    const allKeys = dbService
      .getRawApiKeys(userId)
      .filter((k) => k.provider === provider && k.enabled && k.rawKey && k.rawKey.trim().length > 0);

    if (allKeys.length === 0) return [];

    const now = Date.now();
    const readyKeys = allKeys.filter((k) => {
      // Exclude keys in rate limit cooldown
      if (k.status === 'cooldown' && k.cooldownUntil && k.cooldownUntil > now) {
        return false;
      }
      // Unless allowErrors is requested, exclude keys marked as failed/invalid
      if (!allowErrors && k.status === 'error') {
        return false;
      }
      return true;
    });

    if (readyKeys.length > 0) {
      return readyKeys;
    }

    if (allowErrors) {
      return [...allKeys].sort((a, b) => (a.failureCount || 0) - (b.failureCount || 0));
    }

    return [];
  }

  public getRotatedKeys(provider: 'gemini' | 'groq', allowErrors = false, userId = 'guest'): StoredApiKey[] {
    const available = this.getAvailableKeys(provider, allowErrors, userId);
    if (available.length <= 1) return available;

    let currentIndex = 0;
    if (provider === 'gemini') currentIndex = this.geminiIndex;
    else currentIndex = this.groqIndex;

    const startIdx = currentIndex % available.length;

    if (provider === 'gemini') {
      this.geminiIndex = (this.geminiIndex + 1) % available.length;
    } else {
      this.groqIndex = (this.groqIndex + 1) % available.length;
    }

    return [...available.slice(startIdx), ...available.slice(0, startIdx)];
  }

  private getEnvKey(provider: 'gemini' | 'groq'): string {
    if (provider === 'gemini') {
      return (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
    } else if (provider === 'groq') {
      return (process.env.GROQ_API_KEY || '').trim();
    }
    return '';
  }

  private createEnvKeyObject(provider: 'gemini' | 'groq', envKey: string): StoredApiKey {
    return {
      id: `env-${provider}-key`,
      provider,
      label: `Environment ${provider.toUpperCase()} Key`,
      rawKey: envKey,
      maskedKey: envKey.length > 4 ? `••••••••••••${envKey.slice(-4)}` : '••••••••',
      enabled: true,
      status: 'active',
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      isEnvKey: true,
    };
  }

  public resolveSelectedProviderKey(
    provider: 'gemini' | 'groq',
    keyId?: string,
    userId = 'guest',
    clientKeys?: { provider: 'gemini' | 'groq'; id?: string; label?: string; rawKey: string }[]
  ): { keyObj: StoredApiKey; rawKey: string } {
    const allRawDbKeys = dbService.getRawApiKeys(userId);

    if (keyId) {
      // 1. Check if keyId exists in DB under any provider
      const matchedDb = allRawDbKeys.find((k) => k.id === keyId);
      if (matchedDb) {
        if (matchedDb.provider !== provider) {
          throw new Error(`Provider mismatch: Selected key "${matchedDb.label}" belongs to ${matchedDb.provider.toUpperCase()}, but active provider is ${provider.toUpperCase()}.`);
        }
        if (!matchedDb.rawKey || !matchedDb.rawKey.trim()) {
          throw new Error(`Selected key "${matchedDb.label}" has no valid API key content.`);
        }
        return { keyObj: matchedDb, rawKey: matchedDb.rawKey.trim() };
      }

      // 2. Check if keyId matches a client key passed in request
      if (Array.isArray(clientKeys)) {
        const matchedClient = clientKeys.find((ck) => ck.id === keyId && ck.rawKey && ck.rawKey.trim());
        if (matchedClient) {
          if (matchedClient.provider !== provider) {
            throw new Error(`Provider mismatch: Selected key belongs to ${matchedClient.provider.toUpperCase()}, but active provider is ${provider.toUpperCase()}.`);
          }
          const rawKey = matchedClient.rawKey.trim();
          const keyObj: StoredApiKey = {
            id: matchedClient.id || `client-${provider}-key`,
            provider: matchedClient.provider,
            label: matchedClient.label || `Client ${provider.toUpperCase()} Key`,
            rawKey,
            maskedKey: rawKey.length > 4 ? `••••••••••••${rawKey.slice(-4)}` : '••••••••',
            enabled: true,
            status: 'active',
            requestCount: 0,
            successCount: 0,
            failureCount: 0,
          };
          return { keyObj, rawKey };
        }
      }

      // 3. Check if keyId is an env key ID
      if (keyId === `env-${provider}-key`) {
        const envKey = this.getEnvKey(provider);
        if (envKey) {
          return { keyObj: this.createEnvKeyObject(provider, envKey), rawKey: envKey };
        }
      }

      // 4. Check if any client key or DB key matches by raw key matching if ID mismatched
      if (Array.isArray(clientKeys)) {
        const fallbackClient = clientKeys.find((ck) => ck.provider === provider && ck.rawKey && ck.rawKey.trim());
        if (fallbackClient) {
          const rawKey = fallbackClient.rawKey.trim();
          const keyObj: StoredApiKey = {
            id: fallbackClient.id || `client-${provider}-key`,
            provider: fallbackClient.provider,
            label: fallbackClient.label || `Client ${provider.toUpperCase()} Key`,
            rawKey,
            maskedKey: rawKey.length > 4 ? `••••••••••••${rawKey.slice(-4)}` : '••••••••',
            enabled: true,
            status: 'active',
            requestCount: 0,
            successCount: 0,
            failureCount: 0,
          };
          return { keyObj, rawKey };
        }
      }
    }

    // If no keyId specified or keyId was not found, find active key for this provider
    const providerKeys = allRawDbKeys.filter(
      (k) => k.provider === provider && k.enabled && k.rawKey && k.rawKey.trim().length > 0
    );

    // Prioritize key with active: true, then fallback to valid/status='active', then first available
    const activeKey = providerKeys.find((k) => k.active) || 
                      providerKeys.find((k) => k.status !== 'error') || 
                      providerKeys[0];
                      
    if (activeKey) {
      return { keyObj: activeKey, rawKey: activeKey.rawKey.trim() };
    }

    // Fallback to client keys provided in request
    if (Array.isArray(clientKeys)) {
      const fallbackClient = clientKeys.find((ck) => ck.provider === provider && ck.rawKey && ck.rawKey.trim());
      if (fallbackClient) {
        const rawKey = fallbackClient.rawKey.trim();
        const keyObj: StoredApiKey = {
          id: fallbackClient.id || `client-${provider}-key`,
          provider: fallbackClient.provider,
          label: fallbackClient.label || `Client ${provider.toUpperCase()} Key`,
          rawKey,
          maskedKey: rawKey.length > 4 ? `••••••••••••${rawKey.slice(-4)}` : '••••••••',
          enabled: true,
          status: 'active',
          requestCount: 0,
          successCount: 0,
          failureCount: 0,
        };
        return { keyObj, rawKey };
      }
    }

    // Fallback to environment variable for this provider
    const envKey = this.getEnvKey(provider);
    if (envKey) {
      return { keyObj: this.createEnvKeyObject(provider, envKey), rawKey: envKey };
    }

    throw new Error(`No active ${provider.toUpperCase()} API key configured. Please add a valid ${provider.toUpperCase()} API key in AI Settings.`);
  }

  private getCandidateKeysForProvider(
    prov: 'gemini' | 'groq',
    targetKeyId?: string,
    clientKeys?: { provider: 'gemini' | 'groq'; id?: string; label?: string; rawKey: string }[],
    userId = 'guest'
  ): { keyObj: StoredApiKey; rawKey: string }[] {
    const results: { keyObj: StoredApiKey; rawKey: string }[] = [];
    const seenIds = new Set<string>();
    const seenRawKeys = new Set<string>();

    const addCandidate = (cand: { keyObj: StoredApiKey; rawKey: string }) => {
      const trimmedRaw = cand.rawKey.trim();
      if (!trimmedRaw) return;
      const keyId = cand.keyObj.id || trimmedRaw;
      if (!seenIds.has(keyId) && !seenRawKeys.has(trimmedRaw)) {
        seenIds.add(keyId);
        seenRawKeys.add(trimmedRaw);
        results.push({ keyObj: cand.keyObj, rawKey: trimmedRaw });
      }
    };

    // 1. Resolve selected/active key if targetKeyId is given
    let primaryResolved = false;
    if (targetKeyId) {
      try {
        const resolved = this.resolveSelectedProviderKey(prov, targetKeyId, userId, clientKeys);
        addCandidate(resolved);
        primaryResolved = true;
      } catch (err: any) {
        if (err.message && err.message.startsWith('Provider mismatch')) {
          throw err;
        }
        console.warn(`[KeyManager] Specified keyId "${targetKeyId}" could not be resolved directly: ${err.message}`);
      }
    }

    // 2. Database keys for this provider (prioritizing the active key)
    const allDbKeys = dbService.getRawApiKeys(userId).filter(k => k.provider === prov && k.enabled && k.rawKey && k.rawKey.trim().length > 0);
    const activeDbKey = allDbKeys.find(k => k.active);

    if (activeDbKey && !primaryResolved) {
      addCandidate({ keyObj: activeDbKey, rawKey: activeDbKey.rawKey.trim() });
    }

    // 3. Client-provided keys for this provider from request body
    if (Array.isArray(clientKeys)) {
      for (const ck of clientKeys) {
        if (ck.provider === prov && ck.rawKey && ck.rawKey.trim()) {
          const rawKey = ck.rawKey.trim();
          addCandidate({
            keyObj: {
              id: ck.id || `client-${prov}-${Math.random().toString(36).substring(2, 6)}`,
              provider: prov,
              label: ck.label || `Client ${prov.toUpperCase()} Key`,
              rawKey,
              maskedKey: rawKey.length > 4 ? `••••••••••••${rawKey.slice(-4)}` : '••••••••',
              enabled: true,
              status: 'active',
              requestCount: 0,
              successCount: 0,
              failureCount: 0,
            },
            rawKey,
          });
        }
      }
    }

    // 4. Add other valid database keys of the same provider for rotation
    const activeDbKeys = this.getRotatedKeys(prov, false, userId);
    for (const k of activeDbKeys) {
      if (k.rawKey && k.rawKey.trim().length > 0) {
        addCandidate({ keyObj: k, rawKey: k.rawKey.trim() });
      }
    }

    // 5. Environment variable key fallback ONLY if there are no user keys at all!
    const hasUserKeys = allDbKeys.length > 0 || (Array.isArray(clientKeys) && clientKeys.some(ck => ck.provider === prov));
    if (!hasUserKeys) {
      const envKey = this.getEnvKey(prov);
      if (envKey) {
        addCandidate({ keyObj: this.createEnvKeyObject(prov, envKey), rawKey: envKey });
      }
    }

    // 6. Cooldown or error DB keys as last resort
    if (results.length === 0) {
      const fallbackDbKeys = this.getRotatedKeys(prov, true, userId);
      for (const k of fallbackDbKeys) {
        if (k.rawKey && k.rawKey.trim().length > 0) {
          addCandidate({ keyObj: k, rawKey: k.rawKey.trim() });
        }
      }
    }

    return results;
  }

  public async executeGeneration(
    imageBase64: string,
    mimeType: string,
    options: PromptBuildOptions,
    providerPref?: AIProvider,
    modelPref?: string,
    keyId?: string,
    clientKeys?: { provider: 'gemini' | 'groq'; id?: string; label?: string; rawKey: string }[],
    autoFallbackParam?: boolean,
    userId: string = 'guest'
  ): Promise<{ metadata: StockMetadata; provider: string; keyLabel: string; model: string; providerUsed: string; modelUsed: string; keyIdUsed: string; notice?: string }> {
    // Validate and filter clientKeys before syncing
    if (Array.isArray(clientKeys) && clientKeys.length > 0) {
      for (const ck of clientKeys) {
        if (ck.rawKey && ck.rawKey.trim()) {
          dbService.addApiKeysBulk(ck.provider, [ck.rawKey.trim()], userId, ck.label || 'Client Key');
        }
      }
    }

    const settings = dbService.getSettings();
    const finalPreferred = providerPref || settings.preferredProvider || 'auto';
    const isStrictProvider = finalPreferred === 'gemini' || finalPreferred === 'groq';
    const autoFallback = isStrictProvider ? false : (autoFallbackParam !== undefined ? autoFallbackParam : (settings.autoFallback !== false));

    const resolvedProvider: 'gemini' | 'groq' = 
      finalPreferred === 'groq' ? 'groq' :
      finalPreferred === 'gemini' ? 'gemini' :
      (settings.preferredProvider === 'groq' ? 'groq' : 'gemini');

    let rawModel = modelPref;
    if (!rawModel) {
      if (resolvedProvider === 'gemini') rawModel = settings.geminiModel;
      else rawModel = settings.groqModel;
    }

    const requestedModel = resolveEffectiveModelLocal(resolvedProvider, rawModel);

    // Get candidate keys for requested provider
    const candidates = this.getCandidateKeysForProvider(resolvedProvider, keyId, clientKeys, userId);
    
    // SAFE DIAGNOSTIC LOGGING (Masked keys)
    console.log(`[KeyManager Diagnostic] Generation started. Provider: ${resolvedProvider}, Model: ${requestedModel}, Candidates: ${candidates.length}`);
    candidates.forEach((c, i) => {
      console.log(`[KeyManager Diagnostic] Candidate ${i}: ID=${c.keyObj.id}, MaskedKey=${c.keyObj.maskedKey}`);
    });

    let lastError: any = null;

    if (candidates.length > 0) {
      console.log('[AI Routing Diagnostic]', {
        requestedProvider: providerPref || settings.preferredProvider,
        requestedKeyId: keyId,
        resolvedProvider,
        model: requestedModel,
        candidateKeysCount: candidates.length,
        autoFallback,
      });

      for (const candidate of candidates) {
        const candidateIndex = candidates.indexOf(candidate) + 1;
        console.log(`[AI Routing] Key rotation: ${candidateIndex}/${candidates.length} using key "${candidate.keyObj.label}"`);
        const startTime = Date.now();
        try {
          let metadata: StockMetadata;
          const executionModel = candidate.keyObj.selectedModel || requestedModel;
          if (resolvedProvider === 'gemini') {
            metadata = await geminiService.generateMetadata(imageBase64, mimeType, options, candidate.rawKey, executionModel);
          } else {
            const effectiveOptions = { ...options, minimizeLayout: true };
            metadata = await groqService.generateMetadata(imageBase64, mimeType, effectiveOptions, candidate.rawKey, executionModel);
          }

          const duration = Date.now() - startTime;
          if (candidate.keyObj.id && !candidate.keyObj.id.startsWith('env-')) {
            dbService.recordKeyUsage(candidate.keyObj.id, true);
          }
          dbService.recordRequestStats(true, duration, false, resolvedProvider);

          return {
            metadata,
            provider: resolvedProvider,
            providerUsed: resolvedProvider,
            keyLabel: candidate.keyObj.label,
            keyIdUsed: candidate.keyObj.id,
            model: requestedModel,
            modelUsed: requestedModel,
          };
        } catch (err: any) {
          const duration = Date.now() - startTime;
          const errMsg = err?.message || String(err);
          const isRateLimit =
            errMsg.includes('429') ||
            errMsg.includes('quota') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('Rate limit') ||
            errMsg.includes('Too Many Requests');

          if (candidate.keyObj.id && !candidate.keyObj.id.startsWith('env-')) {
            dbService.recordKeyUsage(candidate.keyObj.id, false, errMsg, isRateLimit);
          }
          dbService.recordRequestStats(false, duration, isRateLimit, resolvedProvider);

          console.warn(`[AI Engine] ${resolvedProvider.toUpperCase()} key (${candidate.keyObj.label}) failed: ${errMsg}`);
          lastError = err;
        }
      }
    } else {
      lastError = new Error(`No active ${resolvedProvider.toUpperCase()} API key available in AI Settings.`);
    }

    // Attempt Auto-Fallback to secondary providers if enabled
    if (autoFallback) {
      const fallbackProviders: ('gemini' | 'groq')[] = (['gemini', 'groq'] as const).filter(
        (p) => p !== resolvedProvider
      );

      for (const fProvider of fallbackProviders) {
        let fRawModel: string | undefined;
        if (fProvider === 'gemini') fRawModel = settings.geminiModel;
        else fRawModel = settings.groqModel;

        const fModel = resolveEffectiveModelLocal(fProvider, fRawModel);
        const fCandidates = this.getCandidateKeysForProvider(fProvider, undefined, clientKeys, userId);

        if (fCandidates.length > 0) {
          console.warn(`[AI Engine] Primary provider ${resolvedProvider.toUpperCase()} exhausted (${lastError?.message}). Attempting auto-fallback to ${fProvider.toUpperCase()}...`);

          for (const fCandidate of fCandidates) {
            const fCandidateIndex = fCandidates.indexOf(fCandidate) + 1;
            console.log(`[AI Routing] Key rotation: ${fCandidateIndex}/${fCandidates.length} using fallback key "${fCandidate.keyObj.label}"`);
            const startTime = Date.now();
            try {
              let metadata: StockMetadata;
              const executionModel = fCandidate.keyObj.selectedModel || fModel;
              if (fProvider === 'gemini') {
                metadata = await geminiService.generateMetadata(imageBase64, mimeType, options, fCandidate.rawKey, executionModel);
              } else {
                metadata = await groqService.generateMetadata(imageBase64, mimeType, options, fCandidate.rawKey, executionModel);
              }

              const duration = Date.now() - startTime;
              if (fCandidate.keyObj.id && !fCandidate.keyObj.id.startsWith('env-')) {
                dbService.recordKeyUsage(fCandidate.keyObj.id, true);
              }
              dbService.recordRequestStats(true, duration, false, fProvider);

              return {
                metadata,
                provider: fProvider,
                providerUsed: fProvider,
                keyLabel: fCandidate.keyObj.label,
                keyIdUsed: fCandidate.keyObj.id,
                model: fModel,
                modelUsed: fModel,
                notice: `(Auto-fallback to ${fProvider.toUpperCase()} because ${resolvedProvider.toUpperCase()} quota was exceeded)`,
              };
            } catch (fallbackErr: any) {
              const duration = Date.now() - startTime;
              const fErrMsg = fallbackErr?.message || String(fallbackErr);
              const isRateLimit =
                fErrMsg.includes('429') ||
                fErrMsg.includes('quota') ||
                fErrMsg.includes('RESOURCE_EXHAUSTED') ||
                fErrMsg.includes('Rate limit') ||
                fErrMsg.includes('Too Many Requests');

              if (fCandidate.keyObj.id && !fCandidate.keyObj.id.startsWith('env-')) {
                dbService.recordKeyUsage(fCandidate.keyObj.id, false, fErrMsg, isRateLimit);
              }
              dbService.recordRequestStats(false, duration, isRateLimit, fProvider);

              console.warn(`[AI Engine Fallback] ${fProvider.toUpperCase()} key (${fCandidate.keyObj.label}) failed: ${fErrMsg}`);
            }
          }
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`${resolvedProvider.toUpperCase()} metadata generation failed. Please check your API key and account status.`);
  }
}

export const keyManager = new KeyManager();
