import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  Sparkles, 
  CreditCard, 
  ShieldCheck, 
  Zap, 
  Loader2, 
  Shield,
  Coins,
  AlertCircle
} from 'lucide-react';
import { UserProfile, SubscriptionPlan } from '../types';
import { auth } from '../firebase';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  onUpgradeSimulated: (plan: SubscriptionPlan) => Promise<void>;
}

export default function BillingModal({
  isOpen,
  onClose,
  profile
}: BillingModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !profile) return;

    const loadPayphoneButton = async () => {
      setPreparing(true);
      setPrepareError(null);
      
      // Clear previous button render
      const container = document.getElementById('pp-button');
      if (container) {
        container.innerHTML = '';
      }

      try {
        const user = auth.currentUser;
        if (!user) {
          throw new Error('Debes iniciar sesión con Google para preparar el pago.');
        }
        
        const idToken = await user.getIdToken();
        const response = await fetch('/api/payphone/prepare', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ planType: selectedPlan })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Error al preparar la transacción de PayPhone.');
        }

        // Render the official PayPhone Payment Button Box (Cajita de Pagos v2).
        // The v2 box exposes the global `PPaymentButtonBox` (NOT `window.payphone`),
        // render() takes the element id WITHOUT the '#' prefix, and it confirms the
        // payment via a REDIRECT to the configured "Url de respuesta" — not a JS
        // callback. The redirect is handled on app load in App.tsx.
        if ((window as any).PPaymentButtonBox) {
          new (window as any).PPaymentButtonBox({
            token: data.token,
            clientTransactionId: data.clientTransactionId,
            amount: data.amount,
            amountWithoutTax: data.amountWithoutTax,
            amountWithTax: 0,
            tax: 0,
            service: 0,
            tip: 0,
            currency: "USD",
            storeId: data.storeId,
            reference: data.reference,
            lang: "es"
          }).render('pp-button');
        } else {
          setPrepareError('El SDK del portal de PayPhone no se cargó correctamente en el navegador.');
        }
      } catch (err: any) {
        console.error("Payphone Prepare Error:", err);
        setPrepareError(err.message || 'Error de red o comunicación al iniciar la transacción.');
      } finally {
        setPreparing(false);
      }
    };

    // Use a small timeout to let the modal mount and the pp-button container render in the DOM
    const timer = setTimeout(() => {
      loadPayphoneButton();
    }, 150);

    return () => clearTimeout(timer);
    // Only re-prepare/re-render the PayPhone box when the modal opens or the plan
    // changes. `profile` and `onClose` are intentionally excluded: the parent
    // re-renders every second (trial countdown timer), which would otherwise
    // re-run this effect, wipe #pp-button and re-mount the box every tick
    // (visible flicker) while spamming /api/payphone/prepare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedPlan]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto my-auto animate-fadeIn text-left">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all active:scale-95 cursor-pointer z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3.5 py-1.5 text-[11px] font-extrabold text-blue-700 mb-3 border border-blue-100/50">
            <span className="text-sm">🇪🇨</span>
            <span>Pasarela de Pago Segura PayPhone Ecuador</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Evite Sanciones y Proteja su Negocio
          </h2>
          <p className="mt-2 text-slate-500 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed font-medium">
            Desbloquee el procesamiento profesional ilimitado en lote con IA. Ideal para inmobiliarias, agencias de marketing, fotógrafos y empresas comprometidas con las normativas LOPD & GDPR.
          </p>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto mb-8">
          
          {/* 1. PLAN DIARIO */}
          <button
            onClick={() => setSelectedPlan('daily')}
            className={`text-left relative rounded-xl border p-5 transition-all cursor-pointer flex flex-col justify-between ${
              selectedPlan === 'daily'
                ? 'border-slate-900 bg-slate-50/50 ring-1 ring-slate-900/5 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
            }`}
          >
            <div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Pase 24 Horas</span>
                {selectedPlan === 'daily' && <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span>}
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed">Ideal para proyectos rápidos o entregas inmediatas de un solo día.</p>
              <div className="mt-4 flex items-baseline text-slate-900">
                <span className="text-3xl font-extrabold tracking-tight">$1.99</span>
                <span className="ml-1.5 text-[11px] font-bold text-slate-400">/ de un solo pago</span>
              </div>
              <ul className="mt-5 space-y-2 text-[11px] text-slate-600 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Hasta 50 imágenes en lote</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Sin marcas de agua</span>
                </li>
              </ul>
            </div>
          </button>

          {/* 2. PLAN SEMANAL */}
          <button
            onClick={() => setSelectedPlan('weekly')}
            className={`text-left relative rounded-xl border p-5 transition-all cursor-pointer flex flex-col justify-between ${
              selectedPlan === 'weekly'
                ? 'border-slate-900 bg-slate-50/50 ring-1 ring-slate-900/5 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
            }`}
          >
            <div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Pase 7 Días</span>
                {selectedPlan === 'weekly' && <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span>}
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed">Perfecto para editores de contenido y fotógrafos semanales.</p>
              <div className="mt-4 flex items-baseline text-slate-900">
                <span className="text-3xl font-extrabold tracking-tight">$4.99</span>
                <span className="ml-1.5 text-[11px] font-bold text-slate-400">/ de un solo pago</span>
              </div>
              <ul className="mt-5 space-y-2 text-[11px] text-slate-600 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Hasta 500 imágenes en lote</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Sin marcas de agua</span>
                </li>
              </ul>
            </div>
          </button>

          {/* 3. PLAN MENSUAL (MEJOR VALOR) */}
          <button
            onClick={() => setSelectedPlan('monthly')}
            className={`text-left relative rounded-xl border p-5 transition-all cursor-pointer flex flex-col justify-between ${
              selectedPlan === 'monthly'
                ? 'border-slate-900 bg-slate-50/70 ring-1 ring-slate-900/5 shadow-xs'
                : 'border-slate-300 bg-white hover:border-slate-400 shadow-xs'
            }`}
          >
            <div className="absolute top-0 right-4 -translate-y-1/2 rounded-full bg-slate-900 px-2.5 py-0.5 text-[9px] font-extrabold text-white uppercase tracking-wider">
              Mejor Valor
            </div>
            <div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-extrabold text-slate-900 uppercase tracking-widest">Pase 30 Días</span>
                {selectedPlan === 'monthly' && <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span>}
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed">Para empresas, agencias de publicidad y uso recurrente profesional.</p>
              <div className="mt-4 flex items-baseline text-slate-900">
                <span className="text-3xl font-extrabold tracking-tight">$12.99</span>
                <span className="ml-1.5 text-[11px] font-bold text-slate-400">/ de un solo pago</span>
              </div>
              <ul className="mt-5 space-y-2 text-[11px] text-slate-600 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Hasta 2000 imágenes en lote</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Soporte prioritario 24/7</span>
                </li>
              </ul>
            </div>
          </button>

        </div>

        {/* Interactive Payment Checkout Box */}
        <div className="border border-slate-150 rounded-xl bg-slate-50/50 p-5 sm:p-6 max-w-xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3.5 mb-4 text-left">
            <div>
              <h4 className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Plan Seleccionado</h4>
              <p className="text-sm font-extrabold text-slate-800 mt-0.5">
                {selectedPlan === 'daily' ? 'Pase Diario - 24 Horas de Acceso ($1.99)' : selectedPlan === 'weekly' ? 'Pase Semanal - 7 Días de Acceso ($4.99)' : 'Pase Mensual - 30 Días de Acceso ($12.99)'}
              </p>
            </div>
            <div className="mt-2 sm:mt-0">
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full text-slate-700 bg-slate-200/60 border border-slate-300/30">
                <Coins className="h-3.5 w-3.5 text-slate-500" />
                <span>USD</span>
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 text-left mb-5 leading-relaxed font-semibold">
            Protección de datos garantizada. Ingrese su tarjeta Visa, Mastercard o liquide usando su saldo PayPhone. La transacción cuenta con encriptación SSL de nivel bancario.
          </p>

          {/* Payphone Embed Container */}
          <div className="flex flex-col items-center justify-center min-h-[70px] relative">
            {preparing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/70 z-10 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-slate-900" />
                <span className="text-[11px] text-slate-500 font-extrabold">Generando enlace seguro con PayPhone...</span>
              </div>
            )}

            {prepareError && (
              <div className="w-full text-left bg-red-50 border border-red-100/50 rounded-xl p-3.5 mb-4 flex items-start gap-2.5 animate-fadeIn">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-[11px] font-semibold text-red-700 leading-relaxed">{prepareError}</p>
              </div>
            )}

            {/* The main Div where the PayPhone widget mounts */}
            <div id="pp-button" className="w-full max-w-xs transition-all duration-300"></div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-bold">
            <Shield className="h-3.5 w-3.5 text-emerald-500" />
            <span>Encriptación de datos segura SSL de 256 bits.</span>
          </div>
        </div>

      </div>
    </div>
  );
}
