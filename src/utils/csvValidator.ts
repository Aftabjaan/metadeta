import { StockAsset, Marketplace } from '../types';
import { runAdobeSafetyCheck } from './adobeSafetyEngine';
import { MARKETPLACE_PROFILES } from './platforms';

export interface CSVValidationError {
  id: string;
  filename: string;
  field: 'filename' | 'title' | 'keywords' | 'category' | 'structure';
  severity: 'block' | 'warning';
  message: string;
  remedy: string;
}

export interface CSVValidationReport {
  status: 'SAFE' | 'WARNING' | 'BLOCK';
  totalAssets: number;
  errorsCount: number;
  warningsCount: number;
  errors: CSVValidationError[];
}

export function validateCsvAssets(
  assets: StockAsset[],
  marketplace: Marketplace
): CSVValidationReport {
  const errors: CSVValidationError[] = [];
  const profile = MARKETPLACE_PROFILES[marketplace] || MARKETPLACE_PROFILES.generic;

  assets.forEach((asset) => {
    const filename = asset.originalFilename || '';
    const meta = asset.metadata;

    // 1. Filename validations
    if (!filename) {
      errors.push({
        id: asset.id,
        filename: 'Unknown File',
        field: 'filename',
        severity: 'block',
        message: 'Filename is completely empty or missing.',
        remedy: 'Ensure the file is uploaded correctly with a valid file name.',
      });
    } else if (filename.startsWith('undefined') || filename.includes('null')) {
      errors.push({
        id: asset.id,
        filename,
        field: 'filename',
        severity: 'block',
        message: 'Filename contains "undefined" or "null" placeholders.',
        remedy: 'Re-upload the asset to preserve its original system filename.',
      });
    }

    if (!meta) {
      errors.push({
        id: asset.id,
        filename,
        field: 'structure',
        severity: 'block',
        message: 'No metadata payload found for this asset.',
        remedy: 'Generate metadata using the AI generator before exporting.',
      });
      return;
    }

    const specificMeta = meta.marketplaces?.[marketplace];
    const title = (specificMeta?.title || meta.title || '').trim();
    const keywords = specificMeta?.keywords || meta.keywords || [];
    const category = (specificMeta?.category || meta.category || '').trim();

    // 2. Title validations
    if (!title) {
      errors.push({
        id: asset.id,
        filename,
        field: 'title',
        severity: 'block',
        message: 'Title is missing or blank.',
        remedy: 'Provide a natural-language descriptive title.',
      });
    } else {
      if (title.length < 5) {
        errors.push({
          id: asset.id,
          filename,
          field: 'title',
          severity: 'block',
          message: `Title is too short (${title.length} characters). Minimum required is 5 characters.`,
          remedy: 'Write a longer description of the visual scene.',
        });
      }

      if (marketplace === 'adobe') {
        if (title.length > 70) {
          errors.push({
            id: asset.id,
            filename,
            field: 'title',
            severity: 'warning',
            message: `Title is ${title.length} characters, which exceeds Adobe Stock recommended limit of 70 characters.`,
            remedy: 'Condense the title to under 70 characters for higher submission approval.',
          });
        }
      } else {
        if (title.length > 200) {
          errors.push({
            id: asset.id,
            filename,
            field: 'title',
            severity: 'block',
            message: `Title is too long (${title.length} characters). Max allowed is 200 characters.`,
            remedy: 'Shorten title to less than 200 characters.',
          });
        }
      }
    }

    // 3. Keywords validations
    const keywordStrings = keywords
      .map((k) => (typeof k === 'string' ? k : k.word).trim())
      .filter(Boolean);

    if (keywordStrings.length === 0) {
      errors.push({
        id: asset.id,
        filename,
        field: 'keywords',
        severity: 'block',
        message: 'No keywords provided. Search tags are mandatory.',
        remedy: 'Add at least 5 relevant keywords.',
      });
    } else {
      // Duplicate keyword check
      const seen = new Set<string>();
      const duplicates: string[] = [];
      keywordStrings.forEach((k) => {
        const lower = k.toLowerCase();
        if (seen.has(lower)) {
          duplicates.push(k);
        } else {
          seen.add(lower);
        }
      });

      if (duplicates.length > 0) {
        errors.push({
          id: asset.id,
          filename,
          field: 'keywords',
          severity: 'block',
          message: `Duplicate keywords found: "${Array.from(new Set(duplicates)).join(', ')}".`,
          remedy: 'Deduplicate your keyword list. Adobe Stock strictly rejects duplicates.',
        });
      }

      // Keyword count limits
      if (marketplace === 'adobe' && keywordStrings.length > 49) {
        errors.push({
          id: asset.id,
          filename,
          field: 'keywords',
          severity: 'block',
          message: `Keyword count (${keywordStrings.length}) exceeds Adobe Stock maximum limit of 49 tags.`,
          remedy: `Trim the tag list down to a maximum of 49 keywords.`,
        });
      } else if (keywordStrings.length > 50) {
        errors.push({
          id: asset.id,
          filename,
          field: 'keywords',
          severity: 'block',
          message: `Keyword count (${keywordStrings.length}) exceeds standard microstock limit of 50 tags.`,
          remedy: `Trim tags to 50 or fewer keywords.`,
        });
      }

      if (keywordStrings.length < 10) {
        errors.push({
          id: asset.id,
          filename,
          field: 'keywords',
          severity: 'warning',
          message: `Only ${keywordStrings.length} keywords provided. Having at least 10 tags is highly recommended.`,
          remedy: 'Add more descriptive terms to improve search rankings.',
        });
      }
    }

    // 4. Category validations
    if (marketplace === 'adobe' && !category) {
      errors.push({
        id: asset.id,
        filename,
        field: 'category',
        severity: 'block',
        message: 'Adobe Category is missing.',
        remedy: 'Select a valid Adobe Stock category.',
      });
    }

    // Run underlying safety checks (for brands, artists, celebrities, keyword spam etc.)
    const safetyCheck = runAdobeSafetyCheck(meta, undefined, marketplace);
    safetyCheck.issues.forEach((issue) => {
      // Deduplicate some overlapping messages, but make sure critical blocks are registered
      const isRedundant = errors.some(
        (e) => e.id === asset.id && e.field === issue.field && e.severity === issue.severity
      );
      if (!isRedundant) {
        errors.push({
          id: asset.id,
          filename,
          field: issue.field as any,
          severity: issue.severity,
          message: issue.message,
          remedy: issue.remedy,
        });
      }
    });
  });

  const blockErrors = errors.filter((e) => e.severity === 'block');
  const warningErrors = errors.filter((e) => e.severity === 'warning');

  let status: 'SAFE' | 'WARNING' | 'BLOCK' = 'SAFE';
  if (blockErrors.length > 0) {
    status = 'BLOCK';
  } else if (warningErrors.length > 0) {
    status = 'WARNING';
  }

  return {
    status,
    totalAssets: assets.length,
    errorsCount: blockErrors.length,
    warningsCount: warningErrors.length,
    errors,
  };
}
