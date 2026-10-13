import { StockMetadata, SeoBreakdown, SeoCheck, Marketplace, QualityCategoryScore, BackgroundAnalysis } from '../types';
import { MARKETPLACE_PROFILES } from './platforms';
import { runAdobeSafetyCheck } from './adobeSafetyEngine';

export function calculateSeoScore(
  metadata: Partial<StockMetadata>,
  platform: Marketplace = 'adobe',
  backgroundAnalysis?: BackgroundAnalysis
): SeoBreakdown {
  const profile = MARKETPLACE_PROFILES[platform] || MARKETPLACE_PROFILES.generic;
  const checks: SeoCheck[] = [];
  const recommendations: string[] = [];

  const title = (metadata.title || '').trim();
  const keywords = metadata.keywords || [];
  const bg = backgroundAnalysis || metadata.backgroundAnalysis;

  const keywordStrings = keywords
    .map((k) => (typeof k === 'string' ? k : k.word).toLowerCase().trim())
    .filter(Boolean);

  // 1. Title Accuracy & Search Relevance (max 20)
  let titleScore = 20;
  if (!title) {
    titleScore = 0;
    checks.push({
      label: 'Title exists',
      passed: false,
      tip: 'Provide an accurate, descriptive commercial title.',
      category: 'title',
    });
    recommendations.push('Title is missing. Stock agencies require an accurate title.');
  } else {
    const effectiveTitleMax = (() => {
      const ts = metadata.titleSettings;
      if (ts?.maxLength) return ts.maxLength;
      if (platform === 'adobe') return 200;
      return profile.titleMaxLength;
    })();

    if (title.length < profile.titleMinLength) {
      titleScore -= 10;
      checks.push({
        label: `Minimum title length (${profile.titleMinLength} chars)`,
        passed: false,
        tip: `Title is too short (${title.length} chars).`,
        category: 'title',
      });
    } else if (title.length > effectiveTitleMax) {
      titleScore -= 5;
      checks.push({
        label: `Title within limit (max ${effectiveTitleMax} chars)`,
        passed: false,
        tip: `Title is ${title.length} chars.`,
        category: 'title',
      });
    }

    // Comma keyword stuffing in title
    const commaCount = (title.match(/,/g) || []).length;
    if (commaCount > 1) {
      titleScore -= 10;
      checks.push({
        label: 'Natural title phrasing',
        passed: false,
        tip: 'Avoid keyword stuffing or comma lists in titles.',
        category: 'title',
      });
    }
  }

  // 2. Keyword Quality & Priority Order (max 30)
  // Higher weight on first 10 keywords for Adobe Stock
  let keywordScore = 30;
  if (keywordStrings.length === 0) {
    keywordScore = 0;
  } else {
    // Volume check: 25-35 highly relevant keywords is the optimal sweet spot for Adobe Stock ranking.
    if (keywordStrings.length >= 25 && keywordStrings.length <= 35) {
      checks.push({
        label: 'Optimal keyword volume (25-35 tags)',
        passed: true,
        tip: 'Perfect tag count. Prioritizes visual relevance and avoids search rank dilution.',
        category: 'keywords',
      });
    } else if (keywordStrings.length > 35) {
      // High count is allowed but gets a slight tip advising that relevance is higher priority than count
      checks.push({
        label: 'High keyword volume (35+ tags)',
        passed: true,
        tip: 'A large number of tags. Ensure every keyword is strictly visible to prevent search penalties.',
        category: 'keywords',
      });
    } else {
      keywordScore -= 10;
      checks.push({
        label: 'Healthy keyword volume (15+ tags)',
        passed: false,
        tip: `Only ${keywordStrings.length} tags. Provide at least 15-25 highly relevant keywords for maximum discoverability.`,
        category: 'keywords',
      });
    }

    // First 10 quality check
    const top10 = keywordStrings.slice(0, 10);
    const fillerInTop10 = top10.filter(k => 
      ['the', 'and', 'with', 'for', 'of', 'a', 'an', 'is', 'are', 'in', 'on', 'to'].includes(k)
    );
    if (fillerInTop10.length > 0) {
      keywordScore -= 10;
      checks.push({
        label: 'Strong First 10 Keywords',
        passed: false,
        tip: 'Top 10 keywords contain filler words. Move them or replace with core terms.',
        category: 'keywords',
      });
    } else {
      checks.push({
        label: 'Strong First 10 Keywords',
        passed: true,
        tip: 'Top 10 keywords are clean and prioritize core search terms.',
        category: 'keywords',
      });
    }

    // Diversity check
    const uniqueStems = new Set(keywordStrings.flatMap(k => k.split(' ')));
    if (uniqueStems.size < keywordStrings.length * 0.6) {
      keywordScore -= 5;
      checks.push({
        label: 'Keyword diversity',
        passed: false,
        tip: 'Too much repetition of the same words in phrases.',
        category: 'keywords',
      });
    }
  }

  // 3. Duplicate Detection (max 15)
  let duplicatesScore = 15;
  const uniqueKeywords = new Set(keywordStrings);
  const duplicateCount = keywordStrings.length - uniqueKeywords.size;
  if (duplicateCount > 0) {
    duplicatesScore = 0;
    checks.push({
      label: 'Zero duplicate keywords',
      passed: false,
      tip: `Found ${duplicateCount} duplicate keyword(s).`,
      category: 'keywords',
    });
  }

  // 4. Background Accuracy (max 15)
  let backgroundScore = 15;
  if (bg) {
    const mentionsWhite = title.toLowerCase().includes('white background') || keywordStrings.includes('white background');
    const mentionsTransparent = title.toLowerCase().includes('transparent') || keywordStrings.includes('transparent background');

    if (bg.isTransparent && mentionsWhite) {
      backgroundScore = 0;
      checks.push({ label: 'Background match', passed: false, tip: 'Transparent image labeled as white background.', category: 'platform' });
    } else if (!bg.isTransparent && bg.backgroundType === 'white' && mentionsTransparent) {
      backgroundScore = 0;
      checks.push({ label: 'Background match', passed: false, tip: 'Opaque image labeled as transparent.', category: 'platform' });
    }
  }

  // 5. Adobe Safety & Rules (max 20)
  let safetyScore = 20;
  const safetyResult = runAdobeSafetyCheck(metadata, bg, platform);
  if (safetyResult.status === 'BLOCK') {
    safetyScore = 0;
    checks.push({ label: 'Adobe Safety: SAFE', passed: false, tip: safetyResult.summary, category: 'platform' });
  } else if (safetyResult.status === 'WARNING') {
    safetyScore = 10;
    checks.push({ label: 'Adobe Safety: SAFE', passed: true, tip: safetyResult.summary, category: 'platform' });
  }

  const finalScore = Math.max(0, Math.min(100, titleScore + keywordScore + duplicatesScore + backgroundScore + safetyScore));
  
  let rating: SeoBreakdown['rating'] = 'Poor';
  if (finalScore >= 90) rating = 'Excellent';
  else if (finalScore >= 75) rating = 'Good';
  else if (finalScore >= 50) rating = 'Needs Improvement';

  const categoryScores: QualityCategoryScore[] = [
    { name: 'Title Relevance', score: titleScore, max: 20 },
    { name: 'Keyword Quality', score: keywordScore, max: 30 },
    { name: 'Duplicate Check', score: duplicatesScore, max: 15 },
    { name: 'Background Accuracy', score: backgroundScore, max: 15 },
    { name: 'Adobe Safety', score: safetyScore, max: 20 },
  ];

  return {
    score: finalScore,
    rating,
    categoryScores,
    checks,
    recommendations,
  };
}
