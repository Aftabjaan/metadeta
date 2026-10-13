import { StockAsset, Marketplace } from '../types';
import { MARKETPLACE_PROFILES } from './platforms';

export function escapeCsvField(field: any): string {
  if (field === null || field === undefined) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsvClient(
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

  return [headerRow, ...rows].join('\r\n');
}

export function downloadCsvClientDirect(
  assets: StockAsset[],
  marketplace: Marketplace,
  customFileName?: string
) {
  const csvContent = generateCsvClient(assets, marketplace);
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  const fileName =
    customFileName || `stock_metadata_${marketplace}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.setAttribute('download', fileName);
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
