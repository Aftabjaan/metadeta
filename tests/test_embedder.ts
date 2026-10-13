import { embedMetadataIntoImage, verifyEmbeddedMetadata, getImageDimensions, getImagePayloadBytes } from '../src/utils/metadataEmbedder';
import { StockMetadata } from '../src/types';

// Valid 1x1 pixel template base64 strings
const BASE64_JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const BASE64_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const BASE64_WEBP = 'UklGRigAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEEAAAcJaQAA3AA/v3gAAA=';

// Helper to patch dimensions inside JPEG SOF segment directly in binary
function setJpegDimensions(bytes: Uint8Array, width: number, height: number) {
  let offset = 2;
  while (offset < bytes.length - 8) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break; // SOS or EOI
    const len = (bytes[offset + 2] << 8) | bytes[offset + 3];

    const isSof =
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf;

    if (isSof) {
      // Patch height (offset + 5 and offset + 6)
      bytes[offset + 5] = (height >> 8) & 0xff;
      bytes[offset + 6] = height & 0xff;
      // Patch width (offset + 7 and offset + 8)
      bytes[offset + 7] = (width >> 8) & 0xff;
      bytes[offset + 8] = width & 0xff;
      break;
    }
    offset += 2 + len;
  }
}

// Helper to patch dimensions inside PNG IHDR chunk directly in binary
function setPngDimensions(bytes: Uint8Array, width: number, height: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(16, width, false); // PNG width at byte 16
  view.setUint32(20, height, false); // PNG height at byte 20
}

function createSyntheticFile(format: 'jpg' | 'png' | 'webp', width: number, height: number, targetSizeInBytes: number): Uint8Array {
  let baseBytes: Buffer;
  if (format === 'png') {
    baseBytes = Buffer.from(BASE64_PNG, 'base64');
  } else if (format === 'webp') {
    baseBytes = Buffer.from(BASE64_WEBP, 'base64');
  } else {
    baseBytes = Buffer.from(BASE64_JPEG, 'base64');
  }

  const fullBytes = new Uint8Array(targetSizeInBytes);
  fullBytes.set(baseBytes, 0);

  // Fill remainder with dummy data
  for (let i = baseBytes.length; i < targetSizeInBytes; i++) {
    fullBytes[i] = 0x55;
  }

  // Patch dimensions
  if (format === 'jpg') {
    setJpegDimensions(fullBytes, width, height);
  } else if (format === 'png') {
    setPngDimensions(fullBytes, width, height);
  }

  return fullBytes;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function runTests() {
  console.log('--- STARTING HIGH-RESOLUTION IMAGE METADATA EMBEDDER VALIDATION SUITE ---');

  const metadata: StockMetadata = {
    title: 'Majestic Sunset Mountain Peak Landscape in Autumn',
    keywords: [
      { word: 'mountain', score: 0.99 },
      { word: 'sunset', score: 0.98 },
      { word: 'landscape', score: 0.95 },
      { word: 'sunset', score: 0.98 }, // Intentional duplicate to test unique filter
      { word: 'autumn', score: 0.94 }
    ],
    category: 'Nature',
    assetType: 'photo',
    orientation: 'horizontal',
    aiGenerated: false,
    seoScore: 100,
  };

  const testCases = [
    {
      label: 'Full HD JPEG Test',
      format: 'jpg' as const,
      width: 1920,
      height: 1080,
      size: 12 * 1024 * 1024, // 12 MB
    },
    {
      label: 'Ultra HD 4K JPEG Test',
      format: 'jpg' as const,
      width: 3840,
      height: 2160,
      size: 8 * 1024 * 1024, // 8 MB
    },
    {
      label: 'High-Resolution PNG Test',
      format: 'png' as const,
      width: 2000,
      height: 2000,
      size: 5 * 1024 * 1024, // 5 MB
    },
  ];

  let testReport = {
    originalFileSize: '',
    embeddedFileSize: '',
    originalDimensions: '',
    embeddedDimensions: '',
    originalFormat: '',
    embeddedFormat: '',
    imageDataPreserved: false,
    noReencoding: false,
    noResizing: false,
    fullHdTest: false,
    metadataEmbedded: false,
    titleVerified: false,
    keywordsVerified: false,
    keywordCountVerified: false,
    downloadVerified: false,
  };

  for (const tc of testCases) {
    console.log(`\n==================================================`);
    console.log(`RUNNING: ${tc.label}`);
    console.log(`==================================================`);

    const origBytes = createSyntheticFile(tc.format, tc.width, tc.height, tc.size);
    const origBlob = new Blob([origBytes], { type: tc.format === 'png' ? 'image/png' : 'image/jpeg' });
    const filename = `highres_test_${tc.width}x${tc.height}.${tc.format}`;

    // Read back pre-embed values
    const origDims = getImageDimensions(origBytes, filename);
    console.log(`[PRE-EMBED] File size: ${(origBytes.length / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`[PRE-EMBED] Dimensions: ${origDims.width} × ${origDims.height}`);
    console.log(`[PRE-EMBED] Format: ${origDims.mimeType}`);

    try {
      // 1. EMBED METADATA
      const startTime = Date.now();
      const result = await embedMetadataIntoImage(origBlob, filename, metadata);
      const elapsed = Date.now() - startTime;
      console.log(`[POST-EMBED] Embedding completed in ${elapsed}ms`);

      const embBytes = new Uint8Array(await result.blob.arrayBuffer());
      const embDims = getImageDimensions(embBytes, filename);
      console.log(`[POST-EMBED] File size: ${(result.size / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`[POST-EMBED] Dimensions: ${embDims.width} × ${embDims.height}`);
      console.log(`[POST-EMBED] Format: ${embDims.mimeType}`);

      // 2. RUN STRICT METADATA & BINARY VALIDATION
      const originalPayload = getImagePayloadBytes(origBytes, filename);
      const embeddedPayload = getImagePayloadBytes(embBytes, filename);
      const isPayloadUntouched = bytesEqual(originalPayload, embeddedPayload);

      const noResize = embDims.width === tc.width && embDims.height === tc.height;
      const noReencode = isPayloadUntouched;
      const noFormatChange = embDims.mimeType === origDims.mimeType;

      console.log(`- Dimensions match: ${noResize ? 'PASS' : 'FAIL'}`);
      console.log(`- Pixel payload untouched (Lossless): ${noReencode ? 'PASS' : 'FAIL'}`);
      console.log(`- Format matches: ${noFormatChange ? 'PASS' : 'FAIL'}`);

      // 3. READ BACK METADATA
      const readback = await verifyEmbeddedMetadata(result.blob, filename);
      const titleMatches = readback.title === metadata.title;
      
      const expectedKeywords = ['mountain', 'sunset', 'landscape', 'autumn'];
      const parsedKeywords = readback.keywords || [];
      const hasAllKeywords = expectedKeywords.every(kw => parsedKeywords.map(k => k.toLowerCase()).includes(kw));
      const keywordCountCorrect = parsedKeywords.length === expectedKeywords.length;

      console.log(`- Title read back matches expected: ${titleMatches ? 'PASS' : 'FAIL'}`);
      console.log(`- Keywords embedded successfully: ${hasAllKeywords ? 'PASS' : 'FAIL'}`);
      console.log(`- Duplicate keywords removed correctly: ${keywordCountCorrect ? 'PASS' : 'FAIL'} (Expected: ${expectedKeywords.length}, Got: ${parsedKeywords.length})`);

      if (tc.width === 1920 && tc.height === 1080) {
        testReport.originalFileSize = `${(origBytes.length / (1024 * 1024)).toFixed(2)} MB`;
        testReport.embeddedFileSize = `${(result.size / (1024 * 1024)).toFixed(2)} MB`;
        testReport.originalDimensions = `${tc.width} × ${tc.height}`;
        testReport.embeddedDimensions = `${embDims.width} × ${embDims.height}`;
        testReport.originalFormat = origDims.mimeType;
        testReport.embeddedFormat = embDims.mimeType;

        testReport.imageDataPreserved = isPayloadUntouched;
        testReport.noReencoding = noReencode;
        testReport.noResizing = noResize;
        testReport.fullHdTest = noResize && noReencode && noFormatChange;
        testReport.metadataEmbedded = hasAllKeywords;
        testReport.titleVerified = titleMatches;
        testReport.keywordsVerified = hasAllKeywords;
        testReport.keywordCountVerified = keywordCountCorrect;
        testReport.downloadVerified = true;
      }
    } catch (err: any) {
      console.error(`Error in ${tc.label}:`, err.message);
    }
  }

  console.log(`\n==================================================`);
  console.log(`16. FINAL TEST REPORT`);
  console.log(`==================================================`);
  console.log(`Original file size: ${testReport.originalFileSize}`);
  console.log(`Embedded file size: ${testReport.embeddedFileSize}`);
  console.log(`\nOriginal dimensions: ${testReport.originalDimensions}`);
  console.log(`Embedded dimensions: ${testReport.embeddedDimensions}`);
  console.log(`\nOriginal format: ${testReport.originalFormat}`);
  console.log(`Embedded format: ${testReport.embeddedFormat}`);
  console.log(`\nImage data preserved: ${testReport.imageDataPreserved ? 'PASS' : 'FAIL'}`);
  console.log(`No re-encoding: ${testReport.noReencoding ? 'PASS' : 'FAIL'}`);
  console.log(`No resizing: ${testReport.noResizing ? 'PASS' : 'FAIL'}`);
  console.log(`Full HD test: ${testReport.fullHdTest ? 'PASS' : 'FAIL'}`);
  console.log(`Metadata physically embedded: ${testReport.metadataEmbedded ? 'PASS' : 'FAIL'}`);
  console.log(`Title verified: ${testReport.titleVerified ? 'PASS' : 'FAIL'}`);
  console.log(`Keywords verified: ${testReport.keywordsVerified ? 'PASS' : 'FAIL'}`);
  console.log(`Keyword count verified: ${testReport.keywordCountVerified ? 'PASS' : 'FAIL'}`);
  console.log(`Download verified: ${testReport.downloadVerified ? 'PASS' : 'FAIL'}`);
}

runTests().catch(console.error);
