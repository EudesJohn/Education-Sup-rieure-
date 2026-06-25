/** Page de réinitialisation du mot de passe — Glassmorphism & Particules. */

import { useState, FormEvent, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authApi } from '@/services/api'
import { ParticleBackground } from '@/components/ParticleBackground'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setError("Le jeton de réinitialisation est absent de l'adresse de navigation. Veuillez suivre le lien fourni dans l'email.")
    }
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!token) {
      setError("Jeton de réinitialisation invalide ou absent.")
      return
    }

    if (password.length < 8) {
      setError("Le mot de passe doit comporter au moins 8 caractères.")
      return
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.")
      return
    }

    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      setSuccess('Votre mot de passe a été modifié avec succès. Vous pouvez désormais vous connecter.')
      setPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Une erreur est survenue lors de la réinitialisation de votre mot de passe.')
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
            Réinitialisation
          </h1>
          <p className="text-sm text-text-secondary mt-1.5 font-body">
            Saisissez votre nouveau mot de passe sécurisé
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
                Se connecter
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
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Nouveau mot de passe */}
              <div>
                <label htmlFor="pass" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Nouveau mot de passe (min 8 car.)
                </label>
                <input
                  id="pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                  disabled={!token}
                  autoFocus
                />
              </div>

              {/* Confirmation */}
              <div>
                <label htmlFor="confirmPass" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Confirmer le mot de passe
                </label>
                <input
                  id="confirmPass"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                  disabled={!token}
                />
              </div>

              {/* Bouton Envoyer */}
              <button
                type="submit"
                disabled={loading || !token}
                className="btn btn-primary w-full py-2.5 font-semibold btn-ripple"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Enregistrement...
                  </span>
                ) : (
                  <>
                    Enregistrer le mot de passe
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
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
