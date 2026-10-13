import React, { useState, useEffect } from 'react';
import {
  Type,
  Tag,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Sparkles,
  Sliders,
  ShieldCheck,
  Info,
  Layers,
  Wand2,
} from 'lucide-react';
import {
  TitleSettings,
  KeywordSettings,
  BackgroundSettings,
  AssetType,
  BackgroundTypeOption,
} from '../types';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface AdvancedMetadataSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleSettings: TitleSettings;
  keywordSettings: KeywordSettings;
  backgroundSettings?: BackgroundSettings;
  assetType: AssetType;
  onSaveTitleSettings: (settings: TitleSettings) => void;
  onSaveKeywordSettings: (settings: KeywordSettings) => void;
  onSaveBackgroundSettings?: (settings: BackgroundSettings) => void;
  onSaveAll?: (ts: TitleSettings, ks: KeywordSettings, bs: BackgroundSettings, at: AssetType) => void;
  onSelectAssetType: (type: AssetType) => void;
  initialActiveSection?: 'title' | 'keyword' | 'image' | 'all';
}

const TITLE_LENGTH_PRESETS = [
  { id: 'short', label: 'Short', chars: 50, desc: '~50 chars' },
  { id: 'standard', label: 'Standard', chars: 70, desc: '~70 chars' },
  { id: 'long', label: 'Long', chars: 100, desc: '~100 chars' },
  { id: 'extra_long', label: 'Extra Long', chars: 150, desc: '~150-200 chars' },
  { id: 'custom', label: 'Custom', chars: 70, desc: '20-200 chars' },
];

const TITLE_STYLES = [
  { id: 'SEO Optimized', label: 'SEO Optimized', desc: 'Maximized search discoverability' },
  { id: 'Natural', label: 'Natural', desc: 'Flowing descriptive sentences' },
  { id: 'Commercial', label: 'Commercial', desc: 'Buyer-focused action phrasing' },
  { id: 'Descriptive', label: 'Descriptive', desc: 'Detailed visual breakdown' },
  { id: 'Creative', label: 'Creative', desc: 'Evocative artistic titles' },
];

const BACKGROUND_SUFFIXES = [
  { id: 'none', label: 'None', desc: 'No background suffix added' },
  { id: 'isolated_transparent', label: 'Isolated on Transparent Background', desc: 'Append for transparent PNGs' },
  { id: 'isolated_white', label: 'Isolated on White Background', desc: 'Append for white studio cutouts' },
  { id: 'isolated_black', label: 'Isolated on Black Background', desc: 'Append for black studio cutouts' },
  { id: 'isolated_png_transparent', label: 'Isolated PNG with Transparent Background', desc: 'Explicit PNG suffix' },
];

const KEYWORD_COUNT_PRESETS = [15, 20, 25, 30, 35, 40, 45, 49];

const KEYWORD_ORDERINGS = [
  { id: 'relevance', label: 'Most Relevant First', desc: 'Primary subject terms first' },
  { id: 'seo_priority', label: 'SEO Priority', desc: 'High-volume buyer terms first' },
  { id: 'balanced', label: 'Balanced', desc: 'Mix of specific and conceptual' },
  { id: 'broad_to_specific', label: 'Broad to Specific', desc: 'Category down to detail' },
];

const KEYWORD_TYPES = [
  { id: 'mixed', label: 'Mixed (Recommended)', desc: 'Single words & multi-word phrases' },
  { id: 'single', label: 'Single Words', desc: 'Individual keywords only' },
  { id: 'phrases', label: 'Phrases', desc: 'Descriptive compound phrases' },
];

const ASSET_TYPES: { id: AssetType; label: string; desc: string }[] = [
  { id: 'photo', label: 'Photo', desc: 'Standard digital photograph' },
  { id: 'illustration', label: 'Illustration', desc: 'Digital or vector illustration' },
  { id: 'vector', label: 'Vector', desc: 'Scalable graphic design' },
  { id: '3d_render', label: '3D Render', desc: 'CGI 3D model render' },
  { id: 'png', label: 'PNG Cutout', desc: 'Transparent or isolated graphic' },
  { id: 'background', label: 'Background', desc: 'Textured backdrop or scene' },
  { id: 'icon', label: 'Icon', desc: 'UI symbol or icon set' },
  { id: 'wallpaper', label: 'Wallpaper', desc: 'High-res desktop/mobile backdrop' },
  { id: 'pattern', label: 'Pattern', desc: 'Seamless repeating texture' },
  { id: 'abstract', label: 'Abstract', desc: 'Non-representational design' },
];

const BACKGROUND_TYPES: { id: BackgroundTypeOption; label: string; desc: string }[] = [
  { id: 'auto', label: 'Auto-Detect', desc: 'AI visual & alpha pixel analysis' },
  { id: 'transparent', label: 'Transparent', desc: 'Real transparent PNG channel' },
  { id: 'white', label: 'White', desc: 'Clean white studio background' },
  { id: 'black', label: 'Black', desc: 'Clean dark/black background' },
  { id: 'light', label: 'Light', desc: 'Light neutral background' },
  { id: 'dark', label: 'Dark', desc: 'Dark moody background' },
  { id: 'colorful', label: 'Colorful', desc: 'Vibrant studio background' },
  { id: 'isolated', label: 'Isolated Cutout', desc: 'Subject cleanly separated' },
  { id: 'no_background', label: 'No Background', desc: 'Seamless background-free' },
  { id: 'unknown', label: 'Unknown / N/A', desc: 'Full environment or complex' },
];

export const AdvancedMetadataSettingsModal: React.FC<AdvancedMetadataSettingsModalProps> = ({
  isOpen,
  onClose,
  titleSettings,
  keywordSettings,
  backgroundSettings,
  assetType: currentAssetType,
  onSaveTitleSettings,
  onSaveKeywordSettings,
  onSaveBackgroundSettings,
  onSaveAll,
  onSelectAssetType,
  initialActiveSection = 'all',
}) => {
  // Accordion Section States
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    title: initialActiveSection === 'title' || initialActiveSection === 'all',
    keyword: initialActiveSection === 'keyword' || initialActiveSection === 'all',
    image: initialActiveSection === 'image' || initialActiveSection === 'all',
  });

  // Title Settings State
  const [lengthMode, setLengthMode] = useState<string>(titleSettings?.lengthMode || 'standard');
  const [customLength, setCustomLength] = useState<number>(titleSettings?.customLength || 70);
  const [maxLength, setMaxLength] = useState<number>(titleSettings?.maxLength || 70);
  const [titleStyle, setTitleStyle] = useState<string>(titleSettings?.style || 'SEO Optimized');
  const [backgroundSuffix, setBackgroundSuffix] = useState<string>(titleSettings?.backgroundSuffix || 'none');
  const [titleCustomInst, setTitleCustomInst] = useState<string>(titleSettings?.customInstructions || '');

  // Keyword Settings State
  const [targetCount, setTargetCount] = useState<number>(keywordSettings?.targetCount || 30);
  const [isCustomCount, setIsCustomCount] = useState<boolean>(
    keywordSettings?.isCustomCount || !KEYWORD_COUNT_PRESETS.includes(keywordSettings?.targetCount || 30)
  );
  const [customCount, setCustomCount] = useState<number>(keywordSettings?.customCount || 30);
  const [keywordOrdering, setKeywordOrdering] = useState<string>(keywordSettings?.ordering || 'relevance');
  const [keywordType, setKeywordType] = useState<string>(keywordSettings?.keywordType || 'mixed');
  const [keywordCustomInst, setKeywordCustomInst] = useState<string>(keywordSettings?.customInstructions || '');

  // Image & Background Settings State
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType>(currentAssetType || 'photo');
  const [userBgType, setUserBgType] = useState<BackgroundTypeOption>(backgroundSettings?.userBackgroundType || 'auto');

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setOpenSections({
        title: initialActiveSection === 'title' || initialActiveSection === 'all',
        keyword: initialActiveSection === 'keyword' || initialActiveSection === 'all',
        image: initialActiveSection === 'image' || initialActiveSection === 'all',
      });

      if (titleSettings) {
        const mode = titleSettings.lengthMode || 'standard';
        setLengthMode(mode);
        setCustomLength(titleSettings.customLength || 70);
        
        // Ensure maxLength is aligned with the mode
        let effectiveMax = titleSettings.maxLength || 70;
        if (mode !== 'custom') {
          const preset = TITLE_LENGTH_PRESETS.find(p => p.id === mode);
          if (preset) effectiveMax = preset.chars;
        }
        setMaxLength(effectiveMax);
        
        setTitleStyle(titleSettings.style || 'SEO Optimized');
        setBackgroundSuffix(titleSettings.backgroundSuffix || 'none');
        setTitleCustomInst(titleSettings.customInstructions || '');
      }

      if (keywordSettings) {
        setTargetCount(keywordSettings.targetCount || 30);
        setIsCustomCount(!!keywordSettings.isCustomCount || !KEYWORD_COUNT_PRESETS.includes(keywordSettings.targetCount || 30));
        setCustomCount(keywordSettings.customCount || 30);
        setKeywordOrdering(keywordSettings.ordering || 'relevance');
        setKeywordType(keywordSettings.keywordType || 'mixed');
        setKeywordCustomInst(keywordSettings.customInstructions || '');
      }

      if (currentAssetType) {
        setSelectedAssetType(currentAssetType);
      }

      if (backgroundSettings) {
        setUserBgType(backgroundSettings.userBackgroundType || 'auto');
      }
    }
  }, [isOpen, titleSettings, keywordSettings, backgroundSettings, currentAssetType, initialActiveSection]);

  if (!isOpen) return null;

  const toggleSection = (section: 'title' | 'keyword' | 'image') => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSelectLengthMode = (mode: string) => {
    setLengthMode(mode);
    const preset = TITLE_LENGTH_PRESETS.find(p => p.id === mode);
    if (preset && mode !== 'custom') {
      setMaxLength(preset.chars);
    } else if (mode === 'custom') {
      setMaxLength(customLength);
    }
  };

  const handleCustomLengthChange = (val: number) => {
    const clamped = Math.min(Math.max(val, 20), 200);
    setCustomLength(clamped);
    if (lengthMode === 'custom') {
      setMaxLength(clamped);
    }
  };

  const handleSelectCountPreset = (cnt: number) => {
    setIsCustomCount(false);
    setTargetCount(cnt);
  };

  const handleCustomCountChange = (val: number) => {
    const clamped = Math.min(Math.max(val, 15), 49);
    setCustomCount(clamped);
    setIsCustomCount(true);
    setTargetCount(clamped);
  };

  const handleSaveAll = () => {
    // Calculate final title max length
    let finalTitleMax = maxLength;
    if (lengthMode === 'short') finalTitleMax = 50;
    else if (lengthMode === 'standard') finalTitleMax = 70;
    else if (lengthMode === 'long') finalTitleMax = 100;
    else if (lengthMode === 'extra_long') finalTitleMax = 150;
    else if (lengthMode === 'custom') finalTitleMax = customLength;

    const updatedTitleSettings: TitleSettings = {
      lengthMode: lengthMode as any,
      customLength,
      maxLength: finalTitleMax,
      style: titleStyle as any,
      backgroundSuffix: backgroundSuffix as any,
      customInstructions: titleCustomInst,
    };

    const finalKeywordTarget = isCustomCount ? customCount : targetCount;
    const updatedKeywordSettings: KeywordSettings = {
      targetCount: finalKeywordTarget,
      isCustomCount,
      customCount,
      ordering: keywordOrdering,
      keywordType,
      customInstructions: keywordCustomInst,
    };

    const updatedBgSettings: BackgroundSettings = {
      userBackgroundType: userBgType,
    };

    if (onSaveAll) {
      onSaveAll(updatedTitleSettings, updatedKeywordSettings, updatedBgSettings, selectedAssetType);
    } else {
      onSaveTitleSettings(updatedTitleSettings);
      onSaveKeywordSettings(updatedKeywordSettings);
      if (onSaveBackgroundSettings) {
        onSaveBackgroundSettings(updatedBgSettings);
      }
      onSelectAssetType(selectedAssetType);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex-none px-6 py-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Workflow Configuration
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Pro Settings
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Configure prompt directives, title styles, keyword rules & asset rules
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* SECTION 1: TITLE SETTINGS */}
          <div className="bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('title')}
              className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Type className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    TITLE SETTINGS
                    <span className="normal-case text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full border border-blue-200/60 dark:border-blue-800/60">
                      Target: {maxLength} chars • {titleStyle}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Control title length targets, commercial style & background suffixes
                  </p>
                </div>
              </div>
              {openSections.title ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {openSections.title && (
              <div className="p-5 border-t border-slate-200/60 dark:border-slate-700/60 space-y-5 bg-white dark:bg-slate-900/50">
                
                {/* Title Length Mode */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    Title Length Target
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {TITLE_LENGTH_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectLengthMode(preset.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          lengthMode === preset.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 font-bold'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                        }`}
                      >
                        <span className="text-xs font-bold">{preset.label}</span>
                        <span className={`text-[10px] mt-1 ${lengthMode === preset.id ? 'text-blue-100' : 'text-slate-400'}`}>
                          {preset.desc}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Custom Length Slider / Number Input */}
                  {lengthMode === 'custom' && (
                    <div className="mt-3 p-3 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/80 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <span>Custom Character Limit (20–200):</span>
                        <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">{customLength} characters</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={20}
                          max={200}
                          value={customLength}
                          onChange={(e) => handleCustomLengthChange(parseInt(e.target.value, 10))}
                          className="flex-1 accent-blue-600 cursor-pointer"
                        />
                        <input
                          type="number"
                          min={20}
                          max={200}
                          value={customLength}
                          onChange={(e) => handleCustomLengthChange(parseInt(e.target.value, 10) || 70)}
                          className="w-16 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-center text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Title Style */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    Title Style
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {TITLE_STYLES.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setTitleStyle(st.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          titleStyle === st.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md font-bold'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                        }`}
                      >
                        <div className="text-xs font-bold">{st.label}</div>
                        <div className={`text-[9px] mt-0.5 line-clamp-1 ${titleStyle === st.id ? 'text-blue-100' : 'text-slate-400'}`}>
                          {st.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background Suffix */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Background Suffix
                    </label>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      Appended ONLY when visually appropriate
                    </span>
                  </div>
                  <select
                    value={backgroundSuffix}
                    onChange={(e) => setBackgroundSuffix(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {BACKGROUND_SUFFIXES.map((suf) => (
                      <option key={suf.id} value={suf.id}>
                        {suf.label} — {suf.desc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom Title Instructions */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Custom Title Instructions
                  </label>
                  <textarea
                    value={titleCustomInst}
                    onChange={(e) => setTitleCustomInst(e.target.value)}
                    placeholder="e.g. Focus on the main object and commercial use. Emphasize bright studio lighting."
                    rows={2}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

              </div>
            )}
          </div>

          {/* SECTION 2: KEYWORD SETTINGS */}
          <div className="bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('keyword')}
              className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    KEYWORD SETTINGS
                    <span className="normal-case text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/60">
                      Target: {targetCount} tags • {keywordType}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Target keyword count (15–49), ordering priorities & strict spam rules
                  </p>
                </div>
              </div>
              {openSections.keyword ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {openSections.keyword && (
              <div className="p-5 border-t border-slate-200/60 dark:border-slate-700/60 space-y-5 bg-white dark:bg-slate-900/50">
                
                {/* Keyword Count Presets */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    Keyword Count Target (15–49)
                  </label>
                  <div className="grid grid-cols-5 sm:grid-cols-9 gap-1.5">
                    {KEYWORD_COUNT_PRESETS.map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => handleSelectCountPreset(cnt)}
                        className={`py-2 px-1 rounded-xl border text-center transition-all ${
                          !isCustomCount && targetCount === cnt
                            ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-md'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                        }`}
                      >
                        <span className="text-xs font-bold">{cnt}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setIsCustomCount(true)}
                      className={`py-2 px-1 rounded-xl border text-center transition-all ${
                        isCustomCount
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-md'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                      }`}
                    >
                      <span className="text-xs font-bold">Custom</span>
                    </button>
                  </div>

                  {/* Custom Keyword Count Slider */}
                  {isCustomCount && (
                    <div className="mt-3 p-3 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/80 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <span>Custom Keyword Count (15–49):</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">{customCount} keywords</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={15}
                          max={49}
                          value={customCount}
                          onChange={(e) => handleCustomCountChange(parseInt(e.target.value, 10))}
                          className="flex-1 accent-emerald-600 cursor-pointer"
                        />
                        <input
                          type="number"
                          min={15}
                          max={49}
                          value={customCount}
                          onChange={(e) => handleCustomCountChange(parseInt(e.target.value, 10) || 30)}
                          className="w-16 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-center text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Keyword Ordering & Types */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                      Keyword Ordering Strategy
                    </label>
                    <select
                      value={keywordOrdering}
                      onChange={(e) => setKeywordOrdering(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {KEYWORD_ORDERINGS.map((ord) => (
                        <option key={ord.id} value={ord.id}>
                          {ord.label} — {ord.desc}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                      Keyword Type
                    </label>
                    <select
                      value={keywordType}
                      onChange={(e) => setKeywordType(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {KEYWORD_TYPES.map((kt) => (
                        <option key={kt.id} value={kt.id}>
                          {kt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Enforced Keyword Quality Rules Checklist */}
                <div className="p-3.5 bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/50 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Enforced Keyword Rules (Stock Standard):
                  </div>
                  <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-600 shrink-0" /> 1st 10 keywords are strongest</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-600 shrink-0" /> No exact duplicates</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-600 shrink-0" /> No near-duplicate filler</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-600 shrink-0" /> No standalone "the", "and", "with", "for"</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-600 shrink-0" /> No trademark or brand names</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-600 shrink-0" /> Exact target count returned</li>
                  </ul>
                </div>

                {/* Custom Keyword Instructions */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Custom Keyword Instructions
                  </label>
                  <textarea
                    value={keywordCustomInst}
                    onChange={(e) => setKeywordCustomInst(e.target.value)}
                    placeholder="e.g. Focus heavily on isolated studio shot concepts, commercial stock uses, and graphic element terms."
                    rows={2}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>

              </div>
            )}
          </div>

          {/* SECTION 3: IMAGE & BACKGROUND SETTINGS */}
          <div className="bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('image')}
              className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    IMAGE & BACKGROUND SETTINGS
                    <span className="normal-case text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full border border-indigo-200/60 dark:border-indigo-800/60">
                      Asset: {selectedAssetType} • Bg: {userBgType}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Specify primary asset type and visual background classification hint
                  </p>
                </div>
              </div>
              {openSections.image ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {openSections.image && (
              <div className="p-5 border-t border-slate-200/60 dark:border-slate-700/60 space-y-5 bg-white dark:bg-slate-900/50">
                
                {/* Asset Type Selection */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    Primary Asset Type
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {ASSET_TYPES.map((at) => (
                      <button
                        key={at.id}
                        type="button"
                        onClick={() => setSelectedAssetType(at.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          selectedAssetType === at.id
                            ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-md'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                        }`}
                      >
                        <div className="text-xs font-bold">{at.label}</div>
                        <div className={`text-[9px] mt-0.5 line-clamp-1 ${selectedAssetType === at.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {at.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background Type Hint */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    Background Classification
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {BACKGROUND_TYPES.map((bgT) => (
                      <button
                        key={bgT.id}
                        type="button"
                        onClick={() => setUserBgType(bgT.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          userBgType === bgT.id
                            ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-md'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                        }`}
                      >
                        <div className="text-xs font-bold">{bgT.label}</div>
                        <div className={`text-[9px] mt-0.5 line-clamp-1 ${userBgType === bgT.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {bgT.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                  
                  <div className="mt-3 p-3 bg-indigo-50/40 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/60 rounded-xl flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                    <span>
                      <strong>Visual Pixel Integrity:</strong> The AI inspects actual pixel color distributions and alpha channel integrity. A <code>.png</code> file extension does NOT automatically imply a transparent background.
                    </span>
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="flex-none p-4 sm:p-5 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between sticky bottom-0 z-20 backdrop-blur-md">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
            Settings automatically apply to new and re-processed assets.
          </div>
          <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-semibold text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Apply Configuration
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
