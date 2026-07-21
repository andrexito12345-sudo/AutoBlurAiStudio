import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Trash2, 
  Download, 
  Check, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  Sliders, 
  Loader2,
  Lock
} from 'lucide-react';
import { ProcessingTask } from '../types';
import { BlurConfig } from '../utils/imageHelper';

interface ImageItemProps {
  key?: string;
  task: ProcessingTask;
  onRemove: (id: string) => void;
  onProcess: (id: string, config: BlurConfig) => Promise<void>;
  isPremium: boolean;
}

export default function ImageItem({
  task,
  onRemove,
  onProcess,
  isPremium
}: ImageItemProps) {
  // Blur configuration specific to this image
  const [blurStyle, setBlurStyle] = useState<'gaussian' | 'pixelated' | 'censored'>('gaussian');
  const [intensity, setIntensity] = useState<number>(15);
  const [viewOriginal, setViewOriginal] = useState<boolean>(false);
  const [isProcessingLocal, setIsProcessingLocal] = useState<boolean>(false);

  // Auto-retrigger blur calculation when config changes and faces are already detected
  useEffect(() => {
    if (task.facesCount !== undefined && task.status === 'completed') {
      reApplyBlur();
    }
  }, [blurStyle, intensity]);

  const reApplyBlur = async () => {
    setIsProcessingLocal(true);
    try {
      await onProcess(task.id, { style: blurStyle, intensity });
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessingLocal(false);
    }
  };

  const handleStartProcess = async () => {
    await onProcess(task.id, { style: blurStyle, intensity });
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Determine which image URL to display
  const displayUrl = viewOriginal ? task.originalUrl : (task.processedUrl || task.originalUrl);

  return (
    <div className="flex flex-col lg:flex-row gap-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-all">
      
      {/* Image Preview Container */}
      <div className="relative aspect-video w-full lg:w-64 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 group shrink-0">
        <img
          src={displayUrl}
          alt={task.name}
          className="h-full w-full object-contain transition-all duration-200"
        />

        {/* View Toggle Overlay (only when processedUrl exists) */}
        {task.processedUrl && (
          <button
            onMouseDown={() => setViewOriginal(true)}
            onMouseUp={() => setViewOriginal(false)}
            onMouseLeave={() => setViewOriginal(false)}
            onTouchStart={() => setViewOriginal(true)}
            onTouchEnd={() => setViewOriginal(false)}
            className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg bg-gray-900/75 backdrop-blur-xs px-2.5 py-1.5 text-[10px] font-bold text-white uppercase tracking-wider select-none active:bg-indigo-600 transition-all cursor-pointer"
          >
            {viewOriginal ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                <span>Original</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                <span>Mantén presionado para ver original</span>
              </>
            )}
          </button>
        )}

        {/* Status Badges Overlay */}
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
          {task.status === 'completed' && (
            <span className="flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">
              <Check className="h-3 w-3" />
              <span>{task.facesCount} Rostros Difuminados</span>
            </span>
          )}
          {task.status === 'failed' && (
            <span className="flex items-center gap-1 rounded-md bg-red-500 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">
              <AlertTriangle className="h-3 w-3" />
              <span>Error</span>
            </span>
          )}
          {(task.status === 'detecting' || task.status === 'blurring' || isProcessingLocal) && (
            <span className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{task.status === 'detecting' ? 'Analizando IA...' : 'Difuminando...'}</span>
            </span>
          )}
        </div>
      </div>

      {/* Control Panel / Metadata */}
      <div className="flex flex-col justify-between flex-1 gap-4">
        <div>
          {/* Metadata */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-gray-800 truncate max-w-[200px] sm:max-w-xs" title={task.name}>
                {task.name}
              </h4>
              <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{formatSize(task.size)}</p>
            </div>
            
            <button
              onClick={() => onRemove(task.id)}
              className="rounded-lg p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              title="Eliminar de la cola"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Config sliders & controls */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-50 pt-4">
            
            {/* Style Picker */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                <Sliders className="h-3.5 w-3.5" />
                Estilo de Difuminado
              </label>
              <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-0.5 border border-gray-200/50">
                <button
                  onClick={() => setBlurStyle('gaussian')}
                  className={`rounded-md py-1 text-[10px] font-bold transition-all cursor-pointer ${
                    blurStyle === 'gaussian'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Gaussian
                </button>
                <button
                  onClick={() => setBlurStyle('pixelated')}
                  className={`rounded-md py-1 text-[10px] font-bold transition-all cursor-pointer ${
                    blurStyle === 'pixelated'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Mosaico
                </button>
                <button
                  onClick={() => setBlurStyle('censored')}
                  className={`rounded-md py-1 text-[10px] font-bold transition-all cursor-pointer ${
                    blurStyle === 'censored'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Censurado
                </button>
              </div>
            </div>

            {/* Intensity Slider */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex justify-between">
                <span>Intensidad</span>
                <span className="text-gray-600 font-semibold">{intensity}px</span>
              </label>
              <input
                type="range"
                min="3"
                max="45"
                disabled={blurStyle === 'censored'}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="mt-3.5 w-full h-1.5 bg-gray-150 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
              />
            </div>

          </div>
        </div>

        {/* Action button bar */}
        <div className="flex items-center gap-3 border-t border-gray-50 pt-3.5">
          {task.status === 'idle' || task.status === 'failed' ? (
            <button
              onClick={handleStartProcess}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-100 transition-all hover:bg-indigo-700 active:scale-95 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Procesar Automáticamente</span>
            </button>
          ) : task.status === 'completed' ? (
            <a
              href={task.processedUrl}
              download={`autoblur_${task.name}`}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-100 transition-all hover:bg-emerald-700 active:scale-95 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Descargar Imagen</span>
            </a>
          ) : (
            <button
              disabled
              className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-4 py-2 text-xs font-bold text-gray-400 cursor-not-allowed"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Procesando...</span>
            </button>
          )}

          {task.error && (
            <p className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-100/50 px-2.5 py-1 rounded-md max-w-sm truncate">
              {task.error}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
