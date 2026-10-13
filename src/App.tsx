import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Layers,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Plus,
  MessageCircle,
} from 'lucide-react';
import {
  Project,
  StockAsset,
  Marketplace,
  AssetType,
  TitleSettings,
  KeywordSettings,
  DescriptionSettings,
  BackgroundSettings,
  AIProvider,
  ApiKeyEntry,
  ApiUsageStats,
  ProcessingSettings,
} from './types';
import { Navbar } from './components/Navbar';
import { WorkflowBar } from './components/WorkflowBar';
import { UploadZone } from './components/UploadZone';
import { QueueControlBar } from './components/QueueControlBar';
import { AssetTable } from './components/AssetTable';
import { TitleSettingsModal } from './components/TitleSettingsModal';
import { KeywordSettingsModal } from './components/KeywordSettingsModal';
import { MetadataEditorModal } from './components/MetadataEditorModal';
import { MarketplaceSelector } from './components/MarketplaceSelector';
import { CsvExportModal } from './components/CsvExportModal';
import { CsvImportModal } from './components/CsvImportModal';
import { AiProviderManager } from './components/AiProviderManager';
import { DashboardAiProvidersCard } from './components/DashboardAiProvidersCard';
import { DashboardStatsCard } from './components/DashboardStatsCard';
import { ProjectsModal } from './components/ProjectsModal';
import { AdvancedSettingsModal } from './components/AdvancedSettingsModal';
import { RulesModal } from './components/InfoModals';
import { BatchEmbedModal } from './components/BatchEmbedModal';
import { SeoFinderView } from './components/SeoFinderView';
import { AuthView } from './components/AuthView';
import { AuthProvider, useAuth } from './context/AuthContext';
import { analyzeBatchDuplicatesAndSimilarity } from './utils/similarityDetector';
import { cleanTitleOfCommonPhrases, populateMarketplaceAwareMetadata } from './utils/metadataEngine';
import { metadataCache } from './utils/metadataCache';
import { apiKeyStore } from './utils/aiProviderStore';
import { resolveEffectiveModel } from './utils/aiModelService';
import { fileBinaryStore } from './utils/fileBinaryStore';
import {
  fetchProjects,
  saveProjectApi,
  deleteProjectApi,
  fetchApiKeys,
  fetchUsageStats,
  resetUsageStats,
  fetchSettingsApi,
  updateSettingsApi,
  requestGenerateMetadata,
} from './utils/apiClient';
import { normalizeErrorInfo } from './utils/errorNormalizer';
import { playNotificationTone } from './utils/audio';

function DashboardApp() {
  const { user, loading, continueAsGuest } = useAuth();
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAuthTimedOut(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  // Navigation state
  const [activeView, setActiveView] = useState<'generator' | 'seo-finder'>('generator');

  // Project state
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project>({
    id: 'default-project',
    name: 'Stock Batch 01',
    marketplace: 'adobe',
    assetType: 'photo',
    titleSettings: { maxLength: 70 },
    keywordSettings: { targetCount: 30 },
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Global settings & keys
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [stats, setStats] = useState<ApiUsageStats | null>(null);
  const [settings, setSettings] = useState<ProcessingSettings>({
    preferredProvider: 'auto',
    concurrency: 4,
    geminiModel: 'gemini-3.8-flash',
    groqModel: 'llama-3.2-11b-vision-preview',
    retryCount: 2,
    enableAutoSave: true,
    autoRotation: true,
    autoFallback: true,
  });

  // Table selection & editor modal
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);

  // Queue runner state
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentProcessingFilename, setCurrentProcessingFilename] = useState<string | null>(null);
  const [showPostGenerationActions, setShowPostGenerationActions] = useState(false);
  const isCancelledRef = useRef(false);
  const isPausedRef = useRef(false);

  // Modals visibility
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [isKeywordModalOpen, setIsKeywordModalOpen] = useState(false);
  const [isExportCsvOpen, setIsExportCsvOpen] = useState(false);
  const [isImportCsvOpen, setIsImportCsvOpen] = useState(false);
  const [isKeysOpen, setIsKeysOpen] = useState(false);
  const [initialAiProviderTab, setInitialAiProviderTab] = useState<'gemini' | 'groq' | 'openai'>('gemini');
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isBatchEmbedOpen, setIsBatchEmbedOpen] = useState(false);

  // Full-width desktop view state (defaulting to true so PC users get edge-to-edge view)
  const [isFullWidth, setIsFullWidth] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stock_pro_full_width');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const handleToggleFullWidth = () => {
    setIsFullWidth((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('stock_pro_full_width', String(next));
      } catch {}
      return next;
    });
  };

  // Initial load when user changes or authenticates
  useEffect(() => {
    if (user) {
      apiKeyStore.setUserId(user.id);
      loadInitialData();
    }
  }, [user?.id]);

  const loadInitialData = async () => {
    if (!user) return;
    try {
      const [projs, keys, usage, setts] = await Promise.all([
        fetchProjects().catch(() => []),
        fetchApiKeys().catch(() => []),
        fetchUsageStats().catch(() => null),
        fetchSettingsApi().catch(() => null),
      ]);

      if (Array.isArray(keys)) setApiKeys(keys);
      if (usage) setStats(usage);
      if (setts) {
        setSettings({
          ...setts,
          geminiModel: resolveEffectiveModel('gemini', setts.geminiModel),
          groqModel: resolveEffectiveModel('groq', setts.groqModel),
        });
      }

      try {
        const saved = localStorage.getItem('stock_pro_settings_backup');
        if (saved) {
          const parsed = JSON.parse(saved);
          let changed = false;
          if (parsed.geminiModel) {
            const resolved = resolveEffectiveModel('gemini', parsed.geminiModel);
            if (resolved !== parsed.geminiModel) {
              parsed.geminiModel = resolved;
              changed = true;
            }
          }
          if (parsed.groqModel) {
            const resolved = resolveEffectiveModel('groq', parsed.groqModel);
            if (resolved !== parsed.groqModel) {
              parsed.groqModel = resolved;
              changed = true;
            }
          }
          if (changed) {
            localStorage.setItem('stock_pro_settings_backup', JSON.stringify(parsed));
          }
        }
      } catch {}

      if (Array.isArray(projs) && projs.length > 0) {
        const forcedProjs = projs.map(p => ({
          ...p,
          marketplace: 'adobe' as const,
          selectedMarketplaces: ['adobe' as const],
        }));
        setProjects(forcedProjs);
        setCurrentProject(forcedProjs[0]);
      } else {
        // Save initial default project for this user
        const initialProj: Project = {
          id: `project-${Date.now()}`,
          userId: user.id,
          name: 'My Stock Batch 01',
          marketplace: 'adobe',
          assetType: 'photo',
          titleSettings: { maxLength: 70 },
          keywordSettings: { targetCount: 30 },
          items: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveProjectApi(initialProj);
        setProjects([initialProj]);
        setCurrentProject(initialProj);
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
    }
  };

  // Keep project saved to server
  const persistProject = async (updated: Project) => {
    const forced: Project = {
      ...updated,
      marketplace: 'adobe',
      selectedMarketplaces: ['adobe'],
    };
    setCurrentProject(forced);
    setProjects((prev) => prev.map((p) => (p.id === forced.id ? forced : p)));
    try {
      await saveProjectApi(forced);
    } catch (err) {
      console.error('Error auto-saving project:', err);
    }
  };

  // Upload new assets
  const handleAddAssets = (newAssets: StockAsset[]) => {
    const rawItems = [...currentProject.items, ...newAssets];
    
    // Auto-detect duplicates and visual similarity after every upload
    const { annotatedAssets } = analyzeBatchDuplicatesAndSimilarity(rawItems);
    
    const updatedProj: Project = {
      ...currentProject,
      items: annotatedAssets,
      updatedAt: new Date().toISOString(),
    };
    persistProject(updatedProj);
  };

  // Remove asset
  const handleDeleteAsset = (id: string) => {
    const updatedItems = currentProject.items.filter((a) => a.id !== id);
    const updatedProj: Project = {
      ...currentProject,
      items: updatedItems,
      updatedAt: new Date().toISOString(),
    };
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    persistProject(updatedProj);
  };

  // Clear all assets (opens safe in-app confirmation modal)
  const handleClearAllAssets = () => {
    setIsClearConfirmOpen(true);
  };

  const handleConfirmClearAll = () => {
    setIsClearConfirmOpen(false);
    isCancelledRef.current = true;
    setIsProcessing(false);
    setIsPaused(false);
    setCurrentProcessingFilename(null);
    setSelectedIds(new Set());
    fileBinaryStore.clear();

    const updatedProj: Project = {
      ...currentProject,
      items: [],
      updatedAt: new Date().toISOString(),
    };
    persistProject(updatedProj);
  };

  // Instant 1-Click Refresh & Clear Reset Tool
  const handleRefreshAndClearAll = () => {
    isCancelledRef.current = true;
    setIsProcessing(false);
    setIsPaused(false);
    setCurrentProcessingFilename(null);
    setSelectedIds(new Set());
    fileBinaryStore.clear();

    const updatedProj: Project = {
      ...currentProject,
      items: [],
      updatedAt: new Date().toISOString(),
    };
    persistProject(updatedProj);
  };

  // Delete selected assets
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const updatedItems = currentProject.items.filter((a) => !selectedIds.has(a.id));
    const updatedProj: Project = {
      ...currentProject,
      items: updatedItems,
      updatedAt: new Date().toISOString(),
    };
    setSelectedIds(new Set());
    persistProject(updatedProj);
  };

  // Update single asset after edit
  const handleSaveAsset = (updatedAsset: StockAsset) => {
    const rawItems = currentProject.items.map((item) =>
      item.id === updatedAsset.id ? updatedAsset : item
    );
    
    // Re-run similarity since metadata may have changed
    const { annotatedAssets } = analyzeBatchDuplicatesAndSimilarity(rawItems);
    
    persistProject({
      ...currentProject,
      items: annotatedAssets,
      updatedAt: new Date().toISOString(),
    });
  };

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(currentProject.items.map((a) => a.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Workflow settings handlers (Enforce Adobe Stock only)
  const handleSelectMarketplace = (m: Marketplace) => {
    persistProject({
      ...currentProject,
      marketplace: 'adobe',
      selectedMarketplaces: ['adobe'],
      updatedAt: new Date().toISOString(),
    });
  };

  const handleToggleMarketplace = (m: Marketplace) => {
    persistProject({
      ...currentProject,
      marketplace: 'adobe',
      selectedMarketplaces: ['adobe'],
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSelectActiveMarketplace = (m: Marketplace) => {
    persistProject({
      ...currentProject,
      marketplace: 'adobe',
      selectedMarketplaces: ['adobe'],
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSetMarketplacePreset = (markets: Marketplace[]) => {
    persistProject({
      ...currentProject,
      marketplace: 'adobe',
      selectedMarketplaces: ['adobe'],
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSelectAssetType = (t: AssetType) => {
    persistProject({ ...currentProject, assetType: t, updatedAt: new Date().toISOString() });
  };

  const handleSaveAllWorkflowSettings = (
    ts: TitleSettings,
    ks: KeywordSettings,
    bs: BackgroundSettings,
    at: AssetType
  ) => {
    setIsTitleModalOpen(false);
    setIsKeywordModalOpen(false);
    metadataCache.clear();

    const activeMarkets =
      currentProject.selectedMarketplaces && currentProject.selectedMarketplaces.length > 0
        ? currentProject.selectedMarketplaces
        : [currentProject.marketplace || 'adobe'];

    // Update items with new title settings logic if necessary
    const updatedItems = currentProject.items.map((item) => {
      if (item.metadata) {
        let updatedMeta = {
          ...item.metadata,
          titleSettings: ts,
        };
        if (updatedMeta.title && !updatedMeta.isTitleManuallyEdited) {
          updatedMeta.title = cleanTitleOfCommonPhrases(updatedMeta.title);
        }
        const reAdapted = populateMarketplaceAwareMetadata(updatedMeta, activeMarkets, currentProject.marketplace);
        return {
          ...item,
          metadata: reAdapted,
        };
      }
      return item;
    });

    persistProject({
      ...currentProject,
      items: updatedItems,
      titleSettings: ts,
      keywordSettings: ks,
      backgroundSettings: bs,
      assetType: at,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSaveTitleSettings = (ts: TitleSettings) => {
    handleSaveAllWorkflowSettings(ts, currentProject.keywordSettings, currentProject.backgroundSettings || { userBackgroundType: 'auto' }, currentProject.assetType);
  };

  const handleSaveKeywordSettings = (ks: KeywordSettings) => {
    handleSaveAllWorkflowSettings(currentProject.titleSettings, ks, currentProject.backgroundSettings || { userBackgroundType: 'auto' }, currentProject.assetType);
  };

  const handleSaveBackgroundSettings = (bs: BackgroundSettings) => {
    persistProject({ ...currentProject, backgroundSettings: bs, updatedAt: new Date().toISOString() });
  };

  const handleSaveWorkflowSettingsUnified = (
    ts: TitleSettings,
    ks: KeywordSettings,
    ds: DescriptionSettings
  ) => {
    metadataCache.clear();
    const activeMarkets =
      currentProject.selectedMarketplaces && currentProject.selectedMarketplaces.length > 0
        ? currentProject.selectedMarketplaces
        : [currentProject.marketplace || 'adobe'];

    // Update items with new title settings logic if necessary
    const updatedItems = currentProject.items.map((item) => {
      if (item.metadata) {
        let updatedMeta = {
          ...item.metadata,
          titleSettings: ts,
        };
        if (updatedMeta.title && !updatedMeta.isTitleManuallyEdited) {
          updatedMeta.title = cleanTitleOfCommonPhrases(updatedMeta.title);
        }
        const reAdapted = populateMarketplaceAwareMetadata(updatedMeta, activeMarkets, currentProject.marketplace);
        return {
          ...item,
          metadata: reAdapted,
        };
      }
      return item;
    });

    persistProject({
      ...currentProject,
      items: updatedItems,
      titleSettings: ts,
      keywordSettings: ks,
      descriptionSettings: ds,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleToggleAiGenerated = (val: boolean) => {
    // Also toggle for existing items
    const updatedItems = currentProject.items.map((item) => {
      if (item.metadata) {
        return {
          ...item,
          metadata: { ...item.metadata, aiGenerated: val },
        };
      }
      return item;
    });
    persistProject({
      ...currentProject,
      items: updatedItems,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSelectProvider = async (p: AIProvider) => {
    const updatedSettings = { ...settings, preferredProvider: p };
    setSettings(updatedSettings);
    await updateSettingsApi({ preferredProvider: p });
  };

  // ==========================================
  // BULK QUEUE WORKER POOL (MAXIMUM SAFE SPEED + HIGH RESPONSIVENESS)
  // ==========================================
  const runQueue = async (targetAssets: StockAsset[], queueOptions: { bypassCache?: boolean } = {}) => {
    if (targetAssets.length === 0 || isProcessing) return;

    // Check if any keys are configured in the vault
    const totalKeys = apiKeyStore.getTotalConfiguredKeys();
    if (totalKeys === 0) {
      setIsKeysOpen(true);
      return;
    }

    setIsProcessing(true);
    setIsPaused(false);
    setShowPostGenerationActions(false);
    isCancelledRef.current = false;
    isPausedRef.current = false;

    // Immediate visual reset of target assets to 'waiting' state
    let currentItems = [...currentProject.items];
    currentItems = currentItems.map((item) => {
      if (targetAssets.some((t) => t.id === item.id)) {
        return {
          ...item,
          status: 'waiting' as const,
          generationStatus: 'pending' as const,
          errorMessage: undefined,
        };
      }
      return item;
    });
    setCurrentProject((prev) => ({ ...prev, items: currentItems }));

    const queue = [...targetAssets];
    const counts = apiKeyStore.getKeyCounts();
    const effectiveBatchProvider =
      settings.preferredProvider === 'groq'
        ? 'groq'
        : settings.preferredProvider === 'gemini'
        ? 'gemini'
        : counts.groqActive > 0
        ? 'groq'
        : 'gemini';

    // Groq on-demand tier enforces a 1,000 Output Tokens Per Minute (OTPM) limit.
    // Serializing Groq processing (concurrency 1) prevents simultaneous token reservation collisions.
    // For Gemini and OpenAI, safe concurrent workers (3-4) gives 3-4x speedup.
    const maxAllowedConcurrency = effectiveBatchProvider === 'groq' ? 1 : 4;
    const concurrency = Math.min(settings.concurrency || 3, maxAllowedConcurrency);

    // Track mutable items array to update UI and server progressively
    // (currentItems was already initialized above with the reset state)

    const worker = async (workerIndex: number) => {
      // Light worker stagger (250ms) to prevent simultaneous socket handshakes
      if (workerIndex > 0) {
        await new Promise((r) => setTimeout(r, workerIndex * 250));
      }

      while (queue.length > 0 && !isCancelledRef.current) {
        // Pause check loop
        while (isPausedRef.current && !isCancelledRef.current) {
          await new Promise((r) => setTimeout(r, 200));
        }

        if (isCancelledRef.current) break;

        const asset = queue.shift();
        if (!asset) break;

        // If asset is already completed and no explicit bypass is requested, skip unnecessary work
        if (asset.status === 'completed' && asset.metadata && !queueOptions.bypassCache) {
          continue;
        }

        setCurrentProcessingFilename(asset.originalFilename);

        // Mark asset as processing
        currentItems = currentItems.map((item) =>
          item.id === asset.id ? { ...item, status: 'processing', generationStatus: 'processing', errorMessage: undefined } : item
        );
        setCurrentProject((prev) => ({ ...prev, items: currentItems }));

        let attempts = 0;
        const maxAttempts = (settings.retryCount || 2) + 1;
        let success = false;

        while (attempts < maxAttempts && !success && !isCancelledRef.current) {
          try {
            attempts++;
            // Check for cached AI base64 or fallback to thumbnail
            const base64 =
              (asset as any)._aiBase64 || asset.thumbnailUrl || (asset as any).dataUrl;

            if (!base64) {
              throw new Error(`Missing image data for ${asset.originalFilename}`);
            }

            const activeMarkets =
              currentProject.selectedMarketplaces && currentProject.selectedMarketplaces.length > 0
                ? currentProject.selectedMarketplaces
                : [currentProject.marketplace];

            const currentCounts = apiKeyStore.getKeyCounts();
            const effectiveProvider =
              settings.preferredProvider === 'groq'
                ? 'groq'
                : settings.preferredProvider === 'gemini'
                ? 'gemini'
                : currentCounts.groqActive > 0
                ? 'groq'
                : 'gemini';

            const activeKey = apiKeyStore.getActiveKey(effectiveProvider);
            const selectedKeyId = activeKey?.id;

            const selectedModel =
              effectiveProvider === 'gemini'
                ? settings.geminiModel
                : settings.groqModel;

            if (attempts > 1) {
              currentItems = currentItems.map((item) =>
                item.id === asset.id
                  ? {
                      ...item,
                      status: 'processing',
                      generationStatus: 'processing',
                      errorMessage: `Retrying with rotated key (Attempt ${attempts}/${maxAttempts})...`,
                    }
                  : item
              );
              setCurrentProject((prev) => ({ ...prev, items: currentItems }));
            }

            const existingBatchTitles = currentItems
              .filter((item) => item.id !== asset.id && item.metadata?.title)
              .map((item) => item.metadata!.title);
            const existingBatchKeywords = currentItems
              .filter((item) => item.id !== asset.id && item.metadata?.keywords)
              .flatMap((item) => item.metadata!.keywords.map((k) => (typeof k === 'string' ? k : k.word)));

            const genResult = await requestGenerateMetadata(
              base64,
              asset.mimeType || 'image/jpeg',
              {
                marketplace: currentProject.marketplace,
                selectedMarketplaces: activeMarkets,
                assetType: currentProject.assetType,
                titleSettings: currentProject.titleSettings,
                keywordSettings: currentProject.keywordSettings,
                backgroundSettings: currentProject.backgroundSettings,
                aiGeneratedFlag: currentProject.items.some((i) => i.metadata?.aiGenerated),
                backgroundAnalysis: asset.backgroundAnalysis,
                fileContentHash: asset.fileContentHash,
                bypassCache: queueOptions.bypassCache || attempts > 1,
                existingBatchTitles,
                existingBatchKeywords,
              },
              effectiveProvider,
              selectedModel,
              selectedKeyId
            );

            // Update asset with completed metadata
            currentItems = currentItems.map((item) => {
              if (item.id === asset.id) {
                const newVersions = [
                  ...(item.versions || []),
                  {
                    versionNumber: (item.versions?.length || 0) + 1,
                    timestamp: new Date().toISOString(),
                    title: genResult.metadata.title,
                    keywords: genResult.metadata.keywords,
                    category: genResult.metadata.category,
                    seoScore: genResult.metadata.seoScore,
                  },
                ];

                return {
                  ...item,
                  status: 'completed',
                  generationStatus: 'completed',
                  providerUsed: genResult.providerUsed || genResult.provider || effectiveProvider,
                  errorInfo: null,
                  metadata: genResult.metadata,
                  versions: newVersions,
                  errorMessage: undefined,
                };
              }
              return item;
            });

            setCurrentProject((prev) => ({ ...prev, items: currentItems }));
            success = true;

            if (effectiveBatchProvider === 'groq') {
              // Smooth pacing between Groq requests to respect rolling OTPM rate limit window
              await new Promise((r) => setTimeout(r, 600));
            }
          } catch (err: any) {
            console.error(`Error processing ${asset.originalFilename} (Attempt ${attempts}/${maxAttempts}):`, err);

            const isRateLimit =
              err.message?.includes('Rate limit') ||
              err.message?.includes('try again') ||
              err.message?.includes('retry in') ||
              err.message?.includes('Quota exceeded') ||
              err.message?.includes('RESOURCE_EXHAUSTED') ||
              err.message?.includes('429');

            if (attempts < maxAttempts && !isCancelledRef.current) {
              let waitMs = 2500;
              if (isRateLimit) {
                const match = err.message?.match(/(?:retry|try again) in (\d+(?:\.\d+)?)s/i);
                if (match && match[1]) {
                  const seconds = parseFloat(match[1]);
                  waitMs = Math.ceil(seconds * 1000) + 1000;
                } else if (err.message?.includes('reduce max_tokens') || err.message?.includes('OTPM')) {
                  waitMs = 1000;
                } else {
                  waitMs = 3500;
                }
              }

              // Update status to show wait timer
              currentItems = currentItems.map((item) =>
                item.id === asset.id
                  ? {
                      ...item,
                      status: 'processing',
                      generationStatus: 'processing',
                      errorMessage: `Switching key... (retrying in ${Math.round(waitMs / 1000)}s)`,
                    }
                  : item
              );
              setCurrentProject((prev) => ({ ...prev, items: currentItems }));

              await new Promise((r) => setTimeout(r, waitMs));
            } else {
              // Final failure
              const currentCounts = apiKeyStore.getKeyCounts();
              const finalAttemptedProvider =
                settings.preferredProvider === 'groq'
                  ? 'groq'
                  : settings.preferredProvider === 'gemini'
                  ? 'gemini'
                  : currentCounts.groqActive > 0 && currentCounts.geminiActive === 0
                  ? 'groq'
                  : 'gemini';
              const finalErrorInfo = normalizeErrorInfo(err, finalAttemptedProvider);

              currentItems = currentItems.map((item) =>
                item.id === asset.id
                  ? {
                      ...item,
                      status: 'failed',
                      generationStatus: 'failed',
                      providerUsed: null,
                      errorInfo: finalErrorInfo,
                      errorMessage: finalErrorInfo.message,
                    }
                  : item
              );
              setCurrentProject((prev) => ({ ...prev, items: currentItems }));
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        }
      }
    };

    // Run parallel workers with staggered index
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, (_, i) => worker(i));
    await Promise.all(workers);

    // Re-run similarity checks after metadata is generated
    const { annotatedAssets } = analyzeBatchDuplicatesAndSimilarity(currentItems);

    // Save final updated state
    const finalProj: Project = {
      ...currentProject,
      items: annotatedAssets,
      updatedAt: new Date().toISOString(),
    };
    await persistProject(finalProj);

    // Refresh telemetry stats
    fetchUsageStats().then(setStats).catch(() => {});

    setIsProcessing(false);
    setIsPaused(false);
    setCurrentProcessingFilename(null);

    // Trigger completion sound and show prominent download button
    if (!isCancelledRef.current && targetAssets.length > 0) {
      playNotificationTone();
      setShowPostGenerationActions(true);
    }
  };

  const handleResetStats = async () => {
    try {
      const updated = await resetUsageStats();
      setStats(updated);
    } catch {}
  };

  const handleGenerateAll = () => {
    const targets = currentProject.items.filter((a) => a.status !== 'completed' || !a.metadata);
    if (targets.length === 0) {
      // If all are already completed, clicking "Generate All" should act as "Regenerate All"
      handleRegenerateAll();
      return;
    }
    runQueue(targets);
  };

  const handleGenerateSelected = () => {
    const selected = currentProject.items.filter((a) => selectedIds.has(a.id));
    const targets = selected.filter((a) => a.status !== 'completed' || !a.metadata);
    runQueue(targets.length > 0 ? targets : selected, { bypassCache: targets.length === 0 });
  };

  const handleRegenerateAll = () => {
    runQueue(currentProject.items, { bypassCache: true });
  };

  const handleRegenerateSelected = () => {
    const selected = currentProject.items.filter((a) => selectedIds.has(a.id));
    if (selected.length > 0) {
      runQueue(selected, { bypassCache: true });
    }
  };

  const handleRetryFailed = () => {
    const failed = currentProject.items.filter((a) => a.status === 'failed');
    runQueue(failed, { bypassCache: true });
  };

  const handleRegenerateSingle = (asset: StockAsset) => {
    runQueue([asset], { bypassCache: true });
  };

  const handlePause = () => {
    isPausedRef.current = true;
    setIsPaused(true);
  };

  const handleResume = () => {
    isPausedRef.current = false;
    setIsPaused(false);
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    setIsProcessing(false);
    setIsPaused(false);
    setCurrentProcessingFilename(null);
  };

  // Projects Modal Handlers
  const handleCreateProject = async (name: string) => {
    const newProj: Project = {
      id: `project-${Date.now()}`,
      userId: user?.id,
      name,
      marketplace: currentProject.marketplace,
      assetType: currentProject.assetType,
      titleSettings: currentProject.titleSettings,
      keywordSettings: currentProject.keywordSettings,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveProjectApi(newProj);
    setProjects((prev) => [...prev, newProj]);
    setCurrentProject(newProj);
    setSelectedIds(new Set());
  };

  const handleRenameProject = async (id: string, newName: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const updated = { ...target, name: newName, updatedAt: new Date().toISOString() };
    await saveProjectApi(updated);
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    if (currentProject.id === id) setCurrentProject(updated);
  };

  const handleDuplicateProject = async (id: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const dup: Project = {
      ...target,
      id: `project-${Date.now()}`,
      userId: user?.id,
      name: `${target.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveProjectApi(dup);
    setProjects((prev) => [...prev, dup]);
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProjectApi(id);
    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);
    if (currentProject.id === id && remaining.length > 0) {
      setCurrentProject(remaining[0]);
    }
  };

  // Navigation inside Metadata Editor
  const editingAssetIndex = currentProject.items.findIndex((a) => a.id === editingAssetId);
  const editingAsset = editingAssetIndex >= 0 ? currentProject.items[editingAssetIndex] : null;

  const existingFilenames = new Set(currentProject.items.map((a) => a.originalFilename));

  // Authentication Gate:
  // 1. Session Loading Screen (with quick fallback)
  if (loading && !authTimedOut) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300 max-w-xs text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">STOCK METADATA PRO AI</h2>
            <p className="text-xs text-slate-500 mt-1">Starting workspace...</p>
          </div>
          <div className="w-6 h-6 border-2 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Gate: Show Login / Register screen (or allow instant guest mode)
  if (!user) {
    return <AuthView />;
  }

  return (
    <div
      className={`min-h-screen ${
        theme === 'dark' ? 'premium-digital-bg-dark text-slate-100' : 'premium-digital-bg-light text-slate-900'
      } font-sans antialiased selection:bg-cyan-500 selection:text-white transition-colors duration-200`}
    >
      {/* Top Navbar */}
      <Navbar
        currentProject={currentProject}
        onOpenProjects={() => setIsProjectsOpen(true)}
        onOpenKeys={() => setIsKeysOpen(true)}
        onOpenRules={() => setIsRulesOpen(true)}
        onOpenAdvanced={() => setIsAdvancedOpen(true)}
        activeView={activeView}
        setActiveView={setActiveView}
        theme={theme}
        toggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        apiKeys={apiKeys}
        provider={settings.preferredProvider}
        onSelectProvider={handleSelectProvider}
        hasGroq={apiKeys.some((k) => k.provider === 'groq' && k.enabled && k.status !== 'error')}
        isFullWidth={isFullWidth}
        onToggleFullWidth={handleToggleFullWidth}
      />

      {/* Main Content Container matching full-screen PC view */}
      <main className={`w-full ${isFullWidth ? 'max-w-[1850px] 2xl:max-w-[1920px] px-4 sm:px-6 lg:px-8 xl:px-10' : 'max-w-5xl px-3 sm:px-4'} mx-auto py-4 md:py-6 space-y-4 transition-all duration-200`}>
        {/* Real-time API stats overview for Groq & Gemini */}
        <DashboardStatsCard stats={stats} onResetStats={handleResetStats} />

        {activeView === 'generator' ? (
          <>
            {/* Step 1 & 2: Platform, Asset Type, Title & Keyword Configuration Bar */}
            <WorkflowBar
              marketplace={currentProject.marketplace}
              onSelectMarketplace={handleSelectMarketplace}
              selectedMarketplaces={currentProject.selectedMarketplaces || [currentProject.marketplace]}
              assetType={currentProject.assetType}
              onSelectAssetType={handleSelectAssetType}
              titleSettings={currentProject.titleSettings}
              onOpenTitleSettings={() => setIsTitleModalOpen(true)}
              keywordSettings={currentProject.keywordSettings}
              onOpenKeywordSettings={() => setIsKeywordModalOpen(true)}
              aiGenerated={currentProject.items.some((i) => i.metadata?.aiGenerated)}
              onToggleAiGenerated={handleToggleAiGenerated}
              provider={settings.preferredProvider}
              onSelectProvider={handleSelectProvider}
              onOpenAdvanced={() => setIsAdvancedOpen(true)}
              hasGroq={apiKeys.some((k) => k.provider === 'groq' && k.enabled && k.status !== 'error')}
              activeKeysCount={apiKeys.filter((k) => k.enabled).length}
              onOpenKeys={() => setIsKeysOpen(true)}
              theme={theme}
            />

            {/* Step 3: Drag & Drop Upload Zone (client-side fast thumbnails, strict originalFilename) */}
            <UploadZone
              onAddAssets={handleAddAssets}
              existingFilenames={existingFilenames}
              existingAssets={currentProject.items}
              totalAssetsCount={currentProject.items.length}
              onClearAll={handleClearAllAssets}
              onOpenRules={() => setIsRulesOpen(true)}
              theme={theme}
            />

            {/* Step 4: Bulk Queue Controls & Live Progress */}
            {currentProject.items.length > 0 && (
              <QueueControlBar
                assets={currentProject.items}
                isProcessing={isProcessing}
                isPaused={isPaused}
                selectedCount={selectedIds.size}
                currentProcessingFilename={currentProcessingFilename}
                showPostGenerationActions={showPostGenerationActions}
                onDismissPostGeneration={() => setShowPostGenerationActions(false)}
                concurrency={settings.concurrency}
                onChangeConcurrency={(c) => {
                  setSettings((prev) => ({ ...prev, concurrency: c }));
                  updateSettingsApi({ concurrency: c });
                }}
                onGenerateAll={handleGenerateAll}
                onGenerateSelected={handleGenerateSelected}
                onRegenerateAll={handleRegenerateAll}
                onRegenerateSelected={handleRegenerateSelected}
                onPause={handlePause}
                onResume={handleResume}
                onCancel={handleCancel}
                onRetryFailed={handleRetryFailed}
                onOpenExportCsv={() => setIsExportCsvOpen(true)}
                onOpenImportCsv={() => setIsImportCsvOpen(true)}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                onClearAll={handleClearAllAssets}
                onRefreshAndClearAll={handleRefreshAndClearAll}
                onOpenKeys={() => setIsKeysOpen(true)}
                onOpenBatchEmbed={() => setIsBatchEmbedOpen(true)}
              />
            )}

            {/* Step 5: High-Density Asset Review Table & Mobile Cards */}
            <AssetTable
              assets={currentProject.items}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onEditAsset={(asset) => setEditingAssetId(asset.id)}
              onRegenerateAsset={handleRegenerateSingle}
              onDeleteAsset={handleDeleteAsset}
              isProcessing={isProcessing}
              onClearAll={handleClearAllAssets}
              onDeleteSelected={handleDeleteSelected}
              activeMarketplace={currentProject.marketplace}
              selectedMarketplaces={currentProject.selectedMarketplaces || [currentProject.marketplace]}
              onOpenBatchEmbed={() => setIsBatchEmbedOpen(true)}
              onOpenRules={() => setIsRulesOpen(true)}
              isFullWidth={isFullWidth}
            />
          </>
        ) : (
          /* Standalone Stock SEO Auditor & Keyword Researcher */
          <SeoFinderView />
        )}
      </main>

      {/* Persistent App Footer */}
      <footer className="py-6 border-t border-slate-200 flex flex-col items-center justify-center gap-3 text-center">
        <span className="text-xs font-semibold text-slate-500 tracking-wider">AFTAB JAAN</span>
        <a
          href="https://wa.me/923081210798"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-xs font-semibold shadow-xs transition-all cursor-pointer"
          title="Connect Us on WhatsApp"
        >
          <MessageCircle className="w-4 h-4 text-emerald-600" />
          Connect Us
        </a>
      </footer>

      {/* MODALS */}
      {/* Title Settings Modal */}
      <TitleSettingsModal
        isOpen={isTitleModalOpen}
        onClose={() => setIsTitleModalOpen(false)}
        titleSettings={currentProject.titleSettings}
        keywordSettings={currentProject.keywordSettings}
        backgroundSettings={currentProject.backgroundSettings}
        assetType={currentProject.assetType}
        onSave={handleSaveTitleSettings}
        onSaveKeywordSettings={handleSaveKeywordSettings}
        onSaveBackgroundSettings={handleSaveBackgroundSettings}
        onSaveAll={handleSaveAllWorkflowSettings}
        onSelectAssetType={handleSelectAssetType}
      />

      {/* Keyword Settings Modal */}
      <KeywordSettingsModal
        isOpen={isKeywordModalOpen}
        onClose={() => setIsKeywordModalOpen(false)}
        keywordSettings={currentProject.keywordSettings}
        titleSettings={currentProject.titleSettings}
        backgroundSettings={currentProject.backgroundSettings}
        assetType={currentProject.assetType}
        onSave={handleSaveKeywordSettings}
        onSaveTitleSettings={handleSaveTitleSettings}
        onSaveBackgroundSettings={handleSaveBackgroundSettings}
        onSaveAll={handleSaveAllWorkflowSettings}
        onSelectAssetType={handleSelectAssetType}
      />

      {/* Metadata Review & Editor Modal */}
      {editingAsset && (
        <MetadataEditorModal
          isOpen={!!editingAssetId}
          onClose={() => setEditingAssetId(null)}
          asset={editingAsset}
          marketplace={currentProject.marketplace}
          onSaveAsset={handleSaveAsset}
          onPrev={() => {
            if (editingAssetIndex > 0) {
              setEditingAssetId(currentProject.items[editingAssetIndex - 1].id);
            }
          }}
          onNext={() => {
            if (editingAssetIndex < currentProject.items.length - 1) {
              setEditingAssetId(currentProject.items[editingAssetIndex + 1].id);
            }
          }}
          hasPrev={editingAssetIndex > 0}
          hasNext={editingAssetIndex < currentProject.items.length - 1}
        />
      )}

      {/* CSV Export Modal */}
      <CsvExportModal
        isOpen={isExportCsvOpen}
        onClose={() => setIsExportCsvOpen(false)}
        assets={currentProject.items}
        marketplace={currentProject.marketplace}
        selectedIds={selectedIds}
        onUpdateAssets={(updatedItems) => {
          const updatedProj = {
            ...currentProject,
            items: updatedItems,
            updatedAt: new Date().toISOString()
          };
          persistProject(updatedProj);
        }}
      />

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isImportCsvOpen}
        onClose={() => setIsImportCsvOpen(false)}
        onImportAssets={handleAddAssets}
      />

      {/* API Key Manager Modal */}
      <AiProviderManager
        isOpen={isKeysOpen}
        onClose={() => setIsKeysOpen(false)}
        settings={settings}
        onSettingsUpdated={(newSettings) => setSettings(newSettings)}
        titleSettings={currentProject.titleSettings}
        keywordSettings={currentProject.keywordSettings}
        descriptionSettings={currentProject.descriptionSettings}
        onSaveWorkflowSettings={handleSaveWorkflowSettingsUnified}
        initialTab={initialAiProviderTab}
      />

      {/* Projects Modal */}
      <ProjectsModal
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        projects={projects}
        currentProjectId={currentProject.id}
        onSelectProject={(id) => {
          const p = projects.find((proj) => proj.id === id);
          if (p) setCurrentProject(p);
        }}
        onCreateProject={handleCreateProject}
        onRenameProject={handleRenameProject}
        onDuplicateProject={handleDuplicateProject}
        onDeleteProject={handleDeleteProject}
      />

      {/* Advanced Settings Modal */}
      <AdvancedSettingsModal
        isOpen={isAdvancedOpen}
        onClose={() => setIsAdvancedOpen(false)}
        settings={settings}
        onSave={async (newSettings) => {
          setSettings(newSettings);
          await updateSettingsApi(newSettings);
        }}
      />

      {/* Marketplace Rules Reference Modal */}
      <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />

      {/* Batch Metadata Embed & ZIP Modal */}
      <BatchEmbedModal
        isOpen={isBatchEmbedOpen}
        onClose={() => setIsBatchEmbedOpen(false)}
        assets={currentProject.items}
        marketplace={currentProject.marketplace}
      />

      {/* Clear All Confirmation Modal */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 text-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-slate-900">Clear All Assets?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to remove all <strong className="text-slate-900">{currentProject.items.length} {currentProject.items.length === 1 ? 'asset' : 'assets'}</strong> from <span className="text-blue-600 font-medium">"{currentProject.name}"</span>?
                </p>
                <p className="text-[11px] text-slate-500">
                  All thumbnails, tags, keywords, and generated titles in this current batch will be cleared from your workspace.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsClearConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAll}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <DashboardApp />
    </AuthProvider>
  );
}

export default App;
