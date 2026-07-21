import React from 'react';
import { User } from 'firebase/auth';
import { LogOut, Sparkles, LogIn, ShieldAlert, BadgeHelp, CheckCircle2, UserCheck } from 'lucide-react';
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
  // Check trial active status
  const isTrialActive = profile?.subscriptionPlan === 'trial';
  const imagesRemaining = profile ? Math.max(0, 10 - profile.imagesProcessedCount) : 10;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 animate-pulse">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <circle cx="12" cy="11" r="3" />
            </svg>
            <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 border-2 border-white"></div>
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-gray-900">
              AutoBlur<span className="text-indigo-600">.ai</span>
            </h1>
            <p className="text-[10px] text-gray-500 font-medium">Automatic AI Face Blur</p>
          </div>
        </div>

        {/* User / Authentication Status */}
        <div className="flex items-center gap-4">
          {user && profile ? (
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Subscription Status Badge */}
              {(() => {
                const isPremiumActive = !!(
                  profile &&
                  (profile.subscriptionPlan === 'premium' || profile.subscriptionPlan === 'lifetime') &&
                  (profile.subscriptionExpiresAt === 'never' || (profile.subscriptionExpiresAt && new Date(profile.subscriptionExpiresAt) > new Date()))
                );
                const isTrialActive = profile?.subscriptionPlan === 'trial';
                const imagesRemaining = profile ? Math.max(0, 10 - profile.imagesProcessedCount) : 10;

                return (
                  <button
                    onClick={onOpenBilling}
                    className={`hidden md:flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 ${
                      isPremiumActive
                        ? profile.subscriptionPlan === 'lifetime'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200/50 hover:bg-purple-100'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50 hover:bg-emerald-100'
                        : isTrialActive && profile.imagesProcessedCount < 10
                        ? 'bg-amber-50 text-amber-700 border border-amber-200/50 hover:bg-amber-100'
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {isPremiumActive ? (
                      profile.subscriptionPlan === 'lifetime' ? (
                        <>
                          <Sparkles className="h-3.5 w-3.5 text-purple-500 animate-pulse" />
                          <span>Plan De Por Vida Activo</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          <span>Plan Premium Activo</span>
                        </>
                      )
                    ) : isTrialActive && profile.imagesProcessedCount < 10 ? (
                      <>
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                        <span>Prueba Gratuita ({imagesRemaining} disp.)</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-3.5 w-3.5 text-gray-500" />
                        <span>Plan Básico</span>
                      </>
                    )}
                  </button>
                );
              })()}

              {/* User Avatar & Name */}
              <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50/50 p-1.5 pr-3">
                {profile.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt={profile.displayName}
                    className="h-7 w-7 rounded-full object-cover shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-semibold text-xs">
                    {profile.displayName.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-gray-800 leading-3">{profile.displayName}</p>
                  <p className="text-[9px] text-gray-500 truncate max-w-[120px]">{profile.email}</p>
                </div>
              </div>

              {/* Log Out Button */}
              <button
                onClick={onSignOut}
                title="Cerrar Sesión"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 hover:border-red-100 active:scale-95"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-100 transition-all hover:bg-indigo-700 hover:scale-[1.02] active:scale-95"
            >
              <LogIn className="h-4 w-4" />
              <span>Iniciar con Google</span>
            </button>
          )}
        </div>
      </div>

      {/* Trial warning bar for logged-in trial users */}
      {user && profile && isTrialActive && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-t border-b border-amber-100 px-4 py-1.5 text-center text-xs text-amber-800">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-1.5 flex-wrap">
            <span className="font-semibold">Período de Prueba Activo:</span>
            <span>Has procesado {profile.imagesProcessedCount} de un máximo de 10 imágenes permitidas.</span>
            <button
              onClick={onOpenBilling}
              className="ml-2 rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider hover:bg-amber-700 transition-colors"
            >
              Mejorar a Premium
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
