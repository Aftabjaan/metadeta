import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  Key,
  Upload,
  RefreshCw,
  Trash2,
  Cpu,
  Sparkles,
  Zap,
  Activity,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  HelpCircle,
  Lock,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import { parseKeysFromText } from '../utils/keyParser';
import { ProcessingSettings, AIProvider, BulkImportResult } from '../types';
import { useAiProviderStore } from '../utils/aiProviderStore';
import { getClientRawKey } from '../utils/clientKeyStorage';
import {
  AiModelOption,
  fetchDynamicGeminiModels,
  fetchDynamicGroqModels,
  FALLBACK_GEMINI_MODELS,
  FALLBACK_GROQ_MODELS,
  resolveEffectiveModel,
  isDeprecatedGeminiModel,
} from '../utils/aiModelService';
import { updateSettingsApi } from '../utils/apiClient';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ProcessingSettings;
  onSettingsUpdated: (settings: ProcessingSettings) => void;
  initialProvider?: 'gemini' | 'groq';
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsUpdated,
  initialProvider = 'gemini',
}) => {
  const [provider, setProvider] = useState<'gemini' | 'groq'>(initialProvider === 'groq' ? 'groq' : 'gemini');
  const [newKey, setNewKey] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isTestingId, setIsTestingId] = useState<string | null>(null);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  // Dynamic models state
  const [geminiModels, setGeminiModels] = useState<AiModelOption[]>(FALLBACK_GEMINI_MODELS);
  const [groqModels, setGroqModels] = useState<AiModelOption[]>(FALLBACK_GROQ_MODELS);

  // Local settings copy
  const [localSettings, setLocalSettings] = useState<ProcessingSettings>(settings);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to Unified API Provider Store
  const {
    geminiKeys,
    groqKeys,
    userKeys,
    keyCounts,
    activeGeminiKey,
    activeGroqKey,
    addKey,
    importBulk,
    removeKey,
    deleteAllUserKeys,
    toggleKey,
    testKey,
    syncFromServer,
  } = useAiProviderStore();

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
      if (initialProvider === 'groq' || initialProvider === 'gemini') setProvider(initialProvider);
      loadModels();
      syncFromServer();
      setFeedback(null);
    }
  }, [isOpen, initialProvider]);

  const loadModels = async (force = false) => {
    try {
      const activeGeminiObj = geminiKeys.find((k) => k.enabled && k.status !== 'error') || geminiKeys[0];
      const activeGroqObj = groqKeys.find((k) => k.enabled && k.status !== 'error') || groqKeys[0];

      const gRaw = activeGeminiObj ? getClientRawKey(activeGeminiObj.id) : undefined;
      const qRaw = activeGroqObj ? getClientRawKey(activeGroqObj.id) : undefined;

      const [gModels, qModels] = await Promise.all([
        fetchDynamicGeminiModels(gRaw, force).catch(() => FALLBACK_GEMINI_MODELS),
        fetchDynamicGroqModels(qRaw, force).catch(() => FALLBACK_GROQ_MODELS),
      ]);
      setGeminiModels(gModels);
      setGroqModels(qModels);

      // If current selected Gemini model is missing or deprecated, auto-select a valid available vision model
      if (gModels.length > 0) {
        const currentGemini = localSettings.geminiModel;
        const exists = gModels.some((m) => m.id === currentGemini);
        if (!exists || isDeprecatedGeminiModel(currentGemini)) {
          const firstRecommended = gModels.find((m) => m.isRecommended) || gModels[0];
          setLocalSettings((prev) => ({ ...prev, geminiModel: firstRecommended.id }));
        }
      }

      // If current selected Groq model is missing or deprecated, auto-select a valid available model
      if (qModels.length > 0) {
        const currentGroq = localSettings.groqModel;
        const exists = qModels.some((m) => m.id === currentGroq);
        if (!exists || currentGroq.includes('llama') || currentGroq.includes('deprecated')) {
          const firstVision = qModels.find((m) => m.isVisionCapable) || qModels[0];
          setLocalSettings((prev) => ({ ...prev, groqModel: firstVision?.id || 'llama-3.2-11b-vision-preview' }));
        }
      }
    } catch {}
  };

  const handleRefreshModels = async () => {
    setIsRefreshingModels(true);
    setFeedback(null);
    try {
      await loadModels(true);
      setFeedback({ type: 'success', text: 'AI models refreshed with latest live catalog.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Could not refresh live models.' });
    } finally {
      setIsRefreshingModels(false);
    }
  };

  if (!isOpen) return null;

  const currentKeys = provider === 'gemini' ? geminiKeys : groqKeys;
  const currentSystemKeys = currentKeys.filter((k) => k.isEnvKey);
  const currentUserKeys = currentKeys.filter((k) => !k.isEnvKey);
  const activeKeysCount = currentKeys.filter((k) => k.enabled && k.status !== 'error').length;
  const availableModels = provider === 'gemini' ? geminiModels : groqModels;
  const selectedModelId = provider === 'gemini' ? localSettings.geminiModel : localSettings.groqModel;

  const handleSaveSettings = async () => {
    try {
      await updateSettingsApi(localSettings);
      onSettingsUpdated(localSettings);
      onClose();
    } catch (err: any) {
      onSettingsUpdated(localSettings);
      onClose();
    }
  };

  const handleAddSingleKey = async () => {
    if (!newKey.trim()) return;
    setIsImporting(true);
    setFeedback(null);
    try {
      const clean = newKey.trim();
      const parsed = parseKeysFromText(clean);
      let addedEntry;
      if (parsed.tokens.length > 1) {
        const result = importBulk(provider, clean, '');
        setFeedback({
          type: result.added > 0 ? 'success' : 'error',
          text: `Imported ${result.added} ${provider.charAt(0).toUpperCase() + provider.slice(1)} key(s). Verifying...`,
        });
        setNewKey('');
        // Verify newly added keys
        const keysToTest = currentKeys.filter((k) => k.status === 'untested');
        for (const k of keysToTest) {
          await testKey(k.id);
        }
      } else {
        const keyToAdd = parsed.tokens[0] || clean;
        addedEntry = addKey(provider, keyToAdd);
        setNewKey('');
        if (addedEntry) {
          setIsTestingId(addedEntry.id);
          const verifyRes = await testKey(addedEntry.id);
          setIsTestingId(null);
          if (verifyRes.success) {
            setFeedback({
              type: 'success',
              text: `Added and verified 1 ${provider.charAt(0).toUpperCase() + provider.slice(1)} API key (Active)!`,
            });
          } else {
            setFeedback({
              type: 'error',
              text: `Added key, but verification failed: ${verifyRes.error || 'Invalid or restricted key'}`,
            });
          }
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to add key.' });
    } finally {
      setIsImporting(false);
      setIsTestingId(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setFeedback(null);
    setImportResult(null);

    try {
      const text = await file.text();
      const result = importBulk(provider, text, '');
      setImportResult(result);

      if (result.added > 0) {
        setFeedback({
          type: 'success',
          text: `Imported ${result.added} key(s)! Verifying added keys...`,
        });
        const keysToTest = currentKeys.filter((k) => k.status === 'untested');
        for (const k of keysToTest) {
          await testKey(k.id);
        }
        setFeedback({
          type: 'success',
          text: `Import and verification complete! Added ${result.added} ${provider.charAt(0).toUpperCase() + provider.slice(1)} key(s).`,
        });
      } else {
        setFeedback({
          type: 'error',
          text: `No new keys added. (Detected: ${result.totalDetected}, Duplicates: ${result.duplicatesSkipped}, Rejected: ${result.invalidKeysSkipped})`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to import TXT file.' });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTestAllKeys = async () => {
    const untestedOrError = currentKeys.filter((k) => !k.isEnvKey);
    if (untestedOrError.length === 0) return;
    setIsImporting(true);
    setFeedback({ type: 'info', text: `Verifying ${untestedOrError.length} ${provider.charAt(0).toUpperCase() + provider.slice(1)} API key(s)...` });
    try {
      let passCount = 0;
      for (const k of untestedOrError) {
        const res = await testKey(k.id);
        if (res.success) passCount++;
      }
      setFeedback({
        type: passCount > 0 ? 'success' : 'error',
        text: `Batch test finished: ${passCount} of ${untestedOrError.length} keys verified as active and operational.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed testing keys.' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleTestKey = async (id: string) => {
    setIsTestingId(id);
    setFeedback(null);
    try {
      const res = await testKey(id);
      if (res.success) {
        setFeedback({ type: 'success', text: res.message || 'API key verified and operational!' });
      } else {
        setFeedback({ type: 'error', text: res.error || 'API key test failed.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error testing API key.' });
    } finally {
      setIsTestingId(null);
    }
  };

  const handleRemoveKey = (id: string) => {
    removeKey(id);
    setFeedback({ type: 'info', text: 'API key removed from vault.' });
  };

  const handleCopyKey = async (id: string) => {
    try {
      const rawKey = getClientRawKey(id);
      if (rawKey) {
        await navigator.clipboard.writeText(rawKey);
        setFeedback({ type: 'success', text: 'API key copied to clipboard!' });
      } else {
        setFeedback({ type: 'error', text: 'Could not find the full API key.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Failed to copy to clipboard.' });
    }
  };

  const handleConfirmDeleteAll = () => {
    const count = deleteAllUserKeys();
    setShowDeleteAllConfirm(false);
    setFeedback({
      type: 'info',
      text: `Deleted all ${count} API key${count === 1 ? '' : 's'}. Vault is now empty.`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto overscroll-contain">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 ring-1 ring-white/20 shrink-0">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                AI Settings & Key Vault
                <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded-full bg-slate-100 text-blue-700 border border-slate-200">
                  {keyCounts.totalKeys} Total Keys
                </span>
              </h3>
              <p className="text-xs text-slate-500">Configure AI Providers, Multimodal Models & Automatic Key Pools</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar overscroll-contain">
          {/* Provider Selection Tabs */}
          <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setProvider('gemini')}
              className={`py-2.5 px-3 text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                provider === 'gemini'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400/40'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4 text-cyan-200" />
              <span>GEMINI API</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/20">
                {keyCounts.geminiTotal}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setProvider('groq')}
              className={`py-2.5 px-3 text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                provider === 'groq'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-500/25 ring-1 ring-orange-400/40'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <Cpu className="w-4 h-4 text-orange-200" />
              <span>GROQ API</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/20">
                {keyCounts.groqTotal}
              </span>
            </button>
          </div>

          {/* Provider Status Overview Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Engine Status:</span>
              {activeKeysCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Connected & Ready ({activeKeysCount} active)
                </span>
              ) : currentKeys.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-amber-700 font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Attention Needed ({currentKeys.length} keys in cooldown/untested)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-slate-500 font-bold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  No Keys Configured
                </span>
              )}
            </div>

            <div className="text-slate-500 font-mono text-[11px]">
              Active Provider Pool:{' '}
              <strong className="text-slate-800 uppercase">{provider}</strong>
            </div>
          </div>

          {/* Model Selection for Active Provider */}
          <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                {provider === 'gemini' ? 'Google Gemini Model' : 'Groq Vision Model'}
              </label>
              <button
                type="button"
                onClick={handleRefreshModels}
                disabled={isRefreshingModels}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
                title="Fetch latest models from provider API"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingModels ? 'animate-spin' : ''}`} />
                <span>Refresh Models</span>
              </button>
            </div>

            <select
              value={resolveEffectiveModel(provider, selectedModelId)}
              onChange={(e) =>
                setLocalSettings((prev) =>
                  provider === 'gemini'
                    ? { ...prev, geminiModel: e.target.value }
                    : { ...prev, groqModel: e.target.value }
                )
              }
              className="w-full text-xs sm:text-sm font-mono rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.isVisionCapable ? '👁 Vision' : '📝 Text Only'} {m.isRecommended ? '★ Recommended' : ''} ({m.id})
                </option>
              ))}
            </select>

            {provider === 'groq' && availableModels.length > 0 && !availableModels.find((m) => m.id === (localSettings.groqModel || 'llama-3.2-11b-vision-preview'))?.isVisionCapable && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  <strong>Model does not support image analysis.</strong> Image metadata generation will automatically use a compatible Groq vision model (e.g. Llama 3.2 11B).
                </span>
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              {availableModels.find((m) => m.id === selectedModelId)?.description ||
                'Vision-capable model for high-accuracy stock title and keyword metadata generation.'}
            </p>
          </div>

          {/* Key Management Vault Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-500" />
                API Keys Vault ({provider.charAt(0).toUpperCase() + provider.slice(1)})
              </h4>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {currentKeys.length} {currentKeys.length === 1 ? 'key' : 'keys'} in pool
              </span>
            </div>

            {/* Add Key Input & TXT Upload Bar */}
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                id="api_key_vault_input"
                name="api_key_vault_input"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-lpignore="true"
                data-form-type="other"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSingleKey()}
                placeholder={`Paste ${provider === 'gemini' ? 'AIza...' : (provider === 'groq' ? 'gsk_...' : 'sk-...')} API key here`}
                className="flex-1 min-w-[200px] text-xs sm:text-sm rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
              />
              <button
                type="button"
                onClick={handleAddSingleKey}
                disabled={isImporting || !newKey.trim()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Add Key
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold border border-slate-300 shadow-sm transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                title="Bulk import from .txt file (one per line, comma or space separated)"
              >
                <Upload className="w-4 h-4 text-blue-600" />
                Import TXT
              </button>
              <input
                type="file"
                accept=".txt"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {/* Feedback Alert */}
            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : feedback.type === 'error'
                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            {/* User Configured Keys List */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-amber-500" />
                  {provider.charAt(0).toUpperCase() + provider.slice(1)} API Keys ({currentUserKeys.length})
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {currentUserKeys.length > 0 && (
                    <button
                      type="button"
                      id="btn-verify-all-keys"
                      onClick={handleTestAllKeys}
                      disabled={isImporting}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] sm:text-[11px] font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                      title="Verify status of all API keys"
                    >
                      <Zap className="w-3 h-3 text-amber-500" />
                      <span>Test All Keys</span>
                    </button>
                  )}
                  {currentUserKeys.length > 0 && (
                    <button
                      type="button"
                      id="btn-delete-provider-keys"
                      onClick={() => {
                        deleteAllUserKeys(provider);
                        setFeedback({ type: 'info', text: `Deleted all ${provider.charAt(0).toUpperCase() + provider.slice(1)} API keys.` });
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200 text-[10px] sm:text-[11px] font-semibold transition-colors shadow-sm cursor-pointer"
                      title={`Delete all ${provider.charAt(0).toUpperCase() + provider.slice(1)} keys`}
                    >
                      <Trash2 className="w-3 h-3 text-rose-600" />
                      <span>Delete {provider.charAt(0).toUpperCase() + provider.slice(1)} Keys</span>
                    </button>
                  )}
                  {userKeys.length > 0 && (
                    <button
                      type="button"
                      id="btn-delete-all-keys"
                      onClick={() => setShowDeleteAllConfirm(true)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 hover:text-rose-900 border border-rose-300 text-[10px] sm:text-[11px] font-bold transition-colors shadow-sm cursor-pointer"
                      title="Delete all API keys across all providers"
                    >
                      <Trash2 className="w-3 h-3 text-rose-600" />
                      <span>Delete All API Keys</span>
                    </button>
                  )}
                </div>
              </div>

              {currentUserKeys.length === 0 ? (
                <div className="text-center p-6 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                  <p className="text-xs text-slate-500">
                    No API keys configured for <strong className="text-slate-800 capitalize">{provider}</strong>.
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Paste your {provider === 'gemini' ? 'Gemini' : 'Groq'} API key above or import a .txt file to begin.
                  </p>
                </div>
              ) : (
                currentUserKeys.map((k) => (
                  <div
                    key={k.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center text-slate-700 shrink-0 font-mono text-xs font-bold">
                        #
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-900 font-bold">{k.maskedKey}</span>
                          <span className="text-[11px] text-slate-500 truncate">{k.label}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-semibold mt-0.5">
                          {k.status === 'active' && (
                            <span className="text-emerald-700 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> ✓ {provider.charAt(0).toUpperCase() + provider.slice(1)} Verified
                            </span>
                          )}
                          {k.status === 'error' && (
                            <span className="text-rose-600 flex items-center gap-1" title={k.lastError}>
                              {k.lastError?.includes('Provider mismatch') ? (
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-pulse" /> ⚠ Provider Mismatch
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> ⚠ Invalid Key
                                </span>
                              )}
                            </span>
                          )}
                          {k.status === 'cooldown' && (
                            <span className="text-amber-700 flex items-center gap-1" title={k.lastError}>
                              <Activity className="w-3.5 h-3.5 animate-pulse" /> {k.lastError ? k.lastError : 'Rate Limited (Cooldown)'}
                            </span>
                          )}
                          {k.status === 'untested' && <span className="text-slate-500">Untested</span>}
                          {k.requestCount > 0 && (
                            <span className="text-slate-400 font-mono">
                              ({k.successCount}/{k.requestCount} ok)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleKey(k.id, !k.enabled)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 cursor-pointer ${
                          k.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                        title={k.enabled ? 'Disable key' : 'Enable key'}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            k.enabled ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyKey(k.id)}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Copy full API key"
                      >
                        <Copy className="w-3 h-3 text-blue-600" />
                        <span>Copy</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTestKey(k.id)}
                        disabled={isTestingId === k.id}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 border border-slate-200 flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isTestingId === k.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3 text-amber-500" />
                        )}
                        <span>Test</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveKey(k.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Remove key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Engine Settings (Auto Rotation & Auto Fallback) */}
          <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-800">Automatic Key Rotation</h4>
                <p className="text-[11px] text-slate-500">
                  Automatically round-robin and switch keys when a 429 rate limit or temporary quota error occurs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLocalSettings((prev) => ({ ...prev, autoRotation: !prev.autoRotation }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 cursor-pointer ${
                  localSettings.autoRotation ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    localSettings.autoRotation ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-200">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-800">Automatic Provider Failover</h4>
                <p className="text-[11px] text-slate-500">
                  Seamlessly fallback between Google Gemini and Groq Vision if all keys for one provider are exhausted.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLocalSettings((prev) => ({ ...prev, autoFallback: !prev.autoFallback }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 cursor-pointer ${
                  localSettings.autoFallback ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    localSettings.autoFallback ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveSettings}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-600/25 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            Save AI Settings
          </button>
        </div>

        {/* Import Result Overlay Modal */}
        {importResult && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Import Complete</h3>
                    <p className="text-xs text-slate-500">
                      Vault Token Report • <span className="text-blue-600 font-semibold uppercase">{provider}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setImportResult(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Detected</div>
                  <div className="text-lg font-mono font-bold text-blue-600">{importResult.totalDetected}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Added</div>
                  <div className="text-lg font-mono font-bold text-emerald-600">{importResult.added}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Duplicates</div>
                  <div className="text-lg font-mono font-bold text-amber-600">{importResult.duplicatesSkipped}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Rejected</div>
                  <div className="text-lg font-mono font-bold text-rose-600">{importResult.invalidKeysSkipped}</div>
                </div>
              </div>

              {/* List of Imported Keys */}
              <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                {importResult.addedKeys && importResult.addedKeys.length > 0 ? (
                  importResult.addedKeys.map((k) => (
                    <div
                      key={k.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800">{k.label}</div>
                        <div className="text-xs font-mono text-blue-600 font-semibold">{k.maskedKey}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>Status:</span>
                          {k.status === 'untested' ? (
                            <span className="text-slate-600 font-medium">Untested</span>
                          ) : k.status === 'active' ? (
                            <span className="text-emerald-700 font-semibold">Working</span>
                          ) : (
                            <span className="text-rose-600 font-semibold">Failed</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTestKey(k.id)}
                        disabled={isTestingId === k.id}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-xs font-semibold text-amber-700 border border-slate-200 flex items-center gap-1 shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isTestingId === k.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                        ) : (
                          <Zap className="w-3 h-3 text-amber-600" />
                        )}
                        <span>Test</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500 text-center py-3 bg-slate-50 rounded-xl border border-slate-200">
                    No new keys were added to the vault pool.
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => setImportResult(null)}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/25 transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete All Confirmation Dialog */}
        {showDeleteAllConfirm && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-100">
            <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Delete all API keys?</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    This will delete all stored API keys for Gemini and Groq from your vault.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                <p className="text-slate-500 text-[11px]">
                  After deleting, you will need to add your own API key before generating new stock metadata.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteAllConfirm(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btn-confirm-delete-all"
                  onClick={handleConfirmDeleteAll}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/25 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete All</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
