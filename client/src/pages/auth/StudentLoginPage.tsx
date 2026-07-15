/** Page d'accès étudiant — saisie du code de session.
 *  Dédiée aux étudiants, séparée de la connexion enseignant. */

import { Book3D } from '@/components/Book3D'
import { ParticleBackground } from '@/components/ParticleBackground'
import { StudentAccessForm } from '@/components/StudentAccessForm'

export function StudentLoginPage() {
  return (
    <div className="min-h-screen flex bg-deep-space relative overflow-hidden">
      {/*  Arrière-plan particules 3D  */}
      <ParticleBackground density={55} speed={0.8} />

      {/*  Lueurs d'ambiance  */}
      <div className="fixed inset-0 pointer-events-none z-[1]" aria-hidden="true">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(6, 242, 219, 0.06) 0%, transparent 60%)',
          }}
        />
        <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 60%)',
          }}
        />
      </div>

      {/* ===== Panneau gauche — Formulaire ===== */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-sm animate-fade-in-up">

          {/* Logo et titre */}
          <div className="text-center mb-10">
            <div className="relative inline-flex mb-5">
              <div className="w-14 h-14 bg-gradient-to-br from-neon-cyan to-violet-iq rounded-2xl flex items-center justify-center shadow-lg shadow-neon-cyan/20 glow-cyan">
                <span className="text-deep-space text-2xl font-heading font-bold leading-none">P</span>
              </div>
              <div className="absolute -inset-1 rounded-2xl border border-white/5" />
            </div>
            <h1 className="font-heading text-3xl font-semibold text-white tracking-tight">
              Accès étudiant
            </h1>
            <p className="text-sm text-text-secondary mt-1.5 font-body">
              Saisissez le code de session fourni par votre enseignant
            </p>
          </div>

          {/*  Carte glassmorphism  */}
          <div className="glass-card p-6 sm:p-8">
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-white/5">
                <div className="w-8 h-8 bg-violet-iq/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-violet-iq" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Code de session</p>
                  <p className="text-xs text-text-secondary">Entrez le code à 6 caractères reçu</p>
                </div>
              </div>

              <StudentAccessForm />
            </div>
          </div>
        </div>
      </div>

      {/* ===== Panneau droit — Livre 3D ===== */}
      <div className="hidden lg:flex flex-1 relative z-10">
        <div className="flex-1 flex flex-col px-8 py-8 min-h-0">
          {/* Logo et titre */}
          <div className="text-center shrink-0">
            <div className="relative inline-flex mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-neon-cyan to-violet-iq rounded-xl flex items-center justify-center mx-auto shadow-lg shadow-neon-cyan/20">
                <span className="text-deep-space text-xl font-heading font-bold leading-none">P</span>
              </div>
            </div>
            <h2 className="font-heading text-xl font-semibold text-white mb-1 tracking-tight">
              PEAN
            </h2>
            <p className="text-muted leading-relaxed font-body text-xs max-w-xs mx-auto">
              Plateforme d'Évaluation Académique Numérique
            </p>
          </div>

          {/* Livre 3D */}
          <div className="flex-1 flex items-center justify-center min-h-0 py-6">
            <div className="w-[280px] h-[360px]">
              <Book3D />
            </div>
          </div>

          {/* Symbole décoratif en bas */}
          <div className="text-center shrink-0">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-8 h-px bg-white/5" />
              <div className="flex items-center gap-2 text-xs text-muted font-mono">
                <span>∑</span>
                <span className="text-white/20">·</span>
                <span>∫</span>
                <span className="text-white/20">·</span>
                <span>π</span>
                <span className="text-white/20">·</span>
                <span>√</span>
              </div>
              <div className="w-8 h-px bg-white/5" />
            </div>
            <p className="text-muted/50 text-[10px] font-mono">
              QCM · Code · Rédactionnel · Mixte
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
