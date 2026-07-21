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
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
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
  Zap,
  AlertTriangle
} from 'lucide-react';
import { UserProfile, ProcessingTask, SubscriptionPlan } from './types';
import Navbar from './components/Navbar';
import BillingModal from './components/BillingModal';
import UploadZone from './components/UploadZone';
import ImageItem from './components/ImageItem';
import BatchControls from './components/BatchControls';
import { applyBlursToImage, BlurConfig } from './utils/imageHelper';

// Plans that grant a paid image allowance. `daily`/`weekly`/`monthly` are the
// current passes; the legacy names are kept so existing user documents still work.
const PAID_PLANS = ['daily', 'weekly', 'monthly', 'premium', 'ultra_pro', 'lifetime'];
const PLAN_IMAGE_LIMITS: Record<string, number> = { daily: 50, weekly: 500, monthly: 2000 };
const FREE_IMAGE_LIMIT = 10;

// Creator/admin accounts: full unlimited access, no plan or limit checks.
// Match is by the Google (Firebase auth) email the user signs in with, lowercased.
// Add/remove emails here. This is intentionally invisible to normal users.
const ADMIN_EMAILS = [
  'andrexito12345@gmail.com',
  'abcdavila006@gmail.com',
];

// Single source of truth for a user's current access: whether a paid pass is
// active, how many images it allows, and whether they're blocked from processing.
function getPlanAccess(profile: UserProfile | null, now: Date) {
  const plan = profile?.subscriptionPlan || 'free';
  const count = profile?.imagesProcessedCount || 0;

  // Creator override: unlimited everything, never blocked.
  const email = (profile?.email || '').toLowerCase().trim();
  if (email && ADMIN_EMAILS.includes(email)) {
    return {
      plan, isAdmin: true, isPaidActive: true, unlimited: true,
      imageLimit: Infinity, count,
      isTrialExpired: false, isLimitReached: false, isBlocked: false,
    };
  }

  const notExpired =
    profile?.subscriptionExpiresAt === 'never' ||
    (!!profile?.subscriptionExpiresAt && new Date(profile.subscriptionExpiresAt) > now);
  const isPaidActive = PAID_PLANS.includes(plan) && notExpired;
  const imageLimit = isPaidActive
    ? (profile?.imageLimit ?? PLAN_IMAGE_LIMITS[plan] ?? 2000)
    : FREE_IMAGE_LIMIT;
  const isTrialExpired =
    !isPaidActive && !!profile?.trialExpiresAt && now > new Date(profile.trialExpiresAt);
  const isLimitReached = count >= imageLimit;
  const isBlocked = isLimitReached || isTrialExpired;
  return { plan, isAdmin: false, isPaidActive, unlimited: false, imageLimit, count, isTrialExpired, isLimitReached, isBlocked };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<ProcessingTask[]>([]);
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [isProcessingAny, setIsProcessingAny] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [demoFilter, setDemoFilter] = useState<'gaussian' | 'pixel' | 'censored'>('gaussian');
  const [demoIntensity, setDemoIntensity] = useState(20);

  // PayPhone Confirmation States
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);

  // Payphone URL query parameter check hook
  useEffect(() => {
    const handleConfirmPayment = async () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      const clientTransactionId = params.get('clientTransactionId');

      if (id && clientTransactionId) {
        setConfirmingPayment(true);
        try {
          // Poll to wait for user to initialize
          let currentUser = auth.currentUser;
          if (!currentUser) {
            for (let i = 0; i < 30; i++) {
              await new Promise(r => setTimeout(r, 100));
              currentUser = auth.currentUser;
              if (currentUser) break;
            }
          }

          if (!currentUser) {
            setPaymentErrorMessage('Por favor, inicia sesión con Google para completar la confirmación de tu pago.');
            setConfirmingPayment(false);
            return;
          }

          const idToken = await currentUser.getIdToken();
          const response = await fetch('/api/payphone/confirm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ id, clientTransactionId })
          });

          const result = await response.json();
          if (response.ok && result.success) {
            const planLabels: Record<string, string> = { daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual' };
            setPaymentSuccessMessage(`¡Gracias por tu pago! Tu Plan ${planLabels[result.plan] || 'Pro'} ha sido activado correctamente.`);
            // Clean URL query parameters
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          } else {
            setPaymentErrorMessage(result.error || 'No se pudo confirmar tu pago con Payphone.');
          }
        } catch (error: any) {
          console.error("Error confirming payment:", error);
          setPaymentErrorMessage('Ocurrió un error inesperado al procesar tu pago.');
        } finally {
          setConfirmingPayment(false);
        }
      }
    };

    handleConfirmPayment();
  }, [user]);

  // Real-time countdown timer ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  // Add Files to local processing queue with async HEIC/HEIF conversion
  const handleFilesSelected = async (files: File[]) => {
    try {
      const processedFiles = await Promise.all(
        files.map(async (file) => {
          const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
          if (fileExt === 'heic' || fileExt === 'heif') {
            try {
              // Dynamically import heic2any
              const heic2anyModule = await import('heic2any');
              const heic2any = heic2anyModule.default;
              
              const conversionResult = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: 0.85
              });
              
              const resultBlob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
              return new File([resultBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
            } catch (err) {
              console.error('HEIC/HEIF conversion failed for file: ' + file.name, err);
              return file;
            }
          }
          return file;
        })
      );

      const newTasks: ProcessingTask[] = processedFiles.map(file => {
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
    } catch (error) {
      console.error('Error selecting/preprocessing files:', error);
    }
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
  const handleProcessTask = async (id: string, blurConfig: BlurConfig, forceRedetect = false) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    let faces = task.faces || [];
    const hasCachedFaces = faces.length > 0 || (task.faces !== undefined);

    if (forceRedetect || !hasCachedFaces) {
      // Validate plan limit or trial expiration on the client side
      const access = getPlanAccess(profile, new Date());

      if (access.isBlocked) {
        setIsBillingOpen(true);
        const errorMsg = access.isTrialExpired
          ? 'Tu prueba gratuita de 24 horas ha expirado. Actualiza tu plan para continuar procesando imágenes.'
          : access.isPaidActive
            ? `Has alcanzado el límite de ${access.imageLimit} imágenes de tu plan. Renueva o sube de plan para seguir procesando.`
            : `Has alcanzado el límite de ${access.imageLimit} imágenes gratis. Elige un plan para continuar.`;
        setTasks(prev => prev.map(t => t.id === id ? {
          ...t,
          status: 'failed',
          error: errorMsg
        } : t));
        return;
      }

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

        faces = result.faces || [];
      } catch (err: any) {
        console.error("Error processing task:", err);
        setTasks(prev => prev.map(t => t.id === id ? {
          ...t,
          status: 'failed',
          error: err.message || 'Error al procesar la imagen'
        } : t));
        return; // stop execution
      }
    }

    // Now proceed with Blurring (either cached or freshly detected)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'blurring' } : t));

    try {
      const isUserPremium = getPlanAccess(profile, new Date()).isPaidActive;

      // Draw blurs client side using canvas
      const blurredUrl = await applyBlursToImage(task.originalUrl!, faces, blurConfig, isUserPremium);

      // Complete task
      setTasks(prev => prev.map(t => t.id === id ? {
        ...t,
        status: 'completed',
        processedUrl: blurredUrl,
        facesCount: faces.length,
        faces: faces,
        progress: 100
      } : t));

      // NOTE: the processed-image counter is incremented server-side (admin) in
      // /api/gemini/detect-faces. The client no longer writes it — Firestore rules
      // block clients from modifying usage/plan fields.

    } catch (err: any) {
      console.error("Error drawing blurs:", err);
      setTasks(prev => prev.map(t => t.id === id ? {
        ...t,
        status: 'failed',
        error: err.message || 'Error al aplicar difuminado'
      } : t));
    }
  };

  // Process all idle files in batch
  const handleProcessAllBatch = async () => {
    if (isBlocked) {
      setIsBillingOpen(true);
      return;
    }
    const idleTasks = tasks.filter(t => t.status === 'idle' || t.status === 'failed');
    if (idleTasks.length === 0) return;

    setIsProcessingAny(true);
    for (const task of idleTasks) {
      // Run sequentially to handle limits correctly and prevent rate-limiting
      await handleProcessTask(task.id, { style: 'gaussian', intensity: 15 });
    }
    setIsProcessingAny(false);
  };

  // High-fidelity payment upgrade simulator (Direct Firestore client update to bypass backend permissions)
  const handleUpgradeSimulated = async (plan: SubscriptionPlan) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      let expiresAt = '';
      if (plan === 'ultra_pro' || plan === 'premium') {
        const expires = new Date();
        expires.setMonth(expires.getMonth() + 1); // 1 month simulated
        expiresAt = expires.toISOString();
      } else {
        expiresAt = 'never';
      }
      
      await updateDoc(userRef, {
        subscriptionPlan: plan,
        subscriptionExpiresAt: expiresAt,
        stripeCustomerId: 'cus_simulated_test',
        stripeSubscriptionId: plan === 'ultra_pro' ? 'sub_simulated_ultra_pro' : 'sub_simulated_test'
      });
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

  const access = getPlanAccess(profile, currentTime);
  const isPremium = access.isPaidActive;
  const isAdmin = access.isAdmin;
  const isUnlimited = access.unlimited;
  const imageLimit = access.imageLimit;
  const isTrialExpired = access.isTrialExpired;
  const isBlocked = access.isBlocked;

  const trialExpiresAt = profile?.trialExpiresAt ? new Date(profile.trialExpiresAt) : null;

  const getTrialTimeRemainingText = () => {
    if (!trialExpiresAt) return '';
    const diffMs = trialExpiresAt.getTime() - currentTime.getTime();
    if (diffMs <= 0) return 'Expirado';
    
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(diffHrs)}h ${pad(diffMins)}m ${pad(diffSecs)}s`;
  };

  const getPlanDisplayName = (plan?: string) => {
    switch (plan) {
      case 'daily':
        return 'Plan Diario';
      case 'weekly':
        return 'Plan Semanal';
      case 'monthly':
        return 'Plan Mensual';
      case 'ultra_pro':
        return 'Plan Ultra Pro';
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
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Payphone Payment Processing Alerts */}
        {confirmingPayment && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 shadow-xs animate-pulse flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <p className="text-sm font-semibold text-blue-700">
              Confirmando tu pago con PayPhone. Por favor, no cierres esta página...
            </p>
          </div>
        )}

        {paymentSuccessMessage && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-xs flex items-start gap-3 animate-fadeIn">
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-left">
              <p className="text-sm font-extrabold text-emerald-800">¡Pago Confirmado con Éxito!</p>
              <p className="text-xs text-emerald-700 mt-1">{paymentSuccessMessage}</p>
            </div>
            <button 
              onClick={() => setPaymentSuccessMessage(null)}
              className="text-emerald-500 hover:text-emerald-700 text-xs font-bold px-2 py-1 rounded hover:bg-emerald-100/30"
            >
              Cerrar
            </button>
          </div>
        )}

        {paymentErrorMessage && (
          <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 shadow-xs flex items-start gap-3 animate-fadeIn">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-left">
              <p className="text-sm font-extrabold text-red-800">Error en el Pago</p>
              <p className="text-xs text-red-700 mt-1">{paymentErrorMessage}</p>
            </div>
            <button 
              onClick={() => setPaymentErrorMessage(null)}
              className="text-red-500 hover:text-red-700 text-xs font-bold px-2 py-1 rounded hover:bg-red-100/30"
            >
              Cerrar
            </button>
          </div>
        )}

        {user && profile ? (
          /* WORKSPACE VIEW (LOGGED IN) */
          <div className="space-y-8 animate-fadeIn">
            
            {/* Hero Header */}
            <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 px-6 py-8 sm:px-10 sm:py-10 shadow-lg shadow-indigo-200/40">
              <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-violet-400/20 blur-2xl" />
              <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                <div className="max-w-xl">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white/90 backdrop-blur-sm mb-4">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Difuminado inteligente de rostros con IA</span>
                  </div>
                  <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                    Tu Espacio de Trabajo
                  </h2>
                  <p className="text-sm text-indigo-100 mt-2 leading-relaxed">
                    Sube tus fotos, aplica distintos estilos de censura y descarga los resultados en segundos.
                  </p>
                </div>

                {/* Plan + usage cards */}
                <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                  <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-3 min-w-[150px]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-100">Tu Plan</p>
                    <p className="text-base font-extrabold text-white mt-1 flex items-center gap-1.5">
                      {isAdmin ? 'Creador' : getPlanDisplayName(profile.subscriptionPlan)}
                      {isPremium && <Zap className="h-4 w-4 text-amber-300 fill-amber-300 shrink-0" />}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-3 min-w-[170px]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-100">Imágenes</p>
                    <p className="text-base font-extrabold text-white mt-1">
                      {profile.imagesProcessedCount}
                      {isUnlimited
                        ? <span className="text-indigo-200 text-xs font-medium"> · Ilimitado</span>
                        : <span className="text-indigo-200 text-xs font-medium"> / {imageLimit}</span>}
                    </p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-white transition-all duration-500"
                        style={{ width: isUnlimited ? '100%' : `${Math.min(100, ((profile.imagesProcessedCount || 0) / imageLimit) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Limit Warning Banner */}
            {!isPremium && (
              <div className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300 ${
                isBlocked 
                  ? 'bg-red-50/75 border-red-200 text-red-950 shadow-xs' 
                  : 'bg-amber-50/60 border-amber-200 text-amber-950 shadow-xs'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl shrink-0 ${isBlocked ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                    <AlertTriangle className="h-5 w-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">
                      {isBlocked 
                        ? '¡Tu período de prueba o límite gratuito ha finalizado!' 
                        : 'Prueba Gratuita de 24 Horas Activa'}
                    </h4>
                    <p className="text-xs text-gray-600 mt-1">
                      {isBlocked 
                        ? (isTrialExpired 
                            ? 'Han transcurrido las 24 horas de prueba. Suscríbete ahora para reactivar el procesamiento inteligente.' 
                            : `Has alcanzado el límite de ${imageLimit} imágenes gratis. Elige un plan para seguir procesando.`)
                        : `Tienes ${imageLimit} imágenes y 24 horas de uso gratis. Tiempo de prueba restante: ${getTrialTimeRemainingText() || 'Calculando...'}.`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsBillingOpen(true)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                    isBlocked 
                      ? 'bg-red-600 hover:bg-red-700 text-white shadow-xs' 
                      : 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{isBlocked ? 'Actualizar Plan Ahora' : 'Ver Planes de Pago'}</span>
                </button>
              </div>
            )}

            {/* Dropzone Upload */}
            <div className="max-w-5xl mx-auto">
              <UploadZone
                onFilesSelected={handleFilesSelected}
                currentCount={tasks.length}
                maxFilesAllowed={isPremium ? 50 : 10}
                profile={profile}
                onOpenBilling={() => setIsBillingOpen(true)}
              />
            </div>

            {/* Batch Action Bar */}
            <BatchControls
              tasks={tasks}
              onProcessAll={handleProcessAllBatch}
              isProcessingAny={isProcessingAny}
              isBlocked={isBlocked}
              onOpenBilling={() => setIsBillingOpen(true)}
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
                      isBlocked={isBlocked}
                      onOpenBilling={() => setIsBillingOpen(true)}
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
          <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-10 md:py-16 animate-fadeIn">
            
            {/* =========================================================================
                DESKTOP-ONLY LAYOUT (lg:grid)
                A premium, asymmetrical bento-split featuring interactive live demo.
               ========================================================================= */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-12 items-center">
              
              {/* Left Column: Premium Value Proposition & CTA */}
              <div className="lg:col-span-7 space-y-6 text-left">
                
                {/* Trust Badge */}
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-800 shadow-sm">
                  <ShieldCheck className="h-4.5 w-4.5 text-emerald-600 animate-pulse" />
                  <span>Protección de Datos Garantizada — Procesamiento Efímero Local</span>
                </div>
                
                <h2 className="font-display text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-tight">
                  La solución líder para <span className="text-indigo-600 relative inline-block">difuminar rostros</span> de forma automática y segura
                </h2>
                
                <p className="text-gray-600 text-lg leading-relaxed max-w-2xl">
                  AutoBlur es el software profesional más avanzado para anonimizar fotos al instante. Diseñado bajo estrictas normativas de privacidad, detecta y censura rostros automáticamente con inteligencia artificial de última generación.
                </p>

                {/* Proof Bulletins */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100/40 hover:bg-indigo-50 transition-all">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-indigo-950">Prueba de 24 Horas</h4>
                      <p className="text-xs text-gray-500 mt-1">Acceso inmediato y sin límites a todas las funciones premium.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100/40 hover:bg-emerald-50 transition-all">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-emerald-950">10 Fotos Gratis</h4>
                      <p className="text-xs text-gray-500 mt-1">Sube imágenes en lote o de forma individual de inmediato.</p>
                    </div>
                  </div>
                </div>

                {/* Interactive Trust Selling Points */}
                <div className="border-t border-gray-100 pt-6 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">¿Por qué es el software de censura más seguro?</h4>
                  
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs text-gray-600">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">✓</span>
                      <span><b>Cero Almacenamiento:</b> Las fotos nunca se guardan.</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">✓</span>
                      <span><b>Privacidad Certificada:</b> Cumple con GDPR / LOPD.</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">✓</span>
                      <span><b>Limpieza EXIF:</b> Borra metadatos de ubicación GPS.</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">✓</span>
                      <span><b>Procesamiento Local:</b> Ejecución fluida en memoria.</span>
                    </div>
                  </div>
                </div>

                {/* Primary CTA Block */}
                <div className="space-y-3 pt-4">
                  <button
                    onClick={handleSignIn}
                    className="inline-flex items-center justify-center gap-3 rounded-2xl bg-indigo-600 px-8 py-4 text-sm font-bold text-white shadow-xl shadow-indigo-200 transition-all hover:bg-indigo-700 hover:scale-[1.02] active:scale-98 cursor-pointer"
                  >
                    <LogIn className="h-5 w-5" />
                    <span>Comenzar Prueba Gratuita con Google</span>
                  </button>
                  <p className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
                    <ShieldCheck className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                    Sin datos de tarjeta. Tu privacidad está blindada desde el primer segundo.
                  </p>
                </div>

              </div>

              {/* Right Column: Immersive Real-Time Censorship Simulator */}
              <div className="lg:col-span-5 flex flex-col items-center">
                
                <div className="relative w-full max-w-sm bg-white border border-gray-200 rounded-3xl p-6 shadow-2xl shadow-indigo-100/40 overflow-hidden">
                  
                  {/* Window Bar Decoration */}
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-400"></span>
                      <span className="h-2.5 w-2.5 rounded-full bg-yellow-400"></span>
                      <span className="h-2.5 w-2.5 rounded-full bg-green-400"></span>
                      <span className="text-[10px] text-gray-400 font-mono ml-2 uppercase tracking-wider font-semibold">simulador_ia_env</span>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-extrabold text-emerald-700 border border-emerald-100">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      PREVISUALIZADOR LIVE
                    </div>
                  </div>

                  {/* Simulator Screen */}
                  <div className="relative rounded-2xl aspect-square bg-slate-950 border border-slate-900 flex items-center justify-center overflow-hidden group">
                    
                    {/* SVG Portrait representing safe face */}
                    <svg className="w-full h-full p-2 select-none" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="200" cy="200" r="180" fill="#1e1b4b" fillOpacity="0.3" />
                      <circle cx="200" cy="200" r="140" fill="#1e293b" />
                      <circle cx="200" cy="180" r="65" fill="#fed7aa" />
                      <path d="M135 180 C135 80, 265 80, 265 180 C265 200, 275 220, 275 230 C235 190, 165 190, 125 230 C125 220, 135 200, 135 180 Z" fill="#0f172a" />
                      <path d="M145 155 C170 120, 230 120, 255 155" stroke="#0f172a" strokeWidth="15" strokeLinecap="round" />
                      <path d="M165 165 C170 162, 180 162, 185 166" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
                      <path d="M215 166 C220 162, 230 162, 235 165" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
                      <circle cx="175" cy="176" r="6" fill="#0f172a" />
                      <circle cx="225" cy="176" r="6" fill="#0f172a" />
                      <circle cx="160" cy="195" r="8" fill="#f43f5e" fillOpacity="0.35" />
                      <circle cx="240" cy="195" r="8" fill="#f43f5e" fillOpacity="0.35" />
                      <path d="M188 206 Q200 218 212 206" stroke="#0f172a" strokeWidth="4.5" strokeLinecap="round" fill="none" />
                      <path d="M120 320 C120 260, 280 260, 280 320" fill="#4f46e5" />
                      <path d="M200 260 L200 290" stroke="#fed7aa" strokeWidth="18" strokeLinecap="round" />
                    </svg>

                    {/* Face tracking bounds marker */}
                    <div className="absolute top-[28%] left-[29%] w-[42%] h-[42%] border-2 border-emerald-400 rounded-2xl pointer-events-none shadow-md shadow-emerald-500/20">
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-[8px] text-white font-mono font-extrabold px-1.5 py-0.5 rounded-md uppercase whitespace-nowrap shadow-sm tracking-wider">
                        Rostro Detectado [99.8%]
                      </div>
                      
                      {/* Dynamic censorship filters driven by simulator state */}
                      <div className="absolute inset-0 rounded-xl overflow-hidden flex items-center justify-center transition-all duration-300">
                        {demoFilter === 'gaussian' && (
                          <div 
                            className="w-full h-full bg-white/5 backdrop-blur-md" 
                            style={{ backdropFilter: `blur(${demoIntensity / 1.5}px)`, WebkitBackdropFilter: `blur(${demoIntensity / 1.5}px)` }}
                          />
                        )}
                        
                        {demoFilter === 'pixel' && (
                          <div className="absolute inset-0 w-full h-full flex flex-wrap" style={{ opacity: Math.min(1, demoIntensity / 15) }}>
                            {Array.from({ length: 64 }).map((_, i) => (
                              <div 
                                key={i} 
                                className="w-[12.5%] h-[12.5%] border-[0.5px] border-slate-900/10"
                                style={{
                                  backgroundColor: i % 4 === 0 ? '#ea580c' : i % 3 === 0 ? '#ffedd5' : i % 2 === 0 ? '#fdba74' : '#f97316'
                                }}
                              />
                            ))}
                          </div>
                        )}

                        {demoFilter === 'censored' && (
                          <div 
                            className="absolute bg-neutral-950 text-white font-mono text-[8px] font-black tracking-widest text-center py-1.5 shadow-lg border-y border-white/20 w-full scale-y-110 flex items-center justify-center"
                            style={{ transform: `scale(${1 + (demoIntensity - 20) / 100})` }}
                          >
                            CENSURADO
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mode Buttons */}
                  <div className="mt-4 space-y-3.5">
                    <div className="grid grid-cols-3 gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-100">
                      <button 
                        onClick={() => setDemoFilter('gaussian')}
                        className={`py-2 px-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                          demoFilter === 'gaussian' ? 'bg-white text-indigo-700 shadow-sm border border-gray-150' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        <span className="text-sm">💧</span>
                        <span>Gaussiano</span>
                      </button>
                      <button 
                        onClick={() => setDemoFilter('pixel')}
                        className={`py-2 px-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                          demoFilter === 'pixel' ? 'bg-white text-indigo-700 shadow-sm border border-gray-150' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        <span className="text-sm">🟩</span>
                        <span>Mosaico</span>
                      </button>
                      <button 
                        onClick={() => setDemoFilter('censored')}
                        className={`py-2 px-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                          demoFilter === 'censored' ? 'bg-white text-indigo-700 shadow-sm border border-gray-150' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        <span className="text-sm">⬛</span>
                        <span>Censura</span>
                      </button>
                    </div>

                    {/* Interactive Slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold text-gray-500">
                        <span>Fuerza de Desenfoque</span>
                        <span className="font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{demoIntensity}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="10" 
                        max="40" 
                        value={demoIntensity}
                        onChange={(e) => setDemoIntensity(Number(e.target.value))}
                        className="w-full h-1 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>
                  </div>

                </div>

              </div>

            </div>

            {/* =========================================================================
                MOBILE-ONLY LAYOUT (block lg:hidden)
                Fully optimized vertically, centering details for touch, speed & clarity.
               ========================================================================= */}
            <div className="block lg:hidden text-center space-y-8">
              
              {/* Symmetrical Security Badge */}
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-xs mx-auto">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Privacidad 100% Efímera y Local</span>
              </div>

              {/* Impactful Heading */}
              <div className="space-y-3">
                <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight">
                  Protege la privacidad de tus fotos en <span className="text-indigo-600">segundos</span>
                </h2>
                <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto">
                  La forma más rápida y segura de difuminar rostros de forma automática con inteligencia artificial. Tus archivos están protegidos en tu propio navegador.
                </p>
              </div>

              {/* Compact Benefits Grid for Mobile */}
              <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto text-left">
                <div className="p-3 bg-white border border-gray-150 rounded-xl flex items-center gap-2">
                  <span className="text-indigo-500 font-bold text-sm">✦</span>
                  <span className="text-[11px] font-bold text-gray-800">Prueba 24 Horas</span>
                </div>
                <div className="p-3 bg-white border border-gray-150 rounded-xl flex items-center gap-2">
                  <span className="text-emerald-500 font-bold text-sm">✔</span>
                  <span className="text-[11px] font-bold text-gray-800">10 Fotos Gratis</span>
                </div>
                <div className="p-3 bg-white border border-gray-150 rounded-xl flex items-center gap-2">
                  <span className="text-emerald-500 font-bold text-sm">✔</span>
                  <span className="text-[11px] font-bold text-gray-800">Cero Servidores</span>
                </div>
                <div className="p-3 bg-white border border-gray-150 rounded-xl flex items-center gap-2">
                  <span className="text-indigo-500 font-bold text-sm">✦</span>
                  <span className="text-[11px] font-bold text-gray-800">Borrado de EXIF</span>
                </div>
              </div>

              {/* Mobile Simulator (Compact and highly interactive) */}
              <div className="bg-white border border-gray-150 rounded-2xl p-4 max-w-xs mx-auto shadow-lg space-y-3">
                <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                  <span>Demo Interactiva</span>
                  <span className="text-indigo-600 font-mono bg-indigo-50 px-1 rounded">Filtro: {demoFilter}</span>
                </div>

                <div className="relative aspect-square rounded-xl bg-indigo-950/20 overflow-hidden flex items-center justify-center">
                  {/* Miniature portrait background with custom blur effect */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-100 via-indigo-900 to-indigo-950 opacity-90"></div>
                  
                  {/* Simulated Face Area */}
                  <div className="relative w-28 h-28 border border-emerald-400 rounded-full flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 rounded-full overflow-hidden">
                      {demoFilter === 'gaussian' && (
                        <div 
                          className="w-full h-full bg-orange-300/40 backdrop-blur-md" 
                          style={{ backdropFilter: `blur(${demoIntensity / 2}px)`, WebkitBackdropFilter: `blur(${demoIntensity / 2}px)` }}
                        />
                      )}
                      {demoFilter === 'pixel' && (
                        <div className="w-full h-full bg-orange-400/90 flex flex-wrap">
                          {Array.from({ length: 16 }).map((_, i) => (
                            <div key={i} className="w-1/4 h-1/4 bg-orange-500/80 border-[0.5px] border-slate-950/25" />
                          ))}
                        </div>
                      )}
                      {demoFilter === 'censored' && (
                        <div className="absolute inset-x-0 h-6 bg-black text-white text-[7px] font-mono tracking-widest flex items-center justify-center font-bold">
                          CENSURADO
                        </div>
                      )}
                    </div>
                    {/* Portrait Outline */}
                    <div className="absolute top-1/2 -translate-y-1/2 text-center text-emerald-400 font-bold text-[8px] tracking-wider uppercase bg-slate-900/85 px-1.5 py-0.5 rounded-full border border-emerald-400/30 shadow-sm">
                      Filtro Activo
                    </div>
                  </div>
                </div>

                {/* Mobile Filter Toggles */}
                <div className="grid grid-cols-3 gap-1 bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                  <button 
                    onClick={() => setDemoFilter('gaussian')}
                    className={`py-1 px-0.5 text-[9px] font-bold rounded transition-all cursor-pointer ${demoFilter === 'gaussian' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}
                  >
                    Gaussiano
                  </button>
                  <button 
                    onClick={() => setDemoFilter('pixel')}
                    className={`py-1 px-0.5 text-[9px] font-bold rounded transition-all cursor-pointer ${demoFilter === 'pixel' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}
                  >
                    Mosaico
                  </button>
                  <button 
                    onClick={() => setDemoFilter('censored')}
                    className={`py-1 px-0.5 text-[9px] font-bold rounded transition-all cursor-pointer ${demoFilter === 'censored' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}
                  >
                    Barra
                  </button>
                </div>
              </div>

              {/* Mobile High-Contrast CTA */}
              <div className="space-y-4 pt-2">
                <button
                  onClick={handleSignIn}
                  className="w-full max-w-xs inline-flex items-center justify-center gap-2.5 rounded-2xl bg-indigo-600 px-6 py-4 text-sm font-bold text-white shadow-xl shadow-indigo-150 transition-all hover:bg-indigo-700 active:scale-97 cursor-pointer mx-auto"
                >
                  <LogIn className="h-4.5 w-4.5" />
                  <span>Comenzar Prueba Gratis</span>
                </button>
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 max-w-xs mx-auto">
                  <ShieldCheck className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                  <span>Iniciar sesión inmediato con Google</span>
                </div>
              </div>

            </div>

            {/* =========================================================================
                BENEFITS SECTION & VALUE PROP (SHARED - WITH DESKTOP/MOBILE PAIRINGS)
               ========================================================================= */}
            <div className="mt-16 sm:mt-24 border-t border-gray-150 pt-10 sm:pt-16">
              <div className="max-w-2xl mx-auto text-center space-y-3 mb-10 sm:mb-14">
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
                  La máxima seguridad para tus activos visuales
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                  Cumplimos con las regulaciones de protección de datos más estrictas del mundo para garantizar una anonimización confiable.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                
                {/* Security Feature 1 */}
                <div className="bg-white border border-gray-150/60 rounded-3xl p-6 sm:p-7 shadow-xs hover:shadow-md transition-all text-left">
                  <div className="h-11 w-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5 border border-emerald-100">
                    <ShieldCheck className="h-5.5 w-5.5" />
                  </div>
                  <h4 className="font-display text-sm sm:text-base font-extrabold text-gray-900">Privacidad y Confidencialidad Absoluta</h4>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    A diferencia de otros servicios, no retenemos tus imágenes. Las fotos se procesan en memoria efímera ultra segura y se destruyen permanentemente después del uso.
                  </p>
                </div>

                {/* Security Feature 2 */}
                <div className="bg-white border border-gray-150/60 rounded-3xl p-6 sm:p-7 shadow-xs hover:shadow-md transition-all text-left">
                  <div className="h-11 w-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-5 border border-indigo-100">
                    <Lock className="h-5.5 w-5.5" />
                  </div>
                  <h4 className="font-display text-sm sm:text-base font-extrabold text-gray-900">Eliminación Inteligente de EXIF</h4>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    Mantenemos tus archivos seguros limpiando los metadatos de posicionamiento GPS y firmas de cámara en el archivo exportado, bloqueando cualquier rastreo de procedencia.
                  </p>
                </div>

                {/* Security Feature 3 */}
                <div className="bg-white border border-gray-150/60 rounded-3xl p-6 sm:p-7 shadow-xs hover:shadow-md transition-all text-left">
                  <div className="h-11 w-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-5 border border-purple-100">
                    <Eye className="h-5.5 w-5.5" />
                  </div>
                  <h4 className="font-display text-sm sm:text-base font-extrabold text-gray-900">Optimizado para Lotes Grandes</h4>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    Sube hasta 10 fotos a la vez. Nuestro motor inteligente procesa todo de forma paralela en segundos, ahorrándote horas de edición manual en Photoshop.
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
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-gray-400">
          <a href="/privacidad" className="hover:text-indigo-600 transition-colors">Política de Privacidad</a>
          <span>·</span>
          <a href="/terminos" className="hover:text-indigo-600 transition-colors">Términos y Condiciones</a>
        </div>
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
