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
  AlertTriangle,
  ChevronsLeftRight
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

// Stylized street-photo scene for the hero comparison slider. Rendered twice:
// original (sharp faces) and protected (blurred faces + AI detection boxes).
function DemoScene({ protectedMode }: { protectedMode?: boolean }) {
  const fid = protectedMode ? 'hero-face-blur' : 'hero-face-none';
  const people = [
    { x: 190, y: 235, s: 1.0, skin: '#f5c9a4', hair: '#2f2118', shirt: '#334155' },
    { x: 400, y: 210, s: 1.18, skin: '#d99e70', hair: '#151210', shirt: '#0e7490' },
    { x: 610, y: 245, s: 0.94, skin: '#f0b98d', hair: '#3e2c20', shirt: '#7c2d12' },
  ];
  return (
    <svg viewBox="0 0 800 450" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${fid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfdbfe" />
          <stop offset="0.65" stopColor="#e2e8f0" />
          <stop offset="1" stopColor="#cbd5e1" />
        </linearGradient>
        <filter id={`${fid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={protectedMode ? 9 : 0} />
        </filter>
      </defs>
      {/* Background */}
      <rect width="800" height="450" fill={`url(#${fid}-sky)`} />
      <rect y="330" width="800" height="120" fill="#94a3b8" opacity="0.5" />
      {/* Distant buildings */}
      <rect x="40" y="120" width="90" height="215" rx="4" fill="#64748b" opacity="0.35" />
      <rect x="150" y="80" width="70" height="255" rx="4" fill="#64748b" opacity="0.25" />
      <rect x="640" y="100" width="110" height="235" rx="4" fill="#64748b" opacity="0.3" />
      {people.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) scale(${p.s})`}>
          {/* Body */}
          <path d="M-62 200 C-62 92 62 92 62 200 Z" fill={p.shirt} />
          <rect x="-10" y="62" width="20" height="26" fill={p.skin} />
          {/* Head (blurred in protected mode) */}
          <g filter={`url(#${fid}-blur)`}>
            <circle cx="0" cy="18" r="46" fill={p.skin} />
            <path d="M-46 12 C-46 -52 46 -52 46 12 C46 20 48 28 48 32 C20 4 -20 4 -48 32 C-48 28 -46 20 -46 12 Z" fill={p.hair} />
            {!protectedMode && (
              <>
                <circle cx="-16" cy="16" r="4.5" fill="#1e293b" />
                <circle cx="16" cy="16" r="4.5" fill="#1e293b" />
                <path d="M-10 38 Q0 46 10 38" stroke="#1e293b" strokeWidth="3.5" strokeLinecap="round" fill="none" />
              </>
            )}
          </g>
          {/* AI detection box in protected mode */}
          {protectedMode && (
            <>
              <rect x="-52" y="-38" width="104" height="112" rx="10" fill="none" stroke="#3b82f6" strokeWidth="3" />
              <rect x="-52" y="-58" width="66" height="17" rx="4" fill="#2563eb" />
              <text x="-45" y="-45.5" fill="#ffffff" fontSize="11" fontFamily="monospace" fontWeight="bold">BLUR OK</text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<ProcessingTask[]>([]);
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [isProcessingAny, setIsProcessingAny] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [revealPos, setRevealPos] = useState(55);

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
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 px-6 py-8 sm:px-10 sm:py-10 shadow-xl">
              <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-blue-500/10 blur-2xl" />
              <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-slate-800/20 blur-2xl" />
              <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                <div className="max-w-xl text-left">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-[10px] font-bold text-blue-400 border border-blue-500/20 mb-4">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Motor de Anonimización IA Activo</span>
                  </div>
                  <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-none">
                    Espacio de Trabajo
                  </h2>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Sube imágenes en lote, elige el estilo de censura profesional y descarga tus archivos limpios de rostros y metadatos EXIF en segundos.
                  </p>
                </div>

                {/* Plan + usage cards */}
                <div className="flex flex-col sm:flex-row gap-3 shrink-0 text-left">
                  <div className="rounded-xl bg-slate-800/80 backdrop-blur-sm border border-slate-700/60 px-4 py-3 min-w-[150px]">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Tu Plan</p>
                    <p className="text-sm font-extrabold text-white mt-1 flex items-center gap-1.5">
                      {isAdmin ? 'Creador' : getPlanDisplayName(profile.subscriptionPlan)}
                      {isPremium && <Zap className="h-4 w-4 text-amber-300 fill-amber-300 shrink-0" />}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-800/80 backdrop-blur-sm border border-slate-700/60 px-4 py-3 min-w-[170px]">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Uso de Imágenes</p>
                    <p className="text-sm font-extrabold text-white mt-1">
                      {profile.imagesProcessedCount}
                      {isUnlimited
                        ? <span className="text-slate-400 text-xs font-semibold"> · Ilimitado</span>
                        : <span className="text-slate-400 text-xs font-semibold"> / {imageLimit}</span>}
                    </p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-750 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
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
                isPremium={isPremium}
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
                HERO — single viewport, product-demo centered (dark navy, blue only)
               ========================================================================= */}
            <section className="relative flex flex-col justify-center overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-10 sm:px-10 sm:py-12 lg:min-h-[calc(100dvh-11.5rem)]">
              {/* Ambient premium glow */}
              <div className="pointer-events-none absolute -top-40 left-1/2 h-[26rem] w-[46rem] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-48 -right-24 h-96 w-96 rounded-full bg-blue-600/5 blur-3xl" />

              <div className="relative mx-auto w-full max-w-4xl text-left px-4">
                {/* Status compliance pill */}
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] font-extrabold text-slate-300 backdrop-blur-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                  </span>
                  <span>PROCESAMIENTO LOCAL EFÍMERO · 100% CONFIDENCIAL</span>
                </div>

                <h2 className="mt-6 max-w-3xl font-display text-4xl sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1] font-extrabold tracking-tight text-white">
                  Evite demandas.
                  <br />
                  La IA protege <span className="text-blue-500">la privacidad</span> de sus clientes.
                </h2>

                <p className="mt-4 max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-400 font-medium">
                  Detecte y difumine rostros de forma masiva en segundos. Cumpla con la Ley Orgánica de Protección de Datos Personales (LOPDP) en el Ecuador y evite severas multas por difusión no autorizada. Sus fotos nunca se almacenan en la nube.
                </p>

                {/* CTAs */}
                <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <button
                    onClick={handleSignIn}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-xs font-extrabold text-white shadow-lg shadow-blue-500/10 transition-all hover:bg-blue-500 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer text-center"
                  >
                    <LogIn className="h-4.5 w-4.5" />
                    <span>Iniciar ahora gratis con Google</span>
                  </button>
                  <span className="inline-flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500">
                    <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                    10 fotos gratis de prueba · Sin tarjeta
                  </span>
                </div>

                {/* Before / After comparison slider — the product, live */}
                <div className="relative mx-auto mt-12 w-full max-w-3xl select-none">
                  <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
                    {/* Original layer */}
                    <DemoScene />
                    {/* Protected layer, revealed right of the divider */}
                    <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${revealPos}%)` }}>
                      <DemoScene protectedMode />
                    </div>

                    {/* Corner labels */}
                    <span className="absolute left-3 top-3 rounded-md bg-slate-950/80 px-2.5 py-1 font-mono text-[9px] font-extrabold uppercase tracking-wider text-slate-300 backdrop-blur-xs">
                      Foto Original
                    </span>
                    <span className="absolute right-3 top-3 rounded-md bg-blue-600/90 px-2.5 py-1 font-mono text-[9px] font-extrabold uppercase tracking-wider text-white backdrop-blur-xs">
                      Difuminado IA (AutoBlur)
                    </span>

                    {/* Divider + handle */}
                    <div
                      className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-white shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                      style={{ left: `calc(${revealPos}% - 1px)` }}
                    >
                      <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-900 shadow-xl border border-slate-200">
                        <ChevronsLeftRight className="h-4.5 w-4.5 text-slate-600" />
                      </span>
                    </div>

                    {/* Invisible range control on top */}
                    <input
                      type="range"
                      min={4}
                      max={96}
                      value={revealPos}
                      onChange={(e) => setRevealPos(Number(e.target.value))}
                      aria-label="Comparar original y protegido"
                      className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
                    />
                  </div>
                  <p className="mt-3.5 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-center">
                    Arrastre el control para evaluar la precisión del algoritmo de AutoBlur
                  </p>
                </div>

                {/* Stats strip */}
                <div className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-y-4 gap-x-8 sm:gap-x-10">
                  <div className="text-center">
                    <p className="font-display text-lg sm:text-xl font-extrabold tabular-nums text-white">99.8%</p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Eficacia de Detección</p>
                  </div>
                  <div className="h-6 w-px bg-slate-800" />
                  <div className="text-center">
                    <p className="font-display text-lg sm:text-xl font-extrabold tabular-nums text-white">~3 Segundos</p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Por Procesamiento</p>
                  </div>
                  <div className="h-6 w-px bg-slate-800" />
                  <div className="text-center">
                    <p className="font-display text-lg sm:text-xl font-extrabold text-white">GDPR · LOPD</p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cumplimiento Legal</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-16 sm:mt-24 border-t border-slate-200/60 pt-12 text-left">
              <div className="max-w-2xl text-left space-y-3 mb-12">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">Tranquilidad Corporativa</span>
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-800 leading-tight">
                  Proteja a su empresa de sanciones costosas
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed font-medium">
                  En el Ecuador, la Ley Orgánica de Protección de Datos Personales impone multas severas de hasta el 1% de la facturación anual por difundir imágenes con rostros reconocibles sin autorización. AutoBlur le ofrece un blindaje legal inmediato.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                
                {/* Benefit 1 */}
                <div className="bg-white border border-slate-200/80 rounded-xl p-6 sm:p-7 shadow-xs hover:border-slate-300 transition-all text-left">
                  <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 border border-blue-100/50 shadow-xs">
                    <ShieldCheck className="h-5.5 w-5.5" />
                  </div>
                  <h4 className="font-display text-sm sm:text-base font-extrabold text-slate-800">Conformidad Legal LOPDP & GDPR</h4>
                  <p className="text-xs text-slate-500 mt-2.5 leading-relaxed font-medium">
                    Evite querellas y demandas de privacidad. Anonimice el rostro de peatones, clientes, pacientes o niños antes de publicar fotos en portales web, redes sociales o folletos.
                  </p>
                </div>
 
                {/* Benefit 2 */}
                <div className="bg-white border border-slate-200/80 rounded-xl p-6 sm:p-7 shadow-xs hover:border-slate-300 transition-all text-left">
                  <div className="h-11 w-11 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center mb-5 border border-slate-200/50 shadow-xs">
                    <Lock className="h-5.5 w-5.5" />
                  </div>
                  <h4 className="font-display text-sm sm:text-base font-extrabold text-slate-800">Limpieza de Metadatos EXIF</h4>
                  <p className="text-xs text-slate-500 mt-2.5 leading-relaxed font-medium">
                    AutoBlur no solo difumina rostros, sino que remueve la información técnica oculta como ubicaciones GPS y modelos de cámara de los archivos exportados, bloqueando cualquier rastreo no deseado.
                  </p>
                </div>
 
                {/* Benefit 3 */}
                <div className="bg-white border border-slate-200/80 rounded-xl p-6 sm:p-7 shadow-xs hover:border-slate-300 transition-all text-left">
                  <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 border border-blue-100/50 shadow-xs">
                    <Sparkles className="h-5.5 w-5.5" />
                  </div>
                  <h4 className="font-display text-sm sm:text-base font-extrabold text-slate-800">Procesamiento por Lotes Grandes</h4>
                  <p className="text-xs text-slate-500 mt-2.5 leading-relaxed font-medium">
                    Sube y procesa hasta 50 imágenes de forma simultánea. El motor de IA trabaja en paralelo en tu navegador en tiempo récord para que ahorres interminables horas de edición manual.
                  </p>
                </div>
 
              </div>
            </div>
 
            {/* =========================================================================
                HOW IT WORKS
               ========================================================================= */}
            <div className="mt-16 sm:mt-24 border-t border-slate-200/60 pt-12 text-left">
              <div className="max-w-2xl text-left space-y-3 mb-12">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">Proceso Sencillo</span>
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-800 leading-tight">
                  Tres pasos rápidos. Cero fricción.
                </h3>
              </div>
 
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                {[
                  { n: '01', icon: Upload, title: 'Cargue su material', desc: 'Sube una o varias imágenes de forma simultánea. Soporta PNG, JPG, WEBP y formatos modernos de celular como HEIC.' },
                  { n: '02', icon: Sparkles, title: 'La Inteligencia Artificial opera', desc: 'El algoritmo de visión artificial rastrea, encuadra y localiza automáticamente los ojos y rostros de manera milimétrica.' },
                  { n: '03', icon: ShieldCheck, title: 'Descargue de forma segura', desc: 'Seleccione su estilo (difuminado clásico, mosaico retro o barra de censura) y exporte sus imágenes con metadatos limpios.' },
                ].map((step) => (
                  <div key={step.n} className="relative bg-white border border-slate-250 rounded-xl p-6 sm:p-7 shadow-xs hover:border-slate-350 transition-all text-left overflow-hidden">
                    <span className="absolute top-2 right-4 font-display text-5xl font-extrabold text-slate-100 select-none">{step.n}</span>
                    <div className="relative h-11 w-11 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-5 shadow-md shadow-slate-200">
                      <step.icon className="h-5 w-5 text-blue-400" />
                    </div>
                    <h4 className="relative font-display text-sm sm:text-base font-extrabold text-slate-800">{step.title}</h4>
                    <p className="relative text-xs text-slate-500 mt-2.5 leading-relaxed font-medium">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
 
            {/* =========================================================================
                PRICING (PAY-AS-YOU-GO IN ECUADOR)
               ========================================================================= */}
            <div className="mt-16 sm:mt-24 border-t border-slate-200/60 pt-12 text-left">
              <div className="max-w-2xl text-left space-y-3 mb-12">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">Pases Flexibles</span>
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-800 leading-tight">
                  Planes de pago único sin cargos recurrentes
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed font-medium">
                  Comience gratis con 10 fotos. Desbloquee accesos temporales para procesar en lote sin cuotas mensuales molestas. Liquidación segura vía PayPhone Ecuador.
                </p>
              </div>
 
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                {[
                  { name: 'Diario', price: '$1.99', unit: '/ de un solo pago', imgs: 'Hasta 50 imágenes', desc: 'Pase de 24 horas. Excelente para profesionales independientes.', featured: false },
                  { name: 'Mensual', price: '$12.99', unit: '/ de un solo pago', imgs: 'Hasta 2000 imágenes', desc: 'Pase de 30 días. Para inmobiliarias y agencias con volumen recurrente.', featured: true },
                  { name: 'Semanal', price: '$4.99', unit: '/ de un solo pago', imgs: 'Hasta 500 imágenes', desc: 'Pase de 7 días. Ideal para campañas o proyectos medianos.', featured: false },
                ].map((p) => (
                  <div
                    key={p.name}
                    className={`relative rounded-xl p-6 sm:p-7 flex flex-col justify-between transition-all ${
                      p.featured
                        ? 'bg-slate-900 text-white shadow-xl md:-translate-y-3.5 md:order-2 border border-slate-800'
                        : 'bg-white border border-slate-250 shadow-xs hover:border-slate-350 md:order-1 last:md:order-3'
                    }`}
                  >
                    {p.featured && (
                      <span className="absolute top-0 right-6 -translate-y-1/2 rounded-full bg-blue-600 px-3 py-0.5 text-[9px] font-extrabold text-white uppercase tracking-wider">
                        Recomendado
                      </span>
                    )}
                    <div>
                      <h4 className={`text-[10px] font-extrabold uppercase tracking-widest ${p.featured ? 'text-blue-400' : 'text-blue-600'}`}>Pase {p.name}</h4>
                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="font-display text-4xl font-extrabold tracking-tight">{p.price}</span>
                        <span className={`text-[11px] font-bold ${p.featured ? 'text-slate-400' : 'text-slate-400'}`}>{p.unit}</span>
                      </div>
                      <p className={`mt-2.5 text-xs font-semibold ${p.featured ? 'text-slate-300' : 'text-slate-600'}`}>
                        {p.desc}
                      </p>
                      
                      <div className="mt-6 h-px bg-slate-200/20"></div>

                      <div className={`mt-5 flex items-center gap-2 text-xs font-extrabold ${p.featured ? 'text-white' : 'text-slate-800'}`}>
                        <CheckCircle className={`h-4 w-4 shrink-0 ${p.featured ? 'text-blue-400' : 'text-emerald-500'}`} />
                        <span>{p.imgs}</span>
                      </div>
                      <ul className={`mt-3.5 space-y-2.5 text-[11px] font-medium ${p.featured ? 'text-slate-400' : 'text-slate-500'}`}>
                        <li className="flex items-center gap-2">
                          <CheckCircle className={`h-3.5 w-3.5 shrink-0 ${p.featured ? 'text-blue-400' : 'text-emerald-500'}`} />
                          <span>Sin marcas de agua</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className={`h-3.5 w-3.5 shrink-0 ${p.featured ? 'text-blue-400' : 'text-emerald-500'}`} />
                          <span>Soporta HEIC, TIFF, BMP y más</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className={`h-3.5 w-3.5 shrink-0 ${p.featured ? 'text-blue-400' : 'text-emerald-500'}`} />
                          <span>Procesamiento 100% en la RAM del navegador</span>
                        </li>
                      </ul>
                    </div>

                    <button
                      onClick={handleSignIn}
                      className={`mt-8 w-full rounded-xl py-3 text-xs font-extrabold transition-all active:scale-97 cursor-pointer text-center ${
                        p.featured
                          ? 'bg-white text-slate-950 hover:bg-slate-50 shadow-sm'
                          : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
                      }`}
                    >
                      Comenzar ahora
                    </button>
                  </div>
                ))}
              </div>
            </div>
 
            {/* =========================================================================
                FINAL PERSUASIVE CALL-TO-ACTION
               ========================================================================= */}
            <div className="mt-16 sm:mt-24 text-left">
              <div className="relative overflow-hidden rounded-2xl bg-blue-600 px-6 py-12 sm:px-12 sm:py-16 text-center shadow-2xl">
                <div className="absolute -top-20 -right-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl" />
                <div className="relative max-w-2xl mx-auto">
                  <h3 className="font-display text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                    ¿Listo para proteger la reputación de su negocio?
                  </h3>
                  <p className="mt-3 text-xs sm:text-sm text-blue-100 font-medium">
                    Evite sanciones legales y cumpla con las leyes de protección de datos hoy mismo de forma automatizada y confidencial.
                  </p>
                  <button
                    onClick={handleSignIn}
                    className="mt-8 inline-flex items-center justify-center gap-2.5 rounded-xl bg-white px-7 py-3.5 text-xs font-extrabold text-slate-900 shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                  >
                    <LogIn className="h-5 w-5" />
                    <span>Empezar con su cuenta de Google</span>
                  </button>
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
          <a href="/privacidad" className="hover:text-blue-600 transition-colors">Política de Privacidad</a>
          <span>·</span>
          <a href="/terminos" className="hover:text-blue-600 transition-colors">Términos y Condiciones</a>
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
