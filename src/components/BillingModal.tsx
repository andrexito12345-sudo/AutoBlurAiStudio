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
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual' | 'lifetime'>('monthly');
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

        // Render the official PayPhone Payment Button Box
        if ((window as any).payphone) {
          (window as any).payphone.Button({
            token: data.token,
            storeId: data.storeId,
            clientTransactionId: data.clientTransactionId,
            amount: data.amount,
            amountWithoutTax: data.amountWithoutTax,
            tax: 0,
            amountWithTax: 0,
            currency: "USD",
            reference: data.reference,
            onComplete: async function(model: any, status: any) {
              try {
                const confirmResponse = await fetch('/api/payphone/confirm', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                  },
                  body: JSON.stringify({
                    id: model.id,
                    clientTransactionId: model.clientTransactionId
                  })
                });
                
                const result = await confirmResponse.json();
                if (confirmResponse.ok && result.success) {
                  alert(`¡Pago completado con éxito! Tu acceso ${selectedPlan === 'lifetime' ? 'De Por Vida' : 'Premium'} ha sido activado correctamente.`);
                  onClose();
                } else {
                  alert(result.error || 'Ocurrió un error al verificar tu transacción en el servidor.');
                }
              } catch (err) {
                console.error("Error confirming payphone payment:", err);
                alert('No se pudo verificar el estado de tu transacción.');
              }
            }
          }).render('#pp-button');
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
  }, [isOpen, selectedPlan, profile, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-gray-100 max-h-[95vh] overflow-y-auto my-auto animate-fadeIn">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all active:scale-95 cursor-pointer z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3.5 py-1 text-xs font-bold text-orange-700 mb-3 border border-orange-100">
            <span className="text-sm">🇪🇨</span>
            <span>Pasarela de Pago Oficial de PayPhone</span>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Desbloquea AutoBlur Pro con PayPhone
          </h2>
          <p className="mt-2 text-gray-500 text-xs sm:text-sm max-w-lg mx-auto leading-relaxed">
            Obtén procesamiento masivo e ilimitado de imágenes con IA de la forma más rápida y segura del Ecuador.
          </p>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto mb-8">
          
          {/* 1. PLAN MENSUAL */}
          <button
            onClick={() => setSelectedPlan('monthly')}
            className={`text-left relative rounded-2xl border p-5 transition-all cursor-pointer flex flex-col justify-between ${
              selectedPlan === 'monthly'
                ? 'border-indigo-600 bg-indigo-50/20 ring-2 ring-indigo-600/10'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider">Plan Mensual</span>
                {selectedPlan === 'monthly' && <span className="h-2 w-2 rounded-full bg-indigo-600"></span>}
              </div>
              <p className="text-xs text-gray-500 mt-1">Suscripción por 30 días de uso ilimitado.</p>
              <div className="mt-3 flex items-baseline text-gray-900">
                <span className="text-3xl font-extrabold tracking-tight">$9.99</span>
                <span className="ml-1 text-[11px] font-semibold text-gray-500">/ 30 días</span>
              </div>
              <ul className="mt-4 space-y-2 text-[11px] text-gray-600">
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Sin marcas de agua</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Imágenes ilimitadas</span>
                </li>
              </ul>
            </div>
          </button>

          {/* 2. PLAN ANUAL (RECOMENDADO) */}
          <button
            onClick={() => setSelectedPlan('annual')}
            className={`text-left relative rounded-2xl border p-5 transition-all cursor-pointer flex flex-col justify-between ${
              selectedPlan === 'annual'
                ? 'border-emerald-600 bg-emerald-50/20 ring-2 ring-emerald-600/10'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="absolute top-0 right-4 -translate-y-1/2 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-extrabold text-white uppercase tracking-widest">
              Ahorra 18%
            </div>
            <div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-extrabold text-emerald-600 uppercase tracking-wider">Plan Anual</span>
                {selectedPlan === 'annual' && <span className="h-2 w-2 rounded-full bg-emerald-600"></span>}
              </div>
              <p className="text-xs text-gray-500 mt-1">Suscripción por 365 días al mejor precio.</p>
              <div className="mt-3 flex items-baseline text-gray-900">
                <span className="text-3xl font-extrabold tracking-tight">$99.00</span>
                <span className="ml-1 text-[11px] font-semibold text-gray-500">/ 365 días</span>
              </div>
              <ul className="mt-4 space-y-2 text-[11px] text-gray-600">
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Soporte prioritario</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Acceso por todo un año</span>
                </li>
              </ul>
            </div>
          </button>

          {/* 3. PLAN DE POR VIDA */}
          <button
            onClick={() => setSelectedPlan('lifetime')}
            className={`text-left relative rounded-2xl border p-5 transition-all cursor-pointer flex flex-col justify-between ${
              selectedPlan === 'lifetime'
                ? 'border-purple-600 bg-purple-50/20 ring-2 ring-purple-600/10'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="absolute top-0 right-4 -translate-y-1/2 rounded-full bg-purple-600 px-2 py-0.5 text-[9px] font-extrabold text-white uppercase tracking-widest">
              Único Pago
            </div>
            <div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-extrabold text-purple-600 uppercase tracking-wider">De Por Vida</span>
                {selectedPlan === 'lifetime' && <span className="h-2 w-2 rounded-full bg-purple-600"></span>}
              </div>
              <p className="text-xs text-gray-500 mt-1">Acceso permanente. Olvídate de renovar.</p>
              <div className="mt-3 flex items-baseline text-gray-900">
                <span className="text-3xl font-extrabold tracking-tight">$39.99</span>
                <span className="ml-1 text-[11px] font-semibold text-gray-500">/ único pago</span>
              </div>
              <ul className="mt-4 space-y-2 text-[11px] text-gray-600">
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Acceso permanente</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Actualizaciones eternas</span>
                </li>
              </ul>
            </div>
          </button>

        </div>

        {/* Interactive Payment Checkout Box */}
        <div className="border border-gray-150 rounded-2xl bg-gray-50/50 p-5 sm:p-6 max-w-xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-3 mb-4 text-left">
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Plan Seleccionado</h4>
              <p className="text-sm font-extrabold text-gray-800 mt-0.5">
                {selectedPlan === 'monthly' ? 'Suscripción Premium Mensual ($9.99)' : selectedPlan === 'annual' ? 'Suscripción Premium Anual ($99.00)' : 'Acceso De Por Vida ($39.99)'}
              </p>
            </div>
            <div className="mt-2 sm:mt-0">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg text-orange-700 bg-orange-100">
                <Coins className="h-3.5 w-3.5" />
                <span>USD</span>
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-left mb-5 leading-relaxed">
            Ingresa tu tarjeta de crédito o débito Visa, Mastercard de forma rápida. La pasarela es procesada con total seguridad por PayPhone.
          </p>

          {/* Payphone Embed Container */}
          <div className="flex flex-col items-center justify-center min-h-[70px] relative">
            {preparing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/70 z-10 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
                <span className="text-[11px] text-gray-500 font-bold">Generando enlace seguro...</span>
              </div>
            )}

            {prepareError && (
              <div className="w-full text-left bg-red-50 border border-red-100 rounded-xl p-3 mb-4 flex items-start gap-2 animate-fadeIn">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-[11px] font-semibold text-red-700 leading-relaxed">{prepareError}</p>
              </div>
            )}

            {/* The main Div where the PayPhone widget mounts */}
            <div id="pp-button" className="w-full max-w-xs transition-all duration-300"></div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
            <Shield className="h-3.5 w-3.5 text-emerald-500" />
            <span>Encriptación de datos segura SSL de 256 bits.</span>
          </div>
        </div>

      </div>
    </div>
  );
}
