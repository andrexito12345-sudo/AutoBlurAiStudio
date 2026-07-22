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
  Lock,
  RefreshCw,
  Maximize2,
  X,
  ArrowRight,
  Undo2
} from 'lucide-react';
import { ProcessingTask } from '../types';
import { BlurConfig } from '../utils/imageHelper';

interface ImageItemProps {
  key?: string;
  task: ProcessingTask;
  onRemove: (id: string) => void;
  onProcess: (id: string, config: BlurConfig, forceRedetect?: boolean) => Promise<void>;
  isPremium: boolean;
  isBlocked?: boolean;
  onOpenBilling?: () => void;
}

export default function ImageItem({
  task,
  onRemove,
  onProcess,
  isPremium,
  isBlocked,
  onOpenBilling
}: ImageItemProps) {
  const [blurStyle, setBlurStyle] = useState<'gaussian' | 'pixelated' | 'censored'>('gaussian');
  const [intensity, setIntensity] = useState<number>(15);
  const [viewOriginal, setViewOriginal] = useState<boolean>(false);
  const [isProcessingLocal, setIsProcessingLocal] = useState<boolean>(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);

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

  const handleForceRegenerate = async () => {
    setIsProcessingLocal(true);
    try {
      // Force face re-detection from Gemini API
      await onProcess(task.id, { style: blurStyle, intensity }, true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessingLocal(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const displayUrl = viewOriginal ? task.originalUrl : (task.processedUrl || task.originalUrl);

  return (
    <div className="flex flex-col lg:flex-row gap-5 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs hover:shadow-sm hover:border-slate-300 transition-all duration-300 text-left">
      
      {/* Thumbnail Container */}
      <div 
        onClick={() => { if (task.status === 'completed') setIsLightboxOpen(true); }}
        className={`relative aspect-[4/3] w-full lg:w-52 rounded-xl overflow-hidden bg-slate-50 border border-slate-100/80 group shrink-0 ${task.status === 'completed' ? 'cursor-zoom-in' : ''}`}
      >
        <img
          src={displayUrl}
          alt={task.name}
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain transition-all duration-300 group-hover:scale-[1.015]"
        />

        {/* Hover Zoom-in cue for completed images */}
        {task.status === 'completed' && (
          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <span className="flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-md px-3.5 py-2 text-[10px] font-extrabold text-slate-800 shadow-lg">
              <Maximize2 className="h-3.5 w-3.5 text-blue-600" />
              <span>Comparar y Ajustar</span>
            </span>
          </div>
        )}

        {/* View Toggle Overlay */}
        {task.processedUrl && !isLightboxOpen && (
          <button
            onMouseDown={() => setViewOriginal(true)}
            onMouseUp={() => setViewOriginal(false)}
            onMouseLeave={() => setViewOriginal(false)}
            onTouchStart={() => setViewOriginal(true)}
            onTouchEnd={() => setViewOriginal(false)}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-slate-900/90 backdrop-blur-sm px-2.5 py-1.5 text-[9px] font-extrabold text-white uppercase tracking-wider select-none active:bg-blue-600 transition-all cursor-pointer"
            title="Mantén pulsado para comparar con el original"
          >
            {viewOriginal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            <span>{viewOriginal ? 'Original' : 'Ver Original'}</span>
          </button>
        )}

        {/* Status Badges Overlay */}
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
          {task.status === 'completed' && (
            <span className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider shadow-sm">
              <Check className="h-3 w-3" />
              <span>{task.facesCount} Rostros</span>
            </span>
          )}
          {task.status === 'failed' && (
            <span className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider shadow-sm">
              <AlertTriangle className="h-3 w-3" />
              <span>Error</span>
            </span>
          )}
          {(task.status === 'detecting' || task.status === 'blurring' || isProcessingLocal) && (
            <span className="flex items-center gap-1 rounded-md bg-slate-900 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider animate-pulse shadow-sm">
              <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
              <span>{task.status === 'detecting' ? 'Analizando IA...' : 'Difuminando...'}</span>
            </span>
          )}
        </div>
      </div>

      {/* Control Panel / Metadata */}
      <div className="flex flex-col justify-between flex-1 gap-4 text-left">
        <div>
          {/* Metadata Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-extrabold text-slate-800 truncate max-w-[200px] sm:max-w-xs md:max-w-md" title={task.name}>
                {task.name}
              </h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-400 font-bold">{formatSize(task.size)}</span>
                {task.facesCount !== undefined && task.status === 'completed' && (
                  <>
                    <span className="text-slate-300 text-[10px]">•</span>
                    <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100/50">
                      Anonimización completada ({task.facesCount} {task.facesCount === 1 ? 'rostro' : 'rostros'})
                    </span>
                  </>
                )}
              </div>
            </div>
            
            <button
              onClick={() => onRemove(task.id)}
              className="rounded-xl p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
              title="Eliminar de la cola"
            >
              <Trash2 className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Config Sliders & Style Presets */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            
            {/* Style Picker */}
            <div>
              <label className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                <Sliders className="h-3.5 w-3.5 text-slate-450" />
                Estilo de Censura
              </label>
              <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200/50">
                <button
                  onClick={() => setBlurStyle('gaussian')}
                  className={`rounded-lg py-1.5 text-[10px] font-bold transition-all cursor-pointer ${
                    blurStyle === 'gaussian'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/20'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Gaussiano
                </button>
                <button
                  onClick={() => setBlurStyle('pixelated')}
                  className={`rounded-lg py-1.5 text-[10px] font-bold transition-all cursor-pointer ${
                    blurStyle === 'pixelated'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/20'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Mosaico
                </button>
                <button
                  onClick={() => setBlurStyle('censored')}
                  className={`rounded-lg py-1.5 text-[10px] font-bold transition-all cursor-pointer ${
                    blurStyle === 'censored'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/20'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Barra Negra
                </button>
              </div>
            </div>

            {/* Intensity Slider */}
            <div>
              <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 flex justify-between">
                <span>Intensidad del efecto</span>
                <span className="text-blue-600 font-extrabold">{intensity}px</span>
              </div>
              <input
                type="range"
                min="3"
                max="60"
                disabled={blurStyle === 'censored'}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="mt-3.5 w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900 disabled:opacity-30 disabled:cursor-not-allowed"
              />
            </div>

          </div>
        </div>

        {/* Action Button Bar */}
        <div className="flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
          {task.status === 'idle' || task.status === 'failed' ? (
            <button
              onClick={isBlocked ? onOpenBilling : handleStartProcess}
              disabled={isProcessingLocal}
              className={`flex items-center gap-1.5 rounded-xl px-4.5 py-2.5 text-xs font-bold text-white shadow-sm transition-all cursor-pointer ${
                isBlocked 
                  ? 'bg-slate-400 hover:bg-slate-500 shadow-slate-100' 
                  : 'bg-slate-900 hover:bg-slate-800 shadow-slate-200 active:scale-97'
              }`}
            >
              {isBlocked ? <Lock className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{isBlocked ? 'Desbloquear con Premium' : 'Procesar con Inteligencia Artificial'}</span>
            </button>
          ) : task.status === 'completed' ? (
            <>
              {/* Compare and Zoom Action */}
              <button
                onClick={() => setIsLightboxOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-250 bg-slate-50 hover:bg-slate-100 px-4 py-2.5 text-xs font-extrabold text-slate-700 transition-all active:scale-97 cursor-pointer"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Comparar e Inspeccionar</span>
              </button>

              {/* Download Action */}
              <a
                href={task.processedUrl}
                download={`autoblur_${task.name}`}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-100 hover:bg-emerald-700 active:scale-97 transition-all cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Descargar Imagen</span>
              </a>

              {/* Force Regenerate Action */}
              <button
                onClick={handleForceRegenerate}
                disabled={isProcessingLocal}
                title="Vuelve a correr el modelo de IA para detectar rostros desde cero"
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-600 transition-all active:scale-97 cursor-pointer disabled:opacity-50"
              >
                {isProcessingLocal ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                )}
                <span>Regenerar Rostros con IA</span>
              </button>
            </>
          ) : (
            <button
              disabled
              className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-400 cursor-not-allowed"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{task.status === 'detecting' ? 'Corriendo Detección...' : 'Aplicando Filtros...'}</span>
            </button>
          )}

          {task.error && (
            <p className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100/50 px-2.5 py-1.5 rounded-lg max-w-sm truncate">
              {task.error}
            </p>
          )}
        </div>

      </div>

      {/* FULL-SCREEN COMPARISON LIGHTBOX (ANTES / DESPUÉS) */}
      {isLightboxOpen && task.status === 'completed' && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between bg-gray-950/95 backdrop-blur-xl p-4 sm:p-6 overflow-y-auto animate-fadeIn text-white">
          
          {/* Lightbox Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4 w-full max-w-7xl mx-auto">
            <div>
              <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-1 rounded-full uppercase tracking-widest">
                Modo Inspección e IA
              </span>
              <h3 className="text-base sm:text-lg font-bold text-white mt-1.5 truncate max-w-[240px] sm:max-w-xl">
                {task.name}
              </h3>
            </div>

            <button
              onClick={() => setIsLightboxOpen(false)}
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-all cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Lightbox Comparison Grid */}
          <div className="my-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center justify-center w-full max-w-7xl mx-auto flex-1">
            
            {/* Column 1: Original Image */}
            <div className="flex flex-col items-center">
              <div className="relative rounded-2xl overflow-hidden bg-gray-900 border border-white/10 aspect-[4/3] w-full max-h-[50vh] flex items-center justify-center shadow-2xl">
                <img
                  src={task.originalUrl}
                  alt="Original"
                  referrerPolicy="no-referrer"
                  className="max-h-[45vh] max-w-full object-contain"
                />
                <span className="absolute top-4 left-4 rounded-lg bg-gray-900/80 backdrop-blur-md border border-white/10 px-2.5 py-1 text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                  Original (Antes)
                </span>
              </div>
            </div>

            {/* Column 2: Processed AI Image */}
            <div className="flex flex-col items-center">
              <div className="relative rounded-2xl overflow-hidden bg-gray-900 border border-indigo-500/30 aspect-[4/3] w-full max-h-[50vh] flex items-center justify-center shadow-2xl">
                {isProcessingLocal ? (
                  <div className="absolute inset-0 bg-gray-950/40 backdrop-blur-xs flex flex-col items-center justify-center z-10">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
                    <span className="text-xs text-gray-300 font-bold tracking-wider">Aplicando cambios...</span>
                  </div>
                ) : null}
                <img
                  src={task.processedUrl}
                  alt="Blurred Result"
                  referrerPolicy="no-referrer"
                  className="max-h-[45vh] max-w-full object-contain"
                />
                <span className="absolute top-4 left-4 rounded-lg bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5 shadow-md">
                  <Check className="h-3.5 w-3.5" />
                  <span>Difuminado Inteligente ({task.facesCount} rostros)</span>
                </span>
              </div>
            </div>

          </div>

          {/* Lightbox Control Bar & Action buttons */}
          <div className="border-t border-white/10 pt-5 w-full max-w-7xl mx-auto">
            <div className="flex flex-col lg:flex-row gap-5 items-center justify-between bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/5">
              
              {/* Left side: interactive adjustments inside lightbox */}
              <div className="w-full lg:w-1/2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Style Picker */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                    <Sliders className="h-3.5 w-3.5 text-gray-400" />
                    Estilo de Difuminado
                  </label>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-white/10 p-1 border border-white/5">
                    <button
                      onClick={() => setBlurStyle('gaussian')}
                      className={`rounded-lg py-1 text-[10px] font-bold transition-all cursor-pointer ${
                        blurStyle === 'gaussian'
                          ? 'bg-white text-gray-900 shadow-xs'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      Gaussian
                    </button>
                    <button
                      onClick={() => setBlurStyle('pixelated')}
                      className={`rounded-lg py-1 text-[10px] font-bold transition-all cursor-pointer ${
                        blurStyle === 'pixelated'
                          ? 'bg-white text-gray-900 shadow-xs'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      Mosaico
                    </button>
                    <button
                      onClick={() => setBlurStyle('censored')}
                      className={`rounded-lg py-1 text-[10px] font-bold transition-all cursor-pointer ${
                        blurStyle === 'censored'
                          ? 'bg-white text-gray-900 shadow-xs'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      Censurado
                    </button>
                  </div>
                </div>

                {/* Intensity Slider */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex justify-between">
                    <span>Intensidad de Difuminado</span>
                    <span className="text-indigo-400 font-extrabold">{intensity}px</span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="60"
                    disabled={blurStyle === 'censored'}
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                    className="mt-3.5 w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>

              </div>

              {/* Right side: Download / Regenerate Actions */}
              <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleForceRegenerate}
                  disabled={isProcessingLocal}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/20 hover:bg-white/10 bg-transparent px-5 py-3 text-xs font-bold text-white transition-all active:scale-97 cursor-pointer disabled:opacity-50"
                >
                  {isProcessingLocal ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span>Regenerar con IA (Desde Cero)</span>
                </button>

                <a
                  href={task.processedUrl}
                  download={`autoblur_${task.name}`}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-3 text-xs font-bold text-white hover:bg-emerald-500 transition-all active:scale-97 shadow-lg shadow-emerald-950/20 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Descargar Imagen Procesada</span>
                </a>

                <button
                  onClick={() => setIsLightboxOpen(false)}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3 text-xs font-bold text-gray-300 hover:text-white transition-all cursor-pointer"
                >
                  <span>Cerrar</span>
                </button>
              </div>

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
