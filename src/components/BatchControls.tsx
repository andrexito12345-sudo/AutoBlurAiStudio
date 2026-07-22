import React, { useState } from 'react';
import { Play, Download, Archive, Loader2, Sparkles, Lock } from 'lucide-react';
import { ProcessingTask } from '../types';
import JSZip from 'jszip';

interface BatchControlsProps {
  tasks: ProcessingTask[];
  onProcessAll: () => Promise<void>;
  isProcessingAny: boolean;
  isBlocked?: boolean;
  onOpenBilling?: () => void;
}

export default function BatchControls({
  tasks,
  onProcessAll,
  isProcessingAny,
  isBlocked,
  onOpenBilling
}: BatchControlsProps) {
  const [zipping, setZipping] = useState(false);

  const totalFiles = tasks.length;
  const processedFiles = tasks.filter(t => t.status === 'completed').length;
  const totalFaces = tasks.reduce((acc, curr) => acc + (curr.facesCount || 0), 0);

  const handleDownloadAllZip = async () => {
    const completedTasks = tasks.filter(t => t.processedUrl && t.status === 'completed');
    if (completedTasks.length === 0) return;

    setZipping(true);
    try {
      const zip = new JSZip();

      for (let i = 0; i < completedTasks.length; i++) {
        const task = completedTasks[i];
        if (task.processedUrl) {
          // Extract base64 string from data URL
          const base64Content = task.processedUrl.split(',')[1];
          // Ensure filename has valid extension or correct naming
          const fileName = task.name.toLowerCase().endsWith('.zip') 
            ? `blurred_${task.name.substring(0, task.name.length - 4)}.jpg` 
            : `blurred_${task.name}`;
          
          zip.file(fileName, base64Content, { base64: true });
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `autoblur_batch_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating zip file:', err);
      alert('Error al generar el archivo comprimido .zip.');
    } finally {
      setZipping(false);
    }
  };

  if (totalFiles === 0) return null;

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 rounded-2xl border border-slate-250 bg-slate-50/80 p-5 shadow-inner">
      {/* Metrics / Overview */}
      <div className="flex items-center gap-6">
        <div className="text-left">
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Archivos en lote</p>
          <p className="text-xl font-extrabold text-slate-800 leading-tight mt-1.5">
            {processedFiles} <span className="text-slate-500 text-xs font-semibold">/ {totalFiles} listos</span>
          </p>
        </div>
        <div className="h-8 w-px bg-slate-200"></div>
        <div className="text-left">
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Rostros Detectados</p>
          <p className="text-xl font-extrabold text-slate-800 leading-tight mt-1.5">
            {totalFaces} <span className="text-slate-500 text-xs font-semibold">{totalFaces === 1 ? 'cara' : 'caras'}</span>
          </p>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex flex-wrap gap-3">
        {processedFiles < totalFiles && (
          <button
            onClick={isBlocked ? onOpenBilling : onProcessAll}
            disabled={isProcessingAny}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-extrabold text-white shadow-md transition-all cursor-pointer ${
              isBlocked 
                ? 'bg-slate-400 hover:bg-slate-500 shadow-slate-100' 
                : 'bg-slate-900 hover:bg-slate-800 shadow-slate-200 active:scale-95'
            }`}
          >
            {isProcessingAny ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Procesando Lote...</span>
              </>
            ) : (
              <>
                {isBlocked ? <Lock className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white text-white" />}
                <span>{isBlocked ? 'Desbloquear Lote con Premium' : 'Procesar Todo el Lote'}</span>
              </>
            )}
          </button>
        )}

        {processedFiles > 0 && (
          <button
            onClick={handleDownloadAllZip}
            disabled={zipping}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-100 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
          >
            {zipping ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Comprimiendo ZIP...</span>
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" />
                <span>Descargar todo (.zip)</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
