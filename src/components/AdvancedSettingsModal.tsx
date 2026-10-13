import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, Check, X, Cpu, RefreshCw, Zap, Trash2, Database, ShieldCheck } from 'lucide-react';
import { ProcessingSettings } from '../types';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { metadataCache } from '../utils/metadataCache';

interface AdvancedSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ProcessingSettings;
  onSave: (settings: ProcessingSettings) => void;
}

export const AdvancedSettingsModal: React.FC<AdvancedSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [concurrency, setConcurrency] = useState<number>(settings.concurrency || 4);
  const [retryCount, setRetryCount] = useState<number>(settings.retryCount || 2);
  const [cacheStats, setCacheStats] = useState<{ count: number; formattedSize: string }>({
    count: 0,
    formattedSize: '0 KB',
  });
  const [cacheClearedNotice, setCacheClearedNotice] = useState<string | null>(null);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setCacheStats(metadataCache.getStats());
      setCacheClearedNotice(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      ...settings,
      concurrency,
      retryCount,
    });
    onClose();
  };

  const handleClearCache = () => {
    const cleared = metadataCache.clear();
    setCacheStats(metadataCache.getStats());
    setCacheClearedNotice(`Successfully cleared ${cleared} cached AI metadata items.`);
    setTimeout(() => {
      setCacheClearedNotice(null);
    }, 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto overscroll-contain">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Advanced Engine & Speed Settings</h3>
              <p className="text-xs text-slate-500">Parallel speed, retry policy & metadata cache</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overscroll-contain bg-white">
          {/* Concurrency & Retry Count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Parallel Speed Workers</span>
                </span>
                <span className="font-mono text-blue-600 font-bold">{concurrency}</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                Higher concurrency speeds up batch image generation exponentially.
              </p>
            </div>

            <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                  <span>Rate-limit Retries</span>
                </span>
                <span className="font-mono text-blue-600 font-bold">{retryCount} attempts</span>
              </div>
              <input
                type="range"
                min="0"
                max="4"
                value={retryCount}
                onChange={(e) => setRetryCount(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                Automatic retry attempts when providers encounter temporary 429/503 load.
              </p>
            </div>
          </div>

          {/* Clean Cache Section */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">AI Metadata Cache Storage</h4>
                  <p className="text-[11px] text-slate-500">
                    Stores processed results locally for instant zero-latency batch re-runs.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold text-slate-800 block">
                  {cacheStats.count} items
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {cacheStats.formattedSize}
                </span>
              </div>
            </div>

            {cacheClearedNotice && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{cacheClearedNotice}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
              <span className="text-[11px] text-slate-600 font-medium">
                Want a fresh generation without using cached responses?
              </span>
              <button
                type="button"
                id="clear-metadata-cache-btn"
                onClick={handleClearCache}
                className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Clean Cache</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Check className="w-4 h-4" />
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
};
