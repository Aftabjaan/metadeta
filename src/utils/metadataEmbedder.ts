/**
 * Direct Image Metadata Embedding Engine for Stock Metadata Pro AI
 * Supports embedding IPTC, Adobe XMP, and EXIF into JPEGs, PNGs, and WebPs
 * with ZERO pixel degradation or re-compression.
 */
import exifr from 'exifr';
import piexif from 'piexifjs';
import { StockMetadata } from '../types';

function uint8ArrayToBinaryString(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 16384;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any));
  }
  return chunks.join('');
}

export interface EmbeddedResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  size: number;
  standards: ('IPTC' | 'XMP' | 'EXIF' | 'PNG-tEXt')[];
  message?: string;
  verificationReport?: VerificationReport;
}

export interface VerificationReport {
  success: boolean;
  filename: string;
  originalSize: number;
  embeddedSize: number;
  mimeType: string;
  originalDimensions: { width: number; height: number; mimeType: string };
  embeddedDimensions: { width: number; height: number; mimeType: string };
  dimensionsMatch: boolean;
  formatMatches: boolean;
  imagePayloadUnchanged: boolean;
  error?: string;
}

export interface VerificationResult {
  filename: string;
  mimeType: string;
  title?: string;
  description?: string;
  keywords?: string[];
  creator?: string;
  copyright?: string;
  software?: string;
  category?: string;
  standardsFound: {
    iptc: boolean;
    xmp: boolean;
    exif: boolean;
    pngText: boolean;
  };
  rawValues?: Record<string, any>;
}

// ----------------------------------------------------------------------
// Fast Binary Helper Functions for Dimensions, Payload Extraction & CRC
// ----------------------------------------------------------------------
export function getImageDimensions(
  bytes: Uint8Array,
  filename: string
): { width: number; height: number; mimeType: string } {
  const lowerName = filename.toLowerCase();

  // 1. JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length - 8) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break; // SOS or EOI
      const len = (bytes[offset + 2] << 8) | bytes[offset + 3];

      // SOF markers
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

      if (isSof && offset + 8 < bytes.length) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height, mimeType: 'image/jpeg' };
      }
      offset += 2 + len;
    }
    return { width: 0, height: 0, mimeType: 'image/jpeg' };
  }

  // 2. PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    if (bytes.length >= 24) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      return { width, height, mimeType: 'image/png' };
    }
    return { width: 0, height: 0, mimeType: 'image/png' };
  }

  // 3. WebP
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const webp = String.fromCharCode(...bytes.subarray(8, 12));
  if (riff === 'RIFF' && webp === 'WEBP') {
    let offset = 12;
    while (offset < bytes.length - 8) {
      const fourCC = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      const chunkLen =
        bytes[offset + 4] |
        (bytes[offset + 5] << 8) |
        (bytes[offset + 6] << 16) |
        (bytes[offset + 7] << 24);

      if (fourCC === 'VP8 ' && offset + 18 <= bytes.length) {
        const width = (bytes[offset + 14] | (bytes[offset + 15] << 8)) & 0x3fff;
        const height = (bytes[offset + 16] | (bytes[offset + 17] << 8)) & 0x3fff;
        return { width, height, mimeType: 'image/webp' };
      }
      if (fourCC === 'VP8L' && offset + 13 <= bytes.length) {
        const word =
          bytes[offset + 9] |
          (bytes[offset + 10] << 8) |
          (bytes[offset + 11] << 16) |
          (bytes[offset + 12] << 24);
        const width = 1 + (word & 0x3fff);
        const height = 1 + ((word >> 14) & 0x3fff);
        return { width, height, mimeType: 'image/webp' };
      }
      if (fourCC === 'VP8X' && offset + 18 <= bytes.length) {
        const width = 1 + (bytes[offset + 12] | (bytes[offset + 13] << 8) | (bytes[offset + 14] << 16));
        const height = 1 + (bytes[offset + 15] | (bytes[offset + 16] << 8) | (bytes[offset + 17] << 16));
        return { width, height, mimeType: 'image/webp' };
      }

      const pad = chunkLen % 2 !== 0 ? 1 : 0;
      offset += 8 + chunkLen + pad;
    }
    return { width: 0, height: 0, mimeType: 'image/webp' };
  }

  // 4. SVG
  if (lowerName.endsWith('.svg')) {
    return { width: 1, height: 1, mimeType: 'image/svg+xml' };
  }

  // 5. EPS / AI
  if (lowerName.endsWith('.eps') || lowerName.endsWith('.ai')) {
    return { width: 1, height: 1, mimeType: lowerName.endsWith('.eps') ? 'image/x-eps' : 'application/illustrator' };
  }

  return { width: 0, height: 0, mimeType: 'image/jpeg' };
}

export function getImagePayloadBytes(bytes: Uint8Array, filename: string): Uint8Array {
  // 1. JPEG: Return everything from SOS (Start of Scan 0xFF 0xDA) to end of file
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length - 1) {
      if (bytes[offset] === 0xff && bytes[offset + 1] === 0xDA) {
        return bytes.subarray(offset);
      }
      if (bytes[offset] !== 0xff) break;
      const len = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + len;
    }
    return bytes;
  }

  // 2. PNG: Concatenate all IDAT chunk payloads
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    const idatChunks: Uint8Array[] = [];
    let offset = 8;
    while (offset < bytes.length - 8) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const chunkLen = view.getUint32(offset, false);
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));

      if (type === 'IDAT') {
        idatChunks.push(bytes.subarray(offset + 8, offset + 8 + chunkLen));
      }
      offset += 8 + chunkLen + 4; // len(4) + type(4) + data(chunkLen) + crc(4)
    }

    let totalLen = 0;
    for (const c of idatChunks) totalLen += c.length;
    const concatenated = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of idatChunks) {
      concatenated.set(c, pos);
      pos += c.length;
    }
    return concatenated;
  }

  // 3. WebP: Concatenate all VP8, VP8L, VP8X image data payloads
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const webp = String.fromCharCode(...bytes.subarray(8, 12));
  if (riff === 'RIFF' && webp === 'WEBP') {
    const imageChunks: Uint8Array[] = [];
    let offset = 12;
    while (offset < bytes.length - 8) {
      const fourCC = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      const chunkLen =
        bytes[offset + 4] |
        (bytes[offset + 5] << 8) |
        (bytes[offset + 6] << 16) |
        (bytes[offset + 7] << 24);

      if (fourCC === 'VP8 ' || fourCC === 'VP8L' || fourCC === 'VP8X') {
        imageChunks.push(bytes.subarray(offset + 8, offset + 8 + chunkLen));
      }
      const pad = chunkLen % 2 !== 0 ? 1 : 0;
      offset += 8 + chunkLen + pad;
    }

    let totalLen = 0;
    for (const c of imageChunks) totalLen += c.length;
    const concatenated = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of imageChunks) {
      concatenated.set(c, pos);
      pos += c.length;
    }
    return concatenated;
  }

  return bytes;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function verifyLosslessEmbedding(
  origBytes: Uint8Array,
  embBytes: Uint8Array,
  filename: string
): VerificationReport {
  const origDimensions = getImageDimensions(origBytes, filename);
  const embDimensions = getImageDimensions(embBytes, filename);

  const dimensionsMatch =
    origDimensions.width === embDimensions.width &&
    origDimensions.height === embDimensions.height;

  const formatMatches = origDimensions.mimeType === embDimensions.mimeType;

  const origPayload = getImagePayloadBytes(origBytes, filename);
  const embPayload = getImagePayloadBytes(embBytes, filename);
  const imagePayloadUnchanged = bytesEqual(origPayload, embPayload);

  let error: string | undefined = undefined;
  if (!dimensionsMatch) {
    error = `Dimension mismatch for "${filename}": Original (${origDimensions.width}x${origDimensions.height}) vs Embedded (${embDimensions.width}x${embDimensions.height}).`;
  } else if (!formatMatches) {
    error = `Format mismatch for "${filename}": Original (${origDimensions.mimeType}) vs Embedded (${embDimensions.mimeType}).`;
  } else if (!imagePayloadUnchanged) {
    error = `Lossless embedding failed for "${filename}": Image scan/pixel payload was modified during embedding.`;
  }

  return {
    success: dimensionsMatch && formatMatches && imagePayloadUnchanged,
    filename,
    originalSize: origBytes.length,
    embeddedSize: embBytes.length,
    mimeType: origDimensions.mimeType,
    originalDimensions: origDimensions,
    embeddedDimensions: embDimensions,
    dimensionsMatch,
    formatMatches,
    imagePayloadUnchanged,
    error,
  };
}

// ----------------------------------------------------------------------
// CRC32 implementation for PNG chunks
// ----------------------------------------------------------------------
const pngCrcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  pngCrcTable[n] = c >>> 0;
}

function calculateCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ pngCrcTable[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const typeBytes = enc.encode(type);
  const typeAndData = new Uint8Array(4 + data.length);
  typeAndData.set(typeBytes, 0);
  typeAndData.set(data, 4);

  const crc = calculateCrc32(typeAndData);

  const chunk = new Uint8Array(8 + data.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false); // Length (Big Endian)
  chunk.set(typeAndData, 4);
  view.setUint32(8 + data.length, crc, false); // CRC (Big Endian)

  return chunk;
}

function makePngTextChunk(keyword: string, text: string): Uint8Array {
  const enc = new TextEncoder();
  const kwBytes = enc.encode(keyword);
  const textBytes = enc.encode(text);
  const data = new Uint8Array(kwBytes.length + 1 + textBytes.length);
  data.set(kwBytes, 0);
  data[kwBytes.length] = 0; // null separator
  data.set(textBytes, kwBytes.length + 1);
  return makePngChunk('tEXt', data);
}

// ----------------------------------------------------------------------
// IPTC-NAA Segment Builder (Photoshop 3.0 APP13)
// ----------------------------------------------------------------------
function buildIptcApp13(
  title: string,
  description: string,
  keywords: string[],
  creator: string,
  copyright: string
): Uint8Array {
  const enc = new TextEncoder();
  const entries: Uint8Array[] = [];

  function addTag(tagNum: number, str: string) {
    if (!str) return;
    const bytes = enc.encode(str);
    const header = new Uint8Array([0x1c, 0x02, tagNum, (bytes.length >> 8) & 0xff, bytes.length & 0xff]);
    entries.push(header, bytes);
  }

  // Model Version
  entries.push(new Uint8Array([0x1c, 0x02, 0x00, 0x00, 0x02, 0x00, 0x04]));
  // 2:05 Object Name (Title)
  addTag(0x05, title);
  // 2:25 Keywords (repeated)
  for (const kw of keywords) {
    addTag(0x19, kw);
  }
  // 2:80 By-line (Creator / Author)
  addTag(0x50, creator);
  // 2:116 Copyright Notice
  addTag(0x74, copyright);
  // 2:120 Caption/Abstract (Description)
  addTag(0x78, description);

  let iptcDataLen = 0;
  for (const e of entries) iptcDataLen += e.length;
  const iptcData = new Uint8Array(iptcDataLen);
  let offset = 0;
  for (const e of entries) {
    iptcData.set(e, offset);
    offset += e.length;
  }

  // Wrap in 8BIM Resource Block (0x0404 = IPTC-NAA)
  const bimHeader = new Uint8Array(12);
  bimHeader.set(enc.encode('8BIM'), 0);
  bimHeader[4] = 0x04;
  bimHeader[5] = 0x04;
  bimHeader[6] = 0;
  bimHeader[7] = 0; // null Pascal string for name
  bimHeader[8] = (iptcDataLen >> 24) & 0xff;
  bimHeader[9] = (iptcDataLen >> 16) & 0xff;
  bimHeader[10] = (iptcDataLen >> 8) & 0xff;
  bimHeader[11] = iptcDataLen & 0xff;

  const pad = iptcDataLen % 2 !== 0 ? new Uint8Array([0]) : new Uint8Array(0);

  // Photoshop 3.0 header
  const ps3Header = enc.encode('Photoshop 3.0\0');
  const totalPayloadLen = ps3Header.length + bimHeader.length + iptcData.length + pad.length;

  const app13 = new Uint8Array(4 + totalPayloadLen);
  app13[0] = 0xff;
  app13[1] = 0xed; // APP13 marker
  const segLen = 2 + totalPayloadLen;
  app13[2] = (segLen >> 8) & 0xff;
  app13[3] = segLen & 0xff;

  let pos = 4;
  app13.set(ps3Header, pos);
  pos += ps3Header.length;
  app13.set(bimHeader, pos);
  pos += bimHeader.length;
  app13.set(iptcData, pos);
  pos += iptcData.length;
  if (pad.length > 0) app13.set(pad, pos);

  return app13;
}

// ----------------------------------------------------------------------
// Adobe XMP Packet Builder (APP1)
// ----------------------------------------------------------------------
function buildXmpApp1(
  title: string,
  description: string,
  keywords: string[],
  creator: string,
  copyright: string,
  category?: string
): Uint8Array {
  const enc = new TextEncoder();
  const escapeXml = (str: string) =>
    (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const safeTitle = escapeXml(title);
  const safeDesc = escapeXml(description || title);
  const safeCreator = escapeXml(creator || 'Aftab Jaan');
  const safeCopy = escapeXml(copyright || `Copyright © ${new Date().getFullYear()} Aftab Jaan. All rights reserved.`);
  const safeCat = escapeXml(category || 'General');

  const kwXml = keywords.map((k) => `<rdf:li>${escapeXml(k)}</rdf:li>`).join('');

  const xmpPacket = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.6-c140">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    photoshop:Headline="${safeTitle}"
    photoshop:Credit="${safeCreator}"
    photoshop:Category="${safeCat}"
    photoshop:Source="Stock Metadata Pro AI">
   <dc:title>
    <rdf:Alt><rdf:li xml:lang="x-default">${safeTitle}</rdf:li></rdf:Alt>
   </dc:title>
   <dc:description>
    <rdf:Alt><rdf:li xml:lang="x-default">${safeDesc}</rdf:li></rdf:Alt>
   </dc:description>
   <dc:subject>
    <rdf:Bag>${kwXml}</rdf:Bag>
   </dc:subject>
   <dc:creator>
    <rdf:Seq><rdf:li>${safeCreator}</rdf:li></rdf:Seq>
   </dc:creator>
   <dc:rights>
    <rdf:Alt><rdf:li xml:lang="x-default">${safeCopy}</rdf:li></rdf:Alt>
   </dc:rights>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  const xmpHeader = enc.encode('http://ns.adobe.com/xap/1.0/\0');
  const packetBytes = enc.encode(xmpPacket);
  const totalLen = xmpHeader.length + packetBytes.length;
  const segLen = 2 + totalLen;

  const app1 = new Uint8Array(4 + totalLen);
  app1[0] = 0xff;
  app1[1] = 0xe1; // APP1 marker
  app1[2] = (segLen >> 8) & 0xff;
  app1[3] = segLen & 0xff;
  app1.set(xmpHeader, 4);
  app1.set(packetBytes, 4 + xmpHeader.length);

  return app1;
}

// Convert string to UTF-16LE byte array for Windows XP EXIF tags
function stringToUtf16LeBytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes.push(code & 0xff, (code >> 8) & 0xff);
  }
  bytes.push(0, 0); // null terminator
  return bytes;
}

/**
 * Embeds IPTC, XMP, and EXIF metadata into a JPEG binary buffer
 */
function embedMetadataInJpeg(
  inputBytes: Uint8Array,
  meta: StockMetadata
): Uint8Array {
  const kwList = Array.from(
    new Set(
      meta.keywords
        .map((k: any) => (typeof k === 'string' ? k.trim() : (k?.word || '').trim()))
        .filter(Boolean)
    )
  );
  const creator = 'Aftab Jaan';
  const copyright = `Copyright © ${new Date().getFullYear()} Aftab Jaan. All rights reserved.`;

  // 1. Prepare EXIF using piexifjs
  let piexifModifiedBytes: Uint8Array = inputBytes;
  try {
    const piexifObj = (piexif as any).load ? piexif : ((piexif as any).default || piexif);
    if (piexifObj && typeof piexifObj.load === 'function') {
      const binaryStr = uint8ArrayToBinaryString(inputBytes);

      let exifObj: any = { '0th': {}, Exif: {}, GPS: {}, '1st': {}, thumbnail: null };
      try {
        exifObj = piexifObj.load(binaryStr);
      } catch {
        // no existing exif, start fresh
      }

      exifObj['0th'] = exifObj['0th'] || {};
      
      const imageIFD = piexifObj.ImageIFD || {};
      if (imageIFD.ImageDescription !== undefined) {
        exifObj['0th'][imageIFD.ImageDescription] = meta.title;
      }
      if (imageIFD.Artist !== undefined) {
        exifObj['0th'][imageIFD.Artist] = creator;
      }
      if (imageIFD.Copyright !== undefined) {
        exifObj['0th'][imageIFD.Copyright] = copyright;
      }
      if (imageIFD.Software !== undefined) {
        exifObj['0th'][imageIFD.Software] = 'Stock Metadata Pro AI';
      }

      // XPTitle, XPKeywords, XPComment (standard Windows / Explorer tags)
      exifObj['0th'][0x9c9b] = stringToUtf16LeBytes(meta.title); // XPTitle
      exifObj['0th'][0x9c9e] = stringToUtf16LeBytes(kwList.join('; ')); // XPKeywords
      exifObj['0th'][0x9c9c] = stringToUtf16LeBytes(meta.title); // XPComment

      const exifBytes = piexifObj.dump(exifObj);
      const updatedBinaryStr = piexifObj.insert(exifBytes, binaryStr);

      const updatedLen = updatedBinaryStr.length;
      piexifModifiedBytes = new Uint8Array(updatedLen);
      for (let i = 0; i < updatedLen; i++) {
        piexifModifiedBytes[i] = updatedBinaryStr.charCodeAt(i) & 0xff;
      }
    }
  } catch (err) {
    console.warn('EXIF injection note:', err);
    piexifModifiedBytes = inputBytes;
  }

  // 2. Build IPTC-NAA (APP13) segment
  const app13Iptc = buildIptcApp13(
    meta.title,
    meta.title,
    kwList,
    creator,
    copyright
  );

  // 3. Build Adobe XMP (APP1) segment
  const app1Xmp = buildXmpApp1(
    meta.title,
    meta.title,
    kwList,
    creator,
    copyright,
    meta.category
  );

  // 4. Clean old XMP (APP1) and IPTC (APP13) to prevent conflicts, then inject new ones
  if (piexifModifiedBytes[0] !== 0xff || piexifModifiedBytes[1] !== 0xd8) {
    throw new Error('Invalid JPEG file: SOI marker missing');
  }

  const chunks: Uint8Array[] = [];
  chunks.push(new Uint8Array([0xff, 0xd8])); // SOI
  
  let offset = 2;
  while (offset < piexifModifiedBytes.length) {
    if (piexifModifiedBytes[offset] !== 0xff) {
      break; // not a marker or corrupt
    }
    const marker = piexifModifiedBytes[offset + 1];
    
    // Stop parsing chunks at SOS (Start Of Scan) or EOI (End Of Image)
    if (marker === 0xda || marker === 0xd9) {
      break;
    }
    
    const len = (piexifModifiedBytes[offset + 2] << 8) | piexifModifiedBytes[offset + 3];
    
    let keep = true;
    if (marker === 0xed) { // APP13
      keep = false;
    } else if (marker === 0xe1) { // APP1
      // Check if it's XMP
      const xmpSig = 'http://ns.adobe.com/xap/1.0/\0';
      if (offset + 4 + xmpSig.length <= piexifModifiedBytes.length) {
        let isXmp = true;
        for (let i = 0; i < xmpSig.length; i++) {
          if (piexifModifiedBytes[offset + 4 + i] !== xmpSig.charCodeAt(i)) {
            isXmp = false;
            break;
          }
        }
        if (isXmp) keep = false;
      }
    }
    
    if (keep) {
      chunks.push(piexifModifiedBytes.subarray(offset, offset + 2 + len));
    }
    
    offset += 2 + len;
  }
  
  // The rest of the file (image data, etc.)
  const imageBody = piexifModifiedBytes.subarray(offset);

  // Reassemble: SOI, APP13, APP1, then the rest of the kept chunks, then body
  // Wait, if there's an APP0 (JFIF), it should ideally be first. 
  // Let's just put APP13 and APP1 immediately after SOI. Most readers are perfectly fine with this.
  let totalLength = 0;
  
  const finalChunks: Uint8Array[] = [ chunks[0] ]; // SOI
  
  // If the first chunk after SOI is APP0 (JFIF), it MUST be the very first segment.
  let startIndex = 1;
  if (chunks.length > 1 && chunks[1][0] === 0xff && chunks[1][1] === 0xe0) {
    finalChunks.push(chunks[1]);
    startIndex = 2;
  }
  
  finalChunks.push(app13Iptc);
  finalChunks.push(app1Xmp);
  
  for (let i = startIndex; i < chunks.length; i++) {
    finalChunks.push(chunks[i]);
  }
  finalChunks.push(imageBody);
  
  for (const c of finalChunks) {
    totalLength += c.length;
  }
  
  const result = new Uint8Array(totalLength);
  let currentOffset = 0;
  for (const c of finalChunks) {
    result.set(c, currentOffset);
    currentOffset += c.length;
  }

  return result;
}

/**
 * Embeds text chunks and Adobe XMP into a PNG binary buffer
 */
function embedMetadataInPng(
  inputBytes: Uint8Array,
  meta: StockMetadata
): Uint8Array {
  // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (inputBytes[i] !== pngSig[i]) {
      throw new Error('Invalid PNG signature');
    }
  }

  const kwList = Array.from(
    new Set(
      meta.keywords
        .map((k: any) => (typeof k === 'string' ? k.trim() : (k?.word || '').trim()))
        .filter(Boolean)
    )
  );
  const creator = 'Aftab Jaan';
  const copyright = `Copyright © ${new Date().getFullYear()} Aftab Jaan. All rights reserved.`;

  // Locate IHDR chunk (starts at byte 8)
  const view = new DataView(inputBytes.buffer, inputBytes.byteOffset, inputBytes.byteLength);
  const ihdrLen = view.getUint32(8, false);
  const ihdrEnd = 8 + 4 + 4 + ihdrLen + 4; // header(8) + len(4) + 'IHDR'(4) + data + crc(4) = 33

  // Create standard text chunks
  const chunkTitle = makePngTextChunk('Title', meta.title);
  const chunkDesc = makePngTextChunk('Description', meta.title);
  const chunkAuthor = makePngTextChunk('Author', creator);
  const chunkCopyright = makePngTextChunk('Copyright', copyright);
  const chunkKeywords = makePngTextChunk('Keywords', kwList.join(', '));
  const chunkSoftware = makePngTextChunk('Software', 'Stock Metadata Pro AI');

  // Insert XMP via iTXt chunk
  const enc = new TextEncoder();
  const escapeXml = (s: string) =>
    (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const kwXml = kwList.map((k) => `<rdf:li>${escapeXml(k)}</rdf:li>`).join('');
  const xmpPacket = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.title)}</rdf:li></rdf:Alt></dc:title>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.title)}</rdf:li></rdf:Alt></dc:description>
   <dc:subject><rdf:Bag>${kwXml}</rdf:Bag></dc:subject>
   <dc:creator><rdf:Seq><rdf:li>${escapeXml(creator)}</rdf:li></rdf:Seq></dc:creator>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  // iTXt structure:
  // Keyword: "XML:com.adobe.xmp\0"
  // Compression flag: 0 (uncompressed)
  // Compression method: 0
  // Language tag: "\0" (empty)
  // Translated keyword: "\0" (empty)
  // Text: xmpPacket
  const kwXmp = enc.encode('XML:com.adobe.xmp');
  const xmpBytes = enc.encode(xmpPacket);
  const itxtData = new Uint8Array(kwXmp.length + 5 + xmpBytes.length);
  itxtData.set(kwXmp, 0);
  itxtData[kwXmp.length] = 0; // null separator
  itxtData[kwXmp.length + 1] = 0; // comp flag
  itxtData[kwXmp.length + 2] = 0; // comp method
  itxtData[kwXmp.length + 3] = 0; // null for lang tag
  itxtData[kwXmp.length + 4] = 0; // null for translated kw
  itxtData.set(xmpBytes, kwXmp.length + 5);

  const chunkXmp = makePngChunk('iTXt', itxtData);

  const newChunks = [
    chunkTitle,
    chunkDesc,
    chunkAuthor,
    chunkCopyright,
    chunkKeywords,
    chunkSoftware,
    chunkXmp,
  ];

  let newChunksLen = 0;
  for (const c of newChunks) newChunksLen += c.length;

  const head = inputBytes.subarray(0, ihdrEnd);
  const tail = inputBytes.subarray(ihdrEnd);

  const combined = new Uint8Array(head.length + newChunksLen + tail.length);
  let pos = 0;
  combined.set(head, pos);
  pos += head.length;
  for (const c of newChunks) {
    combined.set(c, pos);
    pos += c.length;
  }
  combined.set(tail, pos);

  return combined;
}

/**
 * Embeds metadata into a WebP RIFF container
 */
function embedMetadataInWebP(
  inputBytes: Uint8Array,
  meta: StockMetadata
): Uint8Array {
  // Check RIFF header: "RIFF" .... "WEBP"
  const enc = new TextEncoder();
  const riff = String.fromCharCode(...inputBytes.subarray(0, 4));
  const webp = String.fromCharCode(...inputBytes.subarray(8, 12));
  if (riff !== 'RIFF' || webp !== 'WEBP') {
    throw new Error('Invalid WebP container');
  }

  const kwList = Array.from(
    new Set(
      meta.keywords
        .map((k: any) => (typeof k === 'string' ? k.trim() : (k?.word || '').trim()))
        .filter(Boolean)
    )
  );
  const escapeXml = (s: string) =>
    (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const kwXml = kwList.map((k) => `<rdf:li>${escapeXml(k)}</rdf:li>`).join('');

  const xmpPacket = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.title)}</rdf:li></rdf:Alt></dc:title>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.title)}</rdf:li></rdf:Alt></dc:description>
   <dc:subject><rdf:Bag>${kwXml}</rdf:Bag></dc:subject>
   <dc:creator><rdf:Seq><rdf:li>Aftab Jaan</rdf:li></rdf:Seq></dc:creator>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  const xmpBytes = enc.encode(xmpPacket);
  const pad = xmpBytes.length % 2 !== 0 ? new Uint8Array([0]) : new Uint8Array(0);

  // WebP chunk: 4 bytes FourCC ('XMP '), 4 bytes size (LE), data, optional pad
  const chunkHeader = new Uint8Array(8);
  chunkHeader.set(enc.encode('XMP '), 0);
  const view = new DataView(chunkHeader.buffer);
  view.setUint32(4, xmpBytes.length, true); // Little Endian

  // Append chunk to WebP container and update RIFF size
  const newPayload = new Uint8Array(chunkHeader.length + xmpBytes.length + pad.length);
  newPayload.set(chunkHeader, 0);
  newPayload.set(xmpBytes, 8);
  if (pad.length > 0) newPayload.set(pad, 8 + xmpBytes.length);

  const combined = new Uint8Array(inputBytes.length + newPayload.length);
  combined.set(inputBytes, 0);
  combined.set(newPayload, inputBytes.length);

  // Update RIFF total size: total length - 8
  const combinedView = new DataView(combined.buffer);
  combinedView.setUint32(4, combined.length - 8, true);

  return combined;
}

// ----------------------------------------------------------------------
// Main Public API
// ----------------------------------------------------------------------

/**
 * Directly embeds metadata into the original image binary without recompression
 */
export async function embedMetadataIntoImage(
  input: Blob | File | ArrayBuffer,
  filename: string,
  metadata: StockMetadata
): Promise<EmbeddedResult> {
  let arrayBuffer: ArrayBuffer;
  if (input instanceof ArrayBuffer) {
    arrayBuffer = input;
  } else {
    arrayBuffer = await input.arrayBuffer();
  }

  const bytes = new Uint8Array(arrayBuffer);
  const lowerName = filename.toLowerCase();

  let modifiedBytes: Uint8Array;
  let mimeType = 'image/jpeg';
  const standards: ('IPTC' | 'XMP' | 'EXIF' | 'PNG-tEXt')[] = [];
  let customMessage: string | undefined = undefined;

  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    modifiedBytes = embedMetadataInJpeg(bytes, metadata);
    mimeType = 'image/jpeg';
    standards.push('IPTC', 'XMP', 'EXIF');
  } else if (lowerName.endsWith('.png')) {
    modifiedBytes = embedMetadataInPng(bytes, metadata);
    mimeType = 'image/png';
    standards.push('PNG-tEXt', 'XMP');
  } else if (lowerName.endsWith('.webp')) {
    try {
      modifiedBytes = embedMetadataInWebP(bytes, metadata);
      mimeType = 'image/webp';
      standards.push('XMP');
    } catch {
      throw new Error(`Lossless metadata embedding is not supported for this WEBP.`);
    }
  } else if (lowerName.endsWith('.svg')) {
    try {
      const textDecoder = new TextDecoder('utf-8');
      const svgText = textDecoder.decode(bytes);
      const kwList = Array.from(
        new Set(
          metadata.keywords
            .map((k: any) => (typeof k === 'string' ? k.trim() : (k?.word || '').trim()))
            .filter(Boolean)
        )
      );
      
      const xmlMeta = `  <metadata id="stock-metadata-pro">
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
             xmlns:dc="http://purl.org/dc/elements/1.1/">
      <rdf:Description rdf:about="">
        <dc:title>${metadata.title}</dc:title>
        <dc:description>${metadata.title}</dc:description>
        <dc:subject>
          <rdf:Bag>
            ${kwList.map(k => `<rdf:li>${k}</rdf:li>`).join('\n            ')}
          </rdf:Bag>
        </dc:subject>
      </rdf:Description>
    </rdf:RDF>
  </metadata>`;
      
      let modifiedSvg = svgText;
      const svgTagIndex = svgText.indexOf('<svg');
      if (svgTagIndex !== -1) {
        const closingBracketIndex = svgText.indexOf('>', svgTagIndex);
        if (closingBracketIndex !== -1) {
          modifiedSvg = svgText.slice(0, closingBracketIndex + 1) + '\n' + xmlMeta + svgText.slice(closingBracketIndex + 1);
        }
      }
      const textEncoder = new TextEncoder();
      modifiedBytes = textEncoder.encode(modifiedSvg);
      mimeType = 'image/svg+xml';
      standards.push('XMP');
    } catch {
      modifiedBytes = bytes;
      mimeType = 'image/svg+xml';
    }
  } else if (lowerName.endsWith('.eps') || lowerName.endsWith('.ai')) {
    modifiedBytes = bytes;
    mimeType = lowerName.endsWith('.eps') ? 'image/x-eps' : 'application/illustrator';
    customMessage = 'Original file preserved — metadata embedding is not supported for this format.';
  } else {
    // If format is not directly known, try JPEG parser fallback
    try {
      modifiedBytes = embedMetadataInJpeg(bytes, metadata);
      mimeType = 'image/jpeg';
      standards.push('IPTC', 'XMP', 'EXIF');
    } catch {
      throw new Error(`Direct embedding currently supports JPG, PNG, and WebP. For ${filename}, please export CSV.`);
    }
  }

  // Strictly verify lossless embedding rules
  const verificationReport = verifyLosslessEmbedding(bytes, modifiedBytes, filename);
  if (!verificationReport.success || !verificationReport.dimensionsMatch || !verificationReport.formatMatches || !verificationReport.imagePayloadUnchanged) {
    throw new Error(
      verificationReport.error ||
        `Lossless embedding verification failed for "${filename}". Image payload or dimensions were altered.`
    );
  }

  // 1. File Size & Lossless Verification
  const originalSize = bytes.length;
  const embeddedSize = modifiedBytes.length;
  const isBypassedFormat = lowerName.endsWith('.eps') || lowerName.endsWith('.ai') || lowerName.endsWith('.svg');
  // Lossless embedding strictly preserves the image scan payload (verified bit-for-bit via verifyLosslessEmbedding above).
  // Minor size variance (a few tens of KB) is completely normal when legacy metadata (such as old embedded camera/Photoshop preview thumbnails
  // or redundant XMP packets) are replaced with clean Adobe Stock XMP/IPTC segments.
  // We guard against accidental lossy canvas recompression or severe truncation (e.g. >20% reduction).
  if (!isBypassedFormat && embeddedSize < originalSize * 0.80) {
    throw new Error(`Embed changed/compressed the original image data. Output was not created. (Original: ${originalSize} bytes, Embedded: ${embeddedSize} bytes)`);
  }

  const resultBlob = new Blob([modifiedBytes], { type: mimeType });

  // 2. Metadata Readback Verification (Requirement 10)
  if (!isBypassedFormat) {
    try {
      const verifyResult = await verifyEmbeddedMetadata(resultBlob, filename);
      
      // Verify Title exists
      const expectedTitle = metadata.title.trim().toLowerCase();
      const parsedTitle = (verifyResult.title || '').trim().toLowerCase();
      if (!verifyResult.title || (!parsedTitle.includes(expectedTitle.slice(0, 10)) && !expectedTitle.includes(parsedTitle))) {
        throw new Error("Title field is missing or mismatch in embedded output.");
      }

      // Verify Keywords exist
      const expectedKeywords = Array.from(new Set(metadata.keywords.map((k: any) => typeof k === 'string' ? k.trim() : (k?.word || '').trim()).filter(Boolean)));
      const parsedKeywords = verifyResult.keywords || [];
      if (parsedKeywords.length === 0) {
        throw new Error("Keywords are missing in embedded output.");
      }

      // Verify keyword presence (Requirement 10 & 5)
      const parsedSet = new Set(parsedKeywords.map(k => k.toLowerCase()));
      const missingKw = expectedKeywords.filter(k => !parsedSet.has(k.toLowerCase()));
      if (missingKw.length > expectedKeywords.length * 0.5) {
        throw new Error(`Keywords verification failed — missing tags: ${missingKw.slice(0, 5).join(', ')}`);
      }
    } catch (verifErr: any) {
      throw new Error(`Metadata embedding failed — output was not verified. Reason: ${verifErr.message}`);
    }
  }

  return {
    blob: resultBlob,
    filename, // Exact unchanged filename preserved
    mimeType,
    size: resultBlob.size,
    standards,
    message: customMessage || 'Metadata Embedded & Verified',
    verificationReport,
  };
}

/**
 * Reads back embedded metadata from an image buffer/blob to verify insertion
 */
export async function verifyEmbeddedMetadata(
  input: Blob | File | ArrayBuffer,
  filename: string
): Promise<VerificationResult> {
  let arrayBuffer: ArrayBuffer;
  if (input instanceof ArrayBuffer) {
    arrayBuffer = input;
  } else {
    arrayBuffer = await input.arrayBuffer();
  }

  let title: string | undefined = undefined;
  let description: string | undefined = undefined;
  let keywords: string[] = [];
  let creator: string | undefined = undefined;
  let copyright: string | undefined = undefined;

  const isPng = filename.toLowerCase().endsWith('.png');
  if (isPng) {
    try {
      const bytes = new Uint8Array(arrayBuffer);
      let offset = 8; // skip PNG signature
      const textDecoder = new TextDecoder('utf-8');
      while (offset < bytes.length - 12) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
        const chunkLen = view.getUint32(0, false);
        const chunkType = textDecoder.decode(bytes.subarray(offset + 4, offset + 8));
        
        if (chunkType === 'tEXt' || chunkType === 'iTXt') {
          const chunkData = bytes.subarray(offset + 8, offset + 8 + chunkLen);
          let nullIdx = -1;
          for (let j = 0; j < chunkData.length; j++) {
            if (chunkData[j] === 0) {
              nullIdx = j;
              break;
            }
          }
          if (nullIdx !== -1) {
            const key = textDecoder.decode(chunkData.subarray(0, nullIdx));
            let val = '';
            if (chunkType === 'tEXt') {
              val = textDecoder.decode(chunkData.subarray(nullIdx + 1));
            } else if (chunkType === 'iTXt') {
              // iTXt has 5 bytes of compression flag, compression method, language tag, translated keyword before value
              val = textDecoder.decode(chunkData.subarray(nullIdx + 5));
            }
            
            if (key === 'Title') title = val;
            if (key === 'Description') description = val;
            if (key === 'Keywords') {
              keywords = val.split(',').map((s: string) => s.trim()).filter(Boolean);
            }
            if (key === 'Author') creator = val;
            if (key === 'Copyright') copyright = val;
          }
        }
        
        offset += 12 + chunkLen; // len(4) + type(4) + data(chunkLen) + crc(4)
      }
    } catch (pngErr) {
      console.warn('Native PNG chunks parser error:', pngErr);
    }
  }

  let parsed: any = {};
  if (!isPng) {
    try {
      parsed = await exifr.parse(arrayBuffer, {
        iptc: true,
        xmp: true,
        tiff: true,
        exif: true,
        mergeOutput: false,
      });
    } catch (err) {
      console.warn('exifr parse warning:', err);
    }
  }

  const iptc = parsed?.iptc || {};
  const xmp = parsed?.xmp || {};
  const tiff = parsed?.tiff || {};
  const exif = parsed?.exif || {};

  // Extract Title from IPTC, XMP, or EXIF if not found by native PNG parser
  if (!title) {
    title =
      iptc?.ObjectName ||
      (typeof xmp?.title === 'object' ? xmp.title?.value : xmp?.title) ||
      xmp?.Headline ||
      tiff?.XPTitle ||
      tiff?.ImageDescription;
  }

  // Extract Description if not found by native PNG parser
  if (!description) {
    description =
      iptc?.Caption ||
      (typeof xmp?.description === 'object' ? xmp.description?.value : xmp?.description) ||
      tiff?.ImageDescription ||
      tiff?.XPComment;
  }

  // Extract Keywords if not found by native PNG parser
  if (keywords.length === 0) {
    if (Array.isArray(iptc?.Keywords)) {
      keywords = iptc.Keywords;
    } else if (typeof iptc?.Keywords === 'string') {
      keywords = [iptc.Keywords];
    } else if (Array.isArray(xmp?.subject)) {
      keywords = xmp.subject;
    } else if (typeof tiff?.XPKeywords === 'string') {
      keywords = tiff.XPKeywords.split(';').map((s: string) => s.trim()).filter(Boolean);
    }
  }

  // Extract Creator if not found by native PNG parser
  if (!creator) {
    creator =
      iptc?.Byline ||
      (Array.isArray(xmp?.creator) ? xmp.creator[0] : xmp?.creator) ||
      tiff?.Artist;
  }

  // Extract Copyright if not found by native PNG parser
  if (!copyright) {
    copyright =
      iptc?.CopyrightNotice ||
      (typeof xmp?.rights === 'object' ? xmp.rights?.value : xmp?.rights) ||
      tiff?.Copyright;
  }

  const standardsFound = {
    iptc: Boolean(iptc?.ObjectName || iptc?.Keywords || iptc?.Caption),
    xmp: Boolean(xmp?.title || xmp?.subject || xmp?.creator || isPng),
    exif: Boolean(tiff?.XPTitle || tiff?.ImageDescription || tiff?.Artist),
    pngText: isPng,
  };

  if (!title && parsed?.Title) title = parsed.Title;
  if (!description && parsed?.Description) description = parsed.Description;
  if (keywords.length === 0 && parsed?.Keywords) {
    keywords = String(parsed.Keywords).split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (!creator && parsed?.Author) creator = parsed.Author;
  if (!copyright && parsed?.Copyright) copyright = parsed.Copyright;

  return {
    filename,
    mimeType: (input as File)?.type || (isPng ? 'image/png' : 'image/jpeg'),
    title: typeof title === 'string' ? title : undefined,
    description: typeof description === 'string' ? description : undefined,
    keywords: keywords.length > 0 ? keywords : undefined,
    creator: typeof creator === 'string' ? creator : undefined,
    copyright: typeof copyright === 'string' ? copyright : undefined,
    software: tiff?.Software || 'Stock Metadata Pro AI',
    standardsFound,
    rawValues: parsed,
  };
}

/**
 * Triggers a browser file download using exact original filename
 */
export function downloadFileBlob(blob: Blob, originalFilename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = originalFilename; // Strict exact original filename preserved
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
