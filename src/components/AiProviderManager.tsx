import React, { useState, useEffect } from 'react';
import {
  Shield,
  X,
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Key,
  Eye,
  EyeOff,
  Star,
  Edit2,
  Copy,
  Activity,
  Sparkles,
  Cpu,
  Tag,
  Type,
  FileText,
  Globe,
  Info,
} from 'lucide-react';
import {
  ApiKeyEntry,
  ProcessingSettings,
  TitleSettings,
  KeywordSettings,
  DescriptionSettings,
  AIProvider,
} from '../types';
import {
  fetchApiKeys,
  addApiKeyApi,
  deleteApiKeyApi,
  testApiKeyApi,
  testRawApiKeyApi,
  setActiveApiKeyApi,
  renameApiKeyApi,
  deleteAllKeysApi,
  updateSettingsApi,
  getClientRawKey,
  getClientApiKeys,
} from '../utils/apiClient';
import { apiKeyStore } from '../utils/aiProviderStore';
import { fetchDynamicGeminiModels, fetchDynamicGroqModels, AiModelOption } from '../utils/aiModelService';

interface AiProviderManagerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ProcessingSettings;
  onSettingsUpdated: (settings: ProcessingSettings) => void;
  titleSettings?: TitleSettings;
  keywordSettings?: KeywordSettings;
  descriptionSettings?: DescriptionSettings;
  onSaveWorkflowSettings?: (ts: TitleSettings, ks: KeywordSettings, ds: DescriptionSettings) => void;
  initialTab?: string;
}

export const AiProviderManager: React.FC<AiProviderManagerProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsUpdated,
  titleSettings,
  keywordSettings,
  descriptionSettings,
  onSaveWorkflowSettings,
  initialTab = 'keys',
}) => {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Active section inside "AI MODELS & SETTINGS"
  // 'keys' | 'models' | 'aimode' | 'keywords' | 'title' | 'description'
  const [activeSection, setActiveSection] = useState<'keys' | 'models' | 'aimode' | 'keywords' | 'title' | 'description'>(() => {
    if (initialTab === 'gemini' || initialTab === 'groq' || initialTab === 'keys') return 'keys';
    if (initialTab === 'keywords') return 'keywords';
    if (initialTab === 'title') return 'title';
    if (initialTab === 'description') return 'description';
    return 'keys';
  });

  // Dynamic model options fetched from active provider
  const [geminiModels, setGeminiModels] = useState<AiModelOption[]>([]);
  const [groqModels, setGroqModels] = useState<AiModelOption[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Add Key Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [addProvider, setAddProvider] = useState<'gemini' | 'groq'>('gemini');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyVal, setNewKeyVal] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);
  const [isTestingNewKey, setIsTestingNewKey] = useState(false);
  const [newKeyError, setNewKeyError] = useState<string | null>(null);
  const [newKeySuccess, setNewKeySuccess] = useState<string | null>(null);

  // Rename inline states
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  // Key operations loaders
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [showKeyRecord, setShowKeyRecord] = useState<Record<string, boolean>>({});

  // Confirmations
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Local state for Title Settings
  const [localTitleSettings, setLocalTitleSettings] = useState<TitleSettings>({
    minLength: 10,
    maxLength: 70,
    avoidRepetition: true,
    commerciallyRelevant: true,
    matchAssetContent: true,
    adobeStockOptimized: true,
  });

  // Local state for Keyword Settings
  const [localKeywordSettings, setLocalKeywordSettings] = useState<KeywordSettings>({
    targetCount: 30,
    keywordType: 'mixed',
    enforceRelevance: true,
    removeDuplicates: true,
    removeMeaningless: true,
    prioritizeStrongest: true,
  });

  // Local state for Description Settings
  const [localDescriptionSettings, setLocalDescriptionSettings] = useState<DescriptionSettings>({
    minLength: 15,
    maxLength: 200,
    relevantToAsset: true,
    noKeywordStuffing: true,
    commerciallyUseful: true,
    adobeStockOptimized: true,
  });

  // Toast alert
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadKeysAndModels();
      // Adjust active tab if passed from outside
      if (initialTab === 'keywords') setActiveSection('keywords');
      else if (initialTab === 'title') setActiveSection('title');
      else if (initialTab === 'description') setActiveSection('description');
      else setActiveSection('keys');
    }
  }, [isOpen, initialTab]);

  // Sync settings when loaded
  useEffect(() => {
    if (titleSettings && isOpen) {
      setLocalTitleSettings({
        minLength: titleSettings.minLength ?? 10,
        maxLength: titleSettings.maxLength ?? 70,
        avoidRepetition: titleSettings.avoidRepetition ?? true,
        commerciallyRelevant: titleSettings.commerciallyRelevant ?? true,
        matchAssetContent: titleSettings.matchAssetContent ?? true,
        adobeStockOptimized: titleSettings.adobeStockOptimized ?? true,
        style: titleSettings.style ?? 'SEO Optimized',
        backgroundSuffix: titleSettings.backgroundSuffix ?? 'none',
        customInstructions: titleSettings.customInstructions ?? '',
      });
    }
  }, [titleSettings, isOpen]);

  useEffect(() => {
    if (keywordSettings && isOpen) {
      setLocalKeywordSettings({
        targetCount: keywordSettings.targetCount ?? 30,
        keywordType: keywordSettings.keywordType ?? 'mixed',
        enforceRelevance: keywordSettings.enforceRelevance ?? true,
        removeDuplicates: keywordSettings.removeDuplicates ?? true,
        removeMeaningless: keywordSettings.removeMeaningless ?? true,
        prioritizeStrongest: keywordSettings.prioritizeStrongest ?? true,
        ordering: keywordSettings.ordering ?? 'relevance',
        customInstructions: keywordSettings.customInstructions ?? '',
      });
    }
  }, [keywordSettings, isOpen]);

  useEffect(() => {
    if (descriptionSettings && isOpen) {
      setLocalDescriptionSettings({
        minLength: descriptionSettings.minLength ?? 15,
        maxLength: descriptionSettings.maxLength ?? 200,
        relevantToAsset: descriptionSettings.relevantToAsset ?? true,
        noKeywordStuffing: descriptionSettings.noKeywordStuffing ?? true,
        commerciallyUseful: descriptionSettings.commerciallyUseful ?? true,
        adobeStockOptimized: descriptionSettings.adobeStockOptimized ?? true,
      });
    }
  }, [descriptionSettings, isOpen]);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const loadKeysAndModels = async () => {
    setLoading(true);
    setIsLoadingModels(true);
    try {
      const fetched = await fetchApiKeys();
      const filtered = fetched.filter((k) => k.provider === 'gemini' || k.provider === 'groq');
      setKeys(filtered);

      const activeGemini = filtered.find((k) => k.provider === 'gemini' && k.active);
      const activeGroq = filtered.find((k) => k.provider === 'groq' && k.active);

      const geminiKeyVal = activeGemini ? getClientRawKey(activeGemini.id) : undefined;
      const groqKeyVal = activeGroq ? getClientRawKey(activeGroq.id) : undefined;

      const [gModels, grModels] = await Promise.all([
        fetchDynamicGeminiModels(geminiKeyVal, true).catch(() => []),
        fetchDynamicGroqModels(groqKeyVal, true).catch(() => []),
      ]);

      setGeminiModels(gModels);
      setGroqModels(grModels);
    } catch (err) {
      console.error('Failed to load keys or models', err);
    } finally {
      setLoading(false);
      setIsLoadingModels(false);
    }
  };

  const loadKeys = async () => {
    try {
      const fetched = await fetchApiKeys();
      const filtered = fetched.filter((k) => k.provider === 'gemini' || k.provider === 'groq');
      setKeys(filtered);
    } catch (err) {
      console.error('Failed to reload keys', err);
    }
  };

  // Safe Masking helper
  const getMaskedText = (raw: string, provider: 'gemini' | 'groq') => {
    if (!raw) return provider === 'gemini' ? 'AIza••••••••••••' : 'gsk_••••••••••••';
    const trimmed = raw.trim();
    const prefix = provider === 'gemini' ? 'AIza' : 'gsk_';
    if (trimmed.startsWith(prefix)) {
      return `${prefix}••••••••••••${trimmed.slice(-4)}`;
    }
    if (trimmed.length <= 8) return '••••••••';
    return `${trimmed.slice(0, 4)}••••••••••••${trimmed.slice(-4)}`;
  };

  // Copy complete original API key
  const handleCopyKey = async (k: ApiKeyEntry) => {
    try {
      const raw = getClientRawKey(k.id);
      if (raw) {
        await navigator.clipboard.writeText(raw);
        setCopiedKeyId(k.id);
        showToast('success', '✓ API key copied to clipboard');
        setTimeout(() => setCopiedKeyId(null), 2000);
      } else {
        showToast('error', 'Full key could not be loaded from secure local storage.');
      }
    } catch {
      showToast('error', 'Failed to copy key.');
    }
  };

  // Test individual existing key
  const handleTestKey = async (id: string) => {
    setTestingKeyId(id);
    try {
      const result = await testApiKeyApi(id);
      await loadKeys();
      apiKeyStore.syncFromServer();
      if (result.success) {
        showToast('success', '✓ API key validated and operational!');
      } else {
        showToast('error', `✕ Testing failed: ${result.error || 'Invalid API Key'}`);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Key testing failed.');
    } finally {
      setTestingKeyId(null);
    }
  };

  // Test All Keys for a provider
  const handleTestAllKeys = async (provider: 'gemini' | 'groq') => {
    const targets = keys.filter((k) => k.provider === provider);
    if (targets.length === 0) {
      showToast('info', 'No keys available to test.');
      return;
    }
    showToast('info', `Testing all ${targets.length} keys sequentially...`);
    for (const k of targets) {
      setTestingKeyId(k.id);
      try {
        await testApiKeyApi(k.id);
      } catch {}
    }
    setTestingKeyId(null);
    await loadKeys();
    apiKeyStore.syncFromServer();
    showToast('success', `Tested all ${targets.length} keys.`);
  };

  // Delete key
  const handleDeleteKey = async (id: string) => {
    const keyToDelete = keys.find((k) => k.id === id);
    if (!keyToDelete) return;

    try {
      await deleteApiKeyApi(id);
      showToast('info', 'API key permanently deleted.');

      if (keyToDelete.active) {
        const remaining = keys.filter((k) => k.provider === keyToDelete.provider && k.id !== id && k.enabled);
        const bestAlternative = remaining.find((k) => k.status === 'active') || remaining[0];
        if (bestAlternative) {
          await setActiveApiKeyApi(bestAlternative.id);
        }
      }

      await loadKeys();
      setConfirmDeleteId(null);
      apiKeyStore.syncFromServer();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to delete key.');
    }
  };

  // Rename inline label
  const handleRenameKey = async (id: string) => {
    if (!editingLabel.trim()) return;
    try {
      await renameApiKeyApi(id, editingLabel.trim());
      showToast('success', 'Key label updated.');
      setEditingKeyId(null);
      await loadKeys();
      apiKeyStore.syncFromServer();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to rename label.');
    }
  };

  // Set active key
  const handleSetActiveKey = async (id: string) => {
    try {
      await setActiveApiKeyApi(id);
      showToast('success', `Active key switched successfully!`);
      await loadKeys();
      apiKeyStore.syncFromServer();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to set key as active.');
    }
  };

  // Model selection updates per provider
  const handleSelectProviderModel = async (provider: 'gemini' | 'groq', model: string) => {
    const update = provider === 'gemini' ? { geminiModel: model } : { groqModel: model };
    onSettingsUpdated({ ...settings, ...update });
    try {
      await updateSettingsApi(update);
      showToast('success', `Active model for ${provider.toUpperCase()} updated to ${model}`);
    } catch {
      showToast('error', 'Failed to save active model preference.');
    }
  };

  // Test raw key
  const handleTestNewKeyRaw = async () => {
    setNewKeyError(null);
    setNewKeySuccess(null);

    const cleanKey = newKeyVal.trim();
    if (!cleanKey) {
      setNewKeyError('API Key input cannot be empty.');
      return;
    }

    // Wrong provider check
    if (addProvider === 'gemini' && cleanKey.startsWith('gsk_')) {
      setNewKeyError('Wrong provider: This appears to be a Groq API key.');
      return;
    }
    if (addProvider === 'groq' && cleanKey.startsWith('AIza')) {
      setNewKeyError('Wrong provider: This appears to be a Gemini API key.');
      return;
    }

    setIsTestingNewKey(true);
    try {
      const res = await testRawApiKeyApi(cleanKey, addProvider);
      if (res.success) {
        setNewKeySuccess('✓ Key authenticated successfully and is fully operational!');
      } else {
        setNewKeyError(res.error || 'Authentication Failed. Please check the key validity.');
      }
    } catch (err: any) {
      setNewKeyError(err.message || 'Key verification failed.');
    } finally {
      setIsTestingNewKey(false);
    }
  };

  // Save new key
  const handleSaveNewKey = async () => {
    setNewKeyError(null);
    setNewKeySuccess(null);
    const cleanKey = newKeyVal.trim();
    if (!cleanKey) {
      setNewKeyError('API Key is required.');
      return;
    }

    // Check wrong provider again
    if (addProvider === 'gemini' && cleanKey.startsWith('gsk_')) {
      setNewKeyError('Wrong provider: This appears to be a Groq API key.');
      return;
    }
    if (addProvider === 'groq' && cleanKey.startsWith('AIza')) {
      setNewKeyError('Wrong provider: This appears to be a Gemini API key.');
      return;
    }

    // Normalize and compare raw key to find duplicates
    const normalizedNewKey = cleanKey.trim();
    const existingDup = keys.find((k) => {
      if (k.provider !== addProvider) return false;
      const raw = getClientRawKey(k.id);
      return raw ? raw.trim() === normalizedNewKey : false;
    }) || getClientApiKeys().find((k) => {
      if (k.provider !== addProvider) return false;
      const raw = getClientRawKey(k.id);
      return raw ? raw.trim() === normalizedNewKey : false;
    });

    if (existingDup) {
      setNewKeySuccess('API key already exists. Re-testing existing key...');
      setIsTestingNewKey(true);
      try {
        const testRes = await testApiKeyApi(existingDup.id);
        if (testRes.success) {
          showToast('success', '✓ API key already exists. Re-tested successfully!');
          if (!existingDup.active) {
            await setActiveApiKeyApi(existingDup.id);
          }
          setShowAddModal(false);
          setNewKeyVal('');
          setNewKeyLabel('');
          setNewKeyError(null);
          setNewKeySuccess(null);
          await loadKeysAndModels();
          apiKeyStore.syncFromServer();
        } else {
          setNewKeyError(`Existing key re-test failed: ${testRes.error || 'Invalid API Key'}`);
        }
      } catch (err: any) {
        setNewKeyError(err.message || 'Verification of existing key failed.');
      } finally {
        setIsTestingNewKey(false);
      }
      return;
    }

    setIsTestingNewKey(true);
    try {
      const testRes = await testRawApiKeyApi(cleanKey, addProvider);
      if (!testRes.success) {
        setNewKeyError(testRes.error || 'Validation failed. Keys must be verified before saving.');
        setIsTestingNewKey(false);
        return;
      }

      const cleanLabel = newKeyLabel.trim() || `${addProvider === 'gemini' ? 'Gemini' : 'Groq'} Key (${cleanKey.slice(-4)})`;
      const added = await addApiKeyApi(addProvider, cleanLabel, cleanKey);
      
      await testApiKeyApi(added.id);

      showToast('success', `✓ Successfully registered new ${addProvider === 'gemini' ? 'Gemini' : 'Groq'} key.`);
      setNewKeyVal('');
      setNewKeyLabel('');
      setShowAddModal(false);
      setNewKeyError(null);
      setNewKeySuccess(null);
      await loadKeysAndModels();
      apiKeyStore.syncFromServer();
    } catch (err: any) {
      setNewKeyError(err.message || 'Failed to register key.');
    } finally {
      setIsTestingNewKey(false);
    }
  };

  // Global preference change
  const handleGlobalSettingChange = async (update: Partial<ProcessingSettings>) => {
    onSettingsUpdated({ ...settings, ...update });
    try {
      await updateSettingsApi(update);
      showToast('success', `AI Processing Mode updated successfully.`);
    } catch (e) {
      console.error(e);
    }
  };

  // Save workflow settings (Title, Keywords, Description)
  const handleSaveWorkflowConfig = () => {
    if (onSaveWorkflowSettings) {
      onSaveWorkflowSettings(localTitleSettings, localKeywordSettings, localDescriptionSettings);
      showToast('success', '✓ Adobe Stock AI Generation directives updated successfully!');
    }
  };

  if (!isOpen) return null;

  const geminiKeys = keys.filter((k) => k.provider === 'gemini');
  const groqKeys = keys.filter((k) => k.provider === 'groq');

  const isGeminiConnected = geminiKeys.some((k) => k.status === 'active');
  const isGroqConnected = groqKeys.some((k) => k.status === 'active');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-md overflow-y-auto font-sans text-slate-800">
      <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh] md:h-[80vh] animate-in fade-in duration-150">
        
        {/* Header (Top Nav) */}
        <div className="flex-none px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/10">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900 flex items-center gap-2">
                AI Models & Settings
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/55 font-bold">
                  Single Source of Truth
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Configure your API keys, visual models, and Adobe Stock metadata instructions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Toast inside modal */}
        {toast && (
          <div
            className={`px-6 py-3 text-xs font-semibold flex items-center justify-between border-b transition-all ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                : toast.type === 'error'
                ? 'bg-rose-50 border-rose-100 text-rose-800'
                : 'bg-blue-50 border-blue-100 text-blue-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-500" />}
              {toast.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
              <span>{toast.message}</span>
            </div>
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-700 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Inner Sidebar + Content Layout */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Navigation Sidebar */}
          <div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50 p-4 shrink-0 flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible md:overflow-y-auto scrollbar-none whitespace-nowrap">
            <span className="hidden md:block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 mb-2 px-2">
              AI Configuration
            </span>
            <button
              onClick={() => setActiveSection('keys')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                activeSection === 'keys'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/15'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Key className="w-4 h-4 shrink-0" />
              <span>API Keys</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ml-auto ${activeSection === 'keys' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {keys.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSection('models')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                activeSection === 'models'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/15'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Cpu className="w-4 h-4 shrink-0" />
              <span>Model Selection</span>
            </button>

            <button
              onClick={() => setActiveSection('aimode')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                activeSection === 'aimode'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/15'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Globe className="w-4 h-4 shrink-0" />
              <span>AI Mode</span>
            </button>

            <span className="hidden md:block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 mt-4 mb-2 px-2">
              Adobe Stock Rules
            </span>

            <button
              onClick={() => setActiveSection('keywords')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                activeSection === 'keywords'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/15'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Tag className="w-4 h-4 shrink-0" />
              <span>Keyword Settings</span>
            </button>

            <button
              onClick={() => setActiveSection('title')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                activeSection === 'title'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/15'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Type className="w-4 h-4 shrink-0" />
              <span>Title Settings</span>
            </button>

            <button
              onClick={() => setActiveSection('description')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                activeSection === 'description'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/15'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Description Settings</span>
            </button>
          </div>

          {/* Right Workspace Content View */}
          <div className="flex-1 p-5 md:p-6 overflow-y-auto space-y-6 bg-slate-50/20">
            
            {/* SECTION 1: API KEYS */}
            {activeSection === 'keys' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                      Provider API Keys (Gemini & Groq)
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Register your own API keys. Multiple keys are supported for automatic rotation and failover.
                    </p>
                  </div>
                </div>

                {/* Gemini Keys Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      Google Gemini Keys
                    </h4>
                    <div className="flex items-center gap-3">
                      {geminiKeys.length > 0 && (
                        <button
                          onClick={() => handleTestAllKeys('gemini')}
                          className="text-[10px] font-extrabold text-blue-600 hover:underline cursor-pointer"
                        >
                          [ Test All Gemini ]
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setAddProvider('gemini');
                          setNewKeyVal('');
                          setNewKeyLabel('');
                          setNewKeyError(null);
                          setNewKeySuccess(null);
                          setShowAddModal(true);
                        }}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                      >
                        <Plus className="w-3 h-3" />
                        Add Gemini Key
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {geminiKeys.length === 0 ? (
                      <div className="col-span-full p-8 text-center rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs bg-white/50">
                        No Google Gemini API keys registered.
                      </div>
                    ) : (
                      geminiKeys.map((k) => {
                        const isShowing = showKeyRecord[k.id];
                        const isEditing = editingKeyId === k.id;
                        const isTesting = testingKeyId === k.id;

                        let statusStyle = 'text-slate-500 bg-slate-50 border-slate-200';
                        let statusText = k.status === 'active' ? '✓ Valid' : k.status;
                        if (k.status === 'active') {
                          statusStyle = 'text-emerald-700 bg-emerald-50 border-emerald-200';
                        } else if (k.status === 'error') {
                          statusStyle = 'text-rose-700 bg-rose-50 border-rose-200';
                          statusText = '✕ Invalid';
                        } else if (k.status === 'cooldown') {
                          statusStyle = 'text-amber-700 bg-amber-50 border-amber-200';
                          statusText = '⚠ Rate Limited';
                        }

                        return (
                          <div
                            key={k.id}
                            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                              k.active
                                ? 'bg-blue-50/25 border-blue-300 shadow-sm ring-1 ring-blue-500/10'
                                : 'bg-white border-slate-200 hover:border-slate-350 shadow-xs'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="space-y-1 min-w-0">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingLabel}
                                    onChange={(e) => setEditingLabel(e.target.value)}
                                    className="bg-white border border-blue-400 rounded-lg px-2 py-0.5 text-xs text-slate-800 focus:outline-none"
                                    autoFocus
                                    onBlur={() => handleRenameKey(k.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleRenameKey(k.id);
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center gap-1.5 group">
                                    <span className="font-bold text-slate-800 text-xs truncate">
                                      {k.label || 'Unnamed Key'}
                                    </span>
                                    <button
                                      onClick={() => {
                                        setEditingKeyId(k.id);
                                        setEditingLabel(k.label || '');
                                      }}
                                      className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}

                                <div className="font-mono text-[10px] text-slate-600 tracking-tight mt-1 flex items-center gap-1">
                                  <span>{isShowing ? getClientRawKey(k.id) : getMaskedText(getClientRawKey(k.id) || '', 'gemini')}</span>
                                  <button
                                    onClick={() => setShowKeyRecord((prev) => ({ ...prev, [k.id]: !isShowing }))}
                                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                                  >
                                    {isShowing ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                {k.active ? (
                                  <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1 leading-none">
                                    <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                                    ACTIVE
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleSetActiveKey(k.id)}
                                    className="text-[9px] font-extrabold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2 py-0.5 rounded-md cursor-pointer leading-none"
                                  >
                                    Set Active
                                  </button>
                                )}

                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${statusStyle} leading-none`}>
                                  {statusText}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-100/80 text-[10px] text-slate-400">
                              <span>
                                {k.lastTested ? `Tested: ${new Date(k.lastTested).toLocaleTimeString()}` : 'Untested'}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleTestKey(k.id)}
                                  className="px-2 py-1 font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg flex items-center gap-1 cursor-pointer"
                                  disabled={isTesting}
                                >
                                  {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3 text-blue-500" />}
                                  Test
                                </button>
                                <button
                                  onClick={() => handleCopyKey(k)}
                                  className="px-2 py-1 font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg flex items-center gap-1 cursor-pointer"
                                >
                                  <Copy className="w-3 h-3" />
                                  Copy
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(k.id)}
                                  className="px-2 py-1 font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Groq Keys Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                      <Cpu className="w-4 h-4 text-orange-500" />
                      Groq LPU Keys
                    </h4>
                    <div className="flex items-center gap-3">
                      {groqKeys.length > 0 && (
                        <button
                          onClick={() => handleTestAllKeys('groq')}
                          className="text-[10px] font-extrabold text-blue-600 hover:underline cursor-pointer"
                        >
                          [ Test All Groq ]
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setAddProvider('groq');
                          setNewKeyVal('');
                          setNewKeyLabel('');
                          setNewKeyError(null);
                          setNewKeySuccess(null);
                          setShowAddModal(true);
                        }}
                        className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                      >
                        <Plus className="w-3 h-3" />
                        Add Groq Key
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {groqKeys.length === 0 ? (
                      <div className="col-span-full p-8 text-center rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs bg-white/50">
                        No Groq API keys registered.
                      </div>
                    ) : (
                      groqKeys.map((k) => {
                        const isShowing = showKeyRecord[k.id];
                        const isEditing = editingKeyId === k.id;
                        const isTesting = testingKeyId === k.id;

                        let statusStyle = 'text-slate-500 bg-slate-50 border-slate-200';
                        let statusText = k.status === 'active' ? '✓ Valid' : k.status;
                        if (k.status === 'active') {
                          statusStyle = 'text-emerald-700 bg-emerald-50 border-emerald-200';
                        } else if (k.status === 'error') {
                          statusStyle = 'text-rose-700 bg-rose-50 border-rose-200';
                          statusText = '✕ Invalid';
                        } else if (k.status === 'cooldown') {
                          statusStyle = 'text-amber-700 bg-amber-50 border-amber-200';
                          statusText = '⚠ Rate Limited';
                        }

                        return (
                          <div
                            key={k.id}
                            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                              k.active
                                ? 'bg-blue-50/25 border-blue-300 shadow-sm ring-1 ring-blue-500/10'
                                : 'bg-white border-slate-200 hover:border-slate-350 shadow-xs'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="space-y-1 min-w-0">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingLabel}
                                    onChange={(e) => setEditingLabel(e.target.value)}
                                    className="bg-white border border-blue-400 rounded-lg px-2 py-0.5 text-xs text-slate-800 focus:outline-none"
                                    autoFocus
                                    onBlur={() => handleRenameKey(k.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleRenameKey(k.id);
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center gap-1.5 group">
                                    <span className="font-bold text-slate-800 text-xs truncate">
                                      {k.label || 'Unnamed Key'}
                                    </span>
                                    <button
                                      onClick={() => {
                                        setEditingKeyId(k.id);
                                        setEditingLabel(k.label || '');
                                      }}
                                      className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}

                                <div className="font-mono text-[10px] text-slate-600 tracking-tight mt-1 flex items-center gap-1">
                                  <span>{isShowing ? getClientRawKey(k.id) : getMaskedText(getClientRawKey(k.id) || '', 'groq')}</span>
                                  <button
                                    onClick={() => setShowKeyRecord((prev) => ({ ...prev, [k.id]: !isShowing }))}
                                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                                  >
                                    {isShowing ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                {k.active ? (
                                  <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1 leading-none">
                                    <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                                    ACTIVE
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleSetActiveKey(k.id)}
                                    className="text-[9px] font-extrabold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2 py-0.5 rounded-md cursor-pointer leading-none"
                                  >
                                    Set Active
                                  </button>
                                )}

                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${statusStyle} leading-none`}>
                                  {statusText}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-100/80 text-[10px] text-slate-400">
                              <span>
                                {k.lastTested ? `Tested: ${new Date(k.lastTested).toLocaleTimeString()}` : 'Untested'}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleTestKey(k.id)}
                                  className="px-2 py-1 font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg flex items-center gap-1 cursor-pointer"
                                  disabled={isTesting}
                                >
                                  {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3 text-blue-500" />}
                                  Test
                                </button>
                                <button
                                  onClick={() => handleCopyKey(k)}
                                  className="px-2 py-1 font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg flex items-center gap-1 cursor-pointer"
                                >
                                  <Copy className="w-3 h-3" />
                                  Copy
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(k.id)}
                                  className="px-2 py-1 font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: MODEL SELECTION */}
            {activeSection === 'models' && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Model Selection
                  </h3>
                  <p className="text-xs text-slate-500">
                    Choose visual engines for your respective active providers.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Gemini Models card */}
                  <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Sparkles className="w-4.5 h-4.5 text-blue-500" />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Gemini Vision Model</h4>
                        <span className="text-[10px] text-slate-400">Google Multimodal API</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase">Select Active Model</span>
                      <select
                        value={settings.geminiModel || 'gemini-3.8-flash'}
                        onChange={(e) => handleSelectProviderModel('gemini', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
                      >
                        {geminiModels.length === 0 ? (
                          <option value="gemini-3.8-flash">Gemini 3.8 Flash (Recommended)</option>
                        ) : (
                          geminiModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name || m.id} {m.isRecommended ? '✦' : ''}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Groq Models card */}
                  <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                        <Cpu className="w-4.5 h-4.5 text-orange-500" />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Groq Vision Model</h4>
                        <span className="text-[10px] text-slate-400">Ultra-fast Groq Vision API</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase">Select Active Model</span>
                      <select
                        value={settings.groqModel || 'llama-3.2-11b-vision-preview'}
                        onChange={(e) => handleSelectProviderModel('groq', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
                      >
                        {groqModels.length === 0 ? (
                          <option value="llama-3.2-11b-vision-preview">Llama 3.2 11B Vision (Recommended)</option>
                        ) : (
                          groqModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name || m.id} {m.isRecommended ? '✦' : ''}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 3: AI MODE */}
            {activeSection === 'aimode' && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    AI Mode Preferences
                  </h3>
                  <p className="text-xs text-slate-500">
                    Control fallbacks, key rotation, and isolated processing engines.
                  </p>
                </div>

                <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Globe className="w-4 h-4 text-blue-600" />
                        Global API Processing Mode
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        <strong>AUTO</strong>: Key rotators fallback automatically across all operational keys.<br />
                        <strong>GEMINI ONLY</strong>: Exclusively locks generating requests to Google Gemini.<br />
                        <strong>GROQ ONLY</strong>: Exclusively locks generating requests to Groq.
                      </p>
                    </div>

                    <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl shadow-xs shrink-0 self-start sm:self-auto">
                      <button
                        onClick={() => handleGlobalSettingChange({ preferredProvider: 'auto' })}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                          settings.preferredProvider === 'auto'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        AUTO
                      </button>
                      <button
                        onClick={() => handleGlobalSettingChange({ preferredProvider: 'gemini' })}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                          settings.preferredProvider === 'gemini'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        GEMINI ONLY
                      </button>
                      <button
                        onClick={() => handleGlobalSettingChange({ preferredProvider: 'groq' })}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                          settings.preferredProvider === 'groq'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        GROQ ONLY
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 4: KEYWORD SETTINGS */}
            {activeSection === 'keywords' && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Keyword Directives
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure strict keyword generation parameters for Adobe Stock formatting.
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  {/* Count & Strategy */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase block">Target Keyword Count</label>
                      <input
                        type="number"
                        min={5}
                        max={50}
                        value={localKeywordSettings.targetCount || 30}
                        onChange={(e) => setLocalKeywordSettings({ ...localKeywordSettings, targetCount: Math.min(50, Math.max(5, parseInt(e.target.value) || 30)) })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-850"
                      />
                      <span className="text-[10px] text-slate-400">Max limit is 50 keywords.</span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase block">Keyword Strategy</label>
                      <select
                        value={localKeywordSettings.keywordType || 'mixed'}
                        onChange={(e) => setLocalKeywordSettings({ ...localKeywordSettings, keywordType: e.target.value as any })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-850"
                      >
                        <option value="single">Single Word Tags Only</option>
                        <option value="multi">Multi-Word Descriptive Phrases</option>
                        <option value="mixed">Mixed Strategy (Recommended)</option>
                      </select>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="space-y-2.5 pt-2">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase block">Keyword Filtering Options</span>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localKeywordSettings.enforceRelevance}
                          onChange={(e) => setLocalKeywordSettings({ ...localKeywordSettings, enforceRelevance: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Relevant keywords only</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localKeywordSettings.removeDuplicates}
                          onChange={(e) => setLocalKeywordSettings({ ...localKeywordSettings, removeDuplicates: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Remove duplicates</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localKeywordSettings.removeMeaningless}
                          onChange={(e) => setLocalKeywordSettings({ ...localKeywordSettings, removeMeaningless: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Remove unsupported keywords</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localKeywordSettings.prioritizeStrongest}
                          onChange={(e) => setLocalKeywordSettings({ ...localKeywordSettings, prioritizeStrongest: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Prioritize strongest (first 7 tags)</span>
                      </label>
                    </div>

                    <div className="p-3 bg-blue-50/50 border border-blue-100/50 rounded-xl text-[11px] text-blue-800 leading-relaxed space-y-1">
                      <p className="font-bold flex items-center gap-1">
                        <Info className="w-3.5 h-3.5" />
                        Adobe Stock Keyword Importance:
                      </p>
                      <p>
                        Adobe Stock search algorithm relies heavily on keyword ordering. The first 7 keywords receive the highest indexing weight. Enforcing duplicate and unsupported keyword checks ensures search ranking relevance.
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 flex justify-end">
                    <button
                      onClick={handleSaveWorkflowConfig}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 cursor-pointer"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 5: TITLE SETTINGS */}
            {activeSection === 'title' && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Title Directives
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure guidelines for commercial and search indexing titles.
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  {/* Min / Max Length */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase block">Minimum Characters</label>
                      <input
                        type="number"
                        min={5}
                        max={50}
                        value={localTitleSettings.minLength || 10}
                        onChange={(e) => setLocalTitleSettings({ ...localTitleSettings, minLength: Math.max(5, parseInt(e.target.value) || 10) })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-850"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase block">Maximum Characters</label>
                      <input
                        type="number"
                        min={20}
                        max={150}
                        value={localTitleSettings.maxLength || 70}
                        onChange={(e) => setLocalTitleSettings({ ...localTitleSettings, maxLength: Math.min(150, Math.max(20, parseInt(e.target.value) || 70)) })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-850"
                      />
                      <span className="text-[10px] text-slate-400">Adobe Stock sweet spot is 10 - 70 characters.</span>
                    </div>
                  </div>

                  {/* Checkboxes */}
                  <div className="space-y-2.5 pt-2">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase block">Title Quality Controls</span>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localTitleSettings.adobeStockOptimized}
                          onChange={(e) => setLocalTitleSettings({ ...localTitleSettings, adobeStockOptimized: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Adobe Stock optimized</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localTitleSettings.matchAssetContent}
                          onChange={(e) => setLocalTitleSettings({ ...localTitleSettings, matchAssetContent: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Relevant to visible content</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localTitleSettings.commerciallyRelevant}
                          onChange={(e) => setLocalTitleSettings({ ...localTitleSettings, commerciallyRelevant: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Commercially useful title</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localTitleSettings.avoidRepetition}
                          onChange={(e) => setLocalTitleSettings({ ...localTitleSettings, avoidRepetition: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Avoid unnecessary repetition</span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-3 flex justify-end">
                    <button
                      onClick={handleSaveWorkflowConfig}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 cursor-pointer"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 6: DESCRIPTION SETTINGS */}
            {activeSection === 'description' && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Description Directives
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure guidelines for commercial descriptions and metadata claims.
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  {/* Min / Max Length */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase block">Minimum Characters</label>
                      <input
                        type="number"
                        min={5}
                        max={100}
                        value={localDescriptionSettings.minLength || 15}
                        onChange={(e) => setLocalDescriptionSettings({ ...localDescriptionSettings, minLength: Math.max(5, parseInt(e.target.value) || 15) })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-850"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase block">Maximum Characters</label>
                      <input
                        type="number"
                        min={50}
                        max={300}
                        value={localDescriptionSettings.maxLength || 200}
                        onChange={(e) => setLocalDescriptionSettings({ ...localDescriptionSettings, maxLength: Math.min(300, Math.max(50, parseInt(e.target.value) || 200)) })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-850"
                      />
                    </div>
                  </div>

                  {/* Checkboxes */}
                  <div className="space-y-2.5 pt-2">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase block">Description Quality Controls</span>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localDescriptionSettings.relevantToAsset}
                          onChange={(e) => setLocalDescriptionSettings({ ...localDescriptionSettings, relevantToAsset: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Relevant to actual asset</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localDescriptionSettings.commerciallyUseful}
                          onChange={(e) => setLocalDescriptionSettings({ ...localDescriptionSettings, commerciallyUseful: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Commercially useful description</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localDescriptionSettings.adobeStockOptimized}
                          onChange={(e) => setLocalDescriptionSettings({ ...localDescriptionSettings, adobeStockOptimized: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Adobe Stock optimized</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={localDescriptionSettings.noKeywordStuffing}
                          onChange={(e) => setLocalDescriptionSettings({ ...localDescriptionSettings, noKeywordStuffing: e.target.checked })}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Prevent keyword stuffing</span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-3 flex justify-end">
                    <button
                      onClick={handleSaveWorkflowConfig}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 cursor-pointer"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* INNER MODAL: ADD API KEY */}
      {showAddModal && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 text-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-600" />
                Add API Key
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewKeyError(null);
                  setNewKeySuccess(null);
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Provider Display */}
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase">Provider</span>
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-black uppercase tracking-wider flex items-center gap-2">
                  {addProvider === 'gemini' ? (
                    <>
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      Google Gemini
                    </>
                  ) : (
                    <>
                      <Cpu className="w-4 h-4 text-orange-500 animate-pulse" />
                      Groq LPU
                    </>
                  )}
                </div>
              </div>

              {/* Key Display Label */}
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase">Key Name</span>
                <input
                  type="text"
                  placeholder="e.g. My Production Key"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
                />
              </div>

              {/* Key Token */}
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase">API Key</span>
                <div className="relative">
                  <input
                    type={showNewKey ? 'text' : 'password'}
                    placeholder={addProvider === 'gemini' ? 'AIzaSy...' : 'gsk_...'}
                    value={newKeyVal}
                    onChange={(e) => setNewKeyVal(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewKey(!showNewKey)}
                    className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Alerts inside modal */}
              {newKeyError && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold">Wrong provider key</span>
                    <p className="mt-0.5 text-[10px] text-rose-600">{newKeyError}</p>
                  </div>
                </div>
              )}

              {newKeySuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{newKeySuccess}</span>
                </div>
              )}
            </div>

            {/* Buttons inside Modal */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setNewKeyError(null);
                  setNewKeySuccess(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTestNewKeyRaw}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                disabled={isTestingNewKey}
              >
                {isTestingNewKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-blue-500" />}
                Test Key
              </button>
              <button
                type="button"
                onClick={handleSaveNewKey}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/10 cursor-pointer"
                disabled={isTestingNewKey}
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE OVERLAY */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-70 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Permanently delete API Key?</h3>
            <p className="text-xs text-slate-500">
              This action cannot be undone. All active metadata generation connections using this key will be lost.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteKey(confirmDeleteId)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
