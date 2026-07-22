import React from 'react';
import { User } from 'firebase/auth';
import { LogOut, Sparkles, LogIn, ShieldAlert, CheckCircle2, Shield, EyeOff } from 'lucide-react';
import { UserProfile } from '../types';

interface NavbarProps {
  user: User | null;
  profile: UserProfile | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenBilling: () => void;
}

export default function Navbar({
  user,
  profile,
  onSignIn,
  onSignOut,
  onOpenBilling
}: NavbarProps) {
  const isTrialActive = profile?.subscriptionPlan === 'trial';
  const imagesRemaining = profile ? Math.max(0, 10 - profile.imagesProcessedCount) : 10;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Shield className="h-5.5 w-5.5 text-blue-400" />
            <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white"></div>
          </div>
          <div className="text-left">
            <h1 className="font-display text-lg font-extrabold tracking-tight text-slate-900 leading-none">
              AutoBlur<span className="text-blue-600">.ai</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase mt-1">Anonimización Profesional</p>
          </div>
        </div>

        {/* User / Authentication Status */}
        <div className="flex items-center gap-3">
          {user && profile ? (
            <div className="flex items-center gap-2.5 sm:gap-4">
              {/* Subscription Status Badge */}
              {(() => {
                const isPremiumActive = !!(
                  profile &&
                  (profile.subscriptionPlan === 'premium' || profile.subscriptionPlan === 'lifetime' || profile.subscriptionPlan === 'daily' || profile.subscriptionPlan === 'weekly' || profile.subscriptionPlan === 'monthly' || profile.subscriptionPlan === 'ultra_pro') &&
                  (profile.subscriptionExpiresAt === 'never' || (profile.subscriptionExpiresAt && new Date(profile.subscriptionExpiresAt) > new Date()))
                );
                const isTrialActive = profile?.subscriptionPlan === 'trial';
                const imagesRemaining = profile ? Math.max(0, 10 - profile.imagesProcessedCount) : 10;

                return (
                  <button
                    onClick={onOpenBilling}
                    className={`hidden md:flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold shadow-xs transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer ${
                      isPremiumActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100/60'
                        : isTrialActive && profile.imagesProcessedCount < 10
                        ? 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100/60'
                        : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200/60'
                    }`}
                  >
                    {isPremiumActive ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                        <span>Plan Premium Activo</span>
                      </>
                    ) : isTrialActive && profile.imagesProcessedCount < 10 ? (
                      <>
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                        <span>Prueba Gratis ({imagesRemaining} disp.)</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-3.5 w-3.5 text-slate-500" />
                        <span>Plan Básico</span>
                      </>
                    )}
                  </button>
                );
              })()}

              {/* User Avatar & Name */}
              <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-1 sm:p-1.5 sm:pr-3.5">
                {profile.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt={profile.displayName}
                    className="h-7 w-7 rounded-lg object-cover shadow-xs border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white font-extrabold text-[11px]">
                    {profile.displayName.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-slate-800 leading-tight">{profile.displayName}</p>
                  <p className="text-[10px] text-slate-500 truncate max-w-[120px] leading-none mt-0.5">{profile.email}</p>
                </div>
              </div>

              {/* Log Out Button */}
              <button
                onClick={onSignOut}
                title="Cerrar Sesión"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:bg-red-50 hover:text-red-600 hover:border-red-100 active:scale-95 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              <span>Iniciar con Google</span>
            </button>
          )}
        </div>
      </div>

      {/* Trial warning bar for logged-in trial users */}
      {user && profile && isTrialActive && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50/50 border-t border-b border-amber-100 px-4 py-2 text-center text-xs text-amber-800">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 flex-wrap text-[11px]">
            <span className="font-extrabold">Período de Prueba de 24 horas:</span>
            <span>Has procesado {profile.imagesProcessedCount} de un máximo de 10 imágenes permitidas.</span>
            <button
              onClick={onOpenBilling}
              className="ml-2 rounded-full bg-slate-900 px-2.5 py-1 text-[9px] font-extrabold text-white uppercase tracking-wider hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Mejorar a Premium
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
