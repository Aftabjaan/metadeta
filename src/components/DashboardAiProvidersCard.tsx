import React from 'react';
import { Sparkles, Cpu, Settings2, Key, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAiProviderStore } from '../utils/aiProviderStore';
import { resolveEffectiveModel } from '../utils/aiModelService';
import { ProcessingSettings, AIProvider } from '../types';

interface DashboardAiProvidersCardProps {
  settings: ProcessingSettings;
  onOpenAiSettings: (defaultProvider?: 'gemini' | 'groq' | 'openai') => void;
  onSelectProvider: (p: AIProvider) => void;
}

export const DashboardAiProvidersCard: React.FC<DashboardAiProvidersCardProps> = ({
  settings,
  onOpenAiSettings,
}) => {
  const { keyCounts } = useAiProviderStore();

  const geminiConfigured = keyCounts.geminiTotal > 0;
  const groqConfigured = keyCounts.groqTotal > 0;
  const totalConfigured = keyCounts.geminiTotal + keyCounts.groqTotal;

  const currentProvider = settings.preferredProvider || 'gemini';

  return (
    <div id="ai-providers-dashboard-card" className="w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Key className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-wide flex items-center gap-2">
              AI API Keys & Settings
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-blue-700 border border-slate-200">
                Total: {totalConfigured}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
              <span>Gemini: <strong className="text-slate-800 font-mono">{keyCounts.geminiTotal}</strong></span>
              <span>•</span>
              <span>Groq: <strong className="text-slate-800 font-mono">{keyCounts.groqTotal}</strong></span>
              <span>•</span>
              <span>Active Engine: <strong className="text-blue-600 capitalize">{currentProvider}</strong></span>
            </p>
          </div>
        </div>

        <button
          type="button"
          id="btn-configure-ai-keys"
          onClick={() => onOpenAiSettings()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-semibold shadow-sm transition-all group cursor-pointer"
          title="Open AI Settings and Key Manager"
        >
          <Settings2 className="w-3.5 h-3.5 text-blue-600 group-hover:rotate-45 transition-transform" />
          <span>{totalConfigured === 0 ? 'Add API Key' : 'Manage API Keys'}</span>
        </button>
      </div>

      {/* Zero Keys Notice Banner */}
      {totalConfigured === 0 && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Add your own Gemini or Groq API key to start generating metadata.</span>
          </div>
          <button
            type="button"
            id="btn-banner-add-key"
            onClick={() => onOpenAiSettings('gemini')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition-colors shadow-sm shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add API Key</span>
          </button>
        </div>
      )}

      {/* 2-Column Provider Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Gemini Provider Card */}
        <div
          id="card-gemini-provider"
          onClick={() => onOpenAiSettings('gemini')}
          className={`cursor-pointer group relative p-3.5 rounded-xl border transition-all duration-150 ${
            currentProvider === 'gemini' || currentProvider === 'auto'
              ? 'bg-blue-50/60 hover:bg-blue-50 border-blue-300 ring-1 ring-blue-400/30'
              : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200'
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                    Google Gemini
                  </h4>
                  {currentProvider === 'gemini' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 border border-blue-200">
                      Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[10px] mt-0.5">
                  {geminiConfigured ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      {keyCounts.geminiTotal} Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                      No Key
                    </span>
                  )}
                </div>
              </div>
            </div>

            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-white text-slate-700 border border-slate-200 shadow-xs">
              {keyCounts.geminiTotal}
            </span>
          </div>

          {/* Model & Keys Breakdown */}
          <div className="mt-2.5 pt-2 border-t border-slate-200/80 grid grid-cols-2 gap-2 text-[10px]">
            <div className="min-w-0">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Model</span>
              <span className="text-slate-800 font-mono font-medium truncate block" title={resolveEffectiveModel('gemini', settings.geminiModel)}>
                {resolveEffectiveModel('gemini', settings.geminiModel)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Status</span>
              <span className={geminiConfigured ? 'text-emerald-600 font-medium truncate block' : 'text-slate-500 truncate block'}>
                {geminiConfigured ? `${keyCounts.geminiActive} Active` : 'Needs Key'}
              </span>
            </div>
          </div>
        </div>

        {/* Groq Provider Card */}
        <div
          id="card-groq-provider"
          onClick={() => onOpenAiSettings('groq')}
          className={`cursor-pointer group relative p-3.5 rounded-xl border transition-all duration-150 ${
            currentProvider === 'groq'
              ? 'bg-orange-50/60 hover:bg-orange-50 border-orange-300 ring-1 ring-orange-400/30'
              : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200'
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-orange-600 transition-colors">
                    Groq Vision
                  </h4>
                  {currentProvider === 'groq' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-orange-100 text-orange-700 border border-orange-200">
                      Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[10px] mt-0.5">
                  {groqConfigured ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      {keyCounts.groqTotal} Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                      No Key
                    </span>
                  )}
                </div>
              </div>
            </div>

            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-white text-slate-700 border border-slate-200 shadow-xs">
              {keyCounts.groqTotal}
            </span>
          </div>

          {/* Model & Keys Breakdown */}
          <div className="mt-2.5 pt-2 border-t border-slate-200/80 grid grid-cols-2 gap-2 text-[10px]">
            <div className="min-w-0">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Model</span>
              <span className="text-slate-800 font-mono font-medium truncate block" title={settings.groqModel || 'llama-3.2-11b-vision-preview'}>
                {settings.groqModel || 'llama-3.2-11b-vision-preview'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Status</span>
              <span className={groqConfigured ? 'text-emerald-600 font-medium truncate block' : 'text-slate-500 truncate block'}>
                {groqConfigured ? `${keyCounts.groqActive} Active` : 'Needs Key'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
