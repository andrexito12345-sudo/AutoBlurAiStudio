import React, { useState, useRef } from 'react';
import { Upload, FileWarning, Image as ImageIcon, AlertCircle, Sparkles } from 'lucide-react';
import { UserProfile } from '../types';

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  currentCount: number;
  maxFilesAllowed: number;
  profile: UserProfile | null;
  onOpenBilling: () => void;
}

export default function UploadZone({
  onFilesSelected,
  currentCount,
  maxFilesAllowed,
  profile,
  onOpenBilling
}: UploadZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumRequiredError, setPremiumRequiredError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = (filesList: FileList | null) => {
    if (!filesList) return;
    setError(null);
    setPremiumRequiredError(false);
    
    const validFiles: File[] = [];
    const remainingSlots = maxFilesAllowed - currentCount;

    if (remainingSlots <= 0) {
      setError(`Has alcanzado el límite máximo de ${maxFilesAllowed} imágenes en la cola.`);
      return;
    }

    const filesToProcess = Array.from(filesList);
    let overflowCount = 0;

    for (const file of filesToProcess) {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
      const isAdvancedFormat = ['heic', 'heif', 'tiff', 'tif', 'bmp'].includes(fileExt);
      const isAllowedExt = ['heic', 'heif', 'tiff', 'tif', 'bmp', 'png', 'jpg', 'jpeg', 'webp'].includes(fileExt);
      const isImg = file.type.startsWith('image/') || isAllowedExt;

      if (!isImg) {
        setError('Por favor, selecciona únicamente archivos de imagen.');
        continue;
      }

      if (isAdvancedFormat) {
        const isUltraPro = profile?.subscriptionPlan === 'ultra_pro';
        if (!isUltraPro) {
          setError(`El formato .${fileExt.toUpperCase()} es exclusivo del Plan Ultra Pro ($19.99/mes).`);
          setPremiumRequiredError(true);
          continue;
        }
      }

      // Max size 10MB
      if (file.size > 10 * 1024 * 1024) {
        setError('El tamaño máximo de imagen permitido es de 10MB.');
        continue;
      }

      if (validFiles.length < remainingSlots) {
        validFiles.push(file);
      } else {
        overflowCount++;
      }
    }

    if (overflowCount > 0) {
      setError(`Solo se agregaron las imágenes que cabían en el límite de ${maxFilesAllowed}. Se omitieron ${overflowCount} archivos.`);
    }

    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    processFiles(e.dataTransfer.files);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        className={`relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition-all duration-200 cursor-pointer ${
          isDragActive
            ? 'border-indigo-600 bg-indigo-50/40 scale-[0.99] shadow-inner'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          accept="image/*,.heic,.heif,.tiff,.tif,.bmp"
          className="hidden"
        />

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-4 shadow-sm">
          <Upload className="h-6 w-6" />
        </div>

        <h3 className="font-display text-base font-bold text-gray-800">
          Arrastra y suelta tus fotos aquí
        </h3>
        <p className="mt-1 text-xs text-gray-400">
          O haz clic para explorar tus archivos (Máximo 10 imágenes por lote)
        </p>
        <div className="mt-4 flex flex-wrap gap-2 justify-center text-[10px] font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
          <span>PNG, JPG, JPEG, WEBP</span>
          <span className="text-purple-300 font-bold">•</span>
          <span className="text-purple-600 font-bold">PRO: HEIC, HEIF, TIFF, BMP</span>
          <span className="text-gray-300">|</span>
          <span>Tamaño máx: 10MB</span>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-700 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          {premiumRequiredError && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenBilling();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-700 active:scale-95 transition-all shadow-sm shrink-0 cursor-pointer"
            >
              <Sparkles className="h-3 w-3 animate-pulse" />
              <span>Mejorar a Ultra Pro</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
