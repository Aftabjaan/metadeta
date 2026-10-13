import {
  StockMetadata,
  Marketplace,
  AdobeSafetyCheckResult,
  AdobeSafetyIssue,
  AdobeSafetyStatus,
  BackgroundAnalysis,
} from '../types';

export interface SafetyCheckContext {
  isDuplicate?: boolean;
  duplicateOfFilename?: string;
  duplicateReason?: string;
  visualSimilarityLevel?: string;
  visualSimilarityScore?: number;
  visualSimilarityDetails?: string;
}

// Comprehensive Banned Trademarks & Brand Names for Stock Contributor Safety
const TRADEMARK_TERMS = new Set([
  'apple', 'iphone', 'ipad', 'ipod', 'macbook', 'imac', 'airpods', 'apple watch', 'ios',
  'samsung', 'galaxy', 'nike', 'adidas', 'puma', 'reebok', 'under armour', 'gucci', 'prada', 'louis vuitton',
  'coca cola', 'cocacola', 'coke', 'pepsi', 'mcdonalds', 'mcdonald', 'burger king', 'starbucks', 'kfc',
  'disney', 'pixar', 'marvel', 'dc comics', 'lego', 'barbie', 'mattel', 'hasbro',
  'sony', 'playstation', 'ps4', 'ps5', 'xbox', 'microsoft', 'nintendo', 'switch', 'gameboy',
  'pokemon', 'pokémon', 'pikachu', 'mario', 'super mario', 'zelda', 'sonic', 'spider-man', 'spiderman', 'batman', 'superman', 'iron man',
  'google', 'facebook', 'meta', 'instagram', 'whatsapp', 'tiktok', 'twitter', 'youtube', 'snapchat', 'linkedin', 'pinterest',
  'canon', 'nikon', 'gopro', 'red bull', 'tesla', 'bmw', 'mercedes', 'audi', 'ferrari', 'lamborghini', 'porsche', 'ford', 'chevrolet',
  'photoshop', 'illustrator', 'lightroom', 'adobe stock', 'shutterstock', 'freepik', 'midjourney', 'stable diffusion', 'dall-e', 'chatgpt'
]);

// Famous Artists & Mimicry Stems (Strictly Prohibited by Stock Quality Guidelines)
const ARTIST_NAMES = new Set([
  'picasso', 'van gogh', 'da vinci', 'monet', 'rembrandt', 'salvador dali', 'dali', 'andy warhol', 'warhol',
  'greg rutkowski', 'artgerm', 'alphonse mucha', 'mucha', 'wlop', 'rossdraws', 'ilya kuvshinov'
]);

// Celebrity / Real Named Figures
const CELEBRITY_TERMS = new Set([
  'elon musk', 'trump', 'donald trump', 'biden', 'joe biden', 'obama', 'barack obama',
  'taylor swift', 'beyonce', 'messi', 'ronaldo', 'michael jackson', 'einstein', 'steve jobs'
]);

// Often hallucinated or irrelevant concepts that trigger Adobe Stock rejections
const POTENTIALLY_UNSUPPORTED = new Set([
  'space', 'universe', 'science', 'technology', 'particle', 'cosmic', 
  'electric', 'medical', 'business', 'industry', 'success', 'growth', 'future'
]);

// Generic stock spam tags
const BANNED_GENERIC_SPAM = new Set([
  'hd', '4k', '8k', 'wallpaper', 'high quality', 'best photo', 'free download', 'download', 'buy photo',
  'best', 'nice', 'great', 'awesome', 'super', 'stock photo', 'stock image', 'generated'
]);

const TECHNICAL_TERMS = new Set([
  'canon', 'nikon', 'sony', 'fujifilm', 'leica', 'iso', 'shutter', 'aperture', 'lens', 'f-stop',
  '4k', '8k', 'hd', 'high res', 'high resolution', 'dpi', 'megapixels', 'raw', 'dslr', 'mirrorless',
  'shutter speed', 'focal length', 'exposure', 'sharpness', 'bokeh'
]);

const FILE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.psd', '.eps', '.ai', '.svg', '.tiff', '.raw', '.dng']);

/**
 * Normalizes a string for comparison.
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects if two keywords are near-duplicates (e.g. singular/plural).
 */
function isNearDuplicate(kw1: string, kw2: string): boolean {
  if (kw1 === kw2) return false;
  const s1 = kw1.toLowerCase().trim();
  const s2 = kw2.toLowerCase().trim();
  
  // Basic pluralization/singularization
  if (s1 === s2 + 's' || s2 === s1 + 's') return true;
  if (s1 === s2 + 'es' || s2 === s1 + 'es') return true;
  
  // Very minor suffixes/variations for longer words
  if (s1.length > 6 && s2.length > 6) {
    if (s1.includes(s2) && s1.length - s2.length <= 2) return true;
    if (s2.includes(s1) && s2.length - s1.length <= 2) return true;
  }
  
  return false;
}

/**
 * Evaluates stock metadata against microstock and Adobe Stock submission criteria.
 */
export function runAdobeSafetyCheck(
  metadata: Partial<StockMetadata>,
  backgroundAnalysis?: BackgroundAnalysis,
  marketplace: Marketplace = 'adobe',
  context?: SafetyCheckContext
): AdobeSafetyCheckResult {
  const issues: AdobeSafetyIssue[] = [];
  const title = (metadata.title || '').trim();
  const description = '';
  const keywords = metadata.keywords || [];

  const normTitle = normalizeString(title);
  const normDesc = normalizeString(description);

  const keywordStrings = keywords
    .map((k) => (typeof k === 'string' ? k : k.word).toLowerCase().trim())
    .filter(Boolean);

  // 0. DUPLICATE & VISUAL SIMILARITY SAFETY CHECKS
  if (context?.isDuplicate) {
    issues.push({
      type: 'duplicate',
      severity: 'warning',
      field: 'general',
      message: context.duplicateReason || 'Exact duplicate file detected in this batch.',
      remedy: 'Remove duplicate file or keep both if intentional.',
      detectedWords: context.duplicateOfFilename ? [context.duplicateOfFilename] : undefined,
    });
  } else if (
    context?.visualSimilarityLevel === 'HIGH_SIMILARITY' ||
    (context?.visualSimilarityScore && context.visualSimilarityScore >= 85)
  ) {
    issues.push({
      type: 'similarity',
      severity: 'warning',
      field: 'general',
      message: 'High visual similarity detected — review before submitting to Adobe Stock.',
      remedy: 'Ensure compositions have sufficient commercial differentiation.',
      detectedWords: context.visualSimilarityDetails ? [context.visualSimilarityDetails] : undefined,
    });
  }

  // 1. Trademark & Brand Name Detection
  for (const brand of TRADEMARK_TERMS) {
    const brandRegex = new RegExp(`\\b${brand.replace('-', '\\-')}\\b`, 'i');
    if (brandRegex.test(normTitle)) {
      issues.push({
        type: 'trademark',
        severity: 'warning',
        field: 'title',
        message: `Registered trademark/brand detected in title: "${brand}".`,
        remedy: `Remove "${brand}" to avoid IP rejection.`,
        detectedWords: [brand],
      });
    }

    if (brandRegex.test(normDesc)) {
      issues.push({
        type: 'trademark',
        severity: 'warning',
        field: 'description',
        message: `Registered trademark/brand detected in description: "${brand}".`,
        remedy: `Remove trademark reference "${brand}".`,
        detectedWords: [brand],
      });
    }

    if (keywordStrings.includes(brand) || keywordStrings.some((k) => k.includes(brand))) {
      issues.push({
        type: 'trademark',
        severity: 'warning',
        field: 'keywords',
        message: `Trademark keyword detected: "${brand}".`,
        remedy: `Delete "${brand}" from tag list.`,
        detectedWords: [brand],
      });
    }
  }

  // 2. Artist & Art Style Mimicry Names
  for (const artist of ARTIST_NAMES) {
    const artistRegex = new RegExp(`\\b${artist}\\b`, 'i');
    if (artistRegex.test(normTitle) || artistRegex.test(normDesc)) {
      issues.push({
        type: 'artist',
        severity: 'block',
        field: 'title',
        message: `Artist name or style mimicry detected: "${artist}".`,
        remedy: `Remove artist reference "${artist}".`,
        detectedWords: [artist],
      });
    }

    if (keywordStrings.includes(artist)) {
      issues.push({
        type: 'artist',
        severity: 'block',
        field: 'keywords',
        message: `Artist name keyword detected: "${artist}".`,
        remedy: `Remove artist tag "${artist}".`,
        detectedWords: [artist],
      });
    }
  }

  // 3. Celebrity / Real Person Names
  for (const celeb of CELEBRITY_TERMS) {
    const celebRegex = new RegExp(`\\b${celeb}\\b`, 'i');
    if (celebRegex.test(normTitle) || keywordStrings.includes(celeb)) {
      issues.push({
        type: 'celebrity',
        severity: 'block',
        field: 'title',
        message: `Real person/celebrity reference detected: "${celeb}".`,
        remedy: `Remove named person reference.`,
        detectedWords: [celeb],
      });
    }
  }

  // 4. Keyword Duplication Detection
  const seenKeywords = new Set<string>();
  const exactDuplicates: string[] = [];
  const nearDuplicates: string[] = [];

  for (const kw of keywordStrings) {
    if (seenKeywords.has(kw)) {
      exactDuplicates.push(kw);
    } else {
      // Check for near-duplicates against already seen keywords
      let foundNear = false;
      for (const seen of seenKeywords) {
        if (isNearDuplicate(kw, seen)) {
          nearDuplicates.push(kw);
          foundNear = true;
          break;
        }
      }
      if (!foundNear) seenKeywords.add(kw);
    }
  }

  if (exactDuplicates.length > 0) {
    issues.push({
      type: 'duplicate',
      severity: 'block',
      field: 'keywords',
      message: `Exact duplicate keywords detected: ${Array.from(new Set(exactDuplicates)).join(', ')}.`,
      remedy: 'Remove identical keyword repetitions.',
      detectedWords: exactDuplicates,
    });
  }

  if (nearDuplicates.length > 0) {
    issues.push({
      type: 'duplicate',
      severity: 'warning',
      field: 'keywords',
      message: `Near-duplicate keywords detected (redundant variations): ${Array.from(new Set(nearDuplicates)).join(', ')}.`,
      remedy: 'Consolidate singular/plural or very similar variations.',
      detectedWords: nearDuplicates,
    });
  }

  // 5. Keyword Count Limit
  if (keywordStrings.length > 49) {
    issues.push({
      type: 'count',
      severity: 'block',
      field: 'keywords',
      message: `Keyword count (${keywordStrings.length}) exceeds maximum limit of 49.`,
      remedy: `Trim list to comply with Adobe Stock's 49 tag ceiling.`,
    });
  } else if (keywordStrings.length === 0 && metadata.title) {
    issues.push({
      type: 'count',
      severity: 'block',
      field: 'keywords',
      message: 'Keywords are mandatory for stock discovery.',
      remedy: 'Add relevant keywords.',
    });
  }

  // 6. Generic Spam & Unsupported Keywords
  const foundSpam = keywordStrings.filter((k) => BANNED_GENERIC_SPAM.has(k));
  if (foundSpam.length > 0) {
    issues.push({
      type: 'banned_term',
      severity: 'warning',
      field: 'keywords',
      message: `Generic spam keywords detected: ${foundSpam.join(', ')}.`,
      remedy: 'Remove generic tags like "hd", "4k", or "generated".',
      detectedWords: foundSpam,
    });
  }

  const foundUnsupported = keywordStrings.filter((k) => POTENTIALLY_UNSUPPORTED.has(k));
  if (foundUnsupported.length > 0) {
    issues.push({
      type: 'relevance',
      severity: 'warning',
      field: 'keywords',
      message: `Potentially unsupported tags detected: ${foundUnsupported.join(', ')}.`,
      remedy: 'Ensure these are visually supported; otherwise remove them.',
      detectedWords: foundUnsupported,
    });
  }

  // 7. Repetitive Root Keyword Stuffing (Aggressive Analysis Only)
  const wordFrequency: Record<string, number> = {};
  const commonExclusions = [
    'background', 'isolated', 'white', 'transparent', 'black', 'light', 'dark', 
    'abstract', 'texture', 'motion', 'smoke', 'curve', 'line', 'wave', 'glow', 
    'glowing', 'trail', 'streak', 'design', 'illustration', 'vector', 'pattern', 
    'concept', 'modern', 'clean', 'bright', 'minimal', 'effect', 'graphic', 
    'art', 'gradient', 'color', 'colorful', 'blue', 'red', 'green', 'gold', 'yellow', 'digital'
  ];
  
  for (const kw of keywordStrings) {
    const parts = kw.split(' ');
    for (const p of parts) {
      if (p.length > 3 && !commonExclusions.includes(p)) {
        wordFrequency[p] = (wordFrequency[p] || 0) + 1;
      }
    }
  }

  // Only warn if a single specific word (not on exclusion list) appears more than 10 times
  const extremeRepetitiveRoots = Object.entries(wordFrequency).filter(([_, count]) => count >= 10);
  if (extremeRepetitiveRoots.length > 0) {
    const topRepeated = extremeRepetitiveRoots[0];
    issues.push({
      type: 'keyword_spam',
      severity: 'warning',
      field: 'keywords',
      message: `Excessive keyword stem repetition: "${topRepeated[0]}" appears in ${topRepeated[1]} tags.`,
      remedy: 'Reduce redundant variations of the same root concept.',
      detectedWords: [topRepeated[0]],
    });
  }

  // 7b. Keyword Quantity Check (Prefer 15-35)
  if (keywordStrings.length > 35 && keywordStrings.length <= 49) {
    issues.push({
      type: 'count',
      severity: 'warning',
      field: 'keywords',
      message: `Keyword count is ${keywordStrings.length} (Prefer 15–35 highly relevant tags).`,
      remedy: 'Ensure all tags are visually supported; consider pruning less essential ones.',
    });
  }

  // 7b. First 10 Keywords Check (Relevance to Title)
  if (keywordStrings.length >= 5 && title) {
    const titleWords = new Set(normTitle.split(' ').filter(w => w.length > 3));
    const first10 = keywordStrings.slice(0, 10);
    const hasTitleMatch = first10.some(kw => {
      const kwWords = kw.split(' ');
      return kwWords.some(w => titleWords.has(w));
    });

    if (!hasTitleMatch && titleWords.size > 0) {
      issues.push({
        type: 'relevance',
        severity: 'warning',
        field: 'keywords',
        message: 'Primary keywords (top 10) should include core words from the title.',
        remedy: 'Move title-related keywords to the beginning of the list.',
      });
    }
  }

  // 8. Title Checks
  if (!title && metadata.keywords && metadata.keywords.length > 0) {
    issues.push({
      type: 'length',
      severity: 'block',
      field: 'title',
      message: 'Title is missing. A descriptive commercial title is mandatory.',
      remedy: 'Enter an accurate title.',
    });
  } else if (title) {
    if (title.length < 5) {
      issues.push({
        type: 'length',
        severity: 'block',
        field: 'title',
        message: `Title is too short (${title.length} chars). Minimum 5 characters required.`,
        remedy: 'Write a more descriptive title.',
      });
    } else if (title.length > 120) {
      issues.push({
        type: 'length',
        severity: 'block',
        field: 'title',
        message: `Title is ${title.length} characters (maximum 120 chars).`,
        remedy: 'Shorten title to under 120 characters.',
      });
    } else if (marketplace === 'adobe' && title.length > 70) {
      issues.push({
        type: 'length',
        severity: 'block',
        field: 'title',
        message: `Title is ${title.length} characters. Adobe Stock hard maximum is 70 characters for optimized SEO.`,
        remedy: 'Shorten title to under 70 characters.',
      });
    }

    // Technical/Camera Terminology Check
    const titleWords = title.toLowerCase().split(/\s+/);
    const foundTechnical = titleWords.filter(w => TECHNICAL_TERMS.has(w.replace(/[^\w]/g, '')));
    if (foundTechnical.length > 0) {
      issues.push({
        type: 'banned_term',
        severity: 'block',
        field: 'title',
        message: `Technical/Camera terminology detected in title: "${foundTechnical.join(', ')}".`,
        remedy: 'Remove technical specs, camera brands, or file info from the title.',
        detectedWords: foundTechnical,
      });
    }

    // Filename / Random Number Check
    const hasFileExtension = Array.from(FILE_EXTENSIONS).some(ext => title.toLowerCase().includes(ext));
    const hasUnderscoreOrHyphenId = /(_[0-9]{3,}|-[0-9]{3,})/.test(title);
    const hasRandomNumbers = /[0-9]{5,}/.test(title);

    if (hasFileExtension || hasUnderscoreOrHyphenId || hasRandomNumbers) {
      issues.push({
        type: 'banned_term',
        severity: 'block',
        field: 'title',
        message: 'Title appears to contain filename fragments or random identification numbers.',
        remedy: 'Rewrite title as a natural descriptive phrase without technical file markers.',
      });
    }

    const commaCount = (title.match(/,/g) || []).length;
    if (commaCount >= 3) {
      issues.push({
        type: 'keyword_spam',
        severity: 'warning',
        field: 'title',
        message: 'Title appears to be a list of comma-separated tags instead of a natural sentence.',
        remedy: 'Write title as a natural descriptive phrase without commas.',
      });
    }
  }

  // 9. Background Accuracy Verification
  if (backgroundAnalysis) {
    const mentionsWhite =
      normTitle.includes('white background') ||
      normDesc.includes('white background') ||
      keywordStrings.includes('white background') ||
      keywordStrings.includes('isolated on white');
    const mentionsTransparent =
      normTitle.includes('transparent') ||
      normDesc.includes('transparent') ||
      keywordStrings.includes('transparent background') ||
      keywordStrings.includes('transparent');

    if (backgroundAnalysis.isTransparent && mentionsWhite) {
      issues.push({
        type: 'background_mismatch',
        severity: 'warning',
        field: 'title',
        message:
          'Background mismatch: Image has transparent PNG alpha channel, but metadata mentions "white background".',
        remedy:
          'Change "white background" to "isolated on transparent background" or "transparent cutout".',
      });
    }

    if (
      !backgroundAnalysis.isTransparent &&
      backgroundAnalysis.backgroundType === 'white' &&
      mentionsTransparent
    ) {
      issues.push({
        type: 'background_mismatch',
        severity: 'warning',
        field: 'title',
        message:
          'Background mismatch: Image has a solid white background, but metadata mentions "transparent".',
        remedy: 'Change "transparent background" to "isolated on white background".',
      });
    }
  }

  // Determine Final Safety Status
  const hasBlock = issues.some((i) => i.severity === 'block');
  const hasWarning = issues.some((i) => i.severity === 'warning');

  let status: AdobeSafetyStatus = 'SAFE';
  let score = 100;

  if (hasBlock) {
    status = 'BLOCK';
    score = Math.max(
      20,
      100 -
        issues.filter((i) => i.severity === 'block').length * 25 -
        issues.filter((i) => i.severity === 'warning').length * 10
    );
  } else if (hasWarning) {
    status = 'WARNING';
    score = Math.max(65, 100 - issues.length * 8);
  }

  let summary = 'Safe for Adobe Stock submission.';
  if (status === 'BLOCK') {
    summary = `Blocked: ${issues.find((i) => i.severity === 'block')?.message || 'Critical submission issues detected.'}`;
  } else if (status === 'WARNING') {
    summary = `Warning: ${issues[0]?.message || 'Review recommended.'}`;
  }

  return {
    status,
    score,
    issues,
    summary,
  };
}
