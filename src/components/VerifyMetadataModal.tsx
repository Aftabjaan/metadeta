import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  FileCheck,
  Tag,
  Download,
  Upload,
  RefreshCw,
  Eye,
  FileCode,
  Layers,
} from 'lucide-react';
import { StockAsset } from '../types';
import { verifyEmbeddedMetadata, downloadFileBlob, VerificationResult } from '../utils/metadataEmbedder';
import { fileBinaryStore } from '../utils/fileBinaryStore';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface VerifyMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: StockAsset | null;
  targetBlob?: Blob | null;
}

export const VerifyMetadataModal: React.FC<VerifyMetadataModalProps> = ({
  isOpen,
  onClose,
  asset,
  targetBlob,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'raw'>('overview');

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;

    const runVerification = async () => {
      setLoading(true);
      setError(null);
      try {
        let blobToVerify = targetBlob;

        if (!blobToVerify && asset) {
          // Check if embedded blob exists in store
          blobToVerify = fileBinaryStore.getEmbedded(asset.id);
          // If no embedded blob yet, verify original or file from store
          if (!blobToVerify) {
            const file = fileBinaryStore.getFile(asset.id);
            if (file) {
              blobToVerify = file;
            }
          }
        }

        if (!blobToVerify) {
          throw new Error(
            'No image file available in memory to verify. Please embed metadata first or upload an image file.'
          );
        }

        const filename = asset?.originalFilename || 'verified-image.jpg';
        const res = await verifyEmbeddedMetadata(blobToVerify, filename);
        setResult(res);
      } catch (err: any) {
        setError(err.message || 'Verification failed');
      } finally {
        setLoading(false);
      }
    };

    runVerification();
  }, [isOpen, asset, targetBlob]);

  if (!isOpen) return null;

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await verifyEmbeddedMetadata(file, file.name);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const hasEmbeddedData =
    result &&
    (result.title ||
      result.description ||
      (result.keywords && result.keywords.length > 0) ||
      result.creator ||
      result.standardsFound.iptc ||
      result.standardsFound.xmp ||
      result.standardsFound.exif ||
      result.standardsFound.pngText);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto overscroll-contain">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Metadata Verification Inspector
                {hasEmbeddedData && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                    Tags Confirmed
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 font-mono truncate max-w-md">
                {result?.filename || asset?.originalFilename || 'Image metadata audit'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher & Inspector tools */}
        <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Extracted Tags
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'raw'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Raw Header Inspector
            </button>
          </div>

          <label className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-blue-400 shadow-xs transition-all">
            <Upload className="w-3.5 h-3.5" />
            Verify Another Image
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={handleManualUpload}
            />
          </label>
        </div>

        {/* Main Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 overscroll-contain bg-white">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-xs text-slate-500">Parsing binary container and reading embedded tags...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-rose-700">Verification Notice</h4>
                <p className="text-xs text-slate-700">{error}</p>
                <p className="text-[11px] text-slate-500">
                  Tip: Click <strong>[Embed Metadata Into Image]</strong> first to write the generated IPTC/XMP/EXIF tags into your original image binary.
                </p>
              </div>
            </div>
          )}

          {!loading && result && activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Standards Detected Badges */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Industry Standards Detected in File Binary
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${
                      result.standardsFound.iptc
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    IPTC-NAA (Adobe / Stock Contributor)
                  </div>
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${
                      result.standardsFound.xmp
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Adobe XMP (dc:title, dc:subject)
                  </div>
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${
                      result.standardsFound.exif
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    EXIF IFD0 & Windows XP Tags
                  </div>
                  {result.standardsFound.pngText && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      PNG Text Chunks
                    </div>
                  )}
                </div>
              </div>

              {/* Verified Title */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-slate-600">
                    Embedded Title (IPTC 2:05 / XMP dc:title / XPTitle)
                  </span>
                  {result.title ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Not found</span>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 min-h-[42px]">
                  {result.title || <span className="text-slate-400 italic">—</span>}
                </div>
              </div>

              {/* Verified Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-slate-600">
                    Embedded Description (IPTC Caption / XMP dc:description)
                  </span>
                  {result.description ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Not found</span>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed min-h-[50px]">
                  {result.description || <span className="text-slate-400 italic">—</span>}
                </div>
              </div>

              {/* Verified Keywords */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-blue-600" />
                    Embedded Keywords ({result.keywords?.length || 0} Tags Verified)
                  </span>
                  {result.keywords && result.keywords.length > 0 ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified In IPTC & XMP Bag
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">No keywords embedded</span>
                  )}
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                  {result.keywords && result.keywords.length > 0 ? (
                    result.keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-blue-700 text-[11px] font-mono shadow-xs"
                      >
                        {kw}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">None</span>
                  )}
                </div>
              </div>

              {/* Creator & Copyright */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Author / Creator (By-line)
                  </span>
                  <div className="text-xs font-semibold text-slate-800">
                    {result.creator || 'Aftab Jaan'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Copyright Notice
                  </span>
                  <div className="text-xs font-semibold text-slate-800 truncate">
                    {result.copyright || `Copyright © ${new Date().getFullYear()} Aftab Jaan`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading && result && activeTab === 'raw' && (
            <div className="space-y-3">
              <span className="text-xs text-slate-500 font-mono block">
                Direct header inspection of raw metadata segments:
              </span>
              <pre className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-emerald-700 overflow-x-auto max-h-96">
                {JSON.stringify(result.rawValues || {}, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs transition-colors"
          >
            Close Inspector
          </button>

          {asset && (
            <button
              type="button"
              onClick={() => {
                const embedded = fileBinaryStore.getEmbedded(asset.id);
                if (embedded) {
                  downloadFileBlob(embedded, asset.originalFilename);
                } else {
                  const f = fileBinaryStore.getFile(asset.id);
                  if (f) downloadFileBlob(f, asset.originalFilename);
                }
              }}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" />
              Download Verified Image ({asset.originalFilename})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
