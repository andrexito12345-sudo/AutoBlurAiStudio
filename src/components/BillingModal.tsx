import React, { useState } from 'react';
import { X, Check, Sparkles, CreditCard, ShieldCheck, Zap, Loader2 } from 'lucide-react';
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
  profile,
  onUpgradeSimulated
}: BillingModalProps) {
  const [loadingPlan, setLoadingPlan] = useState<'monthly' | 'annual' | 'lifetime' | null>(null);
  const [simulationSuccess, setSimulationSuccess] = useState<SubscriptionPlan | null>(null);

  if (!isOpen) return null;

  const handleSubscribe = async (planType: 'monthly' | 'annual' | 'lifetime') => {
    if (!profile) return;
    setLoadingPlan(planType);
    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          planType: planType
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        if (data.simulated) {
          // Stripe is not configured. Let's simulate a successful upgrade!
          const targetPlan: SubscriptionPlan = planType === 'lifetime' ? 'lifetime' : 'premium';
          await onUpgradeSimulated(targetPlan);
          setSimulationSuccess(targetPlan);
          setTimeout(() => {
            setSimulationSuccess(null);
            onClose();
          }, 3500);
        } else if (data.url) {
          // Stripe checkout session created, redirect to checkout
          window.location.href = data.url;
        }
      } else {
        alert(data.error || 'Error al iniciar la sesión de pago.');
      }
    } catch (err: any) {
      console.error(err);
      alert('Ocurrió un error al contactar al servidor.');
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleDowngradeSimulated = async () => {
    if (!profile) return;
    setLoadingPlan('monthly');
    try {
      await onUpgradeSimulated('basic');
      alert('Has cambiado al Plan Básico.');
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error al actualizar plan.');
    } finally {
      setLoadingPlan(null);
    }
  };

  const activePlan = profile?.subscriptionPlan || 'free';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="relative w-full max-w-6xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all active:scale-95 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {simulationSuccess ? (
          <div className="flex flex-col items-center justify-center py-12 text-center animate-fadeIn">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-6 animate-bounce">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h3 className="font-display text-2xl font-bold text-gray-900 mb-2">
              ¡Plan Activado con Éxito!
            </h3>
            <p className="text-gray-600 max-w-md">
              Como no hay un API Key de Stripe configurado, hemos activado tu
              <span className="font-semibold text-indigo-600"> Plan {simulationSuccess === 'lifetime' ? 'De Por Vida' : 'Premium Pro'}</span> en modo de simulación.
              ¡Disfruta de procesamiento ilimitado de rostros con IA!
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 mb-4">
                <Sparkles className="h-3.5 w-3.5 text-indigo-500 animate-pulse" />
                <span>Nuestros Planes de Precios</span>
              </div>
              <h2 className="font-display text-3xl font-extrabold text-gray-900 tracking-tight">
                Elige el plan ideal para tu privacidad
              </h2>
              <p className="mt-2 text-gray-500 text-sm sm:text-base max-w-lg mx-auto">
                Desbloquea procesamiento masivo ilimitado con IA, calidad HD y diferentes estilos avanzados de censura.
              </p>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
              
              {/* 1. PLAN BÁSICO ($0) */}
              <div className={`relative rounded-2xl border p-6 flex flex-col justify-between transition-all ${
                activePlan === 'free' || activePlan === 'basic' || activePlan === 'trial'
                  ? 'border-indigo-600 bg-indigo-50/20'
                  : 'border-gray-200 bg-gray-50/30 hover:border-gray-300'
              }`}>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Plan Básico</h3>
                  <p className="text-xs text-gray-500 mt-1">Perfecto para pruebas rápidas y uso ocasional.</p>
                  
                  <div className="mt-4 flex items-baseline text-gray-900">
                    <span className="text-4xl font-extrabold tracking-tight">$0</span>
                    <span className="ml-1 text-sm font-semibold text-gray-500">/ siempre</span>
                  </div>

                  <ul className="mt-6 space-y-3.5">
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Máximo 10 imágenes procesadas en total</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Subida de imágenes de hasta 10MB</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Estilos de censura estándar</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-8">
                  {activePlan === 'free' || activePlan === 'basic' || activePlan === 'trial' ? (
                    <button
                      disabled
                      className="w-full rounded-xl border border-indigo-200 py-2.5 text-center text-xs font-semibold text-indigo-600 bg-indigo-50/50 cursor-not-allowed"
                    >
                      Tu Plan Actual
                    </button>
                  ) : (
                    <button
                      onClick={handleDowngradeSimulated}
                      className="w-full rounded-xl border border-gray-300 py-2.5 text-center text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 transition-all active:scale-95 cursor-pointer"
                    >
                      Volver al Plan Básico
                    </button>
                  )}
                </div>
              </div>

              {/* 2. PLAN PREMIUM PRO ($9.99/MES) */}
              <div className={`relative rounded-2xl border p-6 flex flex-col justify-between transition-all ${
                activePlan === 'premium'
                  ? 'border-indigo-600 bg-indigo-50/20 ring-4 ring-indigo-500/10'
                  : 'border-indigo-500 bg-white shadow-md hover:shadow-lg hover:border-indigo-600'
              }`}>
                <div className="absolute top-0 right-6 -translate-y-1/2 rounded-full bg-indigo-600 px-3.5 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                  Suscripción Popular
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    Premium Pro <Zap className="h-4 w-4 text-amber-500 fill-amber-400" />
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Para creadores, fotógrafos y editores constantes.</p>

                  <div className="mt-4 flex flex-col">
                    <div className="flex items-baseline text-gray-900">
                      <span className="text-4xl font-extrabold tracking-tight">$9.99</span>
                      <span className="ml-1 text-sm font-semibold text-gray-500">/ mes</span>
                    </div>
                  </div>

                  <ul className="mt-6 space-y-3.5">
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                      <span className="font-semibold text-gray-900">Procesamiento ilimitado con IA</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                      <span>Soporte de múltiples caras y alta resolución</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                      <span>Carga y descarga en lote veloz (.zip)</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                      <span>Controles deslizantes de intensidad y filtros pro</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                      <span>Soporte y colas de procesamiento prioritarios</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-8">
                  {activePlan === 'premium' ? (
                    <button
                      disabled
                      className="w-full rounded-xl border border-indigo-200 py-2.5 text-center text-xs font-semibold text-indigo-600 bg-indigo-50/50 cursor-not-allowed"
                    >
                      Tu Suscripción Activa
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubscribe('monthly')}
                      disabled={loadingPlan !== null}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-center text-xs font-bold text-white shadow-md shadow-indigo-100 transition-all hover:bg-indigo-700 active:scale-98 disabled:opacity-50 cursor-pointer"
                    >
                      {loadingPlan === 'monthly' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                      <span>Suscripción Mensual ($9.99)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 3. PLAN DE POR VIDA (LIFETIME $39.99) */}
              <div className={`relative rounded-2xl border p-6 flex flex-col justify-between transition-all ${
                activePlan === 'lifetime'
                  ? 'border-indigo-600 bg-indigo-50/20 ring-4 ring-indigo-500/10'
                  : 'border-amber-500 bg-gradient-to-b from-amber-50/30 to-white shadow-md hover:shadow-lg hover:border-amber-600'
              }`}>
                <div className="absolute top-0 right-6 -translate-y-1/2 rounded-full bg-amber-500 px-3.5 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                  ¡Mejor Valor!
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    De Por Vida <Sparkles className="h-4 w-4 text-amber-500 fill-amber-400" />
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Un solo pago único. Acceso ilimitado para siempre.</p>

                  <div className="mt-4 flex flex-col">
                    <div className="flex items-baseline text-gray-900">
                      <span className="text-4xl font-extrabold tracking-tight">$39.99</span>
                      <span className="ml-2.5 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">
                        Pago Único
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-amber-600 mt-1.5">
                      Olvídate de facturas mensuales y anuales
                    </p>
                  </div>

                  <ul className="mt-6 space-y-3.5">
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span className="font-semibold text-gray-900">Acceso ilimitado de por vida</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>Sin cargos recurrentes ni sorpresas</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>Todas las actualizaciones futuras gratis</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>Máxima prioridad en procesamiento con IA</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs text-gray-600">
                      <Check className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>Soporte VIP inmediato de por vida</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-8">
                  {activePlan === 'lifetime' ? (
                    <button
                      disabled
                      className="w-full rounded-xl border border-amber-200 py-2.5 text-center text-xs font-semibold text-amber-600 bg-amber-50/50 cursor-not-allowed"
                    >
                      Tu Plan De Por Vida Activo
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubscribe('lifetime')}
                      disabled={loadingPlan !== null}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-center text-xs font-bold text-white shadow-md shadow-amber-100 transition-all hover:bg-amber-600 active:scale-98 disabled:opacity-50 cursor-pointer"
                    >
                      {loadingPlan === 'lifetime' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      <span>Adquirir De Por Vida ($39.99)</span>
                    </button>
                  )}
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  );
}
