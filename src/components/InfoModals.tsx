import React from 'react';
import { BookOpen, X, CheckCircle2, ShieldCheck, HelpCircle, FileText } from 'lucide-react';
import { MARKETPLACE_PROFILES } from '../utils/platforms';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto overscroll-contain">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Stock Marketplace Ranking Rules</h3>
              <p className="text-xs text-slate-500">
                Official guidelines & algorithmic ranking factors across major microstock agencies
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1 overscroll-contain bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(MARKETPLACE_PROFILES).map(([key, profile]) => (
              <div
                key={key}
                className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">{profile.name}</h4>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-blue-600 font-semibold shadow-xs">
                    Max {profile.maxKeywords} tags
                  </span>
                </div>

                <div className="text-xs text-slate-700 space-y-1.5">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Title length:</span>
                    <strong className="text-slate-800">
                      {profile.titleMinLength} – {profile.titleMaxLength} chars
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>CSV Headers:</span>
                    <strong className="text-slate-800 truncate max-w-[200px]">
                      {profile.csvColumns.map((c) => c.header).join(', ')}
                    </strong>
                  </div>
                </div>

                <div className="space-y-1 pt-1 border-t border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Core Algorithm Directives:
                  </span>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {profile.rules.map((rule, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
