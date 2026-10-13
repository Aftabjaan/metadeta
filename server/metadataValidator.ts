import { StockMetadata, KeywordItem, Marketplace, BackgroundAnalysis, TitleSettings, KeywordSettings } from '../src/types';
import { MARKETPLACE_PROFILES } from '../src/utils/platforms';
import { calculateSeoScore } from '../src/utils/seoEngine';
import { runAdobeSafetyCheck } from '../src/utils/adobeSafetyEngine';
import { cleanTitleOfCommonPhrases } from '../src/utils/metadataEngine';

const BANNED_FILLER_WORDS = new Set([
  'image', 'photo', 'picture', 'photography', 'stock', 'wallpaper',
  'high quality', 'hd', '4k', '8k', 'best', 'nice', 'great', 'awesome',
  'super', 'beautiful image', 'stock photo', 'generated', 'free', 'download',
  'ai', 'artificial intelligence', 'machine learning',
  'iso', 'shutter', 'aperture', 'f-stop', 'lens', 'megapixels', 'raw', 'dslr'
]);

const BANNED_BRANDS = new Set([
  'apple', 'iphone', 'ipad', 'macbook', 'samsung', 'galaxy', 'nike', 'adidas',
  'coca cola', 'pepsi', 'mcdonalds', 'starbucks', 'disney', 'marvel', 'lego',
  'sony', 'playstation', 'xbox', 'microsoft', 'google', 'facebook', 'instagram',
  'canon', 'nikon', 'fujifilm', 'leica', 'adobe', 'shutterstock', 'getty', 'alamy'
]);

// Terms that are often hallucinated in abstract/graphic contexts
const POTENTIALLY_UNSUPPORTED = new Set([
  'space', 'universe', 'science', 'technology', 'particle', 'cosmic', 
  'electric', 'medical', 'business', 'industry', 'success', 'growth', 'future'
]);

export function cleanKeyword(word: string): string {
  if (!word) return '';
  return word
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // remove special punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects if a keyword is an exact duplicate or trivial singular/plural variation.
 * Does NOT drop valid distinct phrases like "light streak", "light trail", "white light", "light curve".
 */
function isRedundant(word: string, existing: Set<string>): boolean {
  if (existing.has(word)) return true;
  
  // Check singular/plural direct duplicates
  if (word.endsWith('s') && existing.has(word.slice(0, -1))) return true;
  if (existing.has(word + 's')) return true;
  if (word.endsWith('es') && existing.has(word.slice(0, -2))) return true;
  if (existing.has(word + 'es')) return true;

  return false;
}

export function validateAndSanitizeMetadata(
  rawJson: any,
  options: {
    marketplace?: Marketplace;
    defaultAssetType?: any;
    defaultAiGenerated?: boolean;
    backgroundAnalysis?: BackgroundAnalysis;
    titleSettings?: TitleSettings;
    keywordSettings?: KeywordSettings;
  } = {}
): StockMetadata {
  const marketplace = options.marketplace || 'adobe';
  const profile = MARKETPLACE_PROFILES[marketplace] || MARKETPLACE_PROFILES.generic;
  const bg = options.backgroundAnalysis;

  // Gather initial text and keyword lists to discover visual context
  const rawKeywords: any[] = Array.isArray(rawJson?.keywords) ? rawJson.keywords : [];
  const rawTitle = typeof rawJson?.title === 'string' ? rawJson.title.trim() : '';
  const rawDesc = typeof rawJson?.description === 'string' ? rawJson.description.trim() : '';

  // Clean initial raw list of keywords for semantic analysis
  const initialWords = new Set<string>();
  rawKeywords.forEach(item => {
    let word = '';
    if (typeof item === 'string') word = cleanKeyword(item);
    else if (item && typeof item === 'object') word = cleanKeyword(item.word || item.tag || item.keyword || '');
    if (word) initialWords.add(word);
  });

  const fullSearchText = `${rawTitle.toLowerCase()} ${rawDesc.toLowerCase()} ${Array.from(initialWords).join(' ')}`;

  // ==========================================
  // DISCOVERING SPECIFIC VISUAL INDICATORS
  // ==========================================
  
  // 1. Simple Heart / Heartbeat Line Visuals
  const hasHeartVisual = initialWords.has('heart') || initialWords.has('heartbeat') || initialWords.has('pulse') || initialWords.has('ecg') || initialWords.has('ekg') || initialWords.has('cardio') || initialWords.has('pulse line') || fullSearchText.includes('heartbeat') || fullSearchText.includes('pulse line');

  // Explicit medical visuals indicators (must be physically visible, not merely associated)
  const hasExplicitMedicalVisuals = 
    fullSearchText.includes('stethoscope') || fullSearchText.includes('doctor') || fullSearchText.includes('nurse') ||
    fullSearchText.includes('syringe') || fullSearchText.includes('pill') || fullSearchText.includes('medicine') ||
    fullSearchText.includes('clinic') || fullSearchText.includes('hospital') || fullSearchText.includes('physician') ||
    fullSearchText.includes('laboratory') || fullSearchText.includes('surgeon') ||
    Array.from(initialWords).some(w => ['stethoscope', 'doctor', 'nurse', 'syringe', 'pill', 'medicine', 'clinic', 'hospital', 'physician', 'laboratory', 'surgeon'].includes(w));

  // Explicit romance visuals indicators (must be physically visible, not merely associated)
  const hasExplicitRomanceVisuals =
    fullSearchText.includes('couple') || fullSearchText.includes('kiss') || fullSearchText.includes('romantic couple') ||
    fullSearchText.includes('relationship') || fullSearchText.includes('wedding') || fullSearchText.includes('rose') ||
    fullSearchText.includes('valentines day') || fullSearchText.includes('marriage') ||
    Array.from(initialWords).some(w => ['couple', 'kiss', 'relationship', 'wedding', 'rose', 'valentines', 'marriage'].includes(w));

  // 2. Abstract / Graphic Background Visuals
  const isAbstractBackground = 
    rawJson?.assetType === 'abstract' || rawJson?.assetType === 'background' || rawJson?.assetType === 'pattern' ||
    initialWords.has('abstract') || initialWords.has('background') || initialWords.has('pattern') || initialWords.has('texture') || initialWords.has('gradient') || initialWords.has('wave') || initialWords.has('lines');

  // Explicit business/office indicators (must be physically visible, not merely associated)
  const isGenericBusinessText = 
    fullSearchText.includes('office') || fullSearchText.includes('meeting') || fullSearchText.includes('businessperson') || fullSearchText.includes('handshake') || fullSearchText.includes('desk') || fullSearchText.includes('corporate meeting');

  // Explicit space/astronomy indicators
  const hasSpaceVisuals = 
    fullSearchText.includes('telescope') || fullSearchText.includes('astronaut') || fullSearchText.includes('planet') || fullSearchText.includes('galaxy') || fullSearchText.includes('nebula') || fullSearchText.includes('rocket');

  // ==========================================
  // PHASE 1: TITLE VALIDATION
  // ==========================================
  let title = rawTitle;
  title = title.replace(/\s+/g, ' ');

  // Clean of common stock template phrases
  if (options.titleSettings) {
    title = cleanTitleOfCommonPhrases(title);
  }

  // Correct transparent PNG title mistakes automatically if AI hallucinated white background
  if (bg?.isTransparent) {
    title = title
      .replace(/\bisolated on white background\b/gi, 'isolated on transparent background')
      .replace(/\bon white background\b/gi, 'isolated on transparent background')
      .replace(/\bwhite background\b/gi, 'transparent background')
      .replace(/\bisolated on white\b/gi, 'isolated on transparent background');
  }

  // Remove unsupported semantic concepts from Title based on strict visible content rules
  if (hasHeartVisual) {
    if (!hasExplicitMedicalVisuals) {
      title = title.replace(/\b(medical|healthcare|cardiology|cardiac|patient|clinical|diagnosis|treatment|health|ekg|ecg|hospital|clinic|doctor|nurse|emergency|medicine|care)\b/gi, '');
    }
    if (!hasExplicitRomanceVisuals) {
      title = title.replace(/\b(romance|love|anniversary|valentines day|valentine|romantic|wedding|marriage|relationship|dating)\b/gi, '');
    }
  }

  if (isAbstractBackground) {
    if (!isGenericBusinessText) {
      title = title.replace(/\b(business|success|growth|future|marketing|strategy|finance|corporate|industry|office|meeting)\b/gi, '');
    }
    if (!hasSpaceVisuals) {
      title = title.replace(/\b(space|universe|science|technology|particle|cosmic|electric|energy|astronomy|galaxy|celestial|nebula)\b/gi, '');
    }
  }

  // Clean up any double spaces/hanging commas from replacements
  title = title.replace(/[\s,]+/g, ' ').trim();

  // Handle Dynamic Title Limit
  let titleLimit = profile.titleMaxLength || 200;
  const ts = options.titleSettings;
  if (ts?.maxLength) {
    titleLimit = ts.maxLength;
  } else if (marketplace === 'adobe') {
    titleLimit = 200;
  }

  if (title.length > titleLimit) {
    const truncated = title.slice(0, titleLimit);
    const lastSpace = truncated.lastIndexOf(' ');
    title = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
  }

  if (!title && rawTitle) {
    title = rawTitle;
  }

  // ==========================================
  // PHASE 2: DESCRIPTION VALIDATION
  // ==========================================
  let description = rawDesc;
  description = description.replace(/\s+/g, ' ');

  if (bg?.isTransparent && description) {
    description = description
      .replace(/\bisolated on white background\b/gi, 'isolated on transparent background')
      .replace(/\bon white background\b/gi, 'isolated on transparent background')
      .replace(/\bwhite background\b/gi, 'transparent background')
      .replace(/\bisolated on white\b/gi, 'isolated on transparent background');
  }

  // Remove unsupported semantic concepts from Description
  if (hasHeartVisual) {
    if (!hasExplicitMedicalVisuals) {
      description = description.replace(/\b(medical|healthcare|cardiology|cardiac|patient|clinical|diagnosis|treatment|health|ekg|ecg|hospital|clinic|doctor|nurse|emergency|medicine|care)\b/gi, '');
    }
    if (!hasExplicitRomanceVisuals) {
      description = description.replace(/\b(romance|love|anniversary|valentines day|valentine|romantic|wedding|marriage|relationship|dating)\b/gi, '');
    }
  }

  if (isAbstractBackground) {
    if (!isGenericBusinessText) {
      description = description.replace(/\b(business|success|growth|future|marketing|strategy|finance|corporate|industry|office|meeting)\b/gi, '');
    }
    if (!hasSpaceVisuals) {
      description = description.replace(/\b(space|universe|science|technology|particle|cosmic|electric|energy|astronomy|galaxy|celestial|nebula)\b/gi, '');
    }
  }

  description = description.replace(/[\s,]+/g, ' ').trim();

  if (!description && title) {
    description = title;
  }

  // ==========================================
  // PHASES 3 & 4 & 5: KEYWORD RELEVANCE, DUPLICATES, & UNSUPPORTED REMOVAL
  // ==========================================
  const MEDICAL_UNSUPPORTED = new Set(['medical', 'healthcare', 'hospital', 'doctor', 'cardiology', 'cardiac', 'patient', 'clinical', 'diagnosis', 'treatment', 'health', 'ekg', 'ecg', 'medicine', 'care', 'emergency', 'wellness', 'physician', 'laboratory', 'surgeon', 'clinic', 'nurse']);
  const ROMANCE_UNSUPPORTED = new Set(['romance', 'love', 'anniversary', 'valentines day', 'valentine', 'romantic', 'wedding', 'marriage', 'relationship', 'dating']);
  const BUSINESS_UNSUPPORTED = new Set(['business', 'success', 'growth', 'future', 'marketing', 'strategy', 'finance', 'corporate', 'industry', 'office', 'meeting']);
  const SPACE_UNSUPPORTED = new Set(['space', 'universe', 'science', 'technology', 'particle', 'cosmic', 'electric', 'energy', 'astronomy', 'galaxy', 'celestial', 'nebula']);

  const sanitizedKeywords: KeywordItem[] = [];
  const seenWords = new Set<string>();
  const stemCount: Record<string, number> = {};

  rawKeywords.forEach((item, index) => {
    let word = '';
    let score = 80;
    let priority: 'primary' | 'secondary' | 'supporting' = 'secondary';

    if (typeof item === 'string') {
      word = cleanKeyword(item);
      score = Math.max(50, 95 - index);
      priority = index < 10 ? 'primary' : index < 25 ? 'secondary' : 'supporting';
    } else if (item && typeof item === 'object') {
      word = cleanKeyword(item.word || item.tag || item.keyword || '');
      score = typeof item.score === 'number' ? Math.min(100, Math.max(0, item.score)) : 80;
      if (item.priority === 'primary' || item.priority === 'secondary' || item.priority === 'supporting') {
        priority = item.priority;
      } else {
        priority = index < 10 ? 'primary' : index < 25 ? 'secondary' : 'supporting';
      }
    }

    if (bg?.isTransparent && (word === 'white background' || word === 'isolated on white')) {
      word = 'transparent background';
    }

    if (!word || word.length < 2 || word.length > 50) return;
    
    // Phase 4: Duplicate and redundant check
    if (seenWords.has(word)) return;
    if (isRedundant(word, seenWords)) return;

    if (BANNED_FILLER_WORDS.has(word)) return;
    if (BANNED_BRANDS.has(word)) return;

    // Phase 3 & 5: Keyword Relevance check & Unsupported Keyword Removal
    // Remove medical keywords if simple heart/heartbeat visual and no explicit medical indicators
    if (hasHeartVisual && MEDICAL_UNSUPPORTED.has(word) && !hasExplicitMedicalVisuals) {
      return; // Discard questionable keyword
    }

    // Remove romance keywords if simple heart/heartbeat visual and no explicit romance indicators
    if (hasHeartVisual && ROMANCE_UNSUPPORTED.has(word) && !hasExplicitRomanceVisuals) {
      return; // Discard questionable keyword
    }

    // Remove business keywords if abstract background and no explicit business indicators
    if (isAbstractBackground && BUSINESS_UNSUPPORTED.has(word) && !isGenericBusinessText) {
      return; // Discard questionable keyword
    }

    // Remove space keywords if abstract background and no explicit space indicators
    if (isAbstractBackground && SPACE_UNSUPPORTED.has(word) && !hasSpaceVisuals) {
      return; // Discard questionable keyword
    }

    // Stem repetition control (Spam prevention)
    const stems = word.split(' ');
    let isSpammy = false;
    for (const s of stems) {
      if (s.length > 3) {
        if ((stemCount[s] || 0) >= 4) {
          isSpammy = true;
          break;
        }
      }
    }
    if (isSpammy) return;

    for (const s of stems) {
      if (s.length > 3) stemCount[s] = (stemCount[s] || 0) + 1;
    }

    seenWords.add(word);
    sanitizedKeywords.push({ word, score, priority });
  });

  const targetCount = Math.min(options.keywordSettings?.targetCount || 30, 49);

  // Enrichment step (only if sanitizedKeywords is below target count and terms are fully verified)
  if (sanitizedKeywords.length < targetCount) {
    const textSources = `${title} ${description}`;
    const wordTokens = textSources
      .toLowerCase()
      .split(/[\s,.\-:_/()]+/)
      .map(w => cleanKeyword(w))
      .filter(w => w.length >= 3);

    for (const w of wordTokens) {
      if (sanitizedKeywords.length >= targetCount) break;
      if (!w || isRedundant(w, seenWords) || BANNED_FILLER_WORDS.has(w) || BANNED_BRANDS.has(w)) continue;
      
      // Ensure enriched words are also clean of unsupported associations
      if (hasHeartVisual && MEDICAL_UNSUPPORTED.has(w) && !hasExplicitMedicalVisuals) continue;
      if (hasHeartVisual && ROMANCE_UNSUPPORTED.has(w) && !hasExplicitRomanceVisuals) continue;
      if (isAbstractBackground && BUSINESS_UNSUPPORTED.has(w) && !isGenericBusinessText) continue;
      if (isAbstractBackground && SPACE_UNSUPPORTED.has(w) && !hasSpaceVisuals) continue;

      seenWords.add(w);
      sanitizedKeywords.push({
        word: w,
        score: 70,
        priority: 'supporting'
      });
    }

    // Try to split multi-word keywords
    if (sanitizedKeywords.length < targetCount) {
      const existingPhrases = [...sanitizedKeywords];
      for (const item of existingPhrases) {
        if (sanitizedKeywords.length >= targetCount) break;
        const phrase = item.word;
        if (phrase.includes(' ')) {
          const parts = phrase.split(' ');
          for (const part of parts) {
            if (sanitizedKeywords.length >= targetCount) break;
            const w = cleanKeyword(part);
            if (w && w.length >= 3 && !isRedundant(w, seenWords) && !BANNED_FILLER_WORDS.has(w) && !BANNED_BRANDS.has(w)) {
              if (hasHeartVisual && MEDICAL_UNSUPPORTED.has(w) && !hasExplicitMedicalVisuals) continue;
              if (hasHeartVisual && ROMANCE_UNSUPPORTED.has(w) && !hasExplicitRomanceVisuals) continue;
              if (isAbstractBackground && BUSINESS_UNSUPPORTED.has(w) && !isGenericBusinessText) continue;
              if (isAbstractBackground && SPACE_UNSUPPORTED.has(w) && !hasSpaceVisuals) continue;

              seenWords.add(w);
              sanitizedKeywords.push({
                word: w,
                score: 65,
                priority: 'supporting'
              });
            }
          }
        }
      }
    }
  }

  // ==========================================
  // PHASE 6: ADOBE STOCK METADATA VALIDATION
  // ==========================================
  // Prioritize top 10 keywords and assign proper algorithmic scores
  sanitizedKeywords.forEach((k, idx) => {
    if (idx < 10) {
      k.priority = 'primary';
      k.score = Math.max(k.score, 95 - idx);
    } else if (idx < 25) {
      k.priority = 'secondary';
      k.score = Math.max(k.score, 85 - idx);
    } else {
      k.priority = 'supporting';
      k.score = Math.max(k.score, 70 - Math.min(30, idx));
    }
  });

  const finalKeywords = sanitizedKeywords.slice(0, targetCount);

  // Category validation
  let category = typeof rawJson?.category === 'string' ? rawJson.category.trim() : '';
  if (!profile.allowedCategories.includes(category)) {
    const matched = profile.allowedCategories.find((c) => c.toLowerCase() === category.toLowerCase());
    category = matched || profile.allowedCategories[0] || 'General';
  }

  // Orientation validation
  const validOrientations = ['horizontal', 'vertical', 'square', 'panoramic'];
  const orientation = validOrientations.includes(rawJson?.orientation) ? rawJson.orientation : 'horizontal';

  // Asset type validation
  const validAssetTypes = ['photo', 'vector', 'illustration', '3d_render', 'png', 'background', 'icon', 'wallpaper', 'pattern', 'abstract'];
  const assetType = validAssetTypes.includes(rawJson?.assetType)
    ? rawJson.assetType
    : options.defaultAssetType || 'photo';

  const aiGenerated =
    typeof rawJson?.aiGenerated === 'boolean'
      ? rawJson.aiGenerated
      : Boolean(options.defaultAiGenerated);
  const partialMetadata: StockMetadata = {
    title,
    keywords: finalKeywords,
    category,
    assetType,
    orientation,
    aiGenerated,
    seoScore: 0,
    backgroundAnalysis: bg,
    titleSettings: options.titleSettings,
  };

  if (!title && (!finalKeywords || finalKeywords.length === 0)) {
    throw new Error('AI model returned empty or invalid metadata format. Please verify your API key limits and image contents.');
  }

  const adobeSafety = runAdobeSafetyCheck(partialMetadata, bg, marketplace);
  partialMetadata.adobeSafety = adobeSafety;

  // ==========================================
  // PHASE 7: SEO SCORE CALCULATION
  // ==========================================
  // SEO score is strictly computed AFTER keyword verification and pruning.
  const seoBreakdown = calculateSeoScore(partialMetadata, marketplace, bg);
  partialMetadata.seoScore = seoBreakdown.score;
  partialMetadata.seoBreakdown = seoBreakdown;

  return partialMetadata;
}
