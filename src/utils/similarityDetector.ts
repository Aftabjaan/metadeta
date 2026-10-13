import { StockAsset, VisualSimilarityLevel } from '../types';

export interface SimilarityGroup {
  id: string;
  assetA: StockAsset;
  assetB: StockAsset;
  type: 'EXACT_DUPLICATE' | 'HIGH_VISUAL_SIMILARITY' | 'MODERATE_VISUAL_SIMILARITY' | 'METADATA_SIMILARITY';
  similarityScore: number; // 0 - 100%
  label: string;
  reason: string;
}

export interface VisualComparisonResult {
  score: number; // 0 - 100
  level: VisualSimilarityLevel;
  details: string;
  isColorShiftOnly?: boolean;
}

/**
 * Calculates Hamming distance between two binary strings of equal length
 */
function hammingDistance(strA: string, strB: string): number {
  const len = Math.min(strA.length, strB.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    if (strA[i] !== strB[i]) dist++;
  }
  return dist + Math.abs(strA.length - strB.length);
}

/**
 * Parses RGB hex components into {r, g, b}
 */
function parseRgbHex(hex: string): { r: number; g: number; b: number } {
  if (!hex || hex.length < 6) return { r: 128, g: 128, b: 128 };
  return {
    r: parseInt(hex.substring(0, 2), 16) || 128,
    g: parseInt(hex.substring(2, 4), 16) || 128,
    b: parseInt(hex.substring(4, 6), 16) || 128,
  };
}

/**
 * Compares two perceptual visual fingerprints:
 * Format: dHash (64 bits) : AvgRGB (hex) : AspectRatio : IsTrans : BgType
 */
export function compareVisualFingerprints(
  fpA?: string,
  fpB?: string
): VisualComparisonResult {
  if (!fpA || !fpB) {
    return {
      score: 0,
      level: 'UNIQUE',
      details: 'Unique image composition',
    };
  }

  if (fpA === fpB) {
    return {
      score: 100,
      level: 'EXACT_DUPLICATE',
      details: 'Identical visual fingerprint (100% match)',
    };
  }

  const partsA = fpA.split(':');
  const partsB = fpB.split(':');

  const dHashA = partsA[0] || '';
  const dHashB = partsB[0] || '';

  if (!dHashA || !dHashB || dHashA.length < 32 || dHashB.length < 32) {
    return { score: 0, level: 'UNIQUE', details: 'Unique visual composition' };
  }

  const dist = hammingDistance(dHashA, dHashB);
  const hashSim = Math.max(0, Math.round(((64 - dist) / 64) * 100));

  // Color difference
  const rgbA = parseRgbHex(partsA[1] || '808080');
  const rgbB = parseRgbHex(partsB[1] || '808080');
  const colorDiff =
    Math.sqrt(
      Math.pow(rgbA.r - rgbB.r, 2) +
      Math.pow(rgbA.g - rgbB.g, 2) +
      Math.pow(rgbA.b - rgbB.b, 2)
    ) / 441.67; // Normalized Euclidean distance (0.0 to 1.0)
  const colorSim = Math.round((1 - colorDiff) * 100);

  // Overall visual score weighting
  const combinedScore = Math.round(hashSim * 0.75 + colorSim * 0.25);

  if (dist === 0) {
    if (colorSim < 75) {
      return {
        score: Math.max(combinedScore, 86),
        level: 'HIGH_SIMILARITY',
        details: 'Same visual design/composition with color palette variation',
        isColorShiftOnly: true,
      };
    }
    return {
      score: 100,
      level: 'EXACT_DUPLICATE',
      details: 'Exact perceptual image match',
    };
  }

  if (dist <= 3 || combinedScore >= 90) {
    return {
      score: Math.max(combinedScore, 92),
      level: 'HIGH_SIMILARITY',
      details: 'Near-identical image composition with minor alterations',
    };
  }

  if (dist <= 7 || combinedScore >= 82) {
    return {
      score: Math.max(combinedScore, 84),
      level: 'HIGH_SIMILARITY',
      details: 'High visual similarity detected (similar composition/elements)',
    };
  }

  if (dist <= 13 || combinedScore >= 70) {
    return {
      score: Math.max(combinedScore, 72),
      level: 'MODERATE_SIMILARITY',
      details: 'Moderate visual resemblance (shared motifs or framing)',
    };
  }

  return {
    score: combinedScore,
    level: 'UNIQUE',
    details: 'Unique image composition',
  };
}

/**
 * Calculates Jaccard token similarity between two strings.
 */
export function calculateTextSimilarity(textA: string, textB: string): number {
  if (!textA || !textB) return 0;
  if (textA.toLowerCase().trim() === textB.toLowerCase().trim()) return 1.0;

  const wordsA = new Set(
    textA
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const wordsB = new Set(
    textB
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  wordsA.forEach((w) => {
    if (wordsB.has(w)) intersection++;
  });

  const union = new Set([...Array.from(wordsA), ...Array.from(wordsB)]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Calculates keyword set overlap similarity between two keyword arrays.
 */
export function calculateKeywordSimilarity(
  kwA: { word: string }[] | string[] | undefined,
  kwB: { word: string }[] | string[] | undefined
): number {
  if (!kwA || !kwB || kwA.length === 0 || kwB.length === 0) return 0;

  const setA = new Set(
    kwA.map((k) => (typeof k === 'string' ? k : k.word).toLowerCase().trim())
  );
  const setB = new Set(
    kwB.map((k) => (typeof k === 'string' ? k : k.word).toLowerCase().trim())
  );

  let intersection = 0;
  setA.forEach((k) => {
    if (setB.has(k)) intersection++;
  });

  const union = new Set([...Array.from(setA), ...Array.from(setB)]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Annotates all assets in a batch with duplicate status, visual similarity, and returns similarity groups.
 * Ensures the original filename is STRICTLY preserved.
 */
export function analyzeBatchDuplicatesAndSimilarity(assets: StockAsset[]): {
  annotatedAssets: StockAsset[];
  similarityGroups: SimilarityGroup[];
  hasDuplicates: boolean;
  hasHighSimilarity: boolean;
} {
  if (!assets || assets.length === 0) {
    return {
      annotatedAssets: [],
      similarityGroups: [],
      hasDuplicates: false,
      hasHighSimilarity: false,
    };
  }

  // Clone assets to annotate
  const annotated: StockAsset[] = assets.map((a) => ({
    ...a,
    isDuplicate: false,
    duplicateOfId: undefined,
    duplicateOfFilename: undefined,
    duplicateReason: undefined,
    visualSimilarityLevel: 'UNIQUE',
    visualSimilarityScore: 0,
    visualSimilarityDetails: undefined,
    similarityWarning: undefined,
  }));

  const groups: SimilarityGroup[] = [];
  const processedPairs = new Set<string>();

  // Pass 1: Strict Duplicate Detection by content hash OR (filename + exact size)
  for (let i = 0; i < annotated.length; i++) {
    const assetA = annotated[i];

    for (let j = i + 1; j < annotated.length; j++) {
      const assetB = annotated[j];

      const isSameContent =
        (assetA.fileContentHash &&
          assetB.fileContentHash &&
          assetA.fileContentHash === assetB.fileContentHash) ||
        (assetA.originalFilename.toLowerCase() === assetB.originalFilename.toLowerCase() &&
          assetA.fileSize === assetB.fileSize);

      if (isSameContent) {
        // Mark assetB as duplicate of assetA if not explicitly dismissed
        if (!assetB.duplicateDismissed) {
          assetB.isDuplicate = true;
          assetB.duplicateOfId = assetA.id;
          assetB.duplicateOfFilename = assetA.originalFilename;
          assetB.duplicateReason = 'Exact duplicate file detected in this batch.';
          assetB.visualSimilarityLevel = 'EXACT_DUPLICATE';
          assetB.visualSimilarityScore = 100;
          assetB.visualSimilarityDetails = `Exact duplicate of "${assetA.originalFilename}"`;
          assetB.similarityWarning = `Exact duplicate of "${assetA.originalFilename}"`;
        }

        const pairKey = `${assetA.id}_${assetB.id}`;
        if (!processedPairs.has(pairKey)) {
          processedPairs.add(pairKey);
          groups.push({
            id: pairKey,
            assetA,
            assetB,
            type: 'EXACT_DUPLICATE',
            similarityScore: 100,
            label: 'Exact Duplicate',
            reason: `Exact duplicate file (${assetA.originalFilename} ↔ ${assetB.originalFilename})`,
          });
        }
      }
    }
  }

  // Pass 2: Perceptual Visual Similarity & Metadata Overlap Check
  for (let i = 0; i < annotated.length; i++) {
    const assetA = annotated[i];

    for (let j = i + 1; j < annotated.length; j++) {
      const assetB = annotated[j];
      const pairKey = `${assetA.id}_${assetB.id}`;
      if (processedPairs.has(pairKey)) continue;

      // 1. Visual Comparison
      const visualRes = compareVisualFingerprints(
        assetA.visualFingerprint,
        assetB.visualFingerprint
      );

      // 2. Metadata Comparison (if both have metadata)
      let metadataSim = 0;
      let titleSim = 0;
      let kwSim = 0;
      if (assetA.metadata && assetB.metadata) {
        titleSim = calculateTextSimilarity(
          assetA.metadata.title || '',
          assetB.metadata.title || ''
        );
        kwSim = calculateKeywordSimilarity(
          assetA.metadata.keywords,
          assetB.metadata.keywords
        );
        metadataSim = Math.round(((titleSim + kwSim) / 2) * 100);
      }

      if (visualRes.level === 'EXACT_DUPLICATE' || visualRes.score >= 90) {
        processedPairs.add(pairKey);
        if (!assetB.isDuplicate && !assetB.duplicateDismissed) {
          assetB.visualSimilarityLevel = 'HIGH_SIMILARITY';
          assetB.visualSimilarityScore = visualRes.score;
          assetB.visualSimilarityDetails = `High visual similarity (${visualRes.score}%) with "${assetA.originalFilename}"`;
          assetB.similarityWarning = `High visual similarity detected (${visualRes.score}%) with "${assetA.originalFilename}". Review before submitting to Adobe Stock.`;
        }

        groups.push({
          id: pairKey,
          assetA,
          assetB,
          type: 'HIGH_VISUAL_SIMILARITY',
          similarityScore: visualRes.score,
          label: `${visualRes.score}% Similar`,
          reason: `High visual similarity: ${visualRes.details} (${assetA.originalFilename} ↔ ${assetB.originalFilename})`,
        });
      } else if (visualRes.level === 'HIGH_SIMILARITY' || visualRes.score >= 82) {
        processedPairs.add(pairKey);
        if (!assetB.isDuplicate && !assetB.duplicateDismissed) {
          assetB.visualSimilarityLevel = 'HIGH_SIMILARITY';
          assetB.visualSimilarityScore = visualRes.score;
          assetB.visualSimilarityDetails = `High visual similarity (${visualRes.score}%) with "${assetA.originalFilename}"`;
          assetB.similarityWarning = `High visual similarity detected (${visualRes.score}%). Review before submitting to Adobe Stock.`;
        }

        groups.push({
          id: pairKey,
          assetA,
          assetB,
          type: 'HIGH_VISUAL_SIMILARITY',
          similarityScore: visualRes.score,
          label: `${visualRes.score}% Similar`,
          reason: `High visual similarity: ${visualRes.details}`,
        });
      } else if (metadataSim >= 80) {
        // High metadata similarity on visually distinct images
        processedPairs.add(pairKey);
        groups.push({
          id: pairKey,
          assetA,
          assetB,
          type: 'METADATA_SIMILARITY',
          similarityScore: metadataSim,
          label: `${metadataSim}% Metadata Match`,
          reason: `Metadata is highly similar — review keyword/title uniqueness (${assetA.originalFilename} ↔ ${assetB.originalFilename})`,
        });
      }
    }
  }

  const hasDuplicates = annotated.some((a) => a.isDuplicate);
  const hasHighSimilarity = groups.some(
    (g) => g.type === 'EXACT_DUPLICATE' || g.type === 'HIGH_VISUAL_SIMILARITY'
  );

  return {
    annotatedAssets: annotated,
    similarityGroups: groups,
    hasDuplicates,
    hasHighSimilarity,
  };
}

/**
 * Legacy compatibility helper
 */
export function detectSimilarAssets(assets: StockAsset[]): SimilarityGroup[] {
  return analyzeBatchDuplicatesAndSimilarity(assets).similarityGroups;
}
