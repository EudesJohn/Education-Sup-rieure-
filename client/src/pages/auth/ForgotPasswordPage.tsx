/** Page de récupération de mot de passe oublié — Glassmorphism & Particules. */

import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '@/services/api'
import { ParticleBackground } from '@/components/ParticleBackground'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      await authApi.forgotPassword(email)
      setSuccess('Si cet email correspond à un compte actif, vous recevrez un lien de réinitialisation sous peu.')
      setEmail('')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Une erreur est survenue lors de la demande.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-deep-space relative overflow-hidden px-6 py-12">
      {/* Arrière-plan particules 3D */}
      <ParticleBackground density={55} speed={0.8} />

      {/* Lueurs d'ambiance */}
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

      <div className="w-full max-w-sm relative z-10 animate-fade-in-up">
        {/* Logo et titre */}
        <div className="text-center mb-8">
          <div className="relative inline-flex mb-5">
            <div className="w-14 h-14 bg-gradient-to-br from-neon-cyan to-violet-iq rounded-2xl flex items-center justify-center shadow-lg shadow-neon-cyan/20 glow-cyan">
              <span className="text-deep-space text-2xl font-heading font-bold leading-none">P</span>
            </div>
            <div className="absolute -inset-1 rounded-2xl border border-white/5" />
          </div>
          <h1 className="font-heading text-3xl font-semibold text-white tracking-tight">
            Mot de passe oublié
          </h1>
          <p className="text-sm text-text-secondary mt-1.5 font-body">
            Saisissez votre adresse email pour réinitialiser votre compte
          </p>
        </div>

        {/* Formulaire glassmorphism */}
        <div className="glass-card p-6 sm:p-8">
          {success ? (
            <div className="space-y-6 text-center">
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-4 rounded-lg text-sm flex flex-col items-center gap-3 animate-fade-in">
                <svg className="w-8 h-8 flex-shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{success}</span>
              </div>
              <Link to="/login" className="btn btn-primary w-full py-2.5 font-semibold block text-center">
                Retour à la connexion
              </Link>
            </div>
          ) : (
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
                  Email de connexion
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

              {/* Bouton Envoyer */}
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
                    Envoi en cours...
                  </span>
                ) : (
                  <>
                    Envoyer le lien de récupération
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <Link to="/login" className="text-sm text-muted hover:text-neon-cyan transition-colors">
                  Retour à la connexion
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
