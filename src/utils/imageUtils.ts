import { BackgroundAnalysis } from '../types';

export interface ProcessedUpload {
  originalFilename: string; // CRITICAL: EXACT browser file.name
  fileSize: number;
  mimeType: string;
  thumbnailUrl: string;
  aiBase64: string;
  backgroundAnalysis: BackgroundAnalysis;
  fileContentHash: string; // SHA-256 hash of raw file content
  visualFingerprint: string; // Perceptual dHash + color histogram
}

/**
 * Computes exact SHA-256 hash of file content in the browser
 */
export async function computeFileContentHash(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `fallback-${file.name}-${file.size}-${file.lastModified}`;
  }
}

/**
 * Computes a robust perceptual visual fingerprint (dHash + average color + aspect + alpha).
 * Allows detecting exact visual duplicates, near-identical visual compositions, and minor edits.
 */
export function computePerceptualFingerprint(
  img: HTMLImageElement | HTMLCanvasElement,
  backgroundAnalysis?: BackgroundAnalysis
): string {
  try {
    // 1. Difference Hash (dHash) on 9x8 grayscale canvas -> 64-bit binary string
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';

    ctx.drawImage(img, 0, 0, 9, 8);
    const imgData = ctx.getImageData(0, 0, 9, 8).data;

    let dHashBits = '';
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const idxLeft = (y * 9 + x) * 4;
        const idxRight = (y * 9 + (x + 1)) * 4;

        const leftLum =
          imgData[idxLeft] * 0.299 +
          imgData[idxLeft + 1] * 0.587 +
          imgData[idxLeft + 2] * 0.114;
        const rightLum =
          imgData[idxRight] * 0.299 +
          imgData[idxRight + 1] * 0.587 +
          imgData[idxRight + 2] * 0.114;

        dHashBits += leftLum > rightLum ? '1' : '0';
      }
    }

    // 2. Average Color from 16x16 sampling
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = 16;
    colorCanvas.height = 16;
    const cCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
    if (!cCtx) return dHashBits;

    cCtx.drawImage(img, 0, 0, 16, 16);
    const cData = cCtx.getImageData(0, 0, 16, 16).data;

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let validPix = 0;

    for (let i = 0; i < cData.length; i += 4) {
      if (cData[i + 3] > 30) {
        sumR += cData[i];
        sumG += cData[i + 1];
        sumB += cData[i + 2];
        validPix++;
      }
    }

    const avgR = validPix ? Math.round(sumR / validPix) : 128;
    const avgG = validPix ? Math.round(sumG / validPix) : 128;
    const avgB = validPix ? Math.round(sumB / validPix) : 128;

    const bgType = backgroundAnalysis?.backgroundType || 'scene';
    const isTrans = backgroundAnalysis?.isTransparent ? 'T' : 'O';
    const aspect = ((img.width || 1) / (img.height || 1)).toFixed(2);

    return `${dHashBits}:${avgR.toString(16).padStart(2, '0')}${avgG
      .toString(16)
      .padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}:${aspect}:${isTrans}:${bgType}`;
  } catch {
    return '';
  }
}

/**
 * Performs direct client-side pixel and alpha-channel analysis on the uploaded image.
 */
export function analyzeImagePixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  isPngOrWebp: boolean
): BackgroundAnalysis {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const totalPixels = width * height;

  let transparentCount = 0;
  let semiTransparentCount = 0;
  let opaqueCount = 0;

  // Track border pixels for background color analysis
  const borderPixels: { r: number; g: number; b: number; a: number }[] = [];
  let borderTransparentCount = 0;

  // Margin for border sampling (top, bottom, left, right 5%)
  const marginX = Math.max(1, Math.floor(width * 0.05));
  const marginY = Math.max(1, Math.floor(height * 0.05));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 30) {
        transparentCount++;
      } else if (a < 240) {
        semiTransparentCount++;
      } else {
        opaqueCount++;
      }

      // Check if this pixel is on the perimeter/border
      const isBorder =
        x < marginX || x >= width - marginX || y < marginY || y >= height - marginY;
      if (isBorder) {
        borderPixels.push({ r, g, b, a });
        if (a < 50) {
          borderTransparentCount++;
        }
      }
    }
  }

  const totalBorderPixels = borderPixels.length || 1;
  const transparentPercentage = Math.round(
    ((transparentCount + semiTransparentCount) / totalPixels) * 100
  );
  const borderTransparentPercentage = Math.round(
    (borderTransparentCount / totalBorderPixels) * 100
  );

  const hasAlphaChannel = isPngOrWebp && (transparentCount > 0 || semiTransparentCount > 0);
  const isTransparent =
    hasAlphaChannel && (borderTransparentPercentage >= 20 || transparentPercentage >= 5);
  const isPartiallyTransparent = semiTransparentCount > 10;

  let backgroundType: BackgroundAnalysis['backgroundType'] = 'full_scene';
  let backgroundDescription = 'Full scene composition / environmental background';
  let isIsolatedObject = false;

  if (isTransparent) {
    if (transparentPercentage > 35 || borderTransparentPercentage > 60) {
      backgroundType = 'transparent_cutout';
      backgroundDescription =
        'Isolated object/graphic on transparent background (PNG alpha channel)';
    } else {
      backgroundType = 'transparent';
      backgroundDescription = 'Transparent PNG background';
    }
    isIsolatedObject = true;
  } else {
    // Analyze opaque border pixels
    const opaqueBorders = borderPixels.filter((p) => p.a >= 240);
    if (opaqueBorders.length > 0) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;

      for (const p of opaqueBorders) {
        sumR += p.r;
        sumG += p.g;
        sumB += p.b;
      }

      const avgR = sumR / opaqueBorders.length;
      const avgG = sumG / opaqueBorders.length;
      const avgB = sumB / opaqueBorders.length;

      // Variance calculation
      let variance = 0;
      for (const p of opaqueBorders) {
        const diffR = p.r - avgR;
        const diffG = p.g - avgG;
        const diffB = p.b - avgB;
        variance += diffR * diffR + diffG * diffG + diffB * diffB;
      }
      const stdDev = Math.sqrt(variance / (opaqueBorders.length * 3));

      // White background threshold: Average R,G,B > 238 and low std dev
      if (avgR > 238 && avgG > 238 && avgB > 238 && stdDev < 15) {
        backgroundType = 'white';
        backgroundDescription = 'Isolated on clean white background';
        isIsolatedObject = true;
      } else if (avgR < 25 && avgG < 25 && avgB < 25 && stdDev < 12) {
        backgroundType = 'black';
        backgroundDescription = 'Isolated on solid black/dark background';
        isIsolatedObject = true;
      } else if (stdDev < 16) {
        backgroundType = 'solid_color';
        backgroundDescription = `Solid uniform color background (RGB: ${Math.round(
          avgR
        )}, ${Math.round(avgG)}, ${Math.round(avgB)})`;
        isIsolatedObject = true;
      } else {
        backgroundType = 'full_scene';
        backgroundDescription = 'Full scene / rich environmental setting';
        isIsolatedObject = false;
      }
    }
  }

  return {
    isTransparent,
    isPartiallyTransparent,
    hasAlphaChannel,
    transparentPercentage,
    borderTransparentPercentage,
    backgroundType,
    backgroundDescription,
    isIsolatedObject,
  };
}

/**
 * Generates a clean, professional vector-file placeholder/preview with a dynamic label and filename.
 */
export function getVectorPlaceholderDataUrl(extension: string, filename: string): string {
  const label = extension.replace('.', '').toUpperCase();
  const escapedFilename = filename.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
    <rect width="100%" height="100%" fill="#0f172a"/>
    <rect x="20" y="20" width="360" height="260" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
    <g transform="translate(150, 60)">
      <path d="M10 0 L70 0 L100 30 L100 110 L10 110 Z" fill="#0f172a" stroke="#475569" stroke-width="3"/>
      <path d="M70 0 L70 30 L100 30 Z" fill="#334155" stroke="#475569" stroke-width="3"/>
      <text x="50" y="75" font-family="monospace" font-size="20" font-weight="bold" fill="#38bdf8" text-anchor="middle">${label}</text>
    </g>
    <text x="200" y="210" font-family="sans-serif" font-size="14" font-weight="600" fill="#f1f5f9" text-anchor="middle">Vector Asset</text>
    <text x="200" y="235" font-family="sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">${escapedFilename}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/**
 * Reads user uploaded File and creates:
 * 1. An ultra-lightweight thumbnail (max 280px) for preview rendering.
 * 2. An optimized image (max 1200px) for AI vision analysis.
 * 3. Inspects actual image pixels and calculates BackgroundAnalysis.
 * 4. Calculates exact fileContentHash (SHA-256) and perceptual visualFingerprint.
 * 5. Preserves originalFilename STRICTLY as file.name.
 */
export async function processUploadedFile(file: File): Promise<ProcessedUpload> {
  const originalFilename = file.name;
  const fileSize = file.size;
  const ext = '.' + originalFilename.split('.').pop()?.toLowerCase();
  
  const isPng = file.type === 'image/png' || ext === '.png';
  const isWebP = file.type === 'image/webp' || ext === '.webp';
  const isSvg = file.type === 'image/svg+xml' || ext === '.svg';
  const isEps = ext === '.eps';
  const isAi = ext === '.ai';
  const isVectorBinary = isEps || isAi;

  const supportsTransparency = isPng || isWebP || isSvg;
  const fileContentHash = await computeFileContentHash(file);

  if (isVectorBinary) {
    const placeholderUrl = getVectorPlaceholderDataUrl(ext, originalFilename);
    const backgroundAnalysis: BackgroundAnalysis = {
      isTransparent: false,
      isPartiallyTransparent: false,
      hasAlphaChannel: false,
      transparentPercentage: 0,
      borderTransparentPercentage: 0,
      backgroundType: 'full_scene',
      backgroundDescription: 'Vector graphic file (EPS/AI binary format)',
      isIsolatedObject: true,
    };

    // Prepare a rasterized placeholder representation so the AI vision model parses it cleanly
    let aiBase64 = placeholderUrl;
    try {
      const img = new Image();
      aiBase64 = await new Promise<string>((resolveImg) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 400;
          canvas.height = 300;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolveImg(canvas.toDataURL('image/jpeg', 0.85));
          } else {
            resolveImg(placeholderUrl);
          }
        };
        img.onerror = () => resolveImg(placeholderUrl);
        img.src = placeholderUrl;
      });
    } catch {
      aiBase64 = placeholderUrl;
    }

    return {
      originalFilename,
      fileSize,
      mimeType: isEps ? 'image/x-eps' : 'application/illustrator',
      thumbnailUrl: placeholderUrl,
      aiBase64,
      backgroundAnalysis,
      fileContentHash,
      visualFingerprint: `vector-fingerprint:${ext}:${fileSize}`,
    };
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    const cleanup = () => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
    };

    img.onerror = () => {
      cleanup();
      reject(
        new Error(`File "${originalFilename}" appears corrupted or is not a valid image.`)
      );
    };

    img.onload = () => {
      try {
        // 1. Generate Thumbnail for UI cards/table (max 280px)
        const thumbCanvas = document.createElement('canvas');
        const thumbMax = 280;
        let tw = img.width || 800;
        let th = img.height || 600;

        if (tw > th) {
          if (tw > thumbMax) {
            th = Math.round((th * thumbMax) / tw);
            tw = thumbMax;
          }
        } else {
          if (th > thumbMax) {
            tw = Math.round((tw * thumbMax) / th);
            th = thumbMax;
          }
        }
        thumbCanvas.width = tw;
        thumbCanvas.height = th;
        const thumbCtx = thumbCanvas.getContext('2d', { alpha: true });
        if (thumbCtx) {
          thumbCtx.imageSmoothingEnabled = true;
          thumbCtx.imageSmoothingQuality = 'medium';
          thumbCtx.clearRect(0, 0, tw, th);
          thumbCtx.drawImage(img, 0, 0, tw, th);
        }

        const thumbnailUrl = supportsTransparency
          ? thumbCanvas.toDataURL('image/png')
          : thumbCanvas.toDataURL('image/jpeg', 0.82);

        // 2. Generate AI Vision Input (optimized to 512px to preserve visual detail while fitting within API token limits)
        const aiCanvas = document.createElement('canvas');
        const aiMax = 512;
        let aw = img.width || 800;
        let ah = img.height || 600;

        if (aw > ah) {
          if (aw > aiMax) {
            ah = Math.round((ah * aiMax) / aw);
            aw = aiMax;
          }
        } else {
          if (ah > aiMax) {
            aw = Math.round((aw * aiMax) / ah);
            ah = aiMax;
          }
        }
        aiCanvas.width = aw;
        aiCanvas.height = ah;
        const aiCtx = aiCanvas.getContext('2d', { alpha: true });
        if (aiCtx) {
          aiCtx.imageSmoothingEnabled = true;
          aiCtx.imageSmoothingQuality = 'high';
          aiCtx.clearRect(0, 0, aw, ah);
          aiCtx.drawImage(img, 0, 0, aw, ah);
        }

        // 3. Perform accurate client-side pixel & alpha channel analysis
        const backgroundAnalysis = aiCtx
          ? analyzeImagePixels(aiCtx, aw, ah, supportsTransparency)
          : {
              isTransparent: isSvg,
              isPartiallyTransparent: false,
              hasAlphaChannel: isSvg,
              transparentPercentage: isSvg ? 100 : 0,
              borderTransparentPercentage: isSvg ? 100 : 0,
              backgroundType: isSvg ? 'transparent' as const : 'full_scene' as const,
              backgroundDescription: isSvg ? 'Vector SVG background' : 'Default scene',
              isIsolatedObject: isSvg,
            };

        // 4. Compute perceptual visual fingerprint
        const visualFingerprint = computePerceptualFingerprint(img, backgroundAnalysis);

        const aiBase64 = supportsTransparency
          ? aiCanvas.toDataURL('image/png')
          : aiCanvas.toDataURL('image/jpeg', 0.85);

        cleanup();

        resolve({
          originalFilename,
          fileSize,
          mimeType: isSvg ? 'image/svg+xml' : (supportsTransparency ? 'image/png' : 'image/jpeg'),
          thumbnailUrl,
          aiBase64,
          backgroundAnalysis,
          fileContentHash,
          visualFingerprint,
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    img.src = objectUrl;
  });
}
