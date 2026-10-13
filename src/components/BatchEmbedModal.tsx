import React, { useState } from 'react';
import {
  ShieldCheck,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  FileArchive,
  FileCheck,
  Tag,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { StockAsset, Marketplace } from '../types';
import { BatchEmbedProgress, runBatchMetadataEmbed } from '../utils/batchEmbedEngine';
import { downloadFileBlob, verifyEmbeddedMetadata, VerificationResult } from '../utils/metadataEmbedder';
import { fileBinaryStore } from '../utils/fileBinaryStore';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface BatchEmbedModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: StockAsset[];
  marketplace: Marketplace;
}

export const BatchEmbedModal: React.FC<BatchEmbedModalProps> = ({
  isOpen,
  onClose,
  assets,
  marketplace,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BatchEmbedProgress | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<VerificationResult | null>(null);

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const eligibleAssets = assets.filter((a) => a.metadata && a.metadata.title);
  const total = eligibleAssets.length;

  const handleStartBatchEmbed = async () => {
    setIsRunning(true);
    setVerificationData(null);

    try {
      await runBatchMetadataEmbed(eligibleAssets, (p) => {
        setProgress(p);
      });
    } catch (err: any) {
      alert(err?.message || 'Batch embedding encountered an error.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownloadZip = () => {
    if (!progress?.zipBlob) return;
    const dateStr = new Date().toISOString().split('T')[0];
    const zipName = `Stock_Metadata_Embedded_${marketplace}_${dateStr}.zip`;
    downloadFileBlob(progress.zipBlob, zipName);
  };

  const handleDownloadSingle = (assetId: string, filename: string) => {
    const blob = fileBinaryStore.getEmbedded(assetId) || fileBinaryStore.getFile(assetId);
    if (blob) {
      downloadFileBlob(blob, filename);
    }
  };

  const handleVerifyAsset = async (assetId: string, filename: string) => {
    setVerifyingId(assetId);
    setVerificationData(null);
    try {
      const blob = fileBinaryStore.getEmbedded(assetId) || fileBinaryStore.getFile(assetId);
      if (!blob) throw new Error('Embedded file not available in memory.');
      const result = await verifyEmbeddedMetadata(blob, filename);
      setVerificationData(result);
    } catch (err: any) {
      alert(`Verification failed: ${err.message}`);
    } finally {
      setVerifyingId(null);
    }
  };

  const completedCount = progress?.completed || 0;
  const failedCount = progress?.failed || 0;
  const skippedCount = assets.filter((a) => !(a.metadata && a.metadata.title)).length;
  const percent = total > 0 && progress ? Math.round(((completedCount + failedCount) / total) * 100) : 0;

  // Consistency Check between CSV Export Scope and ZIP Payload Scope
  const csvAssets = assets.filter((a) => a.status === 'completed' && a.metadata);
  const csvFilenames = csvAssets.map((a) => a.originalFilename);
  const zipSuccessFilenames = progress?.items.filter((item) => item.status === 'completed').map((item) => item.originalFilename) || [];
  const missingInZip = csvFilenames.filter((f) => !zipSuccessFilenames.includes(f));
  const hasConsistencyMismatch = progress?.isDone && missingInZip.length > 0;

  // Build the combined queue (running/completed + skipped items) for comprehensive visibility
  const skippedItems = assets
    .filter((a) => !(a.metadata && a.metadata.title))
    .map((a) => ({
      id: a.id,
      originalFilename: a.originalFilename,
      status: 'skipped' as const,
      error: 'Missing generated metadata. Go to editor or use Bulk Generation.',
    }));

  const allItems = progress
    ? [
        ...progress.items.map((item) => ({
          id: item.id,
          originalFilename: item.originalFilename,
          status: item.status as 'pending' | 'embedding' | 'completed' | 'failed' | 'skipped',
          error: item.error,
          message: item.message,
        })),
        ...skippedItems,
      ]
    : [
        ...eligibleAssets.map((a) => ({
          id: a.id,
          originalFilename: a.originalFilename,
          status: 'pending' as 'pending' | 'embedding' | 'completed' | 'failed' | 'skipped',
          error: undefined,
          message: undefined,
        })),
        ...skippedItems,
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto overscroll-contain">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Batch Image Metadata Embedder & ZIP Export
              </h3>
              <p className="text-xs text-slate-500">
                Losslessly inject IPTC, Adobe XMP, & EXIF into all {total} images simultaneously
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 overscroll-contain">
          {/* Overview Info Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-700">
              <span>Ready for Embedding:</span>
              <strong className="text-slate-900 font-mono text-sm">{total} assets</strong>
            </div>
            <div className="flex items-center justify-between text-slate-500 text-[11px]">
              <span>Standards Written:</span>
              <span className="text-slate-800 font-mono">IPTC (Photoshop APP13) • Adobe XMP • EXIF • PNG-tEXt</span>
            </div>
            <div className="flex items-center justify-between text-slate-500 text-[11px]">
              <span>Filename Integrity:</span>
              <span className="text-emerald-700 font-semibold">100% Exact original filenames preserved</span>
            </div>
            <div className="flex items-center justify-between text-slate-500 text-[11px]">
              <span>Pixel Safety:</span>
              <span className="text-blue-700 font-semibold">Lossless byte-level insertion (0% re-compression)</span>
            </div>

            {progress && progress.isDone && (
              <div className="pt-2 border-t border-slate-200 space-y-1 text-[11px] font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Original Assets Total Size:</span>
                  <span className="font-semibold text-slate-900">
                    {(progress.originalAssetsTotalSize / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Embedded Assets Total Size:</span>
                  <span className="font-semibold text-slate-900">
                    {(progress.embeddedAssetsTotalSize / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>ZIP Download Size:</span>
                  <span className="font-semibold text-emerald-700">
                    {(progress.zipContainerSize / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-sans italic pt-0.5">
                  Small size difference is due to added metadata headers. Image pixels are 100% untouched.
                </p>
              </div>
            )}
          </div>

          {/* Start Embedding / Download Action Area */}
          {!progress && (
            <div className="text-center py-4 space-y-3">
              <button
                type="button"
                disabled={total === 0 || isRunning}
                onClick={handleStartBatchEmbed}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm shadow-md shadow-purple-500/25 flex items-center gap-2 mx-auto transition-all transform active:scale-95 cursor-pointer"
              >
                <ShieldCheck className="w-5 h-5 text-purple-100" />
                Embed Metadata for All ({total})
              </button>
              <p className="text-[11px] text-slate-500">
                Processes all completed images and bundles them into a ready-to-upload ZIP archive.
              </p>
            </div>
          )}

          {/* Progress Tracker */}
          {progress && (
            <div className="space-y-4">
              {/* Progress Summary Header */}
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-slate-900">
                  {completedCount + failedCount} / {total} processed ({percent}%)
                </span>
                <span className="text-slate-500">
                  <strong className="text-emerald-700">{completedCount}</strong> succeeded
                  {failedCount > 0 && (
                    <strong className="text-rose-600 ml-2">{failedCount} failed</strong>
                  )}
                  {skippedCount > 0 && (
                    <strong className="text-amber-700 ml-2">{skippedCount} skipped</strong>
                  )}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
                <div
                  className="bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300"
                  style={{ width: `${(completedCount / total) * 100}%` }}
                />
                <div
                  className="bg-rose-500 transition-all duration-300"
                  style={{ width: `${(failedCount / total) * 100}%` }}
                />
              </div>

              {/* Current processing file indicator */}
              {isRunning && progress.currentFilename && (
                <div className="flex items-center gap-2 text-xs text-purple-800 font-mono bg-purple-50 border border-purple-200 p-2.5 rounded-xl">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-600 shrink-0" />
                  <span className="truncate">Embedding: {progress.currentFilename}</span>
                </div>
              )}

              {/* ZIP + CSV Consistency Warning Block */}
              {hasConsistencyMismatch && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-rose-900">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>ZIP & CSV Consistency Mismatch Blocked</span>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-relaxed">
                    The files below are completed in your project but are missing from the generated ZIP archive. To prevent uploading incomplete collections to Adobe Stock, downloading is blocked until they are resolved:
                  </p>
                  <ul className="list-disc pl-5 font-mono text-[10px] text-rose-800 space-y-0.5 max-h-24 overflow-y-auto">
                    {missingInZip.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Completion Banner with ZIP Download */}
              {progress.isDone && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="font-bold text-emerald-900 text-sm">Batch Embedding Complete!</h4>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        Processed all items in the batch queue:
                      </p>
                      <ul className="list-disc pl-4 text-[11px] text-slate-700 space-y-0.5">
                        <li><strong>Successful</strong>: {completedCount} files losslessly embedded and packed into ZIP</li>
                        {failedCount > 0 && <li><strong>Failed</strong>: {failedCount} files failed to embed</li>}
                        {skippedCount > 0 && <li><strong>Skipped</strong>: {skippedCount} files skipped (missing metadata)</li>}
                      </ul>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    {progress.zipBlob && !hasConsistencyMismatch && (
                      <button
                        type="button"
                        onClick={handleDownloadZip}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer"
                      >
                        <FileArchive className="w-4 h-4" />
                        Download All (ZIP Archive)
                      </button>
                    )}

                    {hasConsistencyMismatch && (
                      <button
                        type="button"
                        disabled
                        className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-400 font-bold text-xs border border-slate-300 flex items-center gap-2 cursor-not-allowed"
                        title="Download blocked due to ZIP & CSV consistency mismatch"
                      >
                        <FileArchive className="w-4 h-4" />
                        Download Blocked
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleStartBatchEmbed}
                      className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Re-run Batch
                    </button>
                  </div>
                </div>
              )}

              {/* Item Status List */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {allItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {item.status === 'completed' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      {item.status === 'embedding' && (
                        <RefreshCw className="w-4 h-4 text-purple-600 animate-spin shrink-0" />
                      )}
                      {item.status === 'failed' && (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      {item.status === 'skipped' && (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      {item.status === 'pending' && (
                        <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                      )}
                      <span className="font-mono text-slate-800 truncate">{item.originalFilename}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === 'completed' && (
                        <>
                          {item.message && (
                            <span className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md max-w-[150px] truncate" title={item.message}>
                              {item.message}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleVerifyAsset(item.id, item.originalFilename)}
                            className="text-[11px] text-blue-700 hover:text-blue-800 font-medium px-2 py-0.5 rounded bg-blue-50 border border-blue-200 cursor-pointer"
                            title="Verify embedded metadata in file"
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSingle(item.id, item.originalFilename)}
                            className="text-[11px] text-slate-600 hover:text-slate-900 font-medium p-1 rounded hover:bg-slate-200 cursor-pointer"
                            title="Download single embedded file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {item.status === 'failed' && (
                        <span className="text-[11px] text-rose-600 font-semibold" title={item.error}>
                          Failed
                        </span>
                      )}
                      {item.status === 'skipped' && (
                        <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs font-semibold" title={item.error}>
                          Skipped
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Verification Inspector Drawer */}
          {verificationData && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-blue-200 space-y-2 text-xs animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-700 font-bold">
                  <FileCheck className="w-4 h-4" />
                  <span>Metadata Verification: {verificationData.filename}</span>
                </div>
                <button
                  onClick={() => setVerificationData(null)}
                  className="text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-1.5 pt-1 text-slate-700">
                <div>
                  <strong className="text-slate-500">Title: </strong>
                  <span className="text-slate-900 font-medium">{verificationData.title || '(None)'}</span>
                </div>
                <div>
                  <strong className="text-slate-500">Description: </strong>
                  <span>{verificationData.description || '(None)'}</span>
                </div>
                <div>
                  <strong className="text-slate-500">Keywords ({verificationData.keywords?.length || 0}): </strong>
                  <span className="text-blue-700">
                    {verificationData.keywords?.slice(0, 15).join(', ')}
                    {(verificationData.keywords?.length || 0) > 15 ? '...' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    IPTC: {verificationData.standardsFound.iptc ? '✓ Found' : '✗'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Adobe XMP: {verificationData.standardsFound.xmp ? '✓ Found' : '✗'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                    EXIF: {verificationData.standardsFound.exif ? '✓ Found' : '✗'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
