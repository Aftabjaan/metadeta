import React from 'react';
import { X, Sparkles, CheckCircle2, AlertCircle, TrendingUp, ShieldCheck } from 'lucide-react';
import { StockAsset } from '../types';
import { calculateSeoScore } from '../utils/seoEngine';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface QualityScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: StockAsset | null;
}

export const QualityScoreModal: React.FC<QualityScoreModalProps> = ({
  isOpen,
  onClose,
  asset,
}) => {
  useBodyScrollLock(isOpen);

  if (!isOpen || !asset || !asset.metadata) return null;

  const meta = asset.metadata;
  const breakdown = meta.seoBreakdown || calculateSeoScore(meta);
  const score = breakdown.score;

  const getScoreColor = (val: number) => {
    if (val >= 90) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (val >= 75) return 'text-blue-700 bg-blue-50 border-blue-200';
    if (val >= 60) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-rose-700 bg-rose-50 border-rose-200';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto overscroll-contain">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Metadata Quality Score
                <span
                  className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${getScoreColor(
                    score
                  )}`}
                >
                  {score} / 100
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-mono truncate max-w-sm">
                {asset.originalFilename}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 overscroll-contain bg-white">
          {/* Main Quality Category Breakdown */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Category Score Breakdown
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(breakdown.categoryScores || [
                { name: 'Title Quality', score: Math.round(score * 0.2), max: 20 },
                { name: 'Description Quality', score: Math.round(score * 0.2), max: 20 },
                { name: 'Keyword Count', score: Math.round(score * 0.2), max: 20 },
                { name: 'Relevance & Hierarchy', score: Math.round(score * 0.2), max: 20 },
                { name: 'Zero Duplicates', score: Math.round(score * 0.1), max: 10 },
                { name: 'Completeness', score: Math.round(score * 0.1), max: 10 },
              ]).map((cat, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                >
                  <span className="text-xs text-slate-800 font-medium">{cat.name}</span>
                  <span className="font-mono text-xs font-bold text-blue-700 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-xs">
                    {cat.score} / {cat.max}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Validation Checks */}
          {breakdown.checks && breakdown.checks.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Platform Rules & SEO Checks
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {breakdown.checks.map((c, i) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                      c.passed
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    {c.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <strong className="font-semibold block">{c.label}</strong>
                      {c.tip && <p className="text-[11px] text-slate-600 mt-0.5">{c.tip}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {breakdown.recommendations && breakdown.recommendations.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-1 text-xs text-blue-900">
              <strong className="font-bold flex items-center gap-1.5 text-blue-800">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Optimization Recommendations:
              </strong>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-700 pt-1">
                {breakdown.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
