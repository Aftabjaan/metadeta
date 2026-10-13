import {
  StockMetadata,
  KeywordItem,
  Marketplace,
  AssetType,
  TitleSettings,
  KeywordSettings,
  BackgroundSettings,
  BackgroundAnalysis,
} from '../types';
import { MARKETPLACE_PROFILES } from './platforms';
import { calculateSeoScore } from './seoEngine';
import { runAdobeSafetyCheck } from './adobeSafetyEngine';

export interface PromptBuildOptions {
  marketplace: Marketplace;
  selectedMarketplaces?: Marketplace[];
  assetType: AssetType;
  titleSettings: TitleSettings;
  keywordSettings: KeywordSettings;
  backgroundSettings?: BackgroundSettings;
  aiGeneratedFlag?: boolean;
  backgroundAnalysis?: BackgroundAnalysis;
  existingBatchTitles?: string[];
  existingBatchKeywords?: string[];
  assetIndex?: number;
  minimizeLayout?: boolean;
}

export const BANNED_FILLER_WORDS = new Set([
  'the', 'and', 'with', 'for', 'of', 'a', 'an', 'is', 'are', 'in', 'on', 'to',
  'image', 'photo', 'picture', 'photography', 'stock', 'wallpaper',
  'high quality', 'hd', '4k', '8k', 'best', 'nice', 'great', 'awesome',
  'super', 'beautiful image', 'stock photo', 'generated', 'free', 'download'
]);

export const BANNED_BRANDS = new Set([
  'apple', 'iphone', 'ipad', 'macbook', 'samsung', 'galaxy', 'nike', 'adidas',
  'coca cola', 'pepsi', 'mcdonalds', 'starbucks', 'disney', 'marvel', 'lego',
  'sony', 'playstation', 'xbox', 'microsoft', 'google', 'facebook', 'instagram'
]);

// Often hallucinated or irrelevant concepts that trigger Adobe Stock rejections
export const POTENTIALLY_UNSUPPORTED = new Set([
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

export function getStemRoot(word: string): string {
  if (!word) return '';
  const w = word.toLowerCase().trim();
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

/**
 * Detects if a keyword is an exact duplicate or trivial singular/plural variation.
 * Does NOT drop valid distinct phrases like "light streak", "light trail", "white light", "light curve".
 */
export function isRedundant(word: string, existing: Set<string>): boolean {
  if (!word) return true;
  const clean = word.toLowerCase().trim();
  if (existing.has(clean)) return true;

  const root = getStemRoot(clean);

  for (const item of existing) {
    if (clean === item) return true;
    const itemRoot = getStemRoot(item);
    if (root && itemRoot && root === itemRoot) return true;
    if (clean === item + 's' || item === clean + 's') return true;
    if (clean === item + 'es' || item === clean + 'es') return true;
    if (clean === item + 'ies' || item === clean + 'ies') return true;
    if (clean.length > 5 && item.length > 5) {
      if (clean.includes(item) && clean.length - item.length <= 2) return true;
      if (item.includes(clean) && item.length - clean.length <= 2) return true;
    }
  }

  return false;
}

export function maskKey(key: string): string {
  if (!key) return '••••••••';
  const clean = key.trim();
  if (clean.length <= 4) return '••••••••';
  return `•••••••••••••${clean.slice(-4)}`;
}

export function buildSystemInstruction(options: PromptBuildOptions): string {
  const profile = MARKETPLACE_PROFILES[options.marketplace] || MARKETPLACE_PROFILES.generic;
  const bg = options.backgroundAnalysis;

  const ts = options.titleSettings;
  let targetLimit = ts?.maxLength || 70;

  let bgMandate = '';
  if (bg) {
    if (bg.isTransparent || bg.backgroundType === 'transparent' || bg.backgroundType === 'transparent_cutout') {
      bgMandate = `
CRITICAL BACKGROUND FIDELITY (TRANSPARENT PNG DETECTED):
- This image has a REAL TRANSPARENT ALPHA CHANNEL (${bg.transparentPercentage}% transparent pixels).
- STRICTLY FORBIDDEN: DO NOT write "white background", "on white background", "isolated on white background", or "black background".
- REQUIRED PHRASING: Use "isolated on transparent background", "transparent background", "isolated graphic element", or "transparent cutout".
- Only mention "white background" if visible opaque white pixels actually exist in the subject.`;
    } else if (bg.backgroundType === 'white') {
      bgMandate = `
BACKGROUND FIDELITY:
- Real image pixel analysis confirms an ISOLATED OBJECT ON CLEAN WHITE BACKGROUND.
- Accurately mention "isolated on white background" or "white background".`;
    } else if (bg.backgroundType === 'black') {
      bgMandate = `
BACKGROUND FIDELITY:
- Real image pixel analysis confirms an ISOLATED OBJECT ON BLACK/DARK BACKGROUND.
- Accurately mention "isolated on black background" or "black background".`;
    }
  }

  return `You are a world-class professional stock metadata specialist and Adobe Stock SEO expert.
Your mission is to generate rigorously accurate, commercially discoverable stock metadata (Title, Description, Keywords, Category, Orientation) strictly based on the visible content of the provided image.

CRITICAL QUALITY DIRECTIVES FOR ADOBE STOCK SEARCH RELEVANCE:

1. VISUAL ACCURACY (THE "NO HALLUCINATION" RULE):
   - Every keyword, title, and description MUST be based ONLY on what is visibly evident in the image.
   - CORE RULE: DO NOT generate a keyword/title word merely because it is associated with the subject. Use: VISIBLE CONTENT > DIRECT CONCEPT > CONTEXTUAL USE. Never use: ASSOCIATED CONCEPT > ASSUMPTION.
   - Example: A simple heart graphic or heartbeat line does NOT automatically mean "medical", "healthcare", "cardiology", "cardiac", "doctor", "hospital", "patient", "clinical", "diagnosis", "treatment", "ekg", "ecg", "romance", "love", "anniversary", "valentines day", etc. Only include these terms when the actual visual clearly contains explicit supporting elements (e.g., stethoscope, clinical coat, a rose, or explicit text). If it is just a simple graphic/vector of a heart, exclude all medical and romance terms completely.
   - Title Verification: Every word in the title must be supported by the visible asset. Do not invent or assume: medical context, romance context, people, locations, events, occasions, professions, or industries.
   - Do NOT guess gender, age, ethnicity, or location. Describe visual attributes instead. If text is visible in the image, accurately read it. Do not invent or hallucinate text.
   - Avoid generic filler keywords. Every single keyword must pass a strict relevance check. Any questionable keyword must be omitted.

2. SEARCH INTENT ANALYSIS:
   - Analyze what a professional stock buyer (designer, marketer, advertiser) would actually search for.
   - Use concepts like "commercial background", "minimalist layout", "copy space", "web design element" only when visually supported.

3. TITLE ENGINE (NATURAL & SEARCHABLE):
   - Generate a clear, natural, searchable Adobe Stock title.
   - Describe: Main subject + Important action/appearance + Relevant context + Important visual characteristic.
   - Target Length: Approximately ${targetLimit} characters.
   - Avoid: Keyword stuffing, generic filler, brands, celebrity names, artist names.
   - Respect user's selected length/style.

4. KEYWORD PRIORITY & ORDERING (ADOBE STOCK SPECIFIC):
   - THE FIRST 10 KEYWORDS ARE HIGHEST PRIORITY. They must contain the strongest search terms.
   - Recommended Keyword Structure for the first 10:
     1. Main subject
     2. Main subject variation
     3. Main visual concept
     4. Important action
     5. Important characteristic
     6. Relevant context
     7. Commercial concept
     8. Relevant use case
     9. Important secondary object
     10. Strong search phrase
   - Mix high-value single words with relevant multi-word search phrases (e.g., "business finance", "financial planning").

5. ADOBE-SAFE METADATA:
   - Remove standalone filler words: the, and, with, for, of, a, an, is, are, in, on, to.
   - Prohibited: Trademarks, brand names, artist names, copyrighted characters, meaningless filler.

6. EXACT KEYWORD COUNT:
   - Respect the user's Keyword Settings exactly. If 49 is requested, generate 49 unique, relevant keywords.
   - Do NOT add weak keywords just to hit the count. If an image only supports 20 keywords, provide 20 high-quality ones unless the user explicitly forces a higher count.

7. STRUCTURED JSON: Output ONLY a valid JSON object. No markdown formatting.

TARGET PLATFORMS: ${profile.name}
Platform Rules & Guidelines:
${profile.rules.map((r) => `- ${r}`).join('\n')}
Supported Categories: ${profile.allowedCategories.join(', ')}`;
}

export function buildUserPrompt(options: PromptBuildOptions): string {
  const profile = MARKETPLACE_PROFILES[options.marketplace] || MARKETPLACE_PROFILES.generic;
  const { titleSettings, keywordSettings, backgroundSettings, assetType, backgroundAnalysis: bg } = options;

  const targetLimit = titleSettings?.maxLength || 70;
  const titleStyle = titleSettings?.style || 'SEO Optimized';
  const suffixKey = titleSettings?.backgroundSuffix || 'none';
  const SUFFIX_LABELS: Record<string, string> = {
    none: '',
    isolated_transparent: 'Isolated on Transparent Background',
    isolated_white: 'Isolated on White Background',
    isolated_black: 'Isolated on Black Background',
    isolated_png_transparent: 'Isolated PNG with Transparent Background',
  };
  const suffixText = SUFFIX_LABELS[suffixKey] || '';
  const customTitleInst = titleSettings?.customInstructions?.trim();

  const targetCount = keywordSettings?.targetCount || 30;
  const ORDERING_LABELS: Record<string, string> = {
    relevance: 'Most Relevant First',
    seo_priority: 'SEO Priority',
    balanced: 'Balanced',
    broad_to_specific: 'Broad to Specific',
  };
  const orderingKey = keywordSettings?.ordering || 'relevance';
  const orderingLabel = ORDERING_LABELS[orderingKey] || 'Most Relevant First';

  const TYPE_LABELS: Record<string, string> = {
    single: 'Single Words',
    phrases: 'Phrases',
    mixed: 'Mixed (Single Words and Phrases)',
  };
  const typeKey = keywordSettings?.keywordType || 'mixed';
  const typeLabel = TYPE_LABELS[typeKey] || 'Mixed (Single Words and Phrases)';
  const customKeywordInst = keywordSettings?.customInstructions?.trim();

  const userBgType = backgroundSettings?.userBackgroundType || 'auto';

  let bgInstruction = '';
  if (bg?.isTransparent) {
    bgInstruction = `
*** VISUAL BACKGROUND ANALYSIS ***
Image has a verified transparent PNG alpha channel (${bg.transparentPercentage}% transparent).
DO NOT write "white background" or "on white background". Use "isolated on transparent background" or "transparent background".`;
  } else if (bg?.backgroundType === 'white') {
    bgInstruction = `
*** VISUAL BACKGROUND ANALYSIS ***
Image is verified on solid white background. You may use "isolated on white background".`;
  } else if (bg?.backgroundType === 'black') {
    bgInstruction = `
*** VISUAL BACKGROUND ANALYSIS ***
Image is verified on solid black background. You may use "isolated on black background".`;
  } else if (userBgType !== 'auto') {
    bgInstruction = `
*** USER BACKGROUND PREFERENCE HINT ***
User indicated background type: ${userBgType}. Analyze actual pixels first. Do NOT assume transparency solely from a .png file extension.`;
  }

  let suffixInstruction = '';
  if (suffixText) {
    suffixInstruction = `\n- BACKGROUND SUFFIX RULE: Append or incorporate "${suffixText}" at the end of the title ONLY IF visually appropriate and accurate for the image content (e.g. isolated graphic cutout on transparent/white/black background). Do NOT force a background suffix onto full scene or complex background images.`;
  }

  let batchDiffInst = '';
  if (options.existingBatchTitles && options.existingBatchTitles.length > 0) {
    batchDiffInst = `
*** BATCH DIFFERENTIATION REQUIREMENT ***
Previous images in this batch already use titles such as:
${options.existingBatchTitles.slice(-3).map((t) => `- "${t}"`).join('\n')}
YOU MUST MAKE THIS METADATA UNIQUE. Describe specific visual differences (composition, angle, perspective, color palette, lighting nuances, or specific visual detail differences). DO NOT repeat identical titles or keyword sets.`;
  }

  return `Analyze this stock image and generate metadata following the ADOBE STOCK SEARCH-OPTIMIZED ENGINE rules:

=== ADOBE STOCK SEARCH PRIORITY ===
- Visual relevance + Search intent + Commercial usefulness.
- KEYWORD ORDERING: The first 10 keywords MUST contain the strongest search terms.
- SEARCH INTENT: "What would a designer or marketer search for when looking for this exact image?"
${batchDiffInst}

=== ASSET & BACKGROUND CLASSIFICATION ===
Asset Type: ${assetType}
Flag AI-Generated: ${options.aiGeneratedFlag ? 'Yes' : 'No'}
${bgInstruction}

=== TITLE SETTINGS ===
- Title Style: ${titleStyle}
- Target Length: Approximately ${targetLimit} characters.
- RULES: Describe subject, action, context, and visual characteristics. No keyword stuffing, no invented info, no brands.
- Respect user's selected length/style.${suffixInstruction}${customTitleInst ? `\n- CUSTOM TITLE INSTRUCTIONS: ${customTitleInst}` : ''}

=== KEYWORD SETTINGS ===
- Target Keyword Count: EXACTLY ${targetCount} keywords. (If 49 are requested, generate 49).
- Keyword Ordering: ${orderingLabel} (Priority: 1.Subject, 2.Subject Variation, 3.Visual Concept, 4.Action, 5.Characteristic, 6.Context, 7.Commercial Concept, 8.Use Case, 9.Secondary Object, 10.Search Phrase).
- Keyword Types: ${typeLabel} (Mix single words and natural search phrases).
${customKeywordInst ? `- CUSTOM KEYWORD INSTRUCTIONS: ${customKeywordInst}\n` : ''}
CRITICAL KEYWORD RULES:
1. NO HALLUCINATIONS: Do not invent people, brands, locations, or objects not visible.
2. ADOBE-SAFE: No trademarks, celebrity names, or artist names.
3. NO FILLER: Remove standalone words: the, and, with, for, of, a, an, is, are, in, on, to.
4. COMMERCIAL VALUE: Prioritize keywords that a real stock buyer would use.
=== CATEGORY & ORIENTATION ===
Select the most appropriate category from: ${profile.allowedCategories.join(', ')}.
Orientation: "horizontal" | "vertical" | "square" | "panoramic".

${options.minimizeLayout
  ? `=== WORKFLOW DIRECTIVE (CONCISE MODE) ===
To stay within strict token limits, do NOT generate detailed 'assetAnalysis' or 'marketResearch'. Simply output empty objects {} for them in the JSON response. Focus 100% of your tokens on producing high-quality 'title', 'category', and 'keywords'.`
  : `=== WORKFLOW DIRECTIVE: ANALYSIS AND RESEARCH (MANDATORY) ===
You must perform the following processes on the asset before outputting the final metadata:
1. ASSET ANALYSIS: Describe visible subject, secondary subjects, visual style, lighting, colors, background, image type, and composition. Do not invent any non-visible names, locations, brands, or events.
2. ADOBE STOCK MARKET RESEARCH: Identify the core market opportunities, commercial search concepts, relevant stock trends, seasonal relevance, user search intent, and long-tail keyword combinations. Do not fabricate sales numbers, downloads, or ranking stats. Show confidence as "High", "Medium", or "Limited" based on how specific the trends are.`}

OUTPUT: VALID RAW JSON.
{
  "assetAnalysis": ${options.minimizeLayout ? '{}' : `{
    "subjects": ["string"],
    "visualStyle": "string",
    "lighting": "string",
    "colors": ["string"],
    "background": "string",
    "imageType": "string",
    "composition": "string"
  }`},
  "marketResearch": ${options.minimizeLayout ? '{}' : `{
    "opportunity": "string",
    "commercialConcepts": ["string"],
    "relevantTrends": ["string"],
    "seasonalOpportunity": "string",
    "searchIntent": "string",
    "keywordOpportunities": ["string"],
    "confidence": "High"
  }`},
  "title": "string",
  "category": "string",
  "assetType": "${assetType}",
  "orientation": "horizontal | vertical | square | panoramic",
  "aiGenerated": ${options.aiGeneratedFlag ? 'true' : 'false'},
  "keywords": [
    {
      "word": "string (lowercase, clean)",
      "score": number (0-100),
      "priority": "primary | secondary | supporting"
    }
  ]
}`;
}

export function cleanTitleOfCommonPhrases(title: string, titleSettings?: TitleSettings): string {
  if (!title) return title;
  
  // If user explicitly chose a background suffix, do not strip that phrase
  const keepSuffix = titleSettings?.backgroundSuffix && titleSettings.backgroundSuffix !== 'none';

  const ALL_COMMON_PHRASES = [
    'isolated on transparent background',
    'isolated on transparent png',
    'on transparent background',
    'on transparent png',
    'isolated on white background',
    'on white background',
    'isolated on black background',
    'on black background',
    'on dark background',
    'close up',
    'top view',
    'front view',
    'side view',
    'overhead view',
    'flat lay',
    'copy space',
    'seamless pattern',
    'vertical format',
    'horizontal format',
    'square format',
    'isolated object',
    'isolated element',
  ];

  let cleaned = title;

  for (const phrase of ALL_COMMON_PHRASES) {
    if (keepSuffix && phrase.includes('isolated')) {
      continue;
    }
    const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  }

  cleaned = cleaned.replace(/[\s,]+/g, ' ').trim();
  return cleaned;
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

  // Clean initial raw list of keywords for semantic analysis
  const initialWords = new Set<string>();
  rawKeywords.forEach(item => {
    let word = '';
    if (typeof item === 'string') word = cleanKeyword(item);
    else if (item && typeof item === 'object') word = cleanKeyword(item.word || item.tag || item.keyword || '');
    if (word) initialWords.add(word);
  });

  const fullSearchText = `${rawTitle.toLowerCase()} ${Array.from(initialWords).join(' ')}`;

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
  title = cleanTitleOfCommonPhrases(title);

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
    const textSources = title;
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
    assetAnalysis: rawJson?.assetAnalysis || undefined,
    marketResearch: rawJson?.marketResearch || undefined,
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

export function matchCategoryForMarketplace(baseCategory: string, marketplace: Marketplace): string {
  const profile = MARKETPLACE_PROFILES[marketplace] || MARKETPLACE_PROFILES.generic;
  const targetCategories = profile.allowedCategories;
  if (!baseCategory || targetCategories.length === 0) return targetCategories[0] || 'General';

  const cleanBase = baseCategory.toLowerCase().trim();
  const exact = targetCategories.find((c) => c.toLowerCase() === cleanBase);
  if (exact) return exact;

  const partial = targetCategories.find(
    (c) => c.toLowerCase().includes(cleanBase) || cleanBase.includes(c.toLowerCase())
  );
  if (partial) return partial;

  const mappings: Record<string, string[]> = {
    nature: ['Nature', 'Landscape', 'Wildlife & Nature', 'Environment', 'Nature & Landscapes', 'Parks/Outdoor'],
    animal: ['Animals', 'Animals/Wildlife', 'Wildlife & Nature'],
    business: ['Business', 'Business & Finance', 'Business/Finance', 'Industry'],
    technology: ['Technology', 'Science & Technology', 'IT & C', 'Science'],
    people: ['People', 'Lifestyle', 'Lifestyle & Culture', 'Lifestyle & People'],
    travel: ['Travel', 'Travel & Destinations', 'Travel & Geography', 'Landscape'],
    food: ['Food', 'Food and Drink', 'Drinks'],
    art: ['Graphic Resources', 'The Arts', 'Abstract & Art', 'Abstract', 'Illustrations/Clip-Art', 'Vectors'],
    architecture: ['Buildings and Architecture', 'Buildings/Landmarks', 'Arts & Architecture', 'Architecture & Places', 'Interiors'],
  };

  for (const [key, aliases] of Object.entries(mappings)) {
    if (cleanBase.includes(key)) {
      const match = targetCategories.find((c) =>
        aliases.some((a) => c.toLowerCase().includes(a.toLowerCase()))
      );
      if (match) return match;
    }
  }

  return targetCategories[0];
}

export function adaptMetadataForMarketplace(
  base: StockMetadata,
  targetMarketplace: Marketplace
): import('../types').MarketplaceMetadata {
  const profile = MARKETPLACE_PROFILES[targetMarketplace] || MARKETPLACE_PROFILES.generic;
  const rulesApplied: string[] = [];

  let title = (base.title || '').trim();
  // Only Adobe Stock is supported

  let effectiveTitleMax = profile.titleMaxLength || 200;
  const ts = base.titleSettings;
  if (ts?.maxLength) {
    effectiveTitleMax = ts.maxLength;
  } else if (targetMarketplace === 'adobe') {
    effectiveTitleMax = 200;
  }

  if (title.length > effectiveTitleMax) {
    const cut = title.slice(0, effectiveTitleMax);
    const lastSp = cut.lastIndexOf(' ');
    title = lastSp > 15 ? cut.slice(0, lastSp) : cut;
  }

  const baseKeywords = base.keywords || [];
  let adaptedKeywords: KeywordItem[] = baseKeywords.map((k) => ({ ...k }));

  if (targetMarketplace === 'adobe') {
    adaptedKeywords.forEach((k, idx) => {
      if (idx < 10) {
        k.priority = 'primary';
        k.score = Math.max(k.score, 92 - idx);
      } else if (idx < 30) {
        k.priority = 'secondary';
      } else {
        k.priority = 'supporting';
      }
    });
    adaptedKeywords = adaptedKeywords.slice(0, Math.min(49, profile.maxKeywords));
    rulesApplied.push('Prioritized top 10 keywords for Adobe Stock algorithmic ranking (max 49)');
  } else {
    adaptedKeywords = adaptedKeywords.slice(0, profile.maxKeywords);
  }

  const category = matchCategoryForMarketplace(base.category, targetMarketplace);

  const adaptedPartial: StockMetadata = {
    title,
    keywords: adaptedKeywords,
    category,
    assetType: base.assetType || 'photo',
    orientation: base.orientation || 'horizontal',
    aiGenerated: base.aiGenerated || false,
    seoScore: 0,
    backgroundAnalysis: base.backgroundAnalysis,
  };

  const seoBreakdown = calculateSeoScore(adaptedPartial, targetMarketplace, base.backgroundAnalysis);

  return {
    marketplace: targetMarketplace,
    title,
    keywords: adaptedKeywords,
    category,
    seoScore: seoBreakdown.score,
    seoBreakdown,
    rulesApplied,
  };
}

export function populateMarketplaceAwareMetadata(
  base: StockMetadata,
  selectedMarketplaces: Marketplace[] = ['generic'],
  activeMarketplace?: Marketplace
): StockMetadata {
  const marketplacesMap: Partial<Record<Marketplace, import('../types').MarketplaceMetadata>> = {};

  const effectiveMarketplaces =
    selectedMarketplaces.length > 0
      ? selectedMarketplaces
      : ([base.activeMarketplace || 'generic'] as Marketplace[]);

  for (const m of effectiveMarketplaces) {
    marketplacesMap[m] = adaptMetadataForMarketplace(base, m);
  }

  const primaryMarketplace = activeMarketplace || effectiveMarketplaces[0] || 'adobe';
  const primaryAdapted =
    marketplacesMap[primaryMarketplace] || adaptMetadataForMarketplace(base, primaryMarketplace);

  return {
    ...base,
    title: primaryAdapted.title,
    keywords: primaryAdapted.keywords,
    category: primaryAdapted.category,
    seoScore: primaryAdapted.seoScore,
    seoBreakdown: primaryAdapted.seoBreakdown,
    activeMarketplace: primaryMarketplace,
    marketplaces: marketplacesMap,
  };
}
