import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  signInWithGoogle, 
  logOut, 
  auth, 
  db, 
  getOrCreateUserProfile 
} from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { 
  Sparkles, 
  ShieldCheck, 
  Loader2, 
  LogIn, 
  Upload, 
  Info, 
  Lock, 
  Eye, 
  AlertCircle, 
  Coins, 
  CheckCircle,
  HelpCircle,
  ChevronRight,
  Shield,
  Zap
} from 'lucide-react';
import { UserProfile, ProcessingTask, SubscriptionPlan } from './types';
import Navbar from './components/Navbar';
import BillingModal from './components/BillingModal';
import UploadZone from './components/UploadZone';
import ImageItem from './components/ImageItem';
import BatchControls from './components/BatchControls';
import { applyBlursToImage, BlurConfig } from './utils/imageHelper';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<ProcessingTask[]>([]);
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [isProcessingAny, setIsProcessingAny] = useState(false);

  // Authenticated State Handler
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setProfile(null);
        setGlobalLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // Sync Profile with Database
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setGlobalLoading(false);
      return;
    }
    
    setGlobalLoading(true);
    let unsubscribe: (() => void) | null = null;

    const setupProfileSync = async () => {
      try {
        await getOrCreateUserProfile(user);
        const userRef = doc(db, 'users', user.uid);
        unsubscribe = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            setProfile(null);
          }
          setGlobalLoading(false);
        }, (error) => {
          console.error("Firestore snapshot error:", error);
          setGlobalLoading(false);
        });
      } catch (err) {
        console.error("Error securing profile:", err);
        setGlobalLoading(false);
      }
    };

    setupProfileSync();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user]);

  // Google Login Trigger
  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Login failed:", error);
      alert("Error al iniciar sesión con Google. Inténtalo de nuevo.");
    }
  };

  // Log out Trigger
  const handleSignOut = async () => {
    try {
      await logOut();
      setTasks([]); // Clear active local queue on logout
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Add Files to local processing queue
  const handleFilesSelected = (files: File[]) => {
    const newTasks: ProcessingTask[] = files.map(file => {
      const objectUrl = URL.createObjectURL(file);
      return {
        id: Math.random().toString(36).substring(7),
        name: file.name,
        size: file.size,
        status: 'idle',
        originalUrl: objectUrl,
        progress: 0
      };
    });
    setTasks(prev => [...prev, ...newTasks]);
  };

  // Remove individual file from local queue
  const handleRemoveTask = (id: string) => {
    setTasks(prev => {
      const target = prev.find(t => t.id === id);
      if (target?.originalUrl) {
        URL.revokeObjectURL(target.originalUrl);
      }
      return prev.filter(t => t.id !== id);
    });
  };

  // Core Processing Loop: Detect & Blur faces via Server API
  const handleProcessTask = async (id: string, blurConfig: BlurConfig) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Set status to detecting
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'detecting', error: undefined } : t));

    try {
      // 1. Fetch file content and convert to base64
      const fileResponse = await fetch(task.originalUrl!);
      const blob = await fileResponse.blob();
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // 2. Query Face detection API
      const idToken = user ? await user.getIdToken() : '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/gemini/detect-faces', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          image: base64Data,
          mimeType: blob.type
        })
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle plan limit exceeded
        if (response.status === 403) {
          setIsBillingOpen(true);
          throw new Error(result.error || 'Límite de plan excedido.');
        }
        throw new Error(result.error || 'Error en la detección de rostros.');
      }

      const faces = result.faces || [];

      // 3. Status update: Blurring
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'blurring' } : t));

      // 4. Draw blurs client side using canvas
      const blurredUrl = await applyBlursToImage(task.originalUrl!, faces, blurConfig);

      // 5. Complete task
      setTasks(prev => prev.map(t => t.id === id ? {
        ...t,
        status: 'completed',
        processedUrl: blurredUrl,
        facesCount: faces.length,
        progress: 100
      } : t));

    } catch (err: any) {
      console.error("Error processing task:", err);
      setTasks(prev => prev.map(t => t.id === id ? {
        ...t,
        status: 'failed',
        error: err.message || 'Error al procesar la imagen'
      } : t));
    }
  };

  // Process all idle files in batch
  const handleProcessAllBatch = async () => {
    const idleTasks = tasks.filter(t => t.status === 'idle' || t.status === 'failed');
    if (idleTasks.length === 0) return;

    setIsProcessingAny(true);
    for (const task of idleTasks) {
      // Run sequentially to handle limits correctly and prevent rate-limiting
      await handleProcessTask(task.id, { style: 'gaussian', intensity: 15 });
    }
    setIsProcessingAny(false);
  };

  // High-fidelity payment upgrade simulator
  const handleUpgradeSimulated = async (plan: SubscriptionPlan) => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/user/update-subscription-simulated', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ plan })
      });
      if (!response.ok) {
        throw new Error('No se pudo simular la suscripción');
      }
    } catch (err) {
      console.error(err);
      alert('Error al actualizar plan en la base de datos.');
    }
  };

  if (globalLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50/50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-sm font-semibold text-gray-500">Cargando AutoBlur.ai...</p>
        </div>
      </div>
    );
  }

  const isPremium = profile?.subscriptionPlan === 'premium' || profile?.subscriptionPlan === 'lifetime';

  const getPlanDisplayName = (plan?: string) => {
    switch (plan) {
      case 'premium':
        return 'Premium Pro';
      case 'lifetime':
        return 'De Por Vida';
      case 'basic':
      case 'free':
        return 'Plan Básico';
      case 'trial':
      default:
        return 'Prueba Gratis';
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafc] flex flex-col justify-between">
      
      {/* Navigation */}
      <Navbar
        user={user}
        profile={profile}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onOpenBilling={() => setIsBillingOpen(true)}
      />

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {user && profile ? (
          /* WORKSPACE VIEW (LOGGED IN) */
          <div className="space-y-8 animate-fadeIn">
            
            {/* Header Title */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-gray-900 tracking-tight">
                  Espacio de Trabajo
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Sube tus fotos, aplica diferentes estilos de censura y descarga los resultados de forma rápida.
                </p>
              </div>

              {/* Status metrics display */}
              <div className="flex gap-4">
                <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-xs min-w-[140px]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tu Plan</p>
                  <p className="text-sm font-extrabold text-indigo-600 capitalize mt-1 flex items-center gap-1.5">
                    {getPlanDisplayName(profile.subscriptionPlan)}
                    {isPremium && (
                      <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-400 shrink-0" />
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-xs min-w-[140px]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Imágenes Procesadas</p>
                  <p className="text-sm font-extrabold text-gray-900 mt-1">
                    {profile.imagesProcessedCount}
                    {!isPremium && <span className="text-gray-400 text-xs font-medium"> / 10 máx</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* Dropzone Upload */}
            <div className="max-w-3xl mx-auto">
              <UploadZone
                onFilesSelected={handleFilesSelected}
                currentCount={tasks.length}
                maxFilesAllowed={10}
              />
            </div>

            {/* Batch Action Bar */}
            <BatchControls
              tasks={tasks}
              onProcessAll={handleProcessAllBatch}
              isProcessingAny={isProcessingAny}
            />

            {/* Image Queue List */}
            {tasks.length > 0 ? (
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 pb-2">
                  Cola de Procesamiento ({tasks.length})
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {tasks.map(task => (
                    <ImageItem
                      key={task.id}
                      task={task}
                      onRemove={handleRemoveTask}
                      onProcess={handleProcessTask}
                      isPremium={isPremium}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-gray-200/50 rounded-3xl bg-white max-w-xl mx-auto">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 text-gray-400 mb-4 border border-gray-100">
                  <Upload className="h-5 w-5" />
                </div>
                <h4 className="font-display text-sm font-bold text-gray-700">Tu cola de procesamiento está vacía</h4>
                <p className="text-xs text-gray-400 mt-1 max-w-xs px-4">
                  Sube una foto o añade varias imágenes en lote usando el cargador superior para comenzar el difuminado automático con IA.
                </p>
              </div>
            )}

          </div>
        ) : (
          /* LANDING PROMOTION VIEW (UNAUTHENTICATED) */
          <div className="flex flex-col items-center py-12 md:py-20 animate-fadeIn text-center">
            
            {/* Promo Header */}
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3.5 py-1 text-xs font-semibold text-indigo-700 mb-6">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500 animate-spin" />
              <span>Detección Facial Automática con IA</span>
            </div>
            
            <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight max-w-4xl leading-tight">
              Protege la privacidad en tus fotos en <span className="text-indigo-600 relative">segundos</span>
            </h2>
            
            <p className="mt-6 text-gray-500 text-sm sm:text-base md:text-lg max-w-2xl leading-relaxed">
              La forma más rápida, segura y profesional de difuminar rostros en tus imágenes. Desarrollado con inteligencia artificial avanzada para procesar fotos individuales o lotes de hasta 10 imágenes al instante.
            </p>

            {/* CTA Auth Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center w-full max-w-md">
              <button
                onClick={handleSignIn}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 rounded-2xl bg-indigo-600 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-indigo-100 transition-all hover:bg-indigo-700 hover:scale-[1.02] active:scale-98 cursor-pointer"
              >
                <LogIn className="h-4.5 w-4.5" />
                <span>Comenzar Prueba de 7 Días Gratis</span>
              </button>
            </div>

            {/* Trial features list */}
            <p className="mt-3 text-xs text-gray-400 font-medium flex items-center gap-1">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Inicia sesión con Google para acceder de inmediato. No requiere tarjeta de crédito.
            </p>

            {/* Dynamic Features Sandbox Presentation */}
            <div className="mt-20 w-full max-w-5xl">
              <h3 className="font-display text-lg font-bold text-gray-800 mb-8">
                Elige entre múltiples filtros avanzados de censura
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* Feature 1 */}
                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <h4 className="font-display text-sm font-bold text-gray-900 text-left">Blur Gaussiano Clásico</h4>
                  <p className="text-xs text-gray-500 text-left mt-2 leading-relaxed">
                    Efecto estético y difuminado ultra-suave. Perfecto para mantener la sobriedad en publicaciones corporativas y retratos.
                  </p>
                </div>

                {/* Feature 2 */}
                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <h4 className="font-display text-sm font-bold text-gray-900 text-left">Censura en Mosaico (Píxel)</h4>
                  <p className="text-xs text-gray-500 text-left mt-2 leading-relaxed">
                    Estilo de pixelación retro tradicional. Ideal para coberturas de noticias, redes sociales o contenido periodístico.
                  </p>
                </div>

                {/* Feature 3 */}
                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <h4 className="font-display text-sm font-bold text-gray-900 text-left">Barra de Censura de Ojos</h4>
                  <p className="text-xs text-gray-500 text-left mt-2 leading-relaxed">
                    Protección estricta mediante barras negras sólidas. Asegura el anonimato absoluto en cualquier documento.
                  </p>
                </div>

              </div>
            </div>

          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-gray-150 py-5 bg-white text-center">
        <p className="text-[10px] text-gray-400 font-semibold tracking-wide uppercase">
          AutoBlur.ai © {new Date().getFullYear()} — Diseñado con precisión para una privacidad inteligente
        </p>
      </footer>

      {/* SaaS Billing & Upgrade Modal */}
      <BillingModal
        isOpen={isBillingOpen}
        onClose={() => setIsBillingOpen(false)}
        profile={profile}
        onUpgradeSimulated={handleUpgradeSimulated}
      />

    </div>
  );
}
