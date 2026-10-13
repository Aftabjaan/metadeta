import React, { useState, useEffect } from 'react';
import {
  Search,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Zap,
  Globe,
  Tag,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Flame,
} from 'lucide-react';
import { Marketplace, SearchTrend } from '../types';
import { MARKETPLACE_PROFILES } from '../utils/platforms';
import { calculateSeoScore } from '../utils/seoEngine';

export const SeoFinderView: React.FC = () => {
  const [marketplace, setMarketplace] = useState<Marketplace>('adobe');
  const [title, setTitle] = useState(
    'Young woman working on laptop at cozy cafe table with cup of coffee in warm morning sunlight'
  );
  const [keywordsText, setKeywordsText] = useState(
    'woman, laptop, cafe, coffee, working, technology, morning, freelance, lifestyle, modern, student, work, business, cup, indoor, young, caucasian, smiling, happy, internet'
  );
  const [copied, setCopied] = useState(false);
  const [trends, setTrends] = useState<SearchTrend[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(true);
  const [refreshingTrends, setRefreshingTrends] = useState(false);

  const profile = MARKETPLACE_PROFILES[marketplace] || MARKETPLACE_PROFILES.generic;

  const fetchTrends = async (isManual = false) => {
    if (isManual) setRefreshingTrends(true);
    else setLoadingTrends(true);
    
    try {
      const res = await fetch('/api/trends');
      const data = await res.json();
      if (data.trends && Array.isArray(data.trends)) {
        setTrends(data.trends);
      }
    } catch (err) {
      console.error('Error fetching trends:', err);
    } finally {
      setLoadingTrends(false);
      setRefreshingTrends(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, []);

  const rawKeywords = keywordsText
    .split(/[,;\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  const handleAddKeyword = (word: string) => {
    if (!rawKeywords.includes(word.toLowerCase())) {
      const newText = keywordsText.trim() ? `${keywordsText.trim()}, ${word}` : word;
      setKeywordsText(newText);
    }
  };

  const keywordsList = rawKeywords.map((w, idx) => ({
    word: w,
    score: 80,
    priority: (idx < 10 ? 'primary' : idx < 25 ? 'secondary' : 'supporting') as any,
  }));

  const seoResult = calculateSeoScore(
    {
      title,
      keywords: keywordsList,
      category: 'Lifestyle',
      assetType: 'photo',
      orientation: 'horizontal',
      aiGenerated: false,
      seoScore: 0,
    },
    marketplace
  );

  const handleCopyCleaned = () => {
    navigator.clipboard.writeText(rawKeywords.join(', '));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Title & Introduction */}
      <div className="glass-panel p-6 sm:p-8 shadow-xl space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/80 border border-blue-200 text-blue-700 text-xs font-semibold">
          <Search className="w-3.5 h-3.5" />
          Stock Search Engine Optimization Auditor
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-sans">
          Microstock SEO Keyword & Title Analyzer
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
          Test your titles and keyword tags against the ranking rules of Adobe Stock.
          Identify keyword stuffing, weak initial tags, missing subject
          nouns, and non-compliance before uploading.
        </p>
      </div>

      {/* Target Marketplace Selector (Static Adobe Stock) */}
      <div className="flex items-center gap-2 flex-wrap glass-panel p-2">
        <span className="text-xs font-bold text-slate-600 px-2 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-blue-500" />
          Audit Ruleset:
        </span>
        <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-md shadow-blue-500/20 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          Adobe Stock Only
        </span>
      </div>

      {/* Main Grid: Input Form vs Live Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Inputs (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Title Tester */}
          <div className="glass-panel p-5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans">
                Stock Title
              </label>
              <span className="text-xs font-mono text-slate-500">
                {title.length} / {profile.titleMaxLength} chars
              </span>
            </div>
            <textarea
              rows={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs font-medium rounded-xl bg-white/60 border border-slate-300 p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              placeholder="Paste or type stock title..."
            />
          </div>

          {/* Keywords Tester */}
          <div className="glass-panel p-5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans">
                Comma-Separated Keywords ({rawKeywords.length} / {profile.maxKeywords})
              </label>
              <button
                type="button"
                onClick={handleCopyCleaned}
                className="text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1 font-semibold"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Clean List
              </button>
            </div>
            <textarea
              rows={5}
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              className="w-full text-xs font-mono rounded-xl bg-white/60 border border-slate-300 p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              placeholder="sunset, beach, ocean, landscape, nature, dusk..."
            />
          </div>

          {/* First 10 Tags (Adobe Algorithm Simulation) */}
          <div className="glass-panel p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5 font-sans">
                <Tag className="w-3.5 h-3.5" />
                Adobe Stock Top 10 Weighting Preview
              </span>
              <span className="text-[11px] text-slate-500">Most critical ranking factors</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
              Adobe Stock weights the initial 5 to 10 keywords with massive priority. If your primary
              subjects are not in this top 10, your asset may not rank on page 1:
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {rawKeywords.slice(0, 10).map((k, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 font-mono text-xs"
                >
                  <strong className="text-blue-900 mr-1">#{i + 1}</strong>
                  {k}
                </span>
              ))}
              {rawKeywords.length === 0 && (
                <span className="text-xs text-slate-400 italic">No keywords entered.</span>
              )}
            </div>
          </div>
        </div>

        {/* Right SEO Score & Audit Checks (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Main Score Card */}
          <div className="glass-panel p-6 text-center space-y-3 shadow-xl">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 font-sans">
              Audit SEO Score
            </div>
            <div
              className={`w-24 h-24 rounded-3xl mx-auto flex items-center justify-center font-mono font-black text-4xl shadow-inner ${
                seoResult.score >= 90
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300/60'
                  : seoResult.score >= 75
                  ? 'bg-blue-50 text-blue-700 border border-blue-300/60'
                  : 'bg-amber-50 text-amber-700 border border-amber-300/60'
              }`}
            >
              {seoResult.score}
            </div>
            <div>
              <div className="text-base font-bold text-slate-800 font-sans">{seoResult.grade} Rating</div>
              <div className="text-xs text-slate-500">
                Benchmarked for {profile.name} microstock guidelines
              </div>
            </div>
          </div>

          {/* Breakdown Checks */}
          <div className="glass-panel p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans">
              Audit Checklist
            </h4>
            <div className="space-y-2">
              {seoResult.checks.map((check, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                    check.passed
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-amber-200 bg-amber-50/50'
                  }`}
                >
                  {check.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <strong className={check.passed ? 'text-emerald-800' : 'text-amber-800'}>
                      {check.label}
                    </strong>
                    <p className="text-[11px] text-slate-600 mt-0.5">{check.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          {seoResult.recommendations.length > 0 && (
            <div className="glass-panel p-5 space-y-2">
              <h4 className="text-xs font-bold text-amber-700 flex items-center gap-1.5 font-sans">
                <Zap className="w-4 h-4" />
                Suggested Optimizations:
              </h4>
              <ul className="space-y-1 text-xs text-slate-700 list-disc list-inside font-sans">
                {seoResult.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Global Rising Trends - Assisting Keyword Research */}
      <div className="space-y-6 pt-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-orange-50 text-orange-600 border border-orange-100 shadow-sm">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight font-sans">
                Global Rising Stock Search Trends
              </h3>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                Grounding: Gemini 2.0 Flash + Google Search
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchTrends(true)}
            disabled={refreshingTrends || loadingTrends}
            className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-500 transition-all active:scale-95 disabled:opacity-50"
            title="Refresh trends"
          >
            <RefreshCw className={`w-4 h-4 ${refreshingTrends ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loadingTrends ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
            ))}
          </div>
        ) : trends.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {trends.map((trend, idx) => (
              <div
                key={idx}
                className="group relative glass-panel p-5 hover:border-orange-400 hover:ring-4 hover:ring-orange-400/5 transition-all duration-300 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-black text-slate-900 font-sans leading-tight group-hover:text-orange-700 transition-colors">
                      {trend.topic}
                    </span>
                    <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-black border border-orange-200 shadow-sm">
                      <Flame className="w-2.5 h-2.5" />
                      {trend.growth}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed italic">
                    "{trend.description}"
                  </p>
                </div>

                <div className="mt-5 space-y-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {trend.keywords.slice(0, 3).map((kw, kidx) => (
                      <button
                        key={kidx}
                        onClick={() => handleAddKeyword(kw)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[10px] font-bold hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition-all group/kw active:scale-95 shadow-sm"
                      >
                        <Plus className="w-2.5 h-2.5 text-slate-400 group-hover/kw:text-emerald-500" />
                        {kw}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center space-y-2">
            <Sparkles className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500 italic">No rising trends detected at this moment. Try refreshing.</p>
          </div>
        )}
      </div>
    </div>
  );
};
