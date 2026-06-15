/** Page d'inscription enseignant — Deep Focus.
 *  Formulaire glassmorphism sur fond avec particules scientifiques 3D. */

import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { ParticleBackground } from '@/components/ParticleBackground'

export function RegisterPage() {
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)
  const [form, setForm] = useState({
    full_name: '', email: '', institution: '', discipline: '',
    password: '', confirm_password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    if (form.password !== form.confirm_password) { setError('Les mots de passe ne correspondent pas'); return }
    if (form.password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères'); return }
    setLoading(true)
    try {
      await register({
        full_name: form.full_name, email: form.email, institution: form.institution,
        discipline: form.discipline, password: form.password,
      })
      navigate('/teacher/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur lors de l'inscription")
    } finally { setLoading(false) }
  }

  const updateField = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }))

  return (
    <div className="min-h-screen flex bg-deep-space relative overflow-hidden">
      {/* █████ Arrière-plan particules 3D █████ */}
      <ParticleBackground density={55} speed={0.8} />

      {/* █████ Lueurs d'ambiance █████ */}
      <div className="fixed inset-0 pointer-events-none z-[1]" aria-hidden="true">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6, 242, 219, 0.06) 0%, transparent 60%)' }} />
        <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 60%)' }} />
      </div>

      {/* ===== Panneau gauche — Formulaire ===== */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Logo et titre */}
          <div className="text-center mb-8">
            <div className="relative inline-flex mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-neon-cyan to-violet-iq rounded-2xl flex items-center justify-center shadow-lg shadow-neon-cyan/20 glow-cyan">
                <span className="text-deep-space text-2xl font-heading font-bold leading-none">P</span>
              </div>
              <div className="absolute -inset-1 rounded-2xl border border-white/5" />
            </div>
            <h1 className="font-heading text-3xl font-semibold text-white tracking-tight">
              Inscription
            </h1>
            <p className="text-sm text-text-secondary mt-1">Créez votre compte pour gérer vos évaluations</p>
          </div>

          {/* █████ Formulaire glassmorphism █████ */}
          <div className="glass-card p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-3 rounded-lg text-sm animate-fade-in">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Nom complet *</label>
                <input type="text" value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)}
                  className="input" placeholder="Dr. Jean Dupont" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Email professionnel *</label>
                <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)}
                  className="input" placeholder="jean.dupont@universite.edu" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Établissement *</label>
                  <input type="text" value={form.institution} onChange={(e) => updateField('institution', e.target.value)}
                    className="input" placeholder="Université" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Discipline *</label>
                  <input type="text" value={form.discipline} onChange={(e) => updateField('discipline', e.target.value)}
                    className="input" placeholder="Mathématiques" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Mot de passe *</label>
                  <input type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)}
                    className="input" placeholder="Min. 8 caractères" required minLength={8} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Confirmer *</label>
                  <input type="password" value={form.confirm_password} onChange={(e) => updateField('confirm_password', e.target.value)}
                    className="input" placeholder="Répétez" required minLength={8} />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="btn btn-primary w-full py-2.5 font-semibold btn-ripple">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Inscription...
                  </span>
                ) : "Créer mon compte enseignant"}
              </button>
            </form>
          </div>

          <p className="text-center mt-6 text-sm text-text-secondary">
            Déjà inscrit ?{' '}
            <Link to="/login" className="text-neon-cyan hover:text-neon-cyan-dim font-medium transition-colors">
              Se connecter
            </Link>
          </p>
        </div>
      </div>

      {/* ===== Panneau droit — Message de bienvenue ===== */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative z-10">
        <div className="max-w-md text-center">
          <div className="relative inline-flex mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-neon-cyan/10 to-violet-iq/10 rounded-2xl flex items-center justify-center border border-white/5">
              <svg className="w-10 h-10 text-neon-cyan/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
              </svg>
            </div>
          </div>
          <h2 className="font-heading text-3xl font-semibold text-white mb-4 tracking-tight">Rejoignez PEAN</h2>
          <p className="text-text-secondary leading-relaxed font-body text-sm">
            Créez, gérez et corrigez vos épreuves académiques en toute simplicité.
            L'intelligence artificielle assiste la correction pour vous faire gagner du temps.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { value: '10k+', label: 'Étudiants' },
              { value: '500+', label: 'Enseignants' },
              { value: '99.9%', label: 'Disponibilité' },
            ].map((stat) => (
              <div key={stat.label} className="glass-card-light p-3">
                <p className="font-heading text-lg font-semibold text-gradient-cyan">{stat.value}</p>
                <p className="text-xs text-muted mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-muted/40 text-xs font-mono">∑ ∫ π √ ∞</span>
            <div className="h-px flex-1 bg-white/5" />
          </div>
        </div>
      </div>
    </div>
  )
}
