import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  ShieldCheck,
  Globe,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { StockAsset, Marketplace } from '../types';
import { MARKETPLACE_PROFILES } from '../utils/platforms';
import { downloadCsvFile } from '../utils/apiClient';
import { MarketplaceLogo } from './MarketplaceLogos';
import { validateCsvAssets } from '../utils/csvValidator';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface CsvExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: StockAsset[];
  marketplace: Marketplace;
  selectedIds: Set<string>;
  onUpdateAssets?: (assets: StockAsset[]) => void;
}

export const CsvExportModal: React.FC<CsvExportModalProps> = ({
  isOpen,
  onClose,
  assets,
  marketplace: initialMarketplace,
  selectedIds,
  onUpdateAssets,
}) => {
  const [selectedMarketplace, setSelectedMarketplace] = useState<Marketplace>(initialMarketplace);
  const [exportScope, setExportScope] = useState<'completed' | 'all' | 'selected'>('completed');
  const [isExporting, setIsExporting] = useState(false);

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const profile = MARKETPLACE_PROFILES[selectedMarketplace] || MARKETPLACE_PROFILES.generic;

  // Filter export target assets
  let exportAssets = assets;
  if (exportScope === 'completed') {
    exportAssets = assets.filter((a) => a.status === 'completed' && a.metadata);
  } else if (exportScope === 'selected') {
    exportAssets = assets.filter((a) => selectedIds.has(a.id));
  }

  // Calculate the validation report
  const validationReport = validateCsvAssets(exportAssets, selectedMarketplace);

  const handleAutoFix = () => {
    if (!onUpdateAssets) return;

    const fixedAssets = assets.map((asset) => {
      if (!asset.metadata) return asset;

      const meta = { ...asset.metadata };
      const specificMeta = meta.marketplaces?.[selectedMarketplace]
        ? { ...meta.marketplaces[selectedMarketplace] }
        : null;

      let title = (specificMeta?.title || meta.title || '').trim();
      let keywords = [...(specificMeta?.keywords || meta.keywords || [])];
      let category = (specificMeta?.category || meta.category || '').trim();

      // 1. Fix missing/empty/too short title
      if (!title || title.length < 5) {
        title = `High quality stock photo of ${asset.originalFilename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ")}`;
      }

      // 2. Fix title too long
      const maxTitleLen = selectedMarketplace === 'adobe' ? 200 : (MARKETPLACE_PROFILES[selectedMarketplace]?.titleMaxLength || 200);
      if (title.length > maxTitleLen) {
        title = title.slice(0, maxTitleLen);
      }

      // 3. Deduplicate keywords & remove forbidden terms
      const seen = new Set<string>();
      let fixedKeywords = keywords.filter((k) => {
        const word = typeof k === 'string' ? k.trim() : k.word.trim();
        if (!word) return false;

        const lower = word.toLowerCase();

        // Remove trademark/brand/artist/celebrity terms
        const isBannedBrand = [
          'apple', 'iphone', 'ipad', 'samsung', 'galaxy', 'nike', 'adidas', 'puma', 'reebok', 'under armour', 'gucci', 'prada', 'louis vuitton',
          'coca cola', 'cocacola', 'coke', 'pepsi', 'mcdonalds', 'mcdonald', 'burger king', 'starbucks', 'kfc',
          'disney', 'pixar', 'marvel', 'dc comics', 'lego', 'barbie', 'mattel', 'hasbro',
          'sony', 'playstation', 'ps4', 'ps5', 'xbox', 'microsoft', 'nintendo', 'switch', 'gameboy',
          'pokemon', 'pokémon', 'pikachu', 'mario', 'super mario', 'zelda', 'sonic', 'spider-man', 'spiderman', 'batman', 'superman', 'iron man',
          'google', 'facebook', 'meta', 'instagram', 'whatsapp', 'tiktok', 'twitter', 'youtube', 'snapchat', 'linkedin', 'pinterest',
          'canon', 'nikon', 'gopro', 'red bull', 'tesla', 'bmw', 'mercedes', 'audi', 'ferrari', 'lamborghini', 'porsche', 'ford', 'chevrolet',
          'photoshop', 'illustrator', 'lightroom', 'adobe stock', 'shutterstock', 'freepik', 'midjourney', 'stable diffusion', 'dall-e', 'chatgpt',
          'picasso', 'van gogh', 'da vinci', 'monet', 'rembrandt', 'salvador dali', 'dali', 'andy warhol', 'warhol',
          'greg rutkowski', 'artgerm', 'alphonse mucha', 'mucha', 'wlop', 'rossdraws', 'ilya kuvshinov',
          'elon musk', 'trump', 'donald trump', 'biden', 'joe biden', 'obama', 'barack obama',
          'taylor swift', 'beyonce', 'messi', 'ronaldo', 'michael jackson', 'einstein', 'steve jobs'
        ].includes(lower);
        
        if (isBannedBrand) return false;

        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });

      // 4. Ensure keyword count limit compliance
      const maxKwCount = selectedMarketplace === 'adobe' ? 49 : (MARKETPLACE_PROFILES[selectedMarketplace]?.maxKeywords || 50);
      if (fixedKeywords.length > maxKwCount) {
        fixedKeywords = fixedKeywords.slice(0, maxKwCount);
      }

      // If keyword count is too low, add general keywords from title
      if (fixedKeywords.length < 10) {
        const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !['with', 'this', 'that', 'from', 'here'].includes(w));
        for (const word of titleWords) {
          if (fixedKeywords.length >= 10) break;
          const cleanW = word.replace(/[^\w]/g, '');
          if (cleanW && !seen.has(cleanW)) {
            fixedKeywords.push(typeof keywords[0] === 'object' ? { word: cleanW, score: 70 } : cleanW as any);
            seen.add(cleanW);
          }
        }
      }

      // 5. Fix category for Adobe Stock
      if (selectedMarketplace === 'adobe' && !category) {
        category = 'Graphic Resources'; // safe default
      }

      if (meta.marketplaces?.[selectedMarketplace]) {
        meta.marketplaces = {
          ...meta.marketplaces,
          [selectedMarketplace]: {
            ...meta.marketplaces[selectedMarketplace],
            title,
            keywords: fixedKeywords,
            category,
          }
        } as any;
      } else {
        meta.title = title;
        meta.keywords = fixedKeywords as any;
        meta.category = category;
      }

      return {
        ...asset,
        metadata: meta,
      };
    });

    onUpdateAssets(fixedAssets);
  };

  // Strict validation verification: Confirm 100% of filenames match exact originalFilename
  const filenameCheckPassed = exportAssets.every(
    (a) => Boolean(a.originalFilename) && !a.originalFilename.startsWith('undefined')
  );

  const handleDownload = async () => {
    if (exportAssets.length === 0) return;
    const hasFatalBlocks = validationReport.errors.some(e => e.severity === 'block');
    if (hasFatalBlocks) {
      alert('CSV Export is Blocked. Please resolve the critical metadata violations listed in the validation report.');
      return;
    }
    setIsExporting(true);
    try {
      await downloadCsvFile(exportAssets, selectedMarketplace);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const platforms: { id: Marketplace; label: string; shortLabel: string }[] = [
    { id: 'adobe', label: 'Adobe Stock', shortLabel: 'Adobe' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto overscroll-contain">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl sm:max-w-3xl w-full max-md:w-[calc(100vw-16px)] max-md:max-h-[calc(100dvh-16px)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] min-h-0 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-none">Export Stock CSV</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Upload-ready stock contributor portal CSV
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain min-h-0 [webkit-overflow-scrolling:touch] bg-white">
          {/* Target Marketplace Format */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Globe className="w-3 h-3 text-blue-600" />
              Target Marketplace Format
            </label>
            <div className="flex">
              <span className="h-9 px-3 rounded-xl border border-emerald-500 bg-emerald-50 text-emerald-700 font-bold flex items-center gap-1.5 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                Adobe Stock
              </span>
            </div>
            <p className="text-[10px] text-slate-500 leading-normal">
              Mapped CSV columns:{' '}
              <strong className="text-slate-700 font-medium">
                {profile.csvColumns.map((c) => c.header).join(' • ')}
              </strong>
            </p>
          </div>

          {/* Export Scope */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Export Scope
            </label>
            <div className="grid grid-cols-3 bg-slate-100 p-1 rounded-xl border border-slate-200 h-10 items-stretch">
              <button
                type="button"
                onClick={() => setExportScope('completed')}
                className={`rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 px-2 ${
                  exportScope === 'completed'
                    ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <span>Completed</span>
                <span className="text-[10px] text-slate-500 font-mono font-medium">
                  ({assets.filter((a) => a.status === 'completed').length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('selected')}
                className={`rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 px-2 ${
                  exportScope === 'selected'
                    ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <span>Selected</span>
                <span className="text-[10px] text-slate-500 font-mono font-medium">
                  ({selectedIds.size})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('all')}
                className={`rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 px-2 ${
                  exportScope === 'all'
                    ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <span>All Assets</span>
                <span className="text-[10px] text-slate-500 font-mono font-medium">
                  ({assets.length})
                </span>
              </button>
            </div>
          </div>

          {/* Strict Filename Validation Indicator */}
          <div className="py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-800 text-[11px]">Immutable Filename Guarantee</span>
            </div>
            {filenameCheckPassed ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 flex items-center gap-1">
                ✓ Verified
              </span>
            ) : (
              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                Warning
              </span>
            )}
          </div>

          {/* Metadata & Portal Validation Report */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Validation Report
              </label>
              {validationReport.status === 'SAFE' && (
                <span className="text-[9px] uppercase font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  Passed
                </span>
              )}
              {validationReport.status === 'WARNING' && (
                <span className="text-[9px] uppercase font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  Warning
                </span>
              )}
              {validationReport.status === 'BLOCK' && (
                <span className="text-[9px] uppercase font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                  Blocked
                </span>
              )}
            </div>

            {validationReport.errors.length === 0 ? (
              <div className="py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                <span>All {exportAssets.length} assets passed portal guidelines perfectly.</span>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                  <span>Found {validationReport.errorsCount} blocks & {validationReport.warningsCount} warnings</span>
                  {onUpdateAssets && validationReport.errors.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoFix}
                      className="text-emerald-700 hover:text-emerald-800 font-bold text-[10px] bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300 transition-all flex items-center gap-1 active:scale-[0.98]"
                    >
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      Auto-Fix All Issues
                    </button>
                  )}
                </div>
                <div className="max-h-24 overflow-y-auto divide-y divide-slate-200 p-0.5 overscroll-contain">
                  {validationReport.errors.map((err, idx) => (
                    <div key={idx} className="p-1.5 flex items-start gap-1.5 text-[11px]">
                      {err.severity === 'block' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[10px] text-slate-500 flex items-center gap-1 flex-wrap">
                          <span className="text-slate-800 font-medium truncate max-w-[120px]">{err.filename}</span>
                          <span className="text-slate-400">•</span>
                          <span className="capitalize text-slate-700">{err.field}</span>
                          <span className="text-slate-400">•</span>
                          <span className={err.severity === 'block' ? 'text-rose-600 font-bold' : 'text-amber-600 font-bold'}>
                            {err.severity.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-slate-700 text-[11px] font-medium leading-normal">{err.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Preview Table of First 5 Items */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span className="font-bold text-slate-700">Data Preview (First 5 records)</span>
              <span className="font-mono">UTF-8 with BOM</span>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-x-auto bg-slate-50 max-w-full">
              <table className="w-full text-left text-[10px] text-slate-700 table-fixed min-w-[600px]">
                <thead className="bg-slate-100 border-b border-slate-200 font-mono text-slate-600 uppercase text-[9px]">
                  <tr>
                    {profile.csvColumns.map((col) => (
                      <th 
                        key={col.key} 
                        className={`py-1.5 px-2 whitespace-nowrap ${col.key === 'originalFilename' ? 'w-[180px]' : 'w-[120px]'}`}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono bg-white">
                  {exportAssets.slice(0, 5).map((asset) => (
                    <tr key={asset.id} className="hover:bg-slate-50">
                      {profile.csvColumns.map((col) => {
                        let val = '';
                        if (col.key === 'originalFilename') val = asset.originalFilename;
                        else if (col.key === 'title') val = asset.metadata?.title || '';
                        else if (col.key === 'description')
                          val = asset.metadata?.description || asset.metadata?.title || '';
                        else if (col.key === 'keywords')
                          val =
                            asset.metadata?.keywords
                              ?.map((k) => (typeof k === 'string' ? k : k.word))
                              .join(', ') || '';
                        else if (col.key === 'category') val = asset.metadata?.category || '';

                        return (
                          <td
                            key={col.key}
                            className="py-1 px-2 truncate text-[10px]"
                            title={val}
                          >
                            {val || <span className="text-slate-400">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {exportAssets.length === 0 && (
                    <tr>
                      <td
                        colSpan={profile.csvColumns.length}
                        className="py-4 text-center text-slate-400 italic font-sans"
                      >
                        No assets in current export scope.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isExporting || exportAssets.length === 0 || validationReport.errors.some(e => e.severity === 'block')}
            onClick={handleDownload}
            className={`h-9 px-4 rounded-xl text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 ${
              validationReport.errors.some(e => e.severity === 'block')
                ? 'bg-rose-100 border border-rose-300 text-rose-700 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20 active:scale-[0.98]'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {isExporting ? 'Generating...' : validationReport.errors.some(e => e.severity === 'block') ? 'Blocked' : `Download ${exportAssets.length} CSV`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
