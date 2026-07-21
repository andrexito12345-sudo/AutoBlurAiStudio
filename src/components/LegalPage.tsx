import React from 'react';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

interface LegalPageProps {
  type: 'privacy' | 'terms';
}

const CONTACT_EMAIL = 'andrexito12345@gmail.com';
const LAST_UPDATED = '21 de julio de 2026';

export default function LegalPage({ type }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-[#fafafc] flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-gray-150 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-gray-900 hover:opacity-80 transition-opacity">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="font-display font-extrabold tracking-tight">
              AutoBlur<span className="text-indigo-600">.ai</span>
            </span>
          </a>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a la app
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {type === 'privacy' ? <PrivacyContent /> : <TermsContent />}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-gray-150 py-5 bg-white text-center">
        <p className="text-[10px] text-gray-400 font-semibold tracking-wide uppercase">
          AutoBlur.ai © {new Date().getFullYear()} — Privacidad inteligente en segundos
        </p>
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-gray-400">
          <a href="/privacidad" className="hover:text-indigo-600">Política de Privacidad</a>
          <span>·</span>
          <a href="/terminos" className="hover:text-indigo-600">Términos y Condiciones</a>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-bold text-gray-900 mb-2">{title}</h2>
      <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function PrivacyContent() {
  return (
    <article>
      <h1 className="font-display text-3xl font-extrabold text-gray-900 tracking-tight">
        Política de Privacidad
      </h1>
      <p className="text-xs text-gray-400 mt-2">Última actualización: {LAST_UPDATED}</p>

      <p className="text-sm text-gray-600 leading-relaxed mt-6">
        En AutoBlur.ai la privacidad es el centro de nuestro producto. Esta política explica qué
        datos tratamos, cómo lo hacemos y qué derechos tienes.
      </p>

      <Section title="1. Qué datos recopilamos">
        <p>
          <b>Cuenta:</b> al iniciar sesión con Google recibimos tu nombre, correo electrónico y
          foto de perfil, únicamente para identificarte y gestionar tu cuenta.
        </p>
        <p>
          <b>Uso:</b> tu plan, número de imágenes procesadas y estado de tus pases.
        </p>
        <p>
          <b>Imágenes:</b> las fotos que subes para difuminar rostros.
        </p>
      </Section>

      <Section title="2. Cómo tratamos tus imágenes">
        <p>
          Cuando subes una imagen, se envía de forma segura a nuestro servidor y de allí a la API de
          inteligencia artificial de Google (Gemini) <b>solo</b> para detectar las coordenadas de los
          rostros. El difuminado se aplica <b>localmente en tu navegador</b>.
        </p>
        <p>
          <b>No almacenamos tus imágenes de forma permanente en nuestros servidores.</b> Se procesan
          en el momento y no se guardan como archivos en nuestra base de datos.
        </p>
      </Section>

      <Section title="3. Dónde se guardan tus datos">
        <p>
          Tu perfil y datos de uso se almacenan en Google Firebase (Firestore). Las transacciones de
          pago las procesa PayPhone. No guardamos datos de tu tarjeta: los maneja íntegramente
          PayPhone.
        </p>
      </Section>

      <Section title="4. Terceros que intervienen">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Google Firebase / Gemini:</b> autenticación y detección de rostros.</li>
          <li><b>PayPhone:</b> procesamiento de pagos.</li>
        </ul>
        <p>Cada uno trata los datos bajo sus propias políticas de privacidad.</p>
      </Section>

      <Section title="5. Tus derechos">
        <p>
          Puedes solicitar acceso, corrección o eliminación de tus datos personales escribiéndonos a{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 font-semibold">{CONTACT_EMAIL}</a>.
          Al eliminar tu cuenta se borra tu perfil y datos de uso asociados.
        </p>
      </Section>

      <Section title="6. Menores de edad">
        <p>
          El servicio no está dirigido a menores de edad. Si usas AutoBlur.ai para proteger la
          privacidad de menores en tus fotos, eres responsable de contar con la autorización
          correspondiente.
        </p>
      </Section>

      <Section title="7. Cambios">
        <p>
          Podemos actualizar esta política. Publicaremos la versión vigente en esta misma página con
          su fecha de actualización.
        </p>
      </Section>

      <Section title="8. Contacto">
        <p>
          Dudas sobre privacidad:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 font-semibold">{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </article>
  );
}

function TermsContent() {
  return (
    <article>
      <h1 className="font-display text-3xl font-extrabold text-gray-900 tracking-tight">
        Términos y Condiciones
      </h1>
      <p className="text-xs text-gray-400 mt-2">Última actualización: {LAST_UPDATED}</p>

      <p className="text-sm text-gray-600 leading-relaxed mt-6">
        Al usar AutoBlur.ai aceptas estos términos. Si no estás de acuerdo, no utilices el servicio.
      </p>

      <Section title="1. El servicio">
        <p>
          AutoBlur.ai es una herramienta que detecta y difumina automáticamente rostros en imágenes
          usando inteligencia artificial. El difuminado se realiza en tu navegador.
        </p>
      </Section>

      <Section title="2. Uso aceptable">
        <p>
          Declaras que tienes derecho a subir y editar las imágenes que procesas. No debes usar el
          servicio para contenido ilegal, difamatorio, que vulnere derechos de terceros ni para fines
          ilícitos. Eres el único responsable del contenido que subes y del uso que le des a los
          resultados.
        </p>
      </Section>

      <Section title="3. Planes y pagos">
        <p>
          Ofrecemos pases de un solo pago (no suscripciones recurrentes):
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Diario:</b> $1.99 · 24 horas · hasta 50 imágenes.</li>
          <li><b>Semanal:</b> $4.99 · 7 días · hasta 500 imágenes.</li>
          <li><b>Mensual:</b> $12.99 · 30 días · hasta 2000 imágenes.</li>
        </ul>
        <p>
          Los precios están en dólares estadounidenses (USD). Los pagos se procesan mediante PayPhone.
          Cada pase da acceso hasta agotar su límite de imágenes o hasta su fecha de expiración, lo
          que ocurra primero. Existe un plan gratuito de prueba limitado.
        </p>
      </Section>

      <Section title="4. Reembolsos">
        <p>
          Por tratarse de un servicio digital de consumo inmediato, los pases no son reembolsables
          una vez activados, salvo fallas atribuibles al servicio. Para cualquier inconveniente con un
          pago, contáctanos a{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 font-semibold">{CONTACT_EMAIL}</a>.
        </p>
      </Section>

      <Section title="5. Sin garantía de resultados perfectos">
        <p>
          La detección de rostros se basa en IA y puede no ser 100% precisa: podría omitir un rostro o
          difuminar de más. <b>Revisa siempre el resultado antes de publicar o compartir la imagen.</b>{' '}
          No garantizamos la detección de todos los rostros en toda imagen.
        </p>
      </Section>

      <Section title="6. Limitación de responsabilidad">
        <p>
          El servicio se ofrece "tal cual". En la máxima medida permitida por la ley, AutoBlur.ai no
          será responsable por daños derivados del uso o imposibilidad de uso del servicio, incluyendo
          la publicación de imágenes sin haber verificado el difuminado.
        </p>
      </Section>

      <Section title="7. Disponibilidad">
        <p>
          Podemos modificar, suspender o discontinuar el servicio en cualquier momento. Dependemos de
          servicios de terceros (Google, PayPhone) cuya disponibilidad no controlamos.
        </p>
      </Section>

      <Section title="8. Cambios en los términos">
        <p>
          Podemos actualizar estos términos. El uso continuado del servicio implica la aceptación de
          la versión vigente publicada en esta página.
        </p>
      </Section>

      <Section title="9. Ley aplicable y contacto">
        <p>
          Estos términos se rigen por las leyes de la República del Ecuador. Contacto:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 font-semibold">{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </article>
  );
}
