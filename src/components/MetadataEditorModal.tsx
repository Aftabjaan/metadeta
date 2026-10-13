import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Check,
  Tag,
  Type,
  Layers,
  History,
  AlertCircle,
  Copy,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  RefreshCw,
  Sliders,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Download,
  FileCheck,
} from 'lucide-react';
import { StockAsset, StockMetadata, KeywordItem, Marketplace, MetadataVersion } from '../types';
import { MARKETPLACE_PROFILES } from '../utils/platforms';
import { calculateSeoScore } from '../utils/seoEngine';
import { requestOptimizeTitle } from '../utils/apiClient';
import { embedMetadataIntoImage, downloadFileBlob } from '../utils/metadataEmbedder';
import { fileBinaryStore } from '../utils/fileBinaryStore';
import { VerifyMetadataModal } from './VerifyMetadataModal';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface MetadataEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: StockAsset | null;
  marketplace: Marketplace;
  onSaveAsset: (updated: StockAsset) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export const MetadataEditorModal: React.FC<MetadataEditorModalProps> = ({
  isOpen,
  onClose,
  asset,
  marketplace,
  onSaveAsset,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}) => {
  useBodyScrollLock(isOpen);

  const profile = MARKETPLACE_PROFILES[marketplace] || MARKETPLACE_PROFILES.generic;

  // Local working copy of metadata
  const [metadata, setMetadata] = useState<StockMetadata>(() =>
    asset?.metadata || {
      title: '',
      keywords: [],
      category: profile.allowedCategories[0] || 'General',
      assetType: 'photo',
      orientation: 'horizontal',
      aiGenerated: false,
      seoScore: 0,
    }
  );

  const [activeTab, setActiveTab] = useState<'edit' | 'seo' | 'history'>('edit');
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [keywordFilter, setKeywordFilter] = useState<'all' | 'primary' | 'secondary' | 'supporting'>('all');
  const [copiedKeywords, setCopiedKeywords] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embeddedSuccess, setEmbeddedSuccess] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // Optimizer modal states
  const [optimizingTitle, setOptimizingTitle] = useState(false);
  const [titleDiff, setTitleDiff] = useState<{ current: string; candidate: string } | null>(null);

  // Sync state whenever the selected asset changes
  useEffect(() => {
    if (asset?.metadata) {
      setMetadata(asset.metadata);
    } else {
      setMetadata({
        title: '',
        keywords: [],
        category: profile.allowedCategories[0] || 'General',
        assetType: 'photo',
        orientation: 'horizontal',
        aiGenerated: false,
        seoScore: 0,
      });
    }
    setTitleDiff(null);
  }, [asset?.id, profile]);

  if (!isOpen || !asset) return null;

  // Recalculate live SEO score on metadata changes
  const liveSeo = calculateSeoScore(metadata, marketplace);

  // Auto-save updates to parent
  const commitMetadataChange = (updatedMeta: StockMetadata) => {
    setSaveStatus('saving');
    
    // Check if title was manually edited compared to original asset
    const isTitleManuallyEdited = 
      updatedMeta.isTitleManuallyEdited || 
      (asset.metadata && updatedMeta.title !== asset.metadata.title);
      
    const enriched: StockMetadata = {
      ...updatedMeta,
      isTitleManuallyEdited,
      seoScore: liveSeo.score,
      seoBreakdown: liveSeo,
    };
    setMetadata(enriched);

    // Save version history entry if significant change
    const newVersions: MetadataVersion[] = [...(asset.versions || [])];
    if (newVersions.length === 0 || newVersions[newVersions.length - 1].title !== enriched.title) {
      newVersions.push({
        versionNumber: newVersions.length + 1,
        timestamp: new Date().toISOString(),
        title: enriched.title,
        keywords: enriched.keywords,
        category: enriched.category,
        seoScore: enriched.seoScore,
      });
    }

    const updatedAsset: StockAsset = {
      ...asset,
      metadata: enriched,
      versions: newVersions,
      status: 'completed',
    };

    onSaveAsset(updatedAsset);
    setTimeout(() => setSaveStatus('saved'), 400);
  };

  // Add new keyword(s)
  const handleAddKeyword = () => {
    if (!newKeywordInput.trim()) return;

    const parts = newKeywordInput
      .split(/[,;\n]/)
      .map((p) => p.trim().toLowerCase())
      .filter((p) => p.length >= 2);

    const currentWords = new Set(
      metadata.keywords.map((k) => (typeof k === 'string' ? k : k.word.toLowerCase()))
    );
    const additions: KeywordItem[] = [];

    for (const p of parts) {
      if (!currentWords.has(p) && metadata.keywords.length + additions.length < profile.maxKeywords) {
        currentWords.add(p);
        additions.push({
          word: p,
          score: 85,
          priority: metadata.keywords.length + additions.length < 10 ? 'primary' : 'secondary',
        });
      }
    }

    if (additions.length > 0) {
      const updated = {
        ...metadata,
        keywords: [...metadata.keywords, ...additions],
      };
      commitMetadataChange(updated);
      setNewKeywordInput('');
    }
  };

  // Remove keyword
  const handleRemoveKeyword = (indexToRemove: number) => {
    const updatedKeywords = metadata.keywords.filter((_, i) => i !== indexToRemove);
    commitMetadataChange({ ...metadata, keywords: updatedKeywords });
  };

  // Update keyword priority
  const handleUpdatePriority = (index: number, priority: 'primary' | 'secondary' | 'supporting') => {
    const updatedKeywords = metadata.keywords.map((k, i) =>
      i === index ? { ...k, priority } : k
    );
    commitMetadataChange({ ...metadata, keywords: updatedKeywords });
  };

  // Copy Title with confirmation
  const handleCopyTitle = () => {
    if (!metadata.title) return;
    navigator.clipboard.writeText(metadata.title);
    setCopiedTitle(true);
    setTimeout(() => setCopiedTitle(false), 1800);
  };

  // Copy all keywords with confirmation
  const handleCopyAllKeywords = () => {
    const text = metadata.keywords.map((k) => (typeof k === 'string' ? k : k.word)).join(', ');
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKeywords(true);
    setTimeout(() => setCopiedKeywords(false), 1800);
  };

  // Copy complete metadata record with confirmation
  const handleCopyAllMetadata = () => {
    const kwText = metadata.keywords.map((k) => (typeof k === 'string' ? k : k.word)).join(', ');
    const block = [
      `TITLE:\n${metadata.title}`,
      `KEYWORDS (${metadata.keywords.length}):\n${kwText}`,
      `CATEGORY:\n${metadata.category}`,
      `ASSET TYPE:\n${metadata.assetType}`,
      `SEO SCORE:\n${metadata.seoScore || liveSeo.score}/100`,
    ].join('\n\n');
    navigator.clipboard.writeText(block);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1800);
  };

  // Embed metadata directly into image binary
  const handleEmbedMetadata = async () => {
    if (!asset) return;
    setIsEmbedding(true);
    try {
      const fileOrBlob: Blob | File | undefined = fileBinaryStore.getFile(asset.id);
      if (!fileOrBlob) {
        throw new Error(
          `Original binary file for "${asset.originalFilename}" is not available in browser memory. Please re-upload the image.`
        );
      }

      const result = await embedMetadataIntoImage(fileOrBlob, asset.originalFilename, metadata);
      fileBinaryStore.setEmbedded(asset.id, result.blob);
      setEmbeddedSuccess(true);
      setTimeout(() => setEmbeddedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Metadata embedding failed');
    } finally {
      setIsEmbedding(false);
    }
  };

  // Download metadata-embedded image
  const handleDownloadEmbedded = async () => {
    if (!asset) return;
    let blob = fileBinaryStore.getEmbedded(asset.id);
    if (!blob) {
      // Auto-embed first
      setIsEmbedding(true);
      try {
        const fileOrBlob: Blob | File | undefined = fileBinaryStore.getFile(asset.id);
        if (!fileOrBlob) {
          throw new Error(`Original binary file for "${asset.originalFilename}" is not available in browser memory. Please re-upload the image.`);
        }
        const res = await embedMetadataIntoImage(fileOrBlob, asset.originalFilename, metadata);
        fileBinaryStore.setEmbedded(asset.id, res.blob);
        blob = res.blob;
      } catch (err: any) {
        alert(err.message || 'Metadata embedding failed');
        setIsEmbedding(false);
        return;
      }
      setIsEmbedding(false);
    }

    if (blob) {
      downloadFileBlob(blob, asset.originalFilename);
    }
  };

  // Quick Title Optimizer
  const handleOptimizeTitle = async () => {
    if (!metadata.title) return;
    setOptimizingTitle(true);
    try {
      const kwList = metadata.keywords.map((k) => (typeof k === 'string' ? k : k.word));
      const optimized = await requestOptimizeTitle(metadata.title, {
        category: metadata.category,
        keywords: kwList,
        marketplace,
      });
      setTitleDiff({ current: metadata.title, candidate: optimized });
    } catch (err: any) {
      alert(err.message || 'Title optimization failed');
    } finally {
      setOptimizingTitle(false);
    }
  };

  // Restore previous version
  const handleRestoreVersion = (ver: MetadataVersion) => {
    const restored: StockMetadata = {
      title: ver.title,
      keywords: ver.keywords,
      category: ver.category,
      assetType: metadata.assetType,
      orientation: metadata.orientation,
      aiGenerated: metadata.aiGenerated,
      seoScore: ver.seoScore,
    };
    commitMetadataChange(restored);
  };

  const filteredKeywords = metadata.keywords.filter((k) => {
    if (keywordFilter === 'all') return true;
    return k.priority === keywordFilter;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto overscroll-contain">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-5xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-4">
          {/* Filename & Navigation */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Prev / Next Asset Navigation */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!hasPrev}
                onClick={onPrev}
                className="p-1.5 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                title="Previous asset"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={!hasNext}
                onClick={onNext}
                className="p-1.5 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                title="Next asset"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-slate-900 truncate">
                  {asset.originalFilename}
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {profile.name}
                </span>
                {(() => {
                  const aiProvider = asset.metadata?.aiProvider || '';
                  if (aiProvider.toLowerCase().includes('groq')) {
                    return (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0" title={`Successfully generated using ${asset.metadata?.aiModel || 'Groq'}`}>
                        <span>⚡</span>
                        <span>Use Groq API</span>
                      </span>
                    );
                  }
                  if (aiProvider.toLowerCase().includes('gemini')) {
                    return (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0" title={`Successfully generated using ${asset.metadata?.aiModel || 'Gemini'}`}>
                        <span>✦</span>
                        <span>Use Gemini API</span>
                      </span>
                    );
                  }
                  if (aiProvider.toLowerCase().includes('openai')) {
                    return (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0" title={`Successfully generated using ${asset.metadata?.aiModel || 'OpenAI'}`}>
                        <span>✨</span>
                        <span>Use OpenAI API</span>
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
              <p className="text-[11px] text-slate-500">
                Exact browser original filename is strictly preserved
              </p>
            </div>
          </div>

          {/* Right: Save Indicator, SEO Score Pill & Close */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                commitMetadataChange(metadata);
                setSaveStatus('saved');
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Save metadata changes"
            >
              {saveStatus === 'saving' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Save Metadata
                </>
              )}
            </button>

            {/* Live SEO Score Gauge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200">
              <span className="text-xs text-slate-500 font-medium">SEO:</span>
              <span
                className={`font-mono text-xs font-bold ${
                  liveSeo.score >= 90
                    ? 'text-emerald-600'
                    : liveSeo.score >= 75
                    ? 'text-blue-600'
                    : 'text-amber-600'
                }`}
              >
                {liveSeo.score}/100
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 bg-white flex items-center gap-2">
          <button
            onClick={() => setActiveTab('edit')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'edit'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Metadata Editor
          </button>
          <button
            onClick={() => setActiveTab('seo')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'seo'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            SEO Diagnostics ({liveSeo.score}%)
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Version History ({asset.versions?.length || 1})
          </button>
        </div>

        {/* Global Action Toolbar */}
        <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCopyAllMetadata}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-slate-200 flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Copy Title, Description, Keywords, Category and SEO score to clipboard"
            >
              {copiedAll ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Copied All!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy All Metadata</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('seo')}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-emerald-700 font-semibold border border-slate-200 flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Check SEO and algorithmic ranking"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              SEO Check ({liveSeo.score}/100)
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isEmbedding}
              onClick={handleEmbedMetadata}
              className="px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold border border-purple-200 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              title="Losslessly inject IPTC, Adobe XMP, and EXIF into image file binary"
            >
              {isEmbedding ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-600" />
                  <span>Embedding...</span>
                </>
              ) : embeddedSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Embedded!</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                  <span>Embed Metadata</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadEmbedded}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              title="Download image with metadata embedded"
            >
              <Download className="w-3.5 h-3.5" />
              Download Embedded Image
            </button>

            <button
              type="button"
              onClick={() => setIsVerifyOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-blue-700 font-semibold border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Inspect IPTC, XMP, and EXIF segments written in file"
            >
              <FileCheck className="w-3.5 h-3.5 text-blue-600" />
              Verify Metadata
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 overscroll-contain bg-white">
          {activeTab === 'edit' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Image Preview & Classifications (4 cols) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden shadow-inner flex items-center justify-center p-2 relative group">
                  {asset.thumbnailUrl ? (
                    <img
                      src={asset.thumbnailUrl}
                      alt={asset.originalFilename}
                      className="w-full max-h-72 object-contain rounded-xl"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-48 flex items-center justify-center text-slate-400 text-xs">
                      No preview available
                    </div>
                  )}
                  <span className="absolute bottom-3 right-3 text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/90 text-slate-700 border border-slate-200 shadow-xs backdrop-blur-sm">
                    {metadata.orientation}
                  </span>
                </div>

                {/* Category Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Stock Category ({profile.name})
                  </label>
                  <select
                    value={metadata.category}
                    onChange={(e) => commitMetadataChange({ ...metadata, category: e.target.value })}
                    className="w-full text-xs rounded-xl bg-white border border-slate-200 p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
                  >
                    {profile.allowedCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Asset Type & Orientation */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Asset Type
                    </label>
                    <select
                      value={metadata.assetType}
                      onChange={(e) =>
                        commitMetadataChange({ ...metadata, assetType: e.target.value as any })
                      }
                      className="w-full text-xs rounded-xl bg-white border border-slate-200 p-2 text-slate-800 focus:outline-none cursor-pointer"
                    >
                      <option value="photo">Photo</option>
                      <option value="vector">Vector</option>
                      <option value="illustration">Illustration</option>
                      <option value="3d_render">3D Render</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Orientation
                    </label>
                    <select
                      value={metadata.orientation}
                      onChange={(e) =>
                        commitMetadataChange({ ...metadata, orientation: e.target.value as any })
                      }
                      className="w-full text-xs rounded-xl bg-white border border-slate-200 p-2 text-slate-800 focus:outline-none cursor-pointer"
                    >
                      <option value="horizontal">Horizontal</option>
                      <option value="vertical">Vertical</option>
                      <option value="square">Square</option>
                      <option value="panoramic">Panoramic</option>
                    </select>
                  </div>
                </div>

                {/* AI Generated Flag */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">AI Generated Asset</div>
                    <div className="text-[11px] text-slate-500">Marketplace requirement</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={metadata.aiGenerated}
                    onChange={(e) =>
                      commitMetadataChange({ ...metadata, aiGenerated: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500/30 cursor-pointer"
                  />
                </div>
              </div>

              {/* Right Column: Title, Description, Keyword Chips (8 cols) */}
              <div className="lg:col-span-8 space-y-5">
                {/* Title Editor with Quick Optimizer */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-blue-600" />
                      Stock Title
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyTitle}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Copy Title"
                      >
                        {copiedTitle ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                            <span>Copy Title</span>
                          </>
                        )}
                      </button>

                      {(() => {
                        const effectiveTitleMax = (() => {
                          const ts = metadata.titleSettings;
                          if (ts) {
                            if (ts.maxLength) return ts.maxLength;
                            if (ts.lengthMode === 'short') return 50;
                            if (ts.lengthMode === 'standard') return 70;
                            if (ts.lengthMode === 'long') return 100;
                            if (ts.lengthMode === 'extra_long') return 150;
                            if (ts.lengthMode === 'custom' && ts.customLength) {
                              return Math.min(Math.max(ts.customLength, 20), 200);
                            }
                          }
                          if (profile.id === 'adobe') return 200;
                          return profile.titleMaxLength;
                        })();
                        return (
                          <span
                            className={`text-[11px] font-mono ${
                              metadata.title.length > effectiveTitleMax
                                ? 'text-rose-600 font-bold'
                                : 'text-slate-500'
                            }`}
                          >
                            {metadata.title.length} / {effectiveTitleMax} chars
                          </span>
                        );
                      })()}
                      <button
                        type="button"
                        disabled={optimizingTitle || !metadata.title}
                        onClick={handleOptimizeTitle}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold border border-blue-200 flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        {optimizingTitle ? 'Optimizing...' : 'Optimize Title'}
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => commitMetadataChange({ ...metadata, title: e.target.value })}
                    className="w-full text-sm font-semibold rounded-xl bg-white border border-slate-200 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="Enter descriptive, non-spammy stock title..."
                  />

                  {/* Title Diff Candidate Modal/Bar */}
                  {titleDiff && (
                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2 animate-in fade-in">
                      <div className="text-[11px] font-bold text-blue-800 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Title Optimization Suggestion:
                      </div>
                      <p className="text-xs text-slate-900 font-medium bg-white p-2.5 rounded-lg border border-blue-200">
                        {titleDiff.candidate}
                      </p>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setTitleDiff(null)}
                          className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            commitMetadataChange({ ...metadata, title: titleDiff.candidate });
                            setTitleDiff(null);
                          }}
                          className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                          Apply Optimized Title
                        </button>
                      </div>
                    </div>
                  )}
                </div>



                {/* Keywords Header & Controls */}
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-800">
                        Keywords ({metadata.keywords.length} / {profile.maxKeywords})
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Priority Filters */}
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-[11px]">
                        {(['all', 'primary', 'secondary', 'supporting'] as const).map((filter) => (
                          <button
                            key={filter}
                            type="button"
                            onClick={() => setKeywordFilter(filter)}
                            className={`px-2 py-0.5 rounded capitalize font-medium transition-all cursor-pointer ${
                              keywordFilter === filter
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>

                      {/* Copy All Tags */}
                      <button
                        type="button"
                        onClick={handleCopyAllKeywords}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold border border-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKeywords ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-500" /> Copy All
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Add Keyword Input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newKeywordInput}
                      onChange={(e) => setNewKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          handleAddKeyword();
                        }
                      }}
                      placeholder="Add tag (type word and press Enter or comma)..."
                      className="flex-1 text-xs rounded-xl bg-white border border-slate-200 px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                    <button
                      type="button"
                      onClick={handleAddKeyword}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Tag
                    </button>
                  </div>

                  {/* Keyword Chips Grid */}
                  <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto p-1.5 bg-slate-50 rounded-xl border border-slate-200 overscroll-contain">
                    {filteredKeywords.map((kw, index) => {
                      const word = typeof kw === 'string' ? kw : kw.word;
                      const score = typeof kw === 'object' ? kw.score : 80;
                      const priority = typeof kw === 'object' ? kw.priority : 'secondary';

                      const priorityColor =
                        priority === 'primary'
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : priority === 'secondary'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-purple-200 bg-purple-50 text-purple-700';

                      return (
                        <div
                          key={`${word}-${index}`}
                          className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all ${priorityColor}`}
                        >
                          <span className="font-semibold text-slate-800">{word}</span>

                          {/* Relevance score pill */}
                          <span className="text-[10px] font-mono opacity-75 font-semibold">
                            {score}
                          </span>

                          {/* Quick priority switcher */}
                          <button
                            type="button"
                            onClick={() => {
                              const next =
                                priority === 'primary'
                                  ? 'secondary'
                                  : priority === 'secondary'
                                  ? 'supporting'
                                  : 'primary';
                              handleUpdatePriority(index, next);
                            }}
                            className="text-[9px] uppercase font-bold opacity-70 hover:opacity-100 px-1 py-0.2 rounded bg-white/80 border border-slate-200 hover:bg-white cursor-pointer"
                            title="Click to cycle priority (Primary > Secondary > Supporting)"
                          >
                            {priority[0]}
                          </button>

                          {/* Remove button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyword(index)}
                            className="text-slate-400 hover:text-rose-600 opacity-70 group-hover:opacity-100 p-0.5 rounded transition-colors cursor-pointer"
                            title="Delete keyword"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}

                    {filteredKeywords.length === 0 && (
                      <div className="py-6 text-center w-full text-slate-400 text-xs italic">
                        No keywords in this category.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: SEO Diagnostics */}
          {activeTab === 'seo' && (
            <div className="space-y-6">
              {/* Score Card Banner */}
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center font-mono font-black text-2xl shadow-xs ${
                      liveSeo.score >= 90
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                        : liveSeo.score >= 75
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-amber-100 text-amber-700 border border-amber-300'
                    }`}
                  >
                    {liveSeo.score}
                  </div>
                  <div>
                    <div className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <span>{liveSeo.grade} Stock Rating</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-white text-slate-700 font-normal border border-slate-200">
                        Target: {profile.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Evaluated against real microstock search algorithms (length, primary weighting,
                      taxonomy, non-spam compliance).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">Keywords</span>
                    <strong className="text-sm text-slate-800 font-mono">
                      {metadata.keywords.length} / {profile.maxKeywords}
                    </strong>
                  </div>
                  <div className="text-right border-l border-slate-200 pl-3">
                    <span className="text-xs text-slate-500 block">Title Length</span>
                    <strong className="text-sm text-slate-800 font-mono">
                      {metadata.title.length} / {(() => {
                        const ts = metadata.titleSettings;
                        if (ts) {
                          if (ts.length === 'short') return 45;
                          if (ts.length === 'medium') return 70;
                          if (ts.length === 'long') return 120;
                          if (ts.length === 'custom' && ts.customMaxLength) {
                            return Math.min(Math.max(ts.customMaxLength, 25), 200);
                          }
                        }
                        if (profile.id === 'adobe') return 200;
                        return profile.titleMaxLength;
                      })()}c
                    </strong>
                  </div>
                </div>
              </div>

              {/* Checks Checklist */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Algorithmic Ranking Checks
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {liveSeo.checks.map((check, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                        check.passed
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-amber-200 bg-amber-50/60'
                      }`}
                    >
                      {check.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div
                          className={`text-xs font-bold ${
                            check.passed ? 'text-emerald-800' : 'text-amber-800'
                          }`}
                        >
                          {check.label}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">{check.details}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              {liveSeo.recommendations.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                  <h4 className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                    <Zap className="w-4 h-4" />
                    Recommended Actions to Boost Ranking:
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                    {liveSeo.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Version History */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Every AI generation or manual save creates a timestamped version snapshot. You can
                preview or restore any prior version.
              </p>

              <div className="space-y-3">
                {(asset.versions || []).map((ver) => (
                  <div
                    key={ver.versionNumber}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          Version {ver.versionNumber}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(ver.timestamp).toLocaleTimeString()} •{' '}
                          {new Date(ver.timestamp).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          SEO: {ver.seoScore}/100
                        </span>
                      </div>
                      <p className="text-xs text-slate-800 font-medium line-clamp-1">{ver.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {ver.keywords.length} keywords • Category: {ver.category}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestoreVersion(ver)}
                      className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-purple-600 hover:text-white text-purple-700 text-xs font-semibold border border-purple-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      Restore Version {ver.versionNumber}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Press <kbd className="px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200">ESC</kbd> or click Close when finished.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                commitMetadataChange(metadata);
                setSaveStatus('saved');
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Save Metadata
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Verify Metadata Inspector Modal */}
      <VerifyMetadataModal
        isOpen={isVerifyOpen}
        onClose={() => setIsVerifyOpen(false)}
        asset={asset}
      />
    </div>
  );
};
