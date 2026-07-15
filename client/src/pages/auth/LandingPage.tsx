/** Page d'accueil — choix entre connexion enseignant et accès étudiant. */

import { Link } from 'react-router-dom'
import { ParticleBackground } from '@/components/ParticleBackground'

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-deep-space relative overflow-hidden">
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

      <div className="relative z-10 w-full max-w-lg mx-auto px-6 animate-fade-in-up">

        {/* Logo et titre */}
        <div className="text-center mb-12">
          <div className="relative inline-flex mb-5">
            <div className="w-16 h-16 bg-gradient-to-br from-neon-cyan to-violet-iq rounded-2xl flex items-center justify-center shadow-lg shadow-neon-cyan/20 glow-cyan">
              <span className="text-deep-space text-3xl font-heading font-bold leading-none">P</span>
            </div>
            <div className="absolute -inset-1 rounded-2xl border border-white/5" />
          </div>
          <h1 className="font-heading text-3xl font-semibold text-white tracking-tight">
            PEAN
          </h1>
          <p className="text-sm text-text-secondary mt-2 font-body">
            Plateforme d'Évaluation Académique Numérique
          </p>
        </div>

        {/* Cartes de choix */}
        <div className="grid gap-4">
          {/* Enseignant */}
          <Link
            to="/login"
            className="glass-card p-5 flex items-center gap-4 hover:border-neon-cyan/30 transition-all group"
          >
            <div className="w-12 h-12 bg-neon-cyan/10 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-neon-cyan/20 transition-colors">
              <svg className="w-6 h-6 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-lg font-semibold text-white group-hover:text-neon-cyan transition-colors">
                Enseignant
              </h2>
              <p className="text-sm text-text-secondary">
                Connexion avec email professionnel
              </p>
            </div>
            <svg className="w-5 h-5 text-muted group-hover:text-neon-cyan group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>

          {/* Étudiant */}
          <Link
            to="/etudiant"
            className="glass-card p-5 flex items-center gap-4 hover:border-violet-iq/30 transition-all group"
          >
            <div className="w-12 h-12 bg-violet-iq/10 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-violet-iq/20 transition-colors">
              <svg className="w-6 h-6 text-violet-iq" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-lg font-semibold text-white group-hover:text-violet-iq transition-colors">
                Étudiant
              </h2>
              <p className="text-sm text-text-secondary">
                Accès avec code de session
              </p>
            </div>
            <svg className="w-5 h-5 text-muted group-hover:text-violet-iq group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>

        {/* Pied */}
        <p className="text-center mt-8 text-sm text-text-secondary">
          Pas encore inscrit ?{' '}
          <Link to="/register" className="text-neon-cyan hover:text-neon-cyan-dim font-medium transition-colors">
            Créer un compte enseignant
          </Link>
        </p>
      </div>
    </div>
  )
}
