/** Page de connexion — Deep Focus.
 *  Formulaire glassmorphism sur fond avec particules scientifiques 3D. */

import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Book3D } from '@/components/Book3D'
import { ParticleBackground } from '@/components/ParticleBackground'

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      const teacher = useAuthStore.getState().teacher
      if (teacher?.role === 'admin') {
        navigate('/role-choice')
      } else {
        navigate('/teacher/dashboard')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Email ou mot de passe incorrect')
    } finally {
      setLoading(false)
    }
  }

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
              Connexion
            </h1>
            <p className="text-sm text-text-secondary mt-1.5 font-body">
              Plateforme d'Évaluation Académique Numérique
            </p>
          </div>

          {/*  Formulaire glassmorphism  */}
          <div className="glass-card p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Message d'erreur */}
              {error && (
                <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-3 rounded-lg text-sm flex items-center gap-2 animate-fade-in">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Email professionnel
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="exemple@universite.edu"
                  required
                  autoFocus
                />
              </div>

              {/* Mot de passe */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-text-secondary">
                    Mot de passe
                  </label>
                  <Link to="/forgot-password" className="text-xs text-muted hover:text-neon-cyan transition-colors">
                    Mot de passe oublié ?
                  </Link>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                />
              </div>

              {/* Bouton Connexion */}
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full py-2.5 font-semibold btn-ripple"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Connexion...
                  </span>
                ) : (
                  <>
                    Se connecter
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            {/* Lien vers accès étudiant */}
            <div className="text-center">
              <Link
                to="/etudiant"
                className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-neon-cyan transition-colors group"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
                </svg>
                Accès étudiant
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Pied */}
          <p className="text-center mt-6 text-sm text-text-secondary">
            Pas encore inscrit ?{' '}
            <Link to="/register" className="text-neon-cyan hover:text-neon-cyan-dim font-medium transition-colors">
              Créer un compte enseignant
            </Link>
          </p>
        </div>
      </div>

      {/* ===== Panneau droit — Livre 3D + Symboles ===== */}
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
