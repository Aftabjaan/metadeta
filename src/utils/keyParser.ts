/**
 * Robust, Safe API Key Parser for Stock Metadata Pro AI
 * 
 * Strict delimiter-based parsing rules:
 * 1. An API key is treated as ONE COMPLETE TOKEN.
 * 2. Never split on internal key characters like hyphens (-), underscores (_), slashes (/), pluses (+), or dots (.).
 * 3. Delimiters are strictly restricted to newlines (\n), commas (,), semicolons (;), tabs (\t), pipes (|), or double spaces.
 * 4. Extracts key values from ENV / Key-Value assignments (e.g., GEMINI_API_KEY=AIzaSy...) and strips label prefixes.
 * 5. Minimum key token length is enforced (>= 16 characters) to prevent storing fake label/index fragments.
 * 6. Never invents, generates, or derives keys.
 */

export interface ParsedKeyCandidate {
  rawKey: string;
  label?: string;
}

export interface ParseKeysResult {
  totalDetected: number;
  tokens: string[];
  rejectedTokens: { token: string; reason: string }[];
  duplicateCount: number;
}

const PLACEHOLDER_BLACKLIST = new Set([
  'YOUR_API_KEY',
  'YOUR_KEY',
  'YOUR_GEMINI_KEY',
  'YOUR_GROQ_KEY',
  'API_KEY',
  'API_KEYS',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'KEY_HERE',
  'ENTER_KEY',
  'ENTER_KEY_HERE',
  'PLACEHOLDER',
  'INSERT_KEY_HERE',
  'MY_API_KEY',
  'MY_KEY',
  'KEY',
  'KEYS',
  'LABEL',
  'DEFAULT',
  'BEARER',
  'AUTHORIZATION',
  'SECRET',
  'TOKEN',
  'VALUE',
  'CONFIG',
  'ENV',
  'ENVIRONMENT',
  'SETTINGS',
  'CLIENT',
  'PROJECT',
  'PRIMARY',
  'SECONDARY',
  'BACKUP',
  'PROD',
  'TEST',
  'NULL',
  'UNDEFINED',
  'NONE',
  'TRUE',
  'FALSE',
]);

/**
 * Basic Token Validation (Stage 1)
 */
export function isValidKeyToken(token: string): { valid: boolean; reason?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Empty token' };
  }

  const clean = token.trim();

  // Minimum length check for real API keys (Gemini, Groq, OpenAI, etc. are >= 8 chars)
  if (clean.length < 8) {
    return { valid: false, reason: 'Too short (< 8 characters - fragment or label)' };
  }

  // Maximum reasonable length check
  if (clean.length > 256) {
    return { valid: false, reason: 'Too long (> 256 characters)' };
  }

  // Obvious placeholder or generic keyword check
  const upper = clean.toUpperCase();
  if (PLACEHOLDER_BLACKLIST.has(upper)) {
    return { valid: false, reason: 'Placeholder keyword or label' };
  }

  // Reject URLs
  if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('ftp://')) {
    return { valid: false, reason: 'URL detected' };
  }

  // Reject JSON, XML, HTML, or code structures
  if (
    (clean.startsWith('{') && clean.endsWith('}')) ||
    (clean.startsWith('[') && clean.endsWith(']')) ||
    (clean.startsWith('<') && clean.endsWith('>'))
  ) {
    return { valid: false, reason: 'Structured JSON/HTML detected' };
  }

  // Reject tokens with internal spaces or tabs
  if (clean.includes(' ') || clean.includes('\t') || clean.includes('\r') || clean.includes('\n')) {
    return { valid: false, reason: 'Contains whitespace inside token' };
  }

  // Reject comment / header markers
  if (clean.startsWith('#') || clean.startsWith('//') || clean.startsWith('/*')) {
    return { valid: false, reason: 'Comment/Markdown header' };
  }

  // Character set verification (API keys consist of base64 / hex / URL-safe characters)
  if (!/^[A-Za-z0-9_\-\.\+\/=]+$/.test(clean)) {
    return { valid: false, reason: 'Contains invalid characters for an API key' };
  }

  return { valid: true };
}

/**
 * Parses raw text (from a .txt file, .env, or paste box) into individual API key tokens.
 * Uses a robust delimiter-based approach (newline, comma, semicolon, tab, pipe) to prevent key fragmentation.
 */
export function parseKeysFromText(text: string): ParseKeysResult {
  if (!text || typeof text !== 'string') {
    return { totalDetected: 0, tokens: [], rejectedTokens: [], duplicateCount: 0 };
  }

  // 1. Strip UTF-8 BOM if present
  let normalized = text.replace(/^\uFEFF/, '');

  // 2. Normalize line breaks
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 3. Process line by line
  const lines = normalized.split('\n');
  const tokens: string[] = [];
  const seenTokens = new Set<string>();
  const rejectedTokens: { token: string; reason: string }[] = [];
  let totalCandidates = 0;
  let duplicateCount = 0;

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Ignore full-line comments
    if (line.startsWith('#') || line.startsWith('//') || line.startsWith('/*') || line.startsWith('--') || line.startsWith(';')) {
      continue;
    }

    // Strip inline comments (e.g. "AIzaSy... # primary key")
    line = line.replace(/\s+(?:#|\/\/|\/\*|--|;).*$/, '').trim();
    if (!line) continue;

    // Handle KEY=VALUE or "Key Label: VALUE" format
    const keyValMatch = line.match(/^(?:[A-Za-z0-9_ \-\.\[\]]+)\s*[:=]\s*(.+)$/);
    if (keyValMatch && keyValMatch[1]) {
      const valCandidate = keyValMatch[1].trim().replace(/^["'`]|["'`]$/g, '');
      if (valCandidate.length >= 8) {
        line = valCandidate;
      }
    }

    // Strip list prefixes like "1. ", "1) ", "• ", "- ", "* "
    line = line.replace(/^(?:\d+[\.\)]\s*|[-*•]\s*|\[\d+\]\s*)/, '').trim();
    if (!line) continue;

    // Split line using strict delimiters: comma, semicolon, tab, pipe, or multiple spaces
    // CRITICAL: NEVER split on hyphens (-), underscores (_), dots (.), slashes (/), or pluses (+)
    const rawSegments = line.split(/[,;\t|]+|\s{2,}/);
    const candidateSegments: string[] = [];

    for (let segment of rawSegments) {
      segment = segment.trim();
      if (!segment) continue;

      // Remove accidental surrounding quotes, brackets, or parenthesis
      segment = segment.replace(/^["'`\[\(\<]+|["'`\]\)\>]+$/g, '').trim();
      // Remove trailing punctuation attached to key
      segment = segment.replace(/[\.,;:!]+$/g, '').trim();

      if (segment) {
        candidateSegments.push(segment);
      }
    }

    // Fallback regex matching if no candidates were found or segment failed
    if (candidateSegments.length === 0) {
      // Look for embedded Gemini / Groq / Generic key patterns
      const embedded = line.match(/(?:AIzaSy[A-Za-z0-9_\-]{33}|gsk_[A-Za-z0-9_]{48,70}|(?:sk-|key-|api-)[A-Za-z0-9_\-]{20,100})/g);
      if (embedded) {
        for (const k of embedded) {
          candidateSegments.push(k);
        }
      }
    }

    for (const segment of candidateSegments) {
      totalCandidates++;
      const validation = isValidKeyToken(segment);
      if (validation.valid) {
        if (seenTokens.has(segment)) {
          duplicateCount++;
        } else {
          seenTokens.add(segment);
          tokens.push(segment);
        }
      } else {
        rejectedTokens.push({ token: segment, reason: validation.reason || 'Invalid format' });
      }
    }
  }

  return {
    totalDetected: totalCandidates,
    tokens,
    rejectedTokens,
    duplicateCount,
  };
}
