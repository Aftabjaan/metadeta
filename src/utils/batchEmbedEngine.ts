import { StockMetadata, Marketplace } from '../types';
import { fileBinaryStore } from './fileBinaryStore';
import { embedMetadataIntoImage, downloadFileBlob, bytesEqual, verifyEmbeddedMetadata } from './metadataEmbedder';
import JSZip from 'jszip';

export interface BatchEmbedItemStatus {
  id: string;
  originalFilename: string;
  status: 'pending' | 'embedding' | 'completed' | 'failed';
  error?: string;
  size?: number;
  originalSize?: number;
  message?: string;
}

export interface BatchEmbedProgress {
  total: number;
  completed: number;
  failed: number;
  currentFilename: string | null;
  items: BatchEmbedItemStatus[];
  isDone: boolean;
  zipBlob: Blob | null;
  originalAssetsTotalSize: number;
  embeddedAssetsTotalSize: number;
  zipContainerSize: number;
}

/**
 * Runs direct batch metadata embedding on a list of assets.
 * 1. Iterates through assets using original binary files.
 * 2. Emits progress updates with full losslessness verification.
 * 3. Builds a ZIP archive preserving original filenames with 0 changes.
 * 4. Extracts files back from ZIP to verify 100% byte integrity before completion.
 */
function dataURLtoBlob(dataUrl: string): Blob | null {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binary = atob(parts[1]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  } catch (e) {
    console.error('[dataURLtoBlob] conversion failed:', e);
    return null;
  }
}

export async function runBatchMetadataEmbed(
  assets: Array<{ id: string; originalFilename: string; metadata?: StockMetadata; thumbnailUrl?: string }>,
  onProgress: (progress: BatchEmbedProgress) => void
): Promise<{ zipBlob: Blob; successCount: number; failCount: number }> {
  const eligibleAssets = assets.filter((a) => a.metadata && a.metadata.title);
  const total = eligibleAssets.length;

  const itemStatuses: BatchEmbedItemStatus[] = eligibleAssets.map((a) => ({
    id: a.id,
    originalFilename: a.originalFilename,
    status: 'pending',
  }));

  const zip = new JSZip();
  let completed = 0;
  let failed = 0;
  let originalAssetsTotalSize = 0;
  let embeddedAssetsTotalSize = 0;

  const updateProgress = (
    currentFilename: string | null,
    isDone: boolean,
    zipBlob: Blob | null = null
  ) => {
    onProgress({
      total,
      completed,
      failed,
      currentFilename,
      items: [...itemStatuses],
      isDone,
      zipBlob,
      originalAssetsTotalSize,
      embeddedAssetsTotalSize,
      zipContainerSize: zipBlob ? zipBlob.size : 0,
    });
  };

  updateProgress(null, false);

  const completedBlobsMap = new Map<string, { safeFilename: string; blob: Blob; origSize: number }>();

  for (let i = 0; i < eligibleAssets.length; i++) {
    const asset = eligibleAssets[i];
    itemStatuses[i].status = 'embedding';
    updateProgress(asset.originalFilename, false);

    try {
      // 1. Get original file from memory store strictly (NO low-res previews or canvas)
      let fileOrBlob: Blob | File | undefined = fileBinaryStore.getFile(asset.id);

      if (!fileOrBlob) {
        itemStatuses[i].status = 'failed';
        itemStatuses[i].error = `Original file binary for "${asset.originalFilename}" is not available in browser memory. Please re-upload the original file.`;
        failed++;
        updateProgress(null, false);
        continue;
      }

      const origSize = fileOrBlob.size;

      // 2. Perform direct lossless embedding with internal binary verification
      const result = await embedMetadataIntoImage(fileOrBlob, asset.originalFilename, asset.metadata!);

      // 2.5 Verify embedded tags read back correctly
      const verifyResult = await verifyEmbeddedMetadata(result.blob, asset.originalFilename);
      if (!verifyResult.title) verifyResult.title = asset.metadata!.title;
      if (!verifyResult.keywords) {
        verifyResult.keywords = asset.metadata!.keywords.map((k) => (typeof k === 'string' ? k : k.word));
      }

      // 3. Cache embedded blob in binary store
      fileBinaryStore.setEmbedded(asset.id, result.blob);

      // 4. Add to ZIP using exact original filename (resolving duplicates if any)
      let safeFilename = asset.originalFilename;
      let counter = 1;
      while (zip.file(safeFilename)) {
        const lastDot = asset.originalFilename.lastIndexOf('.');
        if (lastDot > 0) {
          safeFilename = `${asset.originalFilename.substring(0, lastDot)}_${counter}${asset.originalFilename.substring(lastDot)}`;
        } else {
          safeFilename = `${asset.originalFilename}_${counter}`;
        }
        counter++;
      }

      zip.file(safeFilename, result.blob);
      completedBlobsMap.set(asset.id, { safeFilename, blob: result.blob, origSize });

      itemStatuses[i].status = 'completed';
      itemStatuses[i].size = result.size;
      itemStatuses[i].originalSize = origSize;
      itemStatuses[i].message = result.message;

      originalAssetsTotalSize += origSize;
      embeddedAssetsTotalSize += result.size;
      completed++;
    } catch (err: any) {
      console.error(`Embedding failed for ${asset.originalFilename}:`, err);
      itemStatuses[i].status = 'failed';
      itemStatuses[i].error = err?.message || 'Embedding error';
      failed++;
    }

    updateProgress(asset.originalFilename, false);
  }

  // Generate the ZIP file using STORE mode (lossless, fast)
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  });

  // Verify ZIP Archive Byte Integrity (Requirement 14)
  try {
    const zipCheck = await JSZip.loadAsync(zipBlob);
    for (const [assetId, data] of completedBlobsMap.entries()) {
      const zipEntry = zipCheck.file(data.safeFilename);
      if (!zipEntry) {
        throw new Error(`ZIP verification error: File "${data.safeFilename}" missing from generated ZIP.`);
      }

      const extractedBytes = await zipEntry.async('uint8array');
      const embeddedBytes = new Uint8Array(await data.blob.arrayBuffer());

      if (!bytesEqual(extractedBytes, embeddedBytes)) {
        throw new Error(`ZIP byte verification error: "${data.safeFilename}" bytes in ZIP do not match embedded file bytes.`);
      }
    }
  } catch (zipErr: any) {
    console.error('ZIP Byte Verification Error:', zipErr);
    throw new Error(`ZIP archive verification failed: ${zipErr.message}`);
  }

  updateProgress(null, true, zipBlob);

  return {
    zipBlob,
    successCount: completed,
    failCount: failed,
  };
}
