/** Page de choix de rôle — pour les admins après connexion.
 *  Ils choisissent entre mode Admin et mode Enseignant. */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { ParticleBackground } from '@/components/ParticleBackground'

export function RoleChoicePage() {
  const navigate = useNavigate()
  const { teacher, setActiveRole } = useAuthStore()
  const [choosing, setChoosing] = useState(false)

  const handleChoose = (role: 'teacher' | 'admin') => {
    setChoosing(true)
    setActiveRole(role)
    const path = role === 'admin' ? '/admin' : '/teacher/dashboard'
    // Petite pause pour l'animation
    setTimeout(() => navigate(path), 300)
  }

  if (!teacher || teacher.role !== 'admin') {
    navigate('/teacher/dashboard', { replace: true })
    return null
  }

  return (
    <div className="min-h-screen flex bg-deep-space relative overflow-hidden">
      <ParticleBackground density={50} speed={0.7} />
      <div className="fixed inset-0 pointer-events-none z-[1]" aria-hidden="true">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6, 242, 219, 0.06) 0%, transparent 60%)' }} />
        <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 60%)' }} />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 relative z-10">
        <div className="w-full max-w-lg animate-fade-in-up">
          {/* Logo */}
          <div className="text-center mb-10">
            <div className="relative inline-flex mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-neon-cyan to-violet-iq rounded-2xl flex items-center justify-center shadow-lg shadow-neon-cyan/20 glow-cyan">
                <span className="text-deep-space text-2xl font-heading font-bold leading-none">P</span>
              </div>
            </div>
            <h1 className="font-heading text-2xl font-semibold text-white tracking-tight">
              Bienvenue, {teacher.full_name?.split(' ')[0] || 'Administrateur'}
            </h1>
            <p className="text-sm text-text-secondary mt-2">
              Vous êtes connecté en tant qu'<span className="text-amber-iq font-medium">administrateur</span>.
              Choisissez le mode que vous souhaitez utiliser :
            </p>
          </div>

          {/* Cartes de choix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mode Enseignant */}
            <button
              onClick={() => handleChoose('teacher')}
              disabled={choosing}
              className={`group glass-card p-6 text-center hover:border-neon-cyan/30 transition-all duration-300 ${
                choosing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
              }`}
            >
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-gradient-to-br from-neon-cyan/10 to-emerald-500/10 flex items-center justify-center border border-neon-cyan/10 group-hover:border-neon-cyan/30 group-hover:shadow-lg group-hover:shadow-neon-cyan/10 transition-all">
                <svg className="w-7 h-7 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
                </svg>
              </div>
              <h2 className="font-heading text-lg font-semibold text-white mb-1.5">Mode Enseignant</h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                Gérer mes sessions d'examen, exercices, corrections et listes d'étudiants
              </p>
              <div className="mt-4 flex items-center justify-center gap-1 text-xs text-neon-cyan opacity-0 group-hover:opacity-100 transition-opacity">
                <span>Continuer</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </button>

            {/* Mode Admin */}
            <button
              onClick={() => handleChoose('admin')}
              disabled={choosing}
              className={`group glass-card p-6 text-center hover:border-violet-iq/30 transition-all duration-300 ${
                choosing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
              }`}
            >
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-gradient-to-br from-violet-iq/10 to-amber-iq/10 flex items-center justify-center border border-violet-iq/10 group-hover:border-violet-iq/30 group-hover:shadow-lg group-hover:shadow-violet-iq/10 transition-all">
                <svg className="w-7 h-7 text-violet-iq" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h2 className="font-heading text-lg font-semibold text-white mb-1.5">Mode Administrateur</h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                Gérer les établissements, filières, matières, années académiques, niveaux d'étude et classes
              </p>
              <div className="mt-4 flex items-center justify-center gap-1 text-xs text-violet-iq opacity-0 group-hover:opacity-100 transition-opacity">
                <span>Continuer</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </button>
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={() => handleChoose('teacher')}
              className="text-xs text-muted/60 hover:text-text-secondary transition-colors"
            >
              Accéder au mode enseignant par défaut
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
