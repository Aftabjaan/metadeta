import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Zap,
  Key,
  FolderKanban,
  Search,
  BookOpen,
  Sun,
  Moon,
  Settings,
  LayoutGrid,
  ChevronDown,
  Layers,
  CheckCircle2,
  Folder,
  LogOut,
  User as UserIcon,
  MessageCircle,
  Trash2,
  Maximize2,
  Minimize2,
  MoreVertical,
} from 'lucide-react';
import { Project, ApiKeyEntry, AIProvider } from '../types';
import { useAuth } from '../context/AuthContext';
import { useAiProviderStore } from '../utils/aiProviderStore';
import { metadataCache } from '../utils/metadataCache';

interface NavbarProps {
  currentProject: Project;
  onOpenProjects: () => void;
  onOpenKeys: () => void;
  onOpenRules: () => void;
  onOpenAdvanced: () => void;
  activeView: 'generator' | 'seo-finder';
  setActiveView: (view: 'generator' | 'seo-finder') => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  apiKeys?: ApiKeyEntry[];
  provider: AIProvider;
  onSelectProvider: (p: AIProvider) => void;
  hasGroq?: boolean;
  isFullWidth?: boolean;
  onToggleFullWidth?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentProject,
  onOpenProjects,
  onOpenKeys,
  onOpenRules,
  onOpenAdvanced,
  activeView,
  setActiveView,
  theme,
  toggleTheme,
  provider,
  onSelectProvider,
  isFullWidth = true,
  onToggleFullWidth,
}) => {
  const { user, logout, isSupabaseActive } = useAuth();
  const { keyCounts } = useAiProviderStore();
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [cleanCacheToast, setCleanCacheToast] = useState<string | null>(null);
  const activeKeysCount = keyCounts.totalActive;
  const itemsCount = currentProject?.items?.length || 0;

  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsBrowserFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleFullscreenClick = () => {
    // 1. If currently in browser fullscreen, exit it
    if (document.fullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      return;
    }

    // 2. If layout is not full-width, first toggle layout to full width
    if (!isFullWidth && onToggleFullWidth) {
      onToggleFullWidth();
    }

    // 3. Try to enter browser fullscreen for PC / desktop
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // Fallback: if browser prevents requestFullscreen (e.g. iframe policy), toggle full width
        if (onToggleFullWidth) {
          onToggleFullWidth();
        }
      });
    } else if (onToggleFullWidth) {
      onToggleFullWidth();
    }
  };

  const handleQuickCleanCache = () => {
    const cleared = metadataCache.clear();
    setCleanCacheToast(`Cache Cleared (${cleared})`);
    setTimeout(() => setCleanCacheToast(null), 2500);
  };

  const providerLabels: Record<AIProvider, string> = {
    gemini: 'Gemini',
    groq: 'Groq',
    openai: 'OpenAI',
    auto: 'Auto AI',
  };

  return (
    <header className={`sticky top-0 z-40 backdrop-blur-md transition-all duration-200 ${
      theme === 'light'
        ? 'bg-white/65 border-b border-white/55 text-slate-800 shadow-sm'
        : 'bg-slate-950/95 border-b border-slate-800/80 text-slate-100'
    }`}>
      <div className={`w-full ${isFullWidth ? 'max-w-[1850px] 2xl:max-w-[1920px] px-4 sm:px-6 lg:px-8 xl:px-10' : 'max-w-5xl px-3 sm:px-4'} mx-auto py-2.5 sm:py-3 space-y-2.5 transition-all duration-200`}>
        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-2">
          {/* Logo & Branding */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20 shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <span className={`font-extrabold tracking-tight text-xs min-[385px]:text-sm sm:text-base md:text-lg font-sans whitespace-nowrap ${
                  theme === 'light' ? 'text-slate-900' : 'text-white'
                }`}>
                  Stock Metadata <span className="text-cyan-600 dark:text-cyan-400 font-black inline-flex items-center gap-0.5">Pro AI <span className="text-cyan-500 dark:text-cyan-300 text-xs">✦</span></span>
                </span>
              </div>
              <p className={`text-[10px] sm:text-[11px] font-medium truncate hidden md:block ${
                theme === 'light' ? 'text-slate-500' : 'text-slate-400'
              }`}>
                AI-Powered Stock Image Metadata Generator
              </p>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0">
            {/* Provider Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                id="provider-selector-btn"
                onClick={() => setShowProviderMenu(!showProviderMenu)}
                className={`flex items-center gap-1 px-1.5 sm:px-2.5 md:px-3 py-1 md:py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all ${
                  theme === 'light'
                    ? 'bg-white/70 hover:bg-white border border-slate-200 text-slate-800'
                    : 'bg-slate-900 hover:bg-slate-850 border border-slate-700/80 text-slate-200'
                }`}
                title="Select AI Provider Engine"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                <span className="hidden min-[385px]:inline text-[10px] sm:text-[11px] md:text-xs">{providerLabels[provider] || 'Gemini'}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {showProviderMenu && (
                <div className={`absolute right-0 mt-1.5 w-40 rounded-xl shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 ${
                  theme === 'light'
                    ? 'bg-white border border-slate-200 text-slate-800'
                    : 'bg-slate-900 border border-slate-700 text-slate-200'
                }`}>
                  <div className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    theme === 'light' ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    AI Engine
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProvider('gemini');
                      setShowProviderMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                      provider === 'gemini'
                        ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                        : theme === 'light' ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>Gemini (Vision)</span>
                    {provider === 'gemini' && <span className="text-cyan-600 font-bold">✓</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProvider('groq');
                      setShowProviderMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                      provider === 'groq'
                        ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                        : theme === 'light' ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>Groq (Fast)</span>
                    {provider === 'groq' && <span className="text-cyan-600 font-bold">✓</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProvider('auto');
                      setShowProviderMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                      provider === 'auto'
                        ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                        : theme === 'light' ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>Auto (Failover)</span>
                    {provider === 'auto' && <span className="text-cyan-600 font-bold">✓</span>}
                  </button>
                </div>
              )}
            </div>

            {/* API Keys Pill */}
            <button
              type="button"
              id="navbar-api-keys-btn"
              onClick={onOpenKeys}
              className={`flex items-center gap-1 px-1.5 sm:px-2.5 md:px-3 py-1 md:py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-white/70 hover:bg-white border border-slate-200 text-slate-800'
                  : 'bg-slate-900 hover:bg-slate-850 border border-slate-700/80 text-slate-200'
              }`}
              title="API Keys Vault & Rotation"
            >
              <Key className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="hidden min-[480px]:inline text-[11px] sm:text-xs">API Keys</span>
              <span
                className={`text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold leading-none ${
                  activeKeysCount > 0
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                }`}
              >
                {activeKeysCount}
              </span>
            </button>

            {/* Desktop-only Buttons (visible on md and above) */}
            <div className="hidden md:flex items-center gap-1.5">
              {/* Clean Cache Button */}
              <button
                type="button"
                id="navbar-clean-cache-btn"
                onClick={handleQuickCleanCache}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                  cleanCacheToast
                    ? 'bg-emerald-500 text-white font-bold animate-pulse'
                    : theme === 'light'
                    ? 'bg-white/70 hover:bg-white border border-slate-200 text-slate-800 hover:text-rose-600'
                    : 'bg-slate-900 hover:bg-slate-850 border border-slate-700/80 text-slate-200 hover:text-rose-400'
                }`}
                title="Clean Metadata Cache"
              >
                <Trash2 className={`w-3.5 h-3.5 ${cleanCacheToast ? 'text-white' : 'text-rose-500'}`} />
                <span className="hidden sm:inline text-[11px] sm:text-xs">
                  {cleanCacheToast || 'Clean Cache'}
                </span>
              </button>

              {/* Settings Button */}
              <button
                type="button"
                onClick={onOpenAdvanced}
                className={`p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white/70 hover:bg-white border border-slate-200 text-slate-700 hover:text-slate-900'
                    : 'p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-700/80'
                }`}
                title="Advanced Settings & Model Configurations"
              >
                <Settings className={`w-4 h-4 ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`} />
              </button>

              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleTheme}
                className={`p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white/70 hover:bg-white border border-slate-200 text-slate-700 hover:text-yellow-600'
                    : 'p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-700/80 hover:text-yellow-400'
                }`}
                title="Toggle Dark / Light Theme"
              >
                {theme === 'light' ? (
                  <Moon className="w-4 h-4 text-slate-600" />
                ) : (
                  <Sun className="w-4 h-4 text-yellow-400" />
                )}
              </button>

              {/* Full Screen Desktop View & Browser Display Toggle Button */}
              <button
                type="button"
                id="navbar-fullscreen-toggle-btn"
                onClick={handleFullscreenClick}
                className={`p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  isBrowserFullscreen || isFullWidth
                    ? 'bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-semibold'
                    : theme === 'light'
                    ? 'bg-white/70 hover:bg-white border border-slate-200 text-slate-700 hover:text-blue-600'
                    : 'text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-700/80'
                }`}
                title={
                  isBrowserFullscreen
                    ? 'Exit Full Screen Mode (ESC or Click)'
                    : isFullWidth
                    ? 'Full Screen Active (Click to toggle Compact View or Browser Full Screen)'
                    : 'Switch to Full Screen View (Fit to PC Display / Maximize)'
                }
              >
                {isBrowserFullscreen || isFullWidth ? (
                  <Minimize2 className="w-4 h-4 text-blue-600" />
                ) : (
                  <Maximize2 className="w-4 h-4 text-slate-500" />
                )}
                <span className="hidden lg:inline text-[11px] font-semibold">
                  {isBrowserFullscreen ? 'Exit Fullscreen' : isFullWidth ? 'Full Screen' : 'Compact'}
                </span>
              </button>

              {/* User Profile Logout (if authenticated) */}
              {user && (
                <>
                  <a
                    href="https://wa.me/923081210798"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all ${
                      theme === 'light'
                        ? 'bg-white/70 hover:bg-white border border-slate-200 text-slate-800'
                        : 'bg-slate-900 hover:bg-slate-850 border border-slate-700/80 text-slate-200'
                    }`}
                    title="Connect Us"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-green-500" />
                    <span className="hidden sm:inline text-[11px] sm:text-xs">Connect Us</span>
                  </a>
                  <button
                    type="button"
                    onClick={logout}
                    className={`p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer ${
                      theme === 'light'
                        ? 'bg-white/70 hover:bg-rose-50 border border-slate-200 text-slate-500 hover:text-rose-600'
                        : 'p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-rose-400 bg-slate-900 hover:bg-slate-850 border border-slate-700/80'
                    }`}
                    title={`Sign out (${user.email})`}
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* Mobile & Tablet "More" Actions Dropdown (visible under md) */}
            <div className="relative md:hidden flex items-center gap-1">
              {/* Theme Toggle always handy on mobile too */}
              <button
                type="button"
                onClick={toggleTheme}
                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white/70 border border-slate-200 text-slate-700'
                    : 'bg-slate-900 border border-slate-700/80 text-slate-300'
                }`}
              >
                {theme === 'light' ? (
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-yellow-400" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={`p-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                  showMoreMenu
                    ? 'bg-blue-500 text-white border border-blue-500'
                    : theme === 'light'
                    ? 'bg-white/70 hover:bg-white border border-slate-200 text-slate-700'
                    : 'bg-slate-900 hover:bg-slate-850 border border-slate-700/80 text-slate-300'
                }`}
                title="More Actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Mobile Dropdown Backdrop */}
              {showMoreMenu && (
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setShowMoreMenu(false)}
                />
              )}

              {/* Dropdown Menu Container */}
              {showMoreMenu && (
                <div className={`absolute right-0 mt-12 w-44 rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-3 duration-200 ${
                  theme === 'light'
                    ? 'bg-white/95 border border-slate-200/80 text-slate-800 backdrop-blur-md'
                    : 'bg-slate-950/95 border border-slate-800/90 text-slate-200 backdrop-blur-md'
                }`}
                style={{ top: '100%', marginTop: '0.5rem' }}
                >
                  {/* Connect Us / Support */}
                  <a
                    href="https://wa.me/923081210798"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowMoreMenu(false)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      theme === 'light' ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-slate-900 text-slate-300'
                    }`}
                  >
                    <MessageCircle className="w-4 h-4 text-green-500 shrink-0" />
                    <span>Connect Us</span>
                  </a>

                  {/* Clean Cache */}
                  <button
                    type="button"
                    onClick={() => {
                      handleQuickCleanCache();
                      setShowMoreMenu(false);
                    }}
                    className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      theme === 'light' ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-slate-900 text-slate-300'
                    }`}
                  >
                    <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{cleanCacheToast || 'Clean Cache'}</span>
                  </button>

                  {/* Settings */}
                  <button
                    type="button"
                    onClick={() => {
                      onOpenAdvanced();
                      setShowMoreMenu(false);
                    }}
                    className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      theme === 'light' ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-slate-900 text-slate-300'
                    }`}
                  >
                    <Settings className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Settings</span>
                  </button>

                  {/* Full Screen View */}
                  <button
                    type="button"
                    onClick={() => {
                      handleFullscreenClick();
                      setShowMoreMenu(false);
                    }}
                    className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      theme === 'light' ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-slate-900 text-slate-300'
                    }`}
                  >
                    {isBrowserFullscreen || isFullWidth ? (
                      <Minimize2 className="w-4 h-4 text-blue-500 shrink-0" />
                    ) : (
                      <Maximize2 className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                    <span>{isBrowserFullscreen ? 'Exit Fullscreen' : isFullWidth ? 'Compact View' : 'Full Screen'}</span>
                  </button>

                  {/* Logout (if authenticated) */}
                  {user && (
                    <div className="border-t border-slate-100 dark:border-slate-800/80 my-1 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          logout();
                          setShowMoreMenu(false);
                        }}
                        className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none text-xs flex-nowrap whitespace-nowrap">
          {/* Batch Generator (Active tab) */}
          <button
            type="button"
            onClick={() => setActiveView('generator')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeView === 'generator'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400/40'
                : theme === 'light'
                ? 'bg-white/70 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/60'
                : 'bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-850 border border-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-300" />
            <span>Batch Generator</span>
          </button>

          {/* SEO Keyword Tool */}
          <button
            type="button"
            onClick={() => setActiveView('seo-finder')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeView === 'seo-finder'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400/40'
                : theme === 'light'
                ? 'bg-white/70 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/60'
                : 'bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-850 border border-slate-800'
            }`}
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span>SEO Keyword Tool</span>
          </button>

          {/* Marketplace Rules */}
          <button
            type="button"
            onClick={onOpenRules}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              theme === 'light'
                ? 'bg-white/70 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/60'
                : 'bg-slate-900/90 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span>Marketplace Rules</span>
          </button>

          {/* Current Batch Tag */}
          <button
            type="button"
            onClick={onOpenProjects}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              theme === 'light'
                ? 'bg-white/70 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/60'
                : 'bg-slate-900/90 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800'
            }`}
            title="Current active project batch"
          >
            <Folder className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span className="max-w-[120px] truncate">{currentProject.name || 'Stock Batch 01'}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono font-bold ${
              theme === 'light' ? 'bg-slate-100 text-cyan-600 border border-slate-200' : 'bg-slate-800 text-cyan-300'
            }`}>
              {itemsCount}
            </span>
          </button>

          {/* Projects Button */}
          <button
            type="button"
            onClick={onOpenProjects}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              theme === 'light'
                ? 'bg-white/70 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/60'
                : 'bg-slate-900/90 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5 text-slate-400" />
            <span>Projects</span>
          </button>

          {/* Dashboard Button */}
          <button
            type="button"
            onClick={onOpenProjects}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              theme === 'light'
                ? 'bg-white/70 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/60'
                : 'bg-slate-900/90 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
            <span>Dashboard</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
