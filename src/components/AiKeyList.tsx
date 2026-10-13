import React, { useState } from 'react';
import { Zap, Trash2, Shield, AlertTriangle, CheckCircle2, Copy, Eye, EyeOff, Star, Edit2, Check, Loader2 } from 'lucide-react';
import { ApiKeyEntry } from '../types';
import { getClientRawKey } from '../utils/clientKeyStorage';

interface AiKeyListProps {
  keys: ApiKeyEntry[];
  onTestKey: (id: string) => Promise<void> | void;
  onDeleteKey: (id: string) => Promise<void> | void;
  onSetActive: (id: string) => Promise<void> | void;
  onRenameKey: (id: string, newLabel: string) => Promise<void> | void;
  onDeleteAllKeys: () => void;
  testingId?: string | null;
}

export const AiKeyList: React.FC<AiKeyListProps> = ({
  keys,
  onTestKey,
  onDeleteKey,
  onSetActive,
  onRenameKey,
  onDeleteAllKeys,
  testingId,
}) => {
  const [showFullKeys, setShowFullKeys] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string>('');

  const toggleShowKey = (id: string) => {
    setShowFullKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getResolvedKey = (k: ApiKeyEntry): string => {
    const raw = getClientRawKey(k.id) || (k as any).rawKey;
    return raw || k.maskedKey || '';
  };

  const copyToClipboard = async (k: ApiKeyEntry) => {
    const textToCopy = getResolvedKey(k);
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedId(k.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for browsers that block clipboard API in iframes
      const ta = document.createElement('textarea');
      ta.value = textToCopy;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(k.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const startEditing = (k: ApiKeyEntry) => {
    setEditingId(k.id);
    setEditingLabel(k.label || '');
  };

  const handleSaveRename = async (id: string) => {
    if (editingLabel.trim()) {
      await onRenameKey(id, editingLabel.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-inner">
      {keys.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">
          No keys added yet for this provider. Click <strong className="text-slate-400 font-semibold">+ Add Key</strong> or <strong className="text-slate-400 font-semibold">Import</strong> above.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3">Label</th>
                <th className="p-3">Key</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <span>Actions</span>
                    {keys.length > 0 && (
                      <button
                        onClick={onDeleteAllKeys}
                        className="text-xs bg-rose-950/60 border border-rose-800/70 text-rose-400 hover:text-white hover:bg-rose-600 px-2.5 py-0.5 rounded-md transition-all font-semibold shadow-sm"
                        title="Delete All Keys for this provider"
                      >
                        Delete All
                      </button>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {keys.map((k) => {
                const resolvedKey = getResolvedKey(k);
                const isShowing = showFullKeys[k.id];
                const isCopied = copiedId === k.id;
                const isTesting = testingId === k.id;
                const isEditing = editingId === k.id;

                let statusBadgeClass = 'bg-slate-800 text-slate-400 border border-slate-700';
                if (k.status === 'active') {
                  statusBadgeClass = 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60';
                } else if (k.status === 'error') {
                  statusBadgeClass = 'bg-rose-950/60 text-rose-400 border border-rose-800/60';
                } else if (k.status === 'untested') {
                  statusBadgeClass = 'bg-amber-950/60 text-amber-400 border border-amber-800/60';
                }

                return (
                  <tr key={k.id} className={k.active ? 'bg-blue-950/20' : 'hover:bg-slate-800/40'}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {k.active ? (
                          <span title="Active Key for generation">
                            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 shrink-0" />
                          </span>
                        ) : (
                          <button
                            onClick={() => onSetActive(k.id)}
                            title="Click to make this the active key"
                            className="text-slate-600 hover:text-yellow-400 transition-colors"
                          >
                            <Star className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        )}

                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editingLabel}
                              onChange={(e) => setEditingLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename(k.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="bg-slate-950 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveRename(k.id)}
                              className="text-xs text-emerald-400 hover:text-emerald-300 px-1"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs text-slate-500 hover:text-slate-400"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <span
                            onDoubleClick={() => startEditing(k)}
                            className="font-medium text-slate-200 cursor-pointer hover:underline"
                            title="Double-click to rename"
                          >
                            {k.label || 'Unnamed Key'}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3 font-mono text-xs text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="select-all">
                          {isShowing ? resolvedKey : k.maskedKey || '••••••••'}
                        </span>
                        <button
                          onClick={() => toggleShowKey(k.id)}
                          className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors"
                          title={isShowing ? 'Hide key' : 'Show full key'}
                        >
                          {isShowing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>

                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase cursor-help transition-all ${statusBadgeClass}`}
                        title={k.lastError || `Status: ${k.status}`}
                      >
                        {k.status || 'untested'}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onTestKey(k.id)}
                          disabled={isTesting}
                          className="p-1.5 bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 rounded-md transition-all disabled:opacity-50"
                          title="Test key connection"
                        >
                          {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => copyToClipboard(k)}
                          className="p-1.5 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-400 rounded-md transition-all"
                          title={isCopied ? 'Copied!' : 'Copy API Key'}
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => startEditing(k)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-md transition-all"
                          title="Rename label"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onDeleteKey(k.id)}
                          className="p-1.5 bg-slate-800 hover:bg-rose-600 hover:text-white text-rose-400 rounded-md transition-all"
                          title="Delete API Key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
