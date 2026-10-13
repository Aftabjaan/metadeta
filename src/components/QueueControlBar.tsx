import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  XCircle,
  FileSpreadsheet,
  Upload,
  Sparkles,
  CheckCircle2,
  Clock,
  Sliders,
  Trash2,
  ShieldCheck,
  ArrowUp,
  RefreshCw,
  X,
} from 'lucide-react';
import { StockAsset } from '../types';

interface QueueControlBarProps {
  assets: StockAsset[];
  isProcessing: boolean;
  isPaused: boolean;
  selectedCount: number;
  currentProcessingFilename: string | null;
  concurrency: number;
  onChangeConcurrency: (val: number) => void;
  onGenerateAll: () => void;
  onGenerateSelected: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetryFailed: () => void;
  onOpenExportCsv: () => void;
  onOpenImportCsv: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClearAll?: () => void;
  onRefreshAndClearAll?: () => void;
  onOpenKeys?: () => void;
  onOpenBatchEmbed?: () => void;
  onRegenerateAll?: () => void;
  onRegenerateSelected?: () => void;
  showPostGenerationActions?: boolean;
  onDismissPostGeneration?: () => void;
}

export const QueueControlBar: React.FC<QueueControlBarProps> = ({
  assets,
  isProcessing,
  isPaused,
  selectedCount,
  currentProcessingFilename,
  concurrency,
  onChangeConcurrency,
  onGenerateAll,
  onGenerateSelected,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
  onOpenExportCsv,
  onOpenImportCsv,
  onSelectAll,
  onDeselectAll,
  onClearAll,
  onRefreshAndClearAll,
  onOpenKeys,
  onOpenBatchEmbed,
  onRegenerateAll,
  onRegenerateSelected,
  showPostGenerationActions,
  onDismissPostGeneration,
}) => {
  const total = assets.length;
  const completed = assets.filter((a) => a.status === 'completed').length;
  const failed = assets.filter((a) => a.status === 'failed').length;
  const waiting = assets.filter((a) => a.status === 'waiting').length;
  const activeProcessing = assets.filter((a) => a.status === 'processing').length;
  const remaining = waiting + activeProcessing;

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-3">
      {showPostGenerationActions && !isProcessing && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-900">Batch Generation Complete!</h3>
              <p className="text-[11px] text-emerald-700 font-medium">All metadata has been successfully generated and is ready for download.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                onOpenExportCsv();
                onDismissPostGeneration?.();
              }}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              DOWNLOAD CSV
            </button>
            <button
              onClick={onDismissPostGeneration}
              className="p-2.5 rounded-xl text-emerald-600 hover:bg-emerald-100 transition-colors"
              title="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Uploading / Queue Live Counter Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Left: Blue Upload Icon & Ratio */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-500 block tracking-tight">
                {isProcessing
                  ? `Generating ${completed + activeProcessing} / ${total} (${percent}%)`
                  : 'Uploading / Queue Assets'}
              </span>
              <div className="text-sm sm:text-base font-black text-slate-900 tracking-tight font-mono">
                {completed} <span className="text-slate-400 font-normal">/</span> {total}
                {currentProcessingFilename && isProcessing && (
                  <span className="text-[11px] font-normal text-blue-600 ml-2 truncate max-w-[200px] inline-block align-middle">
                    • {currentProcessingFilename}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Status Chips */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {/* Processing Chip */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700">
              <RefreshCw className={`w-3 h-3 ${activeProcessing > 0 ? 'animate-spin' : ''}`} />
              <span className="text-[10px] font-semibold">Processing</span>
              <span className="font-mono font-bold text-xs">{activeProcessing}</span>
            </div>

            {/* Completed Chip */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
              <CheckCircle2 className="w-3 h-3" />
              <span className="text-[10px] font-semibold">Completed</span>
              <span className="font-mono font-bold text-xs">{completed}</span>
            </div>

            {/* Failed Chip */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
              <X className="w-3 h-3" />
              <span className="text-[10px] font-semibold">Failed</span>
              <span className="font-mono font-bold text-xs">{failed}</span>
            </div>

            {/* Remaining Chip */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
              <Clock className="w-3 h-3" />
              <span className="text-[10px] font-semibold">Remaining</span>
              <span className="font-mono font-bold text-xs">{remaining}</span>
            </div>
          </div>
        </div>

        {/* Smooth Horizontal Progress Bar */}
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
          <div
            className="bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-300"
            style={{ width: `${(completed / total) * 100}%` }}
          />
          <div
            className="bg-blue-400 animate-pulse transition-all duration-300"
            style={{ width: `${(activeProcessing / total) * 100}%` }}
          />
          <div
            className="bg-rose-500 transition-all duration-300"
            style={{ width: `${(failed / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Action Controls & Batch Tools Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 sm:p-2.5 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2">
        {/* Main Processing Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isProcessing ? (
            <>
              {completed < total && (
                <button
                  type="button"
                  id="queue-generate-all-btn"
                  disabled={total === 0}
                  onClick={onGenerateAll}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-100" />
                  <span>Generate All ({total})</span>
                </button>
              )}

              {onRegenerateAll && (
                <button
                  type="button"
                  id="queue-regenerate-all-btn"
                  disabled={total === 0}
                  onClick={onRegenerateAll}
                  className={`px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                    completed === total && total > 0
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${completed === total && total > 0 ? 'text-blue-100' : 'text-blue-600'}`} />
                  <span>Re-generate All</span>
                </button>
              )}

              {selectedCount > 0 && (
                <button
                  type="button"
                  id="queue-generate-selected-btn"
                  onClick={onGenerateSelected}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs border border-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Play className="w-3 h-3 text-blue-600" />
                  <span>Generate Selected ({selectedCount})</span>
                </button>
              )}

              {selectedCount > 0 && onRegenerateSelected && (
                <button
                  type="button"
                  id="queue-regenerate-selected-btn"
                  onClick={onRegenerateSelected}
                  className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs border border-amber-200 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3 text-amber-600" />
                  <span>Re-generate Selected ({selectedCount})</span>
                </button>
              )}

              {onOpenBatchEmbed && (
                <button
                  type="button"
                  id="queue-embed-all-zip-btn"
                  disabled={completed === 0}
                  onClick={onOpenBatchEmbed}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-100" />
                  <span>Embed All & ZIP ({completed})</span>
                </button>
              )}

              {failed > 0 && (
                <button
                  id="queue-retry-failed-btn"
                  type="button"
                  onClick={onRetryFailed}
                  className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs border border-amber-200 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-amber-600" />
                  <span>Retry Failed ({failed})</span>
                </button>
              )}
            </>
          ) : (
            <>
              {isPaused ? (
                <button
                  type="button"
                  onClick={onResume}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume Queue</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onPause}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Queue</span>
                </button>
              )}

              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs border border-rose-200 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>Cancel</span>
              </button>
            </>
          )}

          {/* Quick Select & Deselect & Clear & Refresh All */}
          {total > 0 && (
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs flex-wrap">
              <button
                type="button"
                id="queue-select-all-btn"
                onClick={onSelectAll}
                className="px-2.5 py-1 text-slate-700 hover:text-slate-900 rounded-lg hover:bg-white transition-colors text-[11px] font-semibold cursor-pointer"
              >
                Select All
              </button>
              <button
                type="button"
                id="queue-deselect-btn"
                onClick={onDeselectAll}
                className="px-2.5 py-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-white transition-colors text-[11px] cursor-pointer"
              >
                Deselect
              </button>
              {onClearAll && (
                <button
                  type="button"
                  id="queue-clear-all-btn"
                  onClick={onClearAll}
                  className="px-2.5 py-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  title="Clear all assets from current queue"
                >
                  <Trash2 className="w-3 h-3 text-rose-500" />
                  <span>Clear</span>
                </button>
              )}
              {onRefreshAndClearAll && (
                <button
                  type="button"
                  id="queue-refresh-clear-all-btn"
                  onClick={onRefreshAndClearAll}
                  className="px-2.5 py-1 text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  title="Reset workspace, cancel queue & refresh cleanly"
                >
                  <RotateCcw className="w-3 h-3 text-amber-600" />
                  <span>Refresh & Reset</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Tools: Workers, CSV Import & Export */}
        <div className="flex items-center gap-1.5 w-full lg:w-auto justify-end flex-wrap">
          {/* Concurrency Selector */}
          <div className="flex items-center gap-1 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700">
            <Sliders className="w-3 h-3 text-slate-500" />
            <span className="hidden sm:inline text-[10px] font-medium">Workers:</span>
            <select
              value={concurrency}
              onChange={(e) => onChangeConcurrency(Number(e.target.value))}
              disabled={isProcessing}
              className="bg-white border border-slate-200 rounded-lg text-xs font-bold text-blue-700 px-1.5 py-0.5 focus:outline-none cursor-pointer"
            >
              <option value={1}>1 Worker</option>
              <option value={2}>2 Parallel</option>
              <option value={3}>3 Parallel</option>
              <option value={4}>4 Parallel</option>
              <option value={5}>5 Parallel</option>
            </select>
          </div>

          {/* CSV Import */}
          <button
            type="button"
            onClick={onOpenImportCsv}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Upload className="w-3 h-3 text-blue-600" />
            <span className="hidden sm:inline">Import CSV</span>
          </button>

          {/* CSV Export */}
          <button
            type="button"
            disabled={completed === 0}
            onClick={onOpenExportCsv}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-sm flex items-center gap-1 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
            <span>Export CSV ({completed})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
