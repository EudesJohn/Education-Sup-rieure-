/** Page de vérification de l'adresse email — Glassmorphism & Particules. */

import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authApi } from '@/services/api'
import { ParticleBackground } from '@/components/ParticleBackground'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage("Le jeton de vérification est manquant dans l'adresse. Veuillez utiliser le lien présent dans l'email envoyé.")
      return
    }

    const performVerification = async () => {
      try {
        await authApi.verifyEmail(token)
        setStatus('success')
        setMessage('Votre adresse email a été validée avec succès ! Vous pouvez à présent vous connecter.')
      } catch (err: any) {
        setStatus('error')
        setMessage(err.response?.data?.detail || 'Le jeton de vérification est invalide ou a expiré.')
      }
    }

    performVerification()
  }, [token])

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
            Vérification Email
          </h1>
          <p className="text-sm text-text-secondary mt-1.5 font-body">
            Validation de votre compte Enseignant
          </p>
        </div>

        {/* Formulaire/Panneau glassmorphism */}
        <div className="glass-card p-6 sm:p-8 text-center space-y-6">
          {status === 'loading' && (
            <div className="py-8 space-y-4">
              <div className="flex justify-center">
                <svg className="animate-spin w-10 h-10 text-neon-cyan" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <p className="text-sm text-text-secondary">Vérification en cours auprès du serveur...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-6">
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-4 rounded-lg text-sm flex flex-col items-center gap-3 animate-fade-in">
                <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="leading-relaxed">{message}</span>
              </div>
              <Link to="/login" className="btn btn-primary w-full py-2.5 font-semibold block text-center">
                Retour à la connexion
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-6">
              <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-4 rounded-lg text-sm flex flex-col items-center gap-3 animate-fade-in">
                <svg className="w-10 h-10 text-rose-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span className="leading-relaxed">{message}</span>
              </div>
              <Link to="/login" className="btn btn-primary w-full py-2.5 font-semibold block text-center">
                Retour à la connexion
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
