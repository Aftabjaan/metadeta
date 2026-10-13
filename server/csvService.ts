import { StockAsset, Marketplace, StockMetadata } from '../src/types';
import { MARKETPLACE_PROFILES } from '../src/utils/platforms';

export function escapeCsvField(field: any): string {
  if (field === null || field === undefined) return '';
  const str = String(field);
  // If field contains comma, quotes, newline, escape by enclosing in double quotes and doubling internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsv(
  assets: StockAsset[],
  marketplace: Marketplace = 'generic'
): string {
  const profile = MARKETPLACE_PROFILES[marketplace] || MARKETPLACE_PROFILES.generic;
  const columns = profile.csvColumns;

  // Header row
  const headerRow = columns.map((c) => escapeCsvField(c.header)).join(',');

  // Data rows
  const rows = assets.map((asset) => {
    const meta = asset.metadata;
    const specificMeta = meta?.marketplaces?.[marketplace];
    const effectiveTitle = specificMeta?.title || meta?.title || '';
    const effectiveCategory = specificMeta?.category || meta?.category || '';
    const effectiveKeywords = specificMeta?.keywords || meta?.keywords || [];

    const keywordsStr = effectiveKeywords
      ? effectiveKeywords.map((k) => (typeof k === 'string' ? k : k.word)).join(', ')
      : '';

    return columns
      .map((col) => {
        // STRICT RULE: Filename MUST BE EXACT originalFilename
        if (col.key === 'originalFilename') {
          return escapeCsvField(asset.originalFilename);
        }
        if (!meta) return '';

        switch (col.key) {
          case 'title':
            return escapeCsvField(effectiveTitle);
          case 'keywords':
            return escapeCsvField(keywordsStr);
          case 'category':
            return escapeCsvField(effectiveCategory);
          case 'assetType':
            return escapeCsvField(meta.assetType || 'photo');
          case 'orientation':
            return escapeCsvField(meta.orientation || 'horizontal');
          case 'aiGenerated':
            return escapeCsvField(meta.aiGenerated ? 'Yes' : 'No');
          case 'seoScore':
            return escapeCsvField(specificMeta?.seoScore ?? meta.seoScore ?? 0);
          default:
            return '';
        }
      })
      .join(',');
  });

  // UTF-8 BOM (\uFEFF) ensures Excel handles UTF-8 characters without corruption
  return '\uFEFF' + [headerRow, ...rows].join('\r\n');
}

export interface CsvImportResult {
  filenameCol?: string;
  titleCol?: string;
  keywordsCol?: string;
  categoryCol?: string;
  rows: {
    originalFilename: string;
    title?: string;
    keywords?: string[];
    category?: string;
  }[];
  totalRows: number;
  invalidRows: number;
}

export function parseCsv(csvText: string): CsvImportResult {
  // Remove BOM if present
  let cleanText = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) {
    return { rows: [], totalRows: 0, invalidRows: 0 };
  }

  // Parse lines considering quotes
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentLine.push(currentField.trim());
      currentField = '';
      if (currentLine.some((f) => f.length > 0)) {
        lines.push(currentLine);
      }
      currentLine = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some((f) => f.length > 0)) {
      lines.push(currentLine);
    }
  }

  if (lines.length === 0) {
    return { rows: [], totalRows: 0, invalidRows: 0 };
  }

  const headers = lines[0].map((h) => h.toLowerCase().trim());

  // Detect column indices
  const findColIndex = (candidates: string[]) =>
    headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

  const fnIndex = findColIndex(['filename', 'file name', 'original_filename', 'file', 'image']);
  const titleIndex = findColIndex(['title', 'headline', 'name']);
  const kwIndex = findColIndex(['keywords', 'tags', 'tag']);
  const catIndex = findColIndex(['category', 'categories']);

  const parsedRows: CsvImportResult['rows'] = [];
  let invalidRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const filename = fnIndex >= 0 ? row[fnIndex] : '';

    if (!filename) {
      invalidRows++;
      continue;
    }

    const title = titleIndex >= 0 ? row[titleIndex] : '';
    const rawKw = kwIndex >= 0 ? row[kwIndex] : '';
    const category = catIndex >= 0 ? row[catIndex] : '';

    const keywords = rawKw
      ? rawKw
          .split(/[,;]/)
          .map((k) => k.trim())
          .filter(Boolean)
      : [];

    parsedRows.push({
      originalFilename: filename,
      title,
      keywords,
      category,
    });
  }

  return {
    filenameCol: fnIndex >= 0 ? lines[0][fnIndex] : undefined,
    titleCol: titleIndex >= 0 ? lines[0][titleIndex] : undefined,
    keywordsCol: kwIndex >= 0 ? lines[0][kwIndex] : undefined,
    categoryCol: catIndex >= 0 ? lines[0][catIndex] : undefined,
    rows: parsedRows,
    totalRows: lines.length - 1,
    invalidRows,
  };
}
