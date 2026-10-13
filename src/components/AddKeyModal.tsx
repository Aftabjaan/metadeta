import React, { useState } from 'react';
import { X, Eye, EyeOff, AlertCircle, Key, Loader2, CheckCircle2 } from 'lucide-react';

interface AddKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (label: string, key: string) => Promise<boolean | void> | void;
  provider: string;
}

export const AddKeyModal: React.FC<AddKeyModalProps> = ({ isOpen, onClose, onAdd, provider }) => {
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Helper to extract clean key if user pasted KEY=value or with quotes
  const sanitizeKey = (raw: string): string => {
    let clean = raw.trim();
    // Strip wrapping quotes
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
      clean = clean.slice(1, -1).trim();
    }
    // If user pasted "GEMINI_API_KEY=AIza..." or similar
    if (clean.includes('=')) {
      const parts = clean.split('=');
      clean = parts[parts.length - 1].trim();
      if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
        clean = clean.slice(1, -1).trim();
      }
    }
    return clean;
  };

  const handleKeyChange = (val: string) => {
    setKey(val);
    if (error) setError(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const clean = sanitizeKey(key);
    if (!clean) {
      setError('Please paste or type your API key.');
      return;
    }

    if (clean.length < 10) {
      setError('The API key seems too short. Please verify your key.');
      return;
    }

    // Provider format validation hints
    if (provider === 'gemini' && !clean.startsWith('AIzaSy')) {
      // Warn or allow? Google keys almost always start with AIzaSy
      if (!clean.startsWith('AIza')) {
        setError('Notice: Google Gemini API keys typically start with "AIzaSy...". Please ensure you copied the entire key from Google AI Studio.');
      }
    } else if (provider === 'groq' && !clean.startsWith('gsk_')) {
      setError('Notice: Groq API keys typically start with "gsk_...". Please check your key from console.groq.com.');
      return;
    } else if (provider === 'openai' && !clean.startsWith('sk-')) {
      setError('Notice: OpenAI API keys typically start with "sk-...". Please check your key from platform.openai.com.');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanLabel = label.trim() || `${provider.toUpperCase()} Key (${clean.slice(-4)})`;
      await onAdd(cleanLabel, clean);
      setKey('');
      setLabel('');
      setError(null);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add API key. Please check the key and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getProviderHint = () => {
    switch (provider) {
      case 'gemini':
        return 'Get your free key from Google AI Studio (aistudio.google.com). Starts with AIzaSy...';
      case 'groq':
        return 'Get your ultra-fast key from console.groq.com. Starts with gsk_...';
      case 'openai':
        return 'Get your key from platform.openai.com. Starts with sk-...';
      default:
        return 'Paste your provider API key.';
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-950/50 text-blue-400 border border-blue-800/50 rounded-lg">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Add {provider.toUpperCase()} Key</h3>
              <p className="text-xs text-slate-400">Save and activate a new provider key</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
              Label <span className="text-slate-500 font-normal lowercase">(optional)</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
              placeholder={`e.g. My ${provider.toUpperCase()} Key`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
              API Key <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => handleKeyChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm pr-10 font-mono focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                placeholder={provider === 'gemini' ? 'AIzaSy...' : provider === 'groq' ? 'gsk_...' : 'sk-...'}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 p-1"
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">{getProviderHint()}</p>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-800 hover:bg-slate-900 text-slate-300 text-sm font-medium rounded-lg transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !key.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold py-2 rounded-lg text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                <span>Add Key</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
