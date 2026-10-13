import { Marketplace, AssetType, TitleSettings, KeywordSettings, BackgroundSettings, PromptBuildOptions } from '../src/types';
import { MARKETPLACE_PROFILES } from '../src/utils/platforms';

export type { PromptBuildOptions };

const SUFFIX_LABELS: Record<string, string> = {
  none: '',
  isolated_transparent: 'Isolated on Transparent Background',
  isolated_white: 'Isolated on White Background',
  isolated_black: 'Isolated on Black Background',
  isolated_png_transparent: 'Isolated PNG with Transparent Background',
};

const ORDERING_LABELS: Record<string, string> = {
  relevance: 'Most Relevant First',
  seo_priority: 'SEO Priority',
  balanced: 'Balanced',
  broad_to_specific: 'Broad to Specific',
};

const TYPE_LABELS: Record<string, string> = {
  single: 'Single Words',
  phrases: 'Phrases',
  mixed: 'Mixed (Single Words and Multi-word Phrases)',
};

export function buildSystemInstruction(options: PromptBuildOptions): string {
  const profile = MARKETPLACE_PROFILES[options.marketplace] || MARKETPLACE_PROFILES.generic;
  const selected =
    options.selectedMarketplaces && options.selectedMarketplaces.length > 0
      ? options.selectedMarketplaces
      : [options.marketplace];

  const platformNames = selected.map((m) => MARKETPLACE_PROFILES[m]?.name || m).join(', ');
  const bg = options.backgroundAnalysis;

  const ts = options.titleSettings;
  const targetLimit = ts?.maxLength || 70;

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
    } else if (bg.backgroundType === 'full_scene') {
      bgMandate = `
BACKGROUND FIDELITY:
- Real image pixel analysis confirms a FULL SCENE / COMPLEX ENVIRONMENT.
- DO NOT write "isolated on white background" or "isolated graphic". Describe the actual environmental scene.`;
    }
  }

  return `You are a world-class professional stock metadata specialist and microstock SEO expert.
Your mission is to generate rigorously accurate, commercially discoverable stock metadata (Title, Description, Keywords, Category, Orientation) strictly based on the visible content of the provided image.

CRITICAL QUALITY DIRECTIVES FOR ADOBE STOCK SEARCH DISCOVERABILITY:

1. VISUAL ACCURACY FIRST:
   - Every keyword, title, and description MUST be based ONLY on what is visibly evident in the uploaded image.
   - Never invent objects, people, locations, brands, events, styles, emotions, or intended uses.
   - STRICTLY FORBIDDEN unless unmistakably visible in the image:
     space, cosmic, universe, science, technology, medical, business, electric, explosion, fantasy, sports.
   - Words like "texture", "grunge", "smoke", "glow" are valid ONLY when the image visibly contains these elements.

2. TITLE ENGINE (NATURAL & SEARCHABLE):
   - Generate a natural, professional stock title describing what is visible in the scene.
   - Target Length: Target approximately ${targetLimit} characters (Requested length mode: ${ts?.lengthMode || 'standard'}). Do NOT automatically shorten or truncate titles to 70 characters.
   - Expand the title organically by describing real visual elements (colors, lighting, mood, composition) without repeating words, keyword-stuffing, or adding filler/unsupported details.
   - Prioritize in this order:
     1. Main subject
     2. Main visual element
     3. Color
     4. Style
     5. Composition
     6. Important visual characteristic
     7. Commercially useful concept ONLY when visually supported
   - STRICTLY FORBIDDEN in titles:
     - Brand names, trademarks, company names, artist names, celebrity names, fictional characters.
     - Camera settings/specs (ISO, aperture, shutter speed, f-stop, lens, 4K, HD, megapixels, raw, dslr).
     - Filename fragments (.jpg, .png, underscores, random ID numbers).
     - Comma-separated keyword lists or keyword stuffing.

3. KEYWORDS ENGINE (BUYER SEARCH INTENT & RANKING):
   - Generate ONLY strong, relevant, buyer-searchable keywords.
   - Think like a microstock buyer searching for this exact image.
   - Before generating each keyword, verify: "Would a real buyer reasonably type this word or phrase when searching for this image?" If no, omit it.
   - Prioritize keywords strictly by search relevance.

4. KEYWORD RULES:
   1. The first 10 keywords MUST be the absolute strongest and most relevant search terms.
   2. No duplicate keywords.
   3. No near-duplicate keywords or trivial variations.
   4. No meaningless filler words or fluff.
   5. No standalone words such as: "the", "and", "with", "for", "of", "a", "an", "is", "are", "in", "on", "to".
   6. Do not generate keywords that are not visible or logically supported by the image.
   7. Do not use brands, trademarks, celebrity names, copyrighted characters, or invented locations.
   8. Do not repeat title words unnecessarily just to increase keyword count.
   9. Return the exact target number of useful keywords requested.

5. ACCURATE DESCRIPTION & CATEGORY:
   - Description: Concise, natural 1-2 sentence description of the visible image. No keyword stuffing.
   - Category: Select the single most accurate category from the platform list based on the actual image.

${bgMandate}

6. STRUCTURED JSON: You must output ONLY a valid JSON object matching the requested schema. No markdown formatting, no code fences.

TARGET PLATFORMS: ${platformNames} (Primary Focus: ${profile.name})
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
  const suffixText = SUFFIX_LABELS[suffixKey] || '';
  const customTitleInst = titleSettings?.customInstructions?.trim();

  const targetCount = keywordSettings?.targetCount || 30;
  const orderingKey = keywordSettings?.ordering || 'relevance';
  const orderingLabel = ORDERING_LABELS[orderingKey] || 'Most Relevant First';
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

  return `Please analyze this stock image and generate metadata adhering strictly to these configuration settings:

=== ASSET & BACKGROUND CLASSIFICATION ===
Asset Type: ${assetType}
Flag AI-Generated: ${options.aiGeneratedFlag ? 'Yes' : 'No'}
${bgInstruction}

=== TITLE SETTINGS ===
- Title Style: ${titleStyle}
- Target Title Length: Target approximately ${targetLimit} characters.
  CRITICAL: This is a generation target. Do NOT automatically truncate titles to 70 characters. Generate titles up to this target (${targetLimit} chars).
- Expand the title organically by describing real visual elements (colors, lighting, mood, composition) without repeating words or adding unsupported details.${suffixInstruction}${customTitleInst ? `\n- CUSTOM TITLE INSTRUCTIONS: ${customTitleInst}` : ''}
Prioritize: 1. main subject, 2. main visual element, 3. color, 4. style, 5. composition, 6. important visual characteristic.
Prohibited: Camera specs, technical file info, brands, artist names, or comma-separated keyword lists.

=== KEYWORD SETTINGS ===
- Target Keyword Count: EXACTLY ${targetCount} keywords. (If 45 keywords are requested, generate 45. If 49 are requested, generate 49).
- Keyword Ordering: ${orderingLabel}
- Keyword Types: ${typeLabel}
${customKeywordInst ? `- CUSTOM KEYWORD INSTRUCTIONS: ${customKeywordInst}\n` : ''}
CRITICAL KEYWORD RULES:
1. The first 10 keywords MUST be the absolute strongest, most relevant buyer search terms.
2. No duplicate keywords.
3. No near-duplicate keywords or trivial variations.
4. No meaningless filler words or fluff.
5. No standalone words such as: "the", "and", "with", "for", "of", "a", "an", "is", "are", "in", "on", "to".
6. Do not generate keywords that are not visible or logically supported by the image.
7. Do not use brand names, trademarks, celebrity names, copyrighted characters, or invented locations.
8. Do not repeat title words unnecessarily just to increase keyword count.
9. Return EXACTLY ${targetCount} useful keywords.

=== DESCRIPTION INSTRUCTIONS ===
Write an accurate, natural stock description (1 to 2 sentences) describing the composition, lighting, subject, and atmosphere. Do not simply repeat the title verbatim.

=== CATEGORY & ORIENTATION ===
Select the single most accurate category from: ${profile.allowedCategories.join(', ')}.
Detect orientation: "horizontal" | "vertical" | "square" | "panoramic".

OUTPUT MUST BE VALID RAW JSON with this exact schema:
{
  "title": "string",
  "description": "string",
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

