import React from 'react';
import {
  Globe,
  SlidersHorizontal,
  Type,
  Tag,
  Cpu,
  Bot,
  Sparkles,
  Layers,
  Key,
} from 'lucide-react';
import { Marketplace, AssetType, TitleSettings, KeywordSettings, AIProvider } from '../types';
import { MARKETPLACE_PROFILES } from '../utils/platforms';
import { MarketplaceLogo } from './MarketplaceLogos';
import { useAiProviderStore } from '../utils/aiProviderStore';

interface WorkflowBarProps {
  marketplace: Marketplace;
  onSelectMarketplace: (m: Marketplace) => void;
  assetType: AssetType;
  onSelectAssetType: (t: AssetType) => void;
  titleSettings: TitleSettings;
  onOpenTitleSettings: () => void;
  keywordSettings: KeywordSettings;
  onOpenKeywordSettings: () => void;
  aiGenerated: boolean;
  onToggleAiGenerated: (val: boolean) => void;
  provider: AIProvider;
  onSelectProvider: (p: AIProvider) => void;
  onOpenAdvanced: () => void;
  hasGroq?: boolean;
  activeKeysCount?: number;
  onOpenKeys?: () => void;
  selectedMarketplaces?: Marketplace[];
  theme?: 'light' | 'dark';
}

export const WorkflowBar: React.FC<WorkflowBarProps> = ({
  marketplace,
  onSelectMarketplace,
  assetType,
  onSelectAssetType,
  titleSettings,
  onOpenTitleSettings,
  keywordSettings,
  onOpenKeywordSettings,
  aiGenerated,
  onToggleAiGenerated,
  provider,
  onSelectProvider,
  onOpenAdvanced,
  hasGroq = false,
  onOpenKeys,
  selectedMarketplaces,
  theme = 'light',
}) => {
  const { keyCounts } = useAiProviderStore();
  const currentProfile = MARKETPLACE_PROFILES[marketplace] || MARKETPLACE_PROFILES.generic;
  const activeKeysCount = keyCounts.totalActive;

  const platforms: { id: Marketplace; label: string }[] = [
    { id: 'adobe', label: 'Adobe Stock' },
  ];

  const assetTypes: { id: AssetType; label: string }[] = [
    { id: 'photo', label: 'Photo' },
    { id: 'vector', label: 'Vector' },
    { id: 'illustration', label: 'Illustration' },
    { id: '3d_render', label: '3D Render' },
    { id: 'png', label: 'PNG' },
    { id: 'background', label: 'Background' },
    { id: 'icon', label: 'Icon' },
    { id: 'wallpaper', label: 'Wallpaper' },
    { id: 'pattern', label: 'Pattern' },
    { id: 'abstract', label: 'Abstract' },
  ];

  return (
    <div className={`rounded-xl p-2.5 sm:p-3 shadow-lg space-y-2 ${
      theme === 'light'
        ? 'glass-panel text-slate-800'
        : 'bg-slate-900 border border-slate-800 text-slate-100'
    }`}>
      {/* Row 1: Platform Selection (Static Adobe Stock Indicator) */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-1.5 ${
        theme === 'light' ? 'border-slate-200/50' : 'border-slate-800/80'
      }`}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 mr-0.5 shrink-0 ${
            theme === 'light' ? 'text-slate-600' : 'text-slate-400'
          }`}>
            <Globe className="w-3 h-3 text-blue-500" />
            Platform:
          </span>
          <div className="flex items-center">
            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
              theme === 'light'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-indigo-950/40 text-indigo-300 border border-indigo-900/50'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
              Adobe Stock
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: AI Provider & Settings Controls */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-1.5 ${
        theme === 'light' ? 'border-slate-200/50' : 'border-slate-800/80'
      }`}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className={`flex items-center gap-1 p-0.5 rounded-lg border text-xs ${
            theme === 'light'
              ? 'bg-white/50 border-slate-200/60'
              : 'bg-slate-950/80 border border-slate-800'
          }`}>
            <span className={`px-1.5 text-[10px] font-semibold flex items-center gap-1 ${
              theme === 'light' ? 'text-slate-600' : 'text-slate-400'
            }`}>
              <Cpu className="w-3 h-3 text-cyan-500" />
              Provider:
            </span>
            {(['auto', 'gemini', 'groq'] as AIProvider[]).map((pr) => {
              const isGroqUnavailable = pr === 'groq' && !hasGroq;
              const isUnavailable = isGroqUnavailable;
              
              return (
                <button
                  key={pr}
                  type="button"
                  onClick={() => {
                    if (isUnavailable) {
                      if (onOpenKeys) onOpenKeys();
                      return;
                    }
                    onSelectProvider(pr);
                  }}
                  title={
                    isUnavailable
                      ? `${pr.charAt(0).toUpperCase() + pr.slice(1)} is currently unavailable (no API key configured). Click to configure in API Key Manager.`
                      : undefined
                  }
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all uppercase flex items-center gap-1 ${
                    provider === pr
                      ? 'bg-cyan-500 text-white dark:text-slate-950 shadow-sm'
                      : isUnavailable
                      ? 'text-slate-400 hover:text-slate-500 opacity-60 hover:opacity-90'
                      : theme === 'light'
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {pr}
                  {isUnavailable && (
                    <span className="text-[8px] lowercase font-normal px-1 rounded bg-slate-800 text-slate-400">
                      off
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* API Keys Manager Trigger */}
          {onOpenKeys && (
            <button
              id="workflow-api-keys-btn"
              type="button"
              onClick={onOpenKeys}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-medium transition-all active:scale-95 group ${
                theme === 'light'
                  ? 'bg-white/60 hover:bg-white border-slate-200 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200'
              }`}
              title="Configure and manage Gemini, Groq & OpenAI API keys"
            >
              <Key className="w-3 h-3 text-amber-500 group-hover:rotate-12 transition-transform shrink-0" />
              <span>API Keys</span>
              {typeof activeKeysCount === 'number' && (
                <span
                  className={`text-[10px] px-1 py-0.2 rounded font-mono font-bold leading-none ${
                    activeKeysCount > 0
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {activeKeysCount}
                </span>
              )}
            </button>
          )}
        </div>

        <button
          id="workflow-advanced-settings-btn"
          type="button"
          onClick={onOpenAdvanced}
          className={`self-end sm:self-auto p-1.5 rounded-lg border transition-colors active:scale-95 flex items-center gap-1 text-xs font-medium ${
            theme === 'light'
              ? 'bg-white/60 hover:bg-white border-slate-200 text-slate-700'
              : 'bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white'
          }`}
          title="Advanced processing & queue settings"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden sm:inline">Settings</span>
        </button>
      </div>

      {/* Second row: Asset Type, Title Settings, Keyword Settings, AI Generated - All compact single rows */}
      <div className="flex flex-col gap-1.5 pt-1.5 text-xs">
        {/* Row A: Asset Type */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-1 border-b pb-1.5 ${
          theme === 'light' ? 'border-slate-200/40' : 'border-slate-800/40'
        }`}>
          <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0 ${
            theme === 'light' ? 'text-slate-600' : 'text-slate-400'
          }`}>
            <Layers className="w-3 h-3 text-indigo-500" />
            Asset Type
          </span>
          <div className="flex items-center gap-1 flex-wrap md:justify-end">
            {assetTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectAssetType(t.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                  assetType === t.id
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : theme === 'light'
                    ? 'bg-white/50 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/50'
                    : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row D: AI Generated */}
        <div className="flex items-center justify-between gap-2 py-1">
          <div className="flex items-center gap-1.5">
            <Bot className="w-3 h-3 text-purple-500 shrink-0" />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              theme === 'light' ? 'text-slate-600' : 'text-slate-400'
            }`}>
              AI Generated
            </span>
          </div>
          <div className={`p-0.5 rounded border text-[10px] flex items-center gap-0.5 ${
            theme === 'light'
              ? 'bg-slate-100 border-slate-200'
              : 'bg-slate-950 border border-slate-800'
          }`}>
            <button
              type="button"
              onClick={() => onToggleAiGenerated(false)}
              className={`px-2.5 py-0.5 rounded font-medium transition-all ${
                !aiGenerated
                  ? theme === 'light' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'
              }`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => onToggleAiGenerated(true)}
              className={`px-2.5 py-0.5 rounded font-bold transition-all ${
                aiGenerated
                  ? 'bg-purple-600 text-white'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'
              }`}
            >
              Yes
            </button>
          </div>
        </div>
      </div>

      {/* Platform Active Guidance Banner */}
      <div className={`px-2.5 py-1 rounded-lg flex items-center justify-between text-[11px] border ${
        theme === 'light'
          ? 'bg-slate-50/70 border-slate-200/60 text-slate-600'
          : 'bg-slate-950/80 border border-slate-800/80 text-slate-400'
      }`}>
        <div className="flex items-center gap-2 truncate">
          <span className={`font-semibold ${theme === 'light' ? 'text-slate-800' : 'text-slate-300'}`}>{currentProfile.name}:</span>
          <span className="truncate">{currentProfile.rules[0]}</span>
        </div>
        <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 shrink-0 ml-2">
          Max {currentProfile.maxKeywords} tags • Title max {titleSettings.maxLength}c
        </span>
      </div>
    </div>
  );
};
