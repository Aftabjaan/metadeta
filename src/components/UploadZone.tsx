import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Lock,
  Zap,
  FileText,
  AlertCircle,
  Info,
} from 'lucide-react';
import { processUploadedFile } from '../utils/imageUtils';
import { StockAsset } from '../types';
import { fileBinaryStore } from '../utils/fileBinaryStore';

interface UploadZoneProps {
  onAddAssets: (assets: StockAsset[]) => void;
  existingFilenames: Set<string>;
  existingAssets?: StockAsset[];
  totalAssetsCount: number;
  onClearAll: () => void;
  onOpenRules?: () => void;
  theme?: 'light' | 'dark';
}

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.eps', '.ai', '.svg'];
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'application/postscript',
  'application/illustrator',
  'image/x-eps',
  'image/eps',
  'application/x-postscript',
  'application/eps'
];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB per file

export const UploadZone: React.FC<UploadZoneProps> = ({
  onAddAssets,
  existingFilenames,
  existingAssets = [],
  totalAssetsCount,
  onClearAll,
  onOpenRules,
  theme = 'light',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setLoading(true);
    setErrorMessage(null);
    setDuplicateWarning(null);

    const newAssets: StockAsset[] = [];
    const duplicatesFound: string[] = [];
    const errors: string[] = [];

    const filesArray = Array.from(fileList);
    const totalFiles = filesArray.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = filesArray[i];
      setUploadProgress({
        current: i + 1,
        total: totalFiles,
        filename: file.name,
      });

      // 1. Validate extension & mime safely (relaxed checks to avoid missing browser mime definitions)
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      const isValidExt = ALLOWED_EXTENSIONS.includes(ext);
      const isValidMime = ALLOWED_MIME_TYPES.includes(file.type) || file.type.includes('postscript') || file.type.includes('eps') || file.type.includes('illustrator');

      if (!isValidExt && !isValidMime) {
        errors.push(`"${file.name}": Unsupported format. Supported formats are: JPG, JPEG, PNG, WEBP, EPS, AI, SVG.`);
        continue;
      }

      // 2. Validate file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`"${file.name}": File exceeds 100MB limit.`);
        continue;
      }

      // 3. Duplicate check
      if (existingFilenames.has(file.name)) {
        duplicatesFound.push(file.name);
      }

      try {
        const processed = await processUploadedFile(file);

        // Map the file to any existing matching assets to restore their binaries
        console.log(`Debug: Uploaded filename: ${file.name}, size: ${file.size}, type: ${file.type}`);
        const matchingExistingAssets = existingAssets.filter((a) => {
          const match = a.originalFilename === file.name && a.fileSize === file.size && a.mimeType === file.type;
          if (match) console.log(`Debug: Found match: ${a.id} for ${file.name}`);
          return match;
        });
        for (const existingAsset of matchingExistingAssets) {
          fileBinaryStore.set(existingAsset.id, file);
          console.log(`Restored binary file for existing asset: ${existingAsset.id} (${file.name})`);
        }

        // STRICT REQUIREMENT: originalFilename MUST equal EXACT browser File.name
        const newAsset: StockAsset = {
          id: `asset-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          originalFilename: processed.originalFilename, // EXACT file.name
          fileSize: processed.fileSize,
          mimeType: processed.mimeType,
          thumbnailUrl: processed.thumbnailUrl,
          backgroundAnalysis: processed.backgroundAnalysis,
          fileContentHash: processed.fileContentHash,
          visualFingerprint: processed.visualFingerprint,
          versions: [],
          status: 'waiting',
          uploadedAt: new Date().toISOString(),
        };

        // Cache the optimized AI base64 string on the object for queue dispatch
        (newAsset as any)._aiBase64 = processed.aiBase64;
        // Save exact original browser File in binary store for lossless metadata embedding
        fileBinaryStore.set(newAsset.id, file);

        newAssets.push(newAsset);
      } catch (err: any) {
        errors.push(`"${file.name}": ${err.message || 'Corrupted or unreadable image'}`);
      }
    }

    setUploadProgress(null);
    setLoading(false);

    if (errors.length > 0) {
      setErrorMessage(errors.slice(0, 3).join(' • ') + (errors.length > 3 ? ` (+${errors.length - 3} more)` : ''));
    }

    if (duplicatesFound.length > 0) {
      setDuplicateWarning(duplicatesFound);
    }

    if (newAssets.length > 0) {
      onAddAssets(newAssets);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-1.5">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.eps,.ai,.svg,image/jpeg,image/png,image/webp,image/svg+xml,application/postscript,application/illustrator,image/x-eps"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Main Upload Dropzone - Sized up, spacious and prominent */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative rounded-2xl py-7 sm:py-9 px-6 text-center cursor-pointer transition-all duration-200 group bg-white border-2 ${
          isDragging
            ? 'border-blue-500 bg-blue-50/70 shadow-lg shadow-blue-500/10 ring-4 ring-blue-500/10'
            : 'border-dashed border-slate-300 hover:border-blue-500 hover:bg-slate-50/70 shadow-xs'
        }`}
      >
        <div className="flex flex-col items-center justify-center space-y-3">
          {/* Cloud Icon Container */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-xs group-hover:scale-105 group-hover:bg-blue-100 group-hover:text-blue-700 transition-all">
            <UploadCloud className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>

          {/* Action Title */}
          <div className="space-y-1">
            <h4 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              Drag & Drop files here, or <span className="text-blue-600 underline underline-offset-4 decoration-blue-500/50 hover:text-blue-700">Browse Files</span>
            </h4>
            <p className="text-xs text-slate-500">
              Upload single or batch stock images and vectors to generate metadata
            </p>
          </div>

          {/* Formats and Details Row */}
          <div className="pt-1 text-xs flex flex-wrap items-center justify-center gap-2 text-slate-600">
            <span className="font-semibold font-mono text-[11px] sm:text-xs bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
              JPG • JPEG • PNG • WEBP • EPS • AI • SVG
            </span>
            <span className="text-slate-400 hidden sm:inline">•</span>
            <span className="text-[11px] sm:text-xs bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
              Max 100MB / file
            </span>
            <span className="text-slate-400 hidden sm:inline">•</span>
            <span className="text-[11px] sm:text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
              ✓ Exact Filename Preserved
            </span>
            {onOpenRules && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenRules();
                }}
                className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-slate-500 hover:text-blue-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                title="View format specs"
              >
                <Info className="w-3.5 h-3.5" />
                <span>Specs</span>
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="absolute inset-0 backdrop-blur-xs bg-white/95 rounded-2xl flex flex-col items-center justify-center gap-2 font-semibold text-sm p-4 text-blue-600">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin border-blue-600" />
              <span className="font-bold">
                {uploadProgress
                  ? `Uploading ${uploadProgress.current} / ${uploadProgress.total}`
                  : 'Preparing assets...'}
              </span>
            </div>
            {uploadProgress && (
              <span className="text-xs font-mono truncate max-w-full px-4 text-slate-600">
                {uploadProgress.filename}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Duplicate detection warning */}
      {duplicateWarning && duplicateWarning.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Possible duplicate filename detected: </strong>
              <span>
                {duplicateWarning.slice(0, 3).join(', ')}
                {duplicateWarning.length > 3 ? ` and ${duplicateWarning.length - 3} more` : ''}.
              </span>
              <span className="text-amber-400/80 block mt-0.5">Files added to queue. Exact filename preserved.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDuplicateWarning(null)}
            className="text-amber-400/80 hover:text-amber-200 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Validation Error Banner */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-200 text-xs"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
