import React, { useState } from 'react';
import {
  Check,
  CheckSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Layers,
  HelpCircle,
  Star,
  Trash2,
  X,
  BookOpen,
} from 'lucide-react';
import { Marketplace } from '../types';
import { MARKETPLACE_PROFILES } from '../utils/platforms';
import { MarketplaceLogo } from './MarketplaceLogos';

interface MarketplaceSelectorProps {
  selectedMarketplaces: Marketplace[];
  onChangeSelectedMarketplaces?: (selected: Marketplace[]) => void;
  onToggleMarketplace?: (m: Marketplace) => void;
  activeMarketplace: Marketplace;
  onSelectActiveMarketplace: (m: Marketplace) => void;
  onSetPreset?: (markets: Marketplace[]) => void;
  onClearAll?: () => void;
  isProcessing?: boolean;
  totalAssetsCount?: number;
}

interface PlatformItem {
  id: Marketplace;
  name: string;
  shortName: string;
  badge: string;
  keywordRule: string;
  titleRule: string;
}

const PLATFORMS: PlatformItem[] = [
  {
    id: 'adobe',
    name: 'Adobe Stock',
    shortName: 'Adobe',
    badge: 'St',
    keywordRule: 'Max 49 tags (10 primary)',
    titleRule: '15-120 chars',
  },
  {
    id: 'shutterstock',
    name: 'Shutterstock',
    shortName: 'Shutter',
    badge: 'Ss',
    keywordRule: 'Max 50 tags (25-45 ideal)',
    titleRule: '20-200 chars',
  },
  {
    id: 'freepik',
    name: 'Freepik',
    shortName: 'Freepik',
    badge: 'Fp',
    keywordRule: 'Max 50 tags (English)',
    titleRule: '10-100 chars',
  },
  {
    id: 'istock',
    name: 'iStock / Getty',
    shortName: 'iStock',
    badge: 'iS',
    keywordRule: 'Max 50 tags (Vocab)',
    titleRule: '15-150 chars',
  },
  {
    id: 'alamy',
    name: 'Alamy',
    shortName: 'Alamy',
    badge: 'Al',
    keywordRule: 'Max 50 tags (10 super)',
    titleRule: '15-200 chars',
  },
  {
    id: 'dreamstime',
    name: 'Dreamstime',
    shortName: 'Dreamstime',
    badge: 'Dt',
    keywordRule: 'Max 80 tags (Dedupe)',
    titleRule: '15-100 chars',
  },
  {
    id: 'generic',
    name: 'Generic Stock',
    shortName: 'Generic',
    badge: 'Gen',
    keywordRule: 'Max 50 universal tags',
    titleRule: '15-120 chars',
  },
];

export const MarketplaceSelector: React.FC<MarketplaceSelectorProps> = ({
  selectedMarketplaces,
  onChangeSelectedMarketplaces,
  onToggleMarketplace,
  activeMarketplace,
  onSelectActiveMarketplace,
  onSetPreset,
  onClearAll,
  isProcessing = false,
  totalAssetsCount = 0,
}) => {
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);

  const isSelected = (id: Marketplace) => selectedMarketplaces.includes(id);

  const handleToggle = (id: Marketplace) => {
    if (isProcessing) return;
    if (onToggleMarketplace) {
      onToggleMarketplace(id);
    } else if (onChangeSelectedMarketplaces) {
      if (isSelected(id)) {
        if (selectedMarketplaces.length <= 1) return;
        const updated = selectedMarketplaces.filter((m) => m !== id);
        onChangeSelectedMarketplaces(updated);
        if (activeMarketplace === id && updated.length > 0) {
          onSelectActiveMarketplace(updated[0]);
        }
      } else {
        onChangeSelectedMarketplaces([...selectedMarketplaces, id]);
        onSelectActiveMarketplace(id);
      }
    }
  };

  const handleSelectAll = () => {
    if (isProcessing) return;
    const all = PLATFORMS.map((p) => p.id);
    if (onSetPreset) onSetPreset(all);
    else if (onChangeSelectedMarketplaces) onChangeSelectedMarketplaces(all);
  };

  const handleDeselect = () => {
    if (isProcessing) return;
    const single: Marketplace[] = [activeMarketplace || 'adobe'];
    if (onSetPreset) onSetPreset(single);
    else if (onChangeSelectedMarketplaces) onChangeSelectedMarketplaces(single);
  };

  const handleSelectTrio = () => {
    if (isProcessing) return;
    const trio: Marketplace[] = ['adobe', 'shutterstock', 'freepik'];
    if (onSetPreset) onSetPreset(trio);
    else if (onChangeSelectedMarketplaces) onChangeSelectedMarketplaces(trio);
    if (!trio.includes(activeMarketplace)) {
      onSelectActiveMarketplace('adobe');
    }
  };

  const handleResetGeneric = () => {
    if (isProcessing) return;
    const genericOnly: Marketplace[] = ['generic'];
    if (onSetPreset) onSetPreset(genericOnly);
    else if (onChangeSelectedMarketplaces) onChangeSelectedMarketplaces(genericOnly);
    onSelectActiveMarketplace('generic');
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-2 sm:p-2.5 shadow-sm space-y-2">
      {/* Inline Top Bar: Title & Quick Presets */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-sm">🏪</span>
          <span className="font-bold text-slate-900 text-xs tracking-tight">Marketplaces</span>
          <span className="text-[10px] text-slate-500 font-mono">({selectedMarketplaces.length}/7 active)</span>
        </div>

        {/* Compact Presets Bar */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            id="btn-preset-all"
            onClick={handleSelectAll}
            disabled={isProcessing}
            className="px-2 py-0.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 text-[11px] font-medium flex items-center gap-1 transition-all disabled:opacity-40"
          >
            <CheckSquare className="w-3 h-3 text-blue-600" />
            <span>All</span>
          </button>

          <button
            type="button"
            id="btn-preset-deselect"
            onClick={handleDeselect}
            disabled={isProcessing}
            className="px-2 py-0.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 text-[11px] font-medium flex items-center gap-1 transition-all disabled:opacity-40"
          >
            <X className="w-3 h-3 text-slate-400" />
            <span>None</span>
          </button>

          <button
            type="button"
            id="btn-preset-trio"
            onClick={handleSelectTrio}
            disabled={isProcessing}
            className="px-2 py-0.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 text-[11px] font-medium flex items-center gap-1 transition-all disabled:opacity-40"
          >
            <Star className="w-3 h-3 text-amber-500" />
            <span>Top 3</span>
          </button>

          <button
            type="button"
            id="btn-preset-generic"
            onClick={handleResetGeneric}
            disabled={isProcessing}
            className="px-2 py-0.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 text-[11px] font-medium flex items-center gap-1 transition-all disabled:opacity-40"
          >
            <Layers className="w-3 h-3 text-slate-500" />
            <span>Generic</span>
          </button>

          <button
            type="button"
            id="btn-toggle-rules-drawer"
            onClick={() => setShowRulesDrawer(!showRulesDrawer)}
            className="px-2 py-0.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 text-[11px] font-medium flex items-center gap-1 transition-all"
          >
            <BookOpen className="w-3 h-3 text-slate-500" />
            <span>Rules</span>
            {showRulesDrawer ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>

          {onClearAll && totalAssetsCount > 0 && (
            <button
              type="button"
              id="btn-clear-all-marketplace"
              onClick={onClearAll}
              className="px-2 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 transition-all ml-1 cursor-pointer"
              title="Clear all images in current batch"
            >
              <Trash2 className="w-3 h-3 text-rose-600" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Marketplace Selection Row: All 7 in a tight single horizontal grid on desktop, wrapping on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
        {PLATFORMS.map((platform) => {
          const active = isSelected(platform.id);

          return (
            <button
              type="button"
              key={platform.id}
              onClick={() => handleToggle(platform.id)}
              className={`relative h-8 sm:h-9 px-2 py-1 rounded-lg border text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none group ${
                active
                  ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-xs ring-1 ring-blue-500/20 font-semibold'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900 opacity-80 hover:opacity-100'
              }`}
            >
              {active && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              )}
              <MarketplaceLogo marketplace={platform.id} size={18} />
              <span className="text-[11px] tracking-tight truncate">
                {platform.shortName}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expandable Rules Comparison Drawer */}
      {showRulesDrawer && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
              <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
              Stock Marketplace Rules & Requirements
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">Microstock 2026</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-1 px-2 font-semibold">Platform</th>
                  <th className="py-1 px-2 font-semibold">Title Limit</th>
                  <th className="py-1 px-2 font-semibold">Keyword Rules</th>
                  <th className="py-1 px-2 font-semibold">CSV Export Header</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {PLATFORMS.map((p) => {
                  const prof = MARKETPLACE_PROFILES[p.id];
                  return (
                    <tr key={p.id} className={isSelected(p.id) ? 'bg-blue-50/60' : 'bg-white'}>
                      <td className="py-1 px-2 font-bold text-slate-900 flex items-center gap-1.5">
                        <MarketplaceLogo marketplace={p.id} size={14} />
                        {p.name}
                        {isSelected(p.id) && <span className="text-emerald-600 text-[10px]">✓</span>}
                      </td>
                      <td className="py-1 px-2 text-slate-700">
                        {p.titleRule} (max {prof.titleMaxLength}c)
                      </td>
                      <td className="py-1 px-2 text-slate-700">
                        {p.keywordRule} ({prof.minKeywords}–{prof.maxKeywords} tags)
                      </td>
                      <td className="py-1 px-2 font-mono text-slate-600 text-[10px]">
                        {prof.csvColumns.map((c) => c.header).join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
