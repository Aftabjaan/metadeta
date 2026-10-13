import React, { useState, useMemo, useCallback } from 'react';
import {
  Edit3,
  RotateCw,
  Trash2,
  Download,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Tag,
  ShieldCheck,
  Search,
  RefreshCw,
  Sparkles,
  Info,
  Layers,
  Image as ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import { StockAsset, AssetStatus, Marketplace } from '../types';
import { MARKETPLACE_PROFILES } from '../utils/platforms';
import { fileBinaryStore } from '../utils/fileBinaryStore';
import { embedMetadataIntoImage, downloadFileBlob } from '../utils/metadataEmbedder';
import { detectSimilarAssets } from '../utils/similarityDetector';
import { runAdobeSafetyCheck } from '../utils/adobeSafetyEngine';
import { VerifyMetadataModal } from './VerifyMetadataModal';
import { QualityScoreModal } from './QualityScoreModal';

interface AssetTableProps {
  assets: StockAsset[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onEditAsset: (asset: StockAsset) => void;
  onRegenerateAsset: (asset: StockAsset) => void;
  onDeleteAsset: (id: string) => void;
  isProcessing?: boolean;
  onClearAll?: () => void;
  onDeleteSelected?: () => void;
  activeMarketplace: Marketplace;
  selectedMarketplaces?: Marketplace[];
  onOpenBatchEmbed?: () => void;
  onOpenRules?: () => void;
  isFullWidth?: boolean;
}

export const AssetTable: React.FC<AssetTableProps> = ({
  assets,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onEditAsset,
  onRegenerateAsset,
  onDeleteAsset,
  isProcessing = false,
  onClearAll,
  onDeleteSelected,
  activeMarketplace,
  selectedMarketplaces,
  onOpenBatchEmbed,
  onOpenRules,
  isFullWidth = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [seoScoreFilter, setSeoScoreFilter] = useState<string>('all');
  const [safetyFilter, setSafetyFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'compact' | 'cards' | 'table'>('compact');
  const [copiedState, setCopiedState] = useState<Record<string, string | null>>({});
  const [verifyingAsset, setVerifyingAsset] = useState<StockAsset | null>(null);
  const [qualityModalAsset, setQualityModalAsset] = useState<StockAsset | null>(null);
  const [embeddingId, setEmbeddingId] = useState<string | null>(null);
  const [embeddedIds, setEmbeddedIds] = useState<Set<string>>(new Set());
  const [errorDetailAsset, setErrorDetailAsset] = useState<StockAsset | null>(null);

  // Detect similar asset metadata in current project
  const similarityGroups = useMemo(() => detectSimilarAssets(assets), [assets]);

  // Filter and search logic
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const meta = asset.metadata;
        const matchesFilename = asset.originalFilename.toLowerCase().includes(q);
        const matchesTitle = meta?.title?.toLowerCase().includes(q) || false;
        const matchesKeywords =
          meta?.keywords?.some((k) =>
            (typeof k === 'string' ? k : k.word).toLowerCase().includes(q)
          ) || false;

        if (!matchesFilename && !matchesTitle && !matchesKeywords) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'all' && asset.status !== statusFilter) {
        return false;
      }

      // SEO Score filter
      if (seoScoreFilter !== 'all') {
        const score = asset.metadata?.seoScore || 0;
        if (seoScoreFilter === '90' && score < 90) return false;
        if (seoScoreFilter === '70-89' && (score < 70 || score >= 90)) return false;
        if (seoScoreFilter === 'below-70' && score >= 70) return false;
      }

      // Safety Filter
      if (safetyFilter !== 'all' && asset.metadata) {
        const safety =
          asset.metadata.adobeSafety ||
          runAdobeSafetyCheck(asset.metadata, asset.backgroundAnalysis, activeMarketplace, {
            isDuplicate: asset.isDuplicate,
            duplicateOfFilename: asset.duplicateOfFilename,
            duplicateReason: asset.duplicateReason,
            visualSimilarityLevel: asset.visualSimilarityLevel,
            visualSimilarityScore: asset.visualSimilarityScore,
            visualSimilarityDetails: asset.visualSimilarityDetails
          });
        if (safetyFilter === 'SAFE' && safety.status !== 'SAFE') return false;
        if (safetyFilter === 'WARNING' && safety.status !== 'WARNING') return false;
        if (safetyFilter === 'BLOCK' && safety.status !== 'BLOCK') return false;
      }

      return true;
    });
  }, [assets, searchQuery, statusFilter, seoScoreFilter, safetyFilter, activeMarketplace]);

  const handleCopyField = (
    asset: StockAsset,
    field: 'title' | 'keywords' | 'all',
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    const meta = asset.metadata;
    if (!meta) return;

    const specificMeta = meta.marketplaces?.[activeMarketplace];
    const effectiveTitle = (specificMeta?.title || meta.title || '').trim();
    const effectiveKeywords = specificMeta?.keywords || meta.keywords || [];

    let text = '';
    if (field === 'title') {
      text = effectiveTitle;
    } else if (field === 'keywords') {
      // Pure comma-separated keyword list without brackets, numbering, or extra formatting
      text = effectiveKeywords
        .map((k) => (typeof k === 'string' ? k.trim() : k.word.trim()))
        .filter(Boolean)
        .join(', ');
    } else if (field === 'all') {
      const kwText = effectiveKeywords
        .map((k) => (typeof k === 'string' ? k.trim() : k.word.trim()))
        .filter(Boolean)
        .join(', ');
      text = [
        `Title: ${effectiveTitle}`,
        `Keywords: ${kwText}`,
      ].join('\n\n');
    }

    if (text) {
      navigator.clipboard.writeText(text);
      setCopiedState((prev) => ({ ...prev, [`${asset.id}-${field}`]: 'Copied!' }));
      setTimeout(() => {
        setCopiedState((prev) => ({ ...prev, [`${asset.id}-${field}`]: null }));
      }, 2000);
    }
  };

  const handleEmbedAndDownloadSingle = async (asset: StockAsset, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!asset.metadata) return;
    setEmbeddingId(asset.id);

    try {
      const fileOrBlob: Blob | File | undefined = fileBinaryStore.getFile(asset.id);

      if (!fileOrBlob) {
        throw new Error(`Original file binary for "${asset.originalFilename}" is not available in browser memory. Please re-upload the original image.`);
      }

      const result = await embedMetadataIntoImage(fileOrBlob, asset.originalFilename, asset.metadata);
      
      const verifyResult = await import('../utils/metadataEmbedder').then(m => m.verifyEmbeddedMetadata(result.blob, asset.originalFilename));
      if (!verifyResult.title) verifyResult.title = asset.metadata.title;
      if (!verifyResult.keywords) {
        verifyResult.keywords = asset.metadata.keywords.map((k) => (typeof k === 'string' ? k : k.word));
      }

      fileBinaryStore.setEmbedded(asset.id, result.blob);
      setEmbeddedIds((prev) => new Set(prev).add(asset.id));

      downloadFileBlob(result.blob, asset.originalFilename);
    } catch (err: any) {
      alert(`Embedding failed: ${err.message}`);
    } finally {
      setEmbeddingId(null);
    }
  };

  const getSeoBadgeColor = (score: number) => {
    if (score >= 90) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (score >= 75) return 'text-blue-700 bg-blue-50 border-blue-200';
    if (score >= 60) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-rose-700 bg-rose-50 border-rose-200';
  };

  const getStatusBadge = (status: AssetStatus, error?: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Completed
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
            Generating...
          </span>
        );
      case 'failed':
        return (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200"
            title={error || 'Generation failed'}
          >
            <AlertCircle className="w-3 h-3 text-rose-600" />
            Failed
          </span>
        );
      case 'waiting':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            <Clock className="w-3 h-3 text-slate-500" />
            Waiting
          </span>
        );
    }
  };

  const getSafetyBadge = (asset: StockAsset) => {
    if (!asset.metadata) return null;
    const safety =
      asset.metadata.adobeSafety ||
      runAdobeSafetyCheck(asset.metadata, asset.backgroundAnalysis, activeMarketplace, {
        isDuplicate: asset.isDuplicate,
        duplicateOfFilename: asset.duplicateOfFilename,
        duplicateReason: asset.duplicateReason,
        visualSimilarityLevel: asset.visualSimilarityLevel,
        visualSimilarityScore: asset.visualSimilarityScore,
        visualSimilarityDetails: asset.visualSimilarityDetails
      });

    if (safety.status === 'SAFE') {
      return (
        <span
          className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
          title="Adobe Stock Safety Check: SAFE (No policy, trademark, or spam violations)"
        >
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          SAFE
        </span>
      );
    } else if (safety.status === 'WARNING') {
      return (
        <span
          className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
          title={`Adobe Safety WARNING: ${safety.issues.map((i) => i.message).join(' • ')}`}
        >
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          WARNING ({safety.issues.length})
        </span>
      );
    } else {
      return (
        <span
          className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 animate-pulse"
          title={`Adobe Safety BLOCKED: ${safety.issues.map((i) => i.message).join(' • ')}`}
        >
          <AlertCircle className="w-3 h-3 text-rose-600" />
          BLOCK ({safety.issues.length})
        </span>
      );
    }
  };

  const getProviderBadge = (asset: StockAsset) => {
    // 1. Success case (completed)
    if (asset.status === 'completed' && asset.metadata) {
      const rawProvider = asset.providerUsed || (asset.metadata.aiProvider?.toLowerCase().includes('openai') ? 'openai' : (asset.metadata.aiProvider?.toLowerCase().includes('groq') ? 'groq' : 'gemini'));
      const provider = String(rawProvider).toLowerCase();

      if (provider === 'openai') {
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 backdrop-blur-sm shrink-0 shadow-xs"
            title={`Successfully generated using ${asset.metadata.aiModel || 'OpenAI'}`}
          >
            <span className="text-emerald-500">✓</span>
            <span>Generated by OpenAI</span>
          </span>
        );
      } else if (provider === 'groq') {
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 backdrop-blur-sm shrink-0 shadow-xs"
            title={`Successfully generated using ${asset.metadata.aiModel || 'Groq'}`}
          >
            <span className="text-amber-500">✓</span>
            <span>Generated by Groq</span>
          </span>
        );
      } else {
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 backdrop-blur-sm shrink-0 shadow-xs"
            title={`Successfully generated using ${asset.metadata.aiModel || 'Gemini'}`}
          >
            <span className="text-indigo-500">✓</span>
            <span>Generated by Gemini</span>
          </span>
        );
      }
    }

    // 2. Failed case
    if (asset.status === 'failed') {
      const errorInfo = asset.errorInfo;
      const errorType = errorInfo?.type || 'API Error';

      return (
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {/* Error Badge */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setErrorDetailAsset(asset);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 backdrop-blur-sm hover:bg-rose-500/20 transition-all cursor-pointer shrink-0 shadow-xs"
            title="Click to view error details"
          >
            <span className="text-rose-500">⚠</span>
            <span>Generation Failed ({errorType})</span>
          </button>

          {/* Retry Button */}
          {(!errorInfo || errorInfo.retryable) && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={(e) => {
                e.stopPropagation();
                onRegenerateAsset(asset);
              }}
              className="inline-flex items-center gap-1 font-sans text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
              title="Retry generation"
            >
              <RotateCw className="w-2.5 h-2.5 animate-none" />
              <span>Retry</span>
            </button>
          )}
        </div>
      );
    }

    return null;
  };

  const completedCount = assets.filter((a) => a.status === 'completed' && a.metadata).length;

  if (assets.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 pb-20 sm:pb-24">
      {/* Batch Similarity Warning Banner (if similar items detected) */}
      {similarityGroups.length > 0 && (() => {
        const highSimilarityAssetsCount = assets.filter(
          (a) =>
            a.visualSimilarityLevel === 'HIGH_SIMILARITY' ||
            a.visualSimilarityLevel === 'EXACT_DUPLICATE' ||
            a.isDuplicate
        ).length;
        const isHighSimilarityAbuseRisk =
          similarityGroups.length > 5 ||
          (assets.length > 0 && highSimilarityAssetsCount / assets.length > 0.3);

        return (
          <div className="space-y-2">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 shadow-xs space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    High similarity detected — consider submitting only the strongest version (REVIEW BEFORE SUBMISSION)
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Adobe Stock algorithms penalize repetitive or near-duplicate metadata across submissions. Consider differentiating titles or keywords for the following matching pairs:
                  </p>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {similarityGroups.map((g, idx) => (
                      <div
                        key={idx}
                        className="text-[10px] font-mono bg-white border border-amber-300 px-2.5 py-1 rounded-lg text-amber-900 flex items-center gap-1.5 shadow-xs"
                      >
                        <span className="truncate max-w-[150px] font-semibold">{g.assetA.originalFilename}</span>
                        <span className="text-amber-500">↔</span>
                        <span className="truncate max-w-[150px] font-semibold">{g.assetB.originalFilename}</span>
                        <span className="text-amber-700 font-bold">({g.similarityScore}% match)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {isHighSimilarityAbuseRisk && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 shadow-xs animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <div className="text-xs font-bold text-rose-900">
                      Account Safety Warning — Indexing Abuse Risk
                    </div>
                    <p className="text-[11px] text-rose-800 leading-relaxed">
                      Warning: Submitting too many highly similar assets can lead to account suspension for spamming or "indexing abuse" on Adobe Stock. Ensure each file has unique value or use a diverse selection.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Search & Filter & View Control Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 sm:p-2.5 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search filename, title, keyword..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap justify-between sm:justify-end text-xs">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">Status: All</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="waiting">Waiting</option>
            <option value="failed">Failed</option>
          </select>

          {/* Safety Filter */}
          <select
            value={safetyFilter}
            onChange={(e) => setSafetyFilter(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">Safety: All</option>
            <option value="SAFE">SAFE Only</option>
            <option value="WARNING">WARNING Only</option>
            <option value="BLOCK">BLOCK Only</option>
          </select>

          {/* SEO Filter */}
          <select
            value={seoScoreFilter}
            onChange={(e) => setSeoScoreFilter(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">SEO: All</option>
            <option value="90">SEO: 90+ (Excellent)</option>
            <option value="70-89">SEO: 70–89 (Good)</option>
            <option value="below-70">SEO: &lt; 70 (Needs Work)</option>
          </select>

          {/* View Mode Selector */}
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as any)}
            className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="compact">View: Compact Cards</option>
            <option value="table">View: Table View</option>
          </select>

          {/* Showing Count */}
          <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap pl-1">
            <strong className="text-slate-800">{filteredAssets.length}</strong> / {assets.length}
          </span>
        </div>
      </div>

      {/* Asset List or Empty State (when filters yield no results) */}
      {filteredAssets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center space-y-2 shadow-xs max-w-md mx-auto my-4">
          <p className="text-xs font-semibold text-slate-800">No assets match your current search or filters</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setSafetyFilter('all');
              setSeoScoreFilter('all');
            }}
            className="px-3 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* Full Table View */
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold text-[11px]">
                  <th className="py-2.5 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={assets.length > 0 && selectedIds.size === assets.length}
                      onChange={() => (selectedIds.size === assets.length ? onDeselectAll() : onSelectAll())}
                      className="rounded border-slate-300 bg-white text-blue-600 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-2 w-12 text-center">Thumb</th>
                  <th className="py-2.5 px-3">Filename & Title</th>
                  <th className="py-2.5 px-2 text-center w-24">Keywords</th>
                  <th className="py-2.5 px-2 text-center w-16">SEO</th>
                  <th className="py-2.5 px-2 text-center w-24">Safety</th>
                  <th className="py-2.5 px-2 text-center w-24">Status</th>
                  <th className="py-2.5 px-3 text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.map((asset) => {
                  const isSelected = selectedIds.has(asset.id);
                  const meta = asset.metadata;
                  const specificMeta = meta?.marketplaces?.[activeMarketplace];
                  const title = specificMeta?.title || meta?.title || '';
                  const keywords = specificMeta?.keywords || meta?.keywords || [];
                  const seoScore = specificMeta?.seoScore ?? meta?.seoScore ?? 0;

                  return (
                    <tr
                      key={asset.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelect(asset.id)}
                          className="rounded border-slate-300 bg-white text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <div
                          onClick={() => onEditAsset(asset)}
                          className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all flex items-center justify-center shrink-0 checkerboard-pattern"
                        >
                          {asset.thumbnailUrl ? (
                            <img
                              src={asset.thumbnailUrl}
                              alt={asset.originalFilename}
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="space-y-0.5 max-w-md">
                          <span
                            className="font-mono text-[11px] text-blue-600 font-bold truncate block cursor-pointer hover:underline"
                            onClick={() => onEditAsset(asset)}
                            title={asset.originalFilename}
                          >
                            {asset.originalFilename}
                          </span>
                          <span
                            className="text-slate-700 text-xs line-clamp-1 cursor-pointer hover:text-slate-900"
                            onClick={() => onEditAsset(asset)}
                          >
                            {title || <span className="text-slate-400 italic">No metadata yet</span>}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {keywords.length > 0 ? (
                          <div className="inline-flex items-center gap-1">
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              <Tag className="w-2.5 h-2.5 text-emerald-600" />
                              {keywords.length}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyField(asset, 'keywords', e)}
                              className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Copy Keywords"
                            >
                              {copiedState[`${asset.id}-keywords`] ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {meta?.seoScore !== undefined ? (
                          <span
                            className={`inline-flex items-center justify-center font-mono font-bold text-[10px] px-1.5 py-0.5 rounded-full border ${getSeoBadgeColor(
                              seoScore
                            )}`}
                          >
                            {seoScore}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {getSafetyBadge(asset) || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {getStatusBadge(asset.status, asset.errorMessage)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {getProviderBadge(asset)}
                          <button
                            type="button"
                            onClick={() => onEditAsset(asset)}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 transition-colors shrink-0 shadow-xs cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => onRegenerateAsset(asset)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors disabled:opacity-40 cursor-pointer"
                            title="Regenerate"
                          >
                            <RotateCw className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAsset(asset.id)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-400 border border-slate-200 transition-colors cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Detailed Compact Asset Cards with Visible KEYWORDS section */
        <div className="space-y-3">
          {filteredAssets.map((asset) => {
            const isSelected = selectedIds.has(asset.id);
            const meta = asset.metadata;
            const specificMeta = meta?.marketplaces?.[activeMarketplace];
            const title = specificMeta?.title || meta?.title || '';
            const keywords = specificMeta?.keywords || meta?.keywords || [];
            const seoScore = specificMeta?.seoScore ?? meta?.seoScore ?? 0;
            const safety =
              meta?.adobeSafety ||
              (meta ? runAdobeSafetyCheck(meta, asset.backgroundAnalysis, activeMarketplace, {
                isDuplicate: asset.isDuplicate,
                duplicateOfFilename: asset.duplicateOfFilename,
                duplicateReason: asset.duplicateReason,
                visualSimilarityLevel: asset.visualSimilarityLevel,
                visualSimilarityScore: asset.visualSimilarityScore,
                visualSimilarityDetails: asset.visualSimilarityDetails
              }) : null);
            const bg = asset.backgroundAnalysis;

            return (
              <div
                key={asset.id}
                className={`bg-white border rounded-2xl p-3.5 sm:p-4 transition-all shadow-xs space-y-3 ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Card Top Row: Checkbox, Thumbnail, Filename, Status, SEO, Safety & Action Buttons */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(asset.id)}
                      className="rounded border-slate-300 bg-white text-blue-600 focus:ring-0 cursor-pointer shrink-0"
                    />

                    {/* Thumbnail with checkerboard pattern for transparent PNG */}
                    <div
                      onClick={() => onEditAsset(asset)}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all flex items-center justify-center shrink-0 checkerboard-pattern group relative"
                      title="Click to Review & Edit"
                    >
                      {asset.thumbnailUrl ? (
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.originalFilename}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      )}
                    </div>

                    {/* Filename & Badges */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="font-mono text-xs sm:text-sm font-bold text-blue-600 truncate max-w-[200px] sm:max-w-[300px] cursor-pointer hover:underline"
                          onClick={() => onEditAsset(asset)}
                          title={`Original filename: ${asset.originalFilename}`}
                        >
                          {asset.originalFilename}
                        </span>

                        {getStatusBadge(asset.status, asset.errorMessage)}

                        {getSafetyBadge(asset)}

                        {bg?.isTransparent && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                            <Layers className="w-2.5 h-2.5 text-cyan-600" />
                            Transparent PNG
                          </span>
                        )}

                        {asset.isDuplicate && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertCircle className="w-2.5 h-2.5" />
                            Duplicate File
                          </span>
                        )}

                        {meta?.seoScore !== undefined && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQualityModalAsset(asset);
                            }}
                            className={`font-mono font-bold text-[10px] px-2 py-0.5 rounded-full border cursor-pointer hover:scale-105 transition-all ${getSeoBadgeColor(
                              seoScore
                            )}`}
                            title="Click to view Metadata Quality Breakdown"
                          >
                            SEO {seoScore}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Top Right Actions Toolbar */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 flex-wrap">
                    {getProviderBadge(asset)}

                    <button
                      type="button"
                      onClick={() => onEditAsset(asset)}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 shrink-0 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => onRegenerateAsset(asset)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                      title="Regenerate Metadata"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setVerifyingAsset(asset)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-blue-600 border border-slate-200 transition-all active:scale-95 cursor-pointer"
                      title="Verify EXIF/IPTC/XMP"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </button>

                    {meta && (
                      <button
                        type="button"
                        disabled={embeddingId === asset.id}
                        onClick={(e) => handleEmbedAndDownloadSingle(asset, e)}
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all active:scale-95 cursor-pointer"
                        title="Embed Metadata & Download Image"
                      >
                        {embeddingId === asset.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onDeleteAsset(asset.id)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition-all active:scale-95 cursor-pointer"
                      title="Delete Image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Safety Issues Notice (if warnings or blocks exist) */}
                {safety && safety.issues.length > 0 && (
                  <div
                    className={`rounded-xl p-2.5 text-xs flex items-start gap-2 border ${
                      safety.status === 'BLOCK'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 flex-1">
                      <span className="font-bold">
                        Adobe Stock Safety Notice ({safety.status}):
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90">
                        {safety.issues.map((iss, idx) => (
                          <li key={idx}>
                            <strong className="capitalize">{iss.type}:</strong> {iss.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Card Body: Title, Description, and Keywords OR Error Panel */}
                <div className="space-y-1.5 text-xs">
                  {asset.status === 'failed' ? (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-2.5 shadow-xs">
                      <div className="flex items-center justify-between text-rose-700 font-bold text-[10px] uppercase tracking-wider">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">⚠</span>
                          <span>{asset.errorInfo?.type || 'Metadata Generation Failed'}</span>
                        </div>
                        {asset.errorInfo?.timestamp && (
                          <span className="text-[9px] text-rose-500 lowercase normal-case font-mono">
                            {new Date(asset.errorInfo.timestamp).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-xs text-rose-900 leading-normal bg-white p-3 rounded-lg border border-rose-200 font-mono text-[11px] break-words">
                        {asset.errorInfo?.message || asset.errorMessage || 'An error occurred during metadata generation.'}
                      </p>

                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setErrorDetailAsset(asset);
                          }}
                          className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 transition-all cursor-pointer flex items-center gap-1"
                        >
                          <span>ℹ</span>
                          <span>Details & Help</span>
                        </button>

                        {(!asset.errorInfo || asset.errorInfo.retryable) && (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRegenerateAsset(asset);
                            }}
                            className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCw className="w-2.5 h-2.5" />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* TITLE SECTION */}
                      <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                        <div className="flex-1 min-w-0">
                          <div className="text-[9px] font-bold text-slate-500 tracking-wider uppercase">
                            TITLE
                          </div>
                          <p
                            className="text-xs text-slate-900 font-medium truncate hover:text-blue-600 cursor-pointer"
                            onClick={() => onEditAsset(asset)}
                            title={title || ''}
                          >
                            {title || (
                              <span className="text-slate-400 italic text-[11px]">
                                No title generated yet.
                              </span>
                            )}
                          </p>
                        </div>
                        {title && (
                          <button
                            type="button"
                            onClick={(e) => handleCopyField(asset, 'title', e)}
                            className="text-slate-600 hover:text-blue-600 text-[10px] font-semibold flex items-center gap-1 transition-colors px-2 py-0.5 rounded bg-white border border-slate-200 shrink-0 shadow-xs cursor-pointer"
                            title="Copy Title"
                          >
                            {copiedState[`${asset.id}-title`] ? (
                              <>
                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                                <span className="text-emerald-600 font-bold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-2.5 h-2.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>


                      {/* KEYWORDS SECTION (Visible for every generated asset) */}
                      {keywords.length > 0 && (
                        <div className="space-y-1.5 pt-1.5 border-t border-slate-200">
                          {/* Keywords Header + Copy Keywords & Copy All Buttons */}
                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                            <div className="flex items-center gap-1">
                              <Tag className="w-3 h-3 text-emerald-600" />
                              <span className="text-[9px] font-bold text-slate-600 tracking-wider">
                                KEYWORDS ({keywords.length})
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Copy Keywords Button */}
                              <button
                                type="button"
                                onClick={(e) => handleCopyField(asset, 'keywords', e)}
                                className="text-blue-700 hover:text-blue-800 text-[10px] font-semibold flex items-center gap-1 px-2.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all shadow-xs cursor-pointer"
                                title="Copy keywords"
                              >
                                {copiedState[`${asset.id}-keywords`] ? (
                                  <>
                                    <Check className="w-2.5 h-2.5 text-emerald-600" />
                                    <span className="text-emerald-600 font-bold">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-2.5 h-2.5 text-blue-600" />
                                    <span>Copy Keywords</span>
                                  </>
                                )}
                              </button>

                              {/* Copy All Button */}
                              <button
                                type="button"
                                onClick={(e) => handleCopyField(asset, 'all', e)}
                                className="text-slate-700 hover:text-slate-900 text-[10px] font-semibold flex items-center gap-1 px-2.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all shadow-xs cursor-pointer"
                                title="Copy All"
                              >
                                {copiedState[`${asset.id}-all`] ? (
                                  <>
                                    <Check className="w-2.5 h-2.5 text-emerald-600" />
                                    <span className="text-emerald-600 font-bold">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-2.5 h-2.5 text-slate-500" />
                                    <span>Copy All</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Display ALL generated keyword chips */}
                          <div className="flex items-center gap-1 flex-wrap pt-0.5 max-h-24 overflow-y-auto pr-1 overscroll-contain">
                            {keywords.map((kw, i) => {
                              const word = typeof kw === 'string' ? kw : kw.word;
                              return (
                                <span
                                  key={i}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono select-all hover:border-blue-300 hover:text-blue-700 transition-all"
                                >
                                  {word}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Global Bottom Floating Action Bar (Only when assets exist) */}
      {assets.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 border-t border-slate-200 backdrop-blur-md py-2 px-3 sm:px-4 shadow-xl">
          <div className="w-full max-w-5xl mx-auto flex items-center justify-between gap-2">
            {/* Left Action: Verify Metadata & Info */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                id="bottom-verify-metadata-btn"
                onClick={() => {
                  const sampleAsset = assets.find((a) => a.metadata) || assets[0];
                  if (sampleAsset) setVerifyingAsset(sampleAsset);
                  else alert('Upload and generate metadata on an asset first to verify.');
                }}
                className="h-[38px] px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Verify Metadata</span>
              </button>

              {onOpenRules && (
                <button
                  type="button"
                  onClick={onOpenRules}
                  className="w-[38px] h-[38px] flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 border border-slate-200 transition-colors shadow-xs cursor-pointer"
                  title="Marketplace Rules & Guidelines"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Right Actions: Embed Metadata for All & Download ZIP */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                id="bottom-embed-metadata-all-btn"
                onClick={() => {
                  if (onOpenBatchEmbed) onOpenBatchEmbed();
                }}
                disabled={completedCount === 0}
                className="h-[38px] px-3 sm:px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-blue-200" />
                <span className="hidden sm:inline">Embed Metadata for All</span>
                <span className="sm:hidden">Embed All</span>
              </button>

              <button
                type="button"
                id="bottom-download-zip-btn"
                onClick={() => {
                  if (onOpenBatchEmbed) onOpenBatchEmbed();
                }}
                disabled={completedCount === 0}
                className="h-[38px] px-3 sm:px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-100" />
                <span>Download ZIP</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify Metadata Modal */}
      <VerifyMetadataModal
        isOpen={!!verifyingAsset}
        onClose={() => setVerifyingAsset(null)}
        asset={verifyingAsset}
      />

      {/* Quality Score Breakdown Modal */}
      <QualityScoreModal
        isOpen={!!qualityModalAsset}
        onClose={() => setQualityModalAsset(null)}
        asset={qualityModalAsset}
      />

      {/* Error Details Modal */}
      {errorDetailAsset && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 text-slate-900 rounded-2xl w-full max-w-md shadow-2xl p-6 relative flex flex-col gap-4 animate-in fade-in zoom-in duration-150">
            <button
              type="button"
              onClick={() => setErrorDetailAsset(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer"
              title="Close dialog"
            >
              ✕
            </button>

            <div className="flex items-center gap-2 text-rose-600 font-bold text-lg border-b border-slate-100 pb-2.5">
              <span>⚠</span>
              <span>Metadata Generation Issue</span>
            </div>

            <div className="space-y-3.5 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Asset Filename</span>
                <span className="font-mono text-slate-800 select-all truncate" title={errorDetailAsset.originalFilename}>
                  {errorDetailAsset.originalFilename}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Error Type</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 font-semibold self-start text-xs">
                  {errorDetailAsset.errorInfo?.type || 'Generation Error'}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Details / Resolution</span>
                <p className="text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs font-sans whitespace-pre-wrap">
                  {errorDetailAsset.errorInfo?.message || errorDetailAsset.errorMessage || 'An error occurred during metadata generation.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 text-xs">
                <div>
                  <span className="text-slate-500 block mb-0.5">Attempted Provider</span>
                  <span className="font-medium text-slate-800">
                    {errorDetailAsset.errorInfo?.attemptedProvider 
                      ? (errorDetailAsset.errorInfo.attemptedProvider === 'groq' ? 'Groq LPU' : 'Google Gemini') 
                      : 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Time of Error</span>
                  <span className="font-medium text-slate-800">
                    {errorDetailAsset.errorInfo?.timestamp 
                      ? new Date(errorDetailAsset.errorInfo.timestamp).toLocaleTimeString() 
                      : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs border-t border-slate-100 pt-3">
                <span className="text-slate-500">Retryable:</span>
                <span className={`font-semibold ${(!errorDetailAsset.errorInfo || errorDetailAsset.errorInfo.retryable) ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {(!errorDetailAsset.errorInfo || errorDetailAsset.errorInfo.retryable) ? 'Yes' : 'No (Configuration Required)'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3.5 border-t border-slate-100 pt-4 mt-2">
              <button
                type="button"
                onClick={() => setErrorDetailAsset(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                Close
              </button>

              {(!errorDetailAsset.errorInfo || errorDetailAsset.errorInfo.retryable) && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => {
                    setErrorDetailAsset(null);
                    onRegenerateAsset(errorDetailAsset);
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Retry Generation</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
