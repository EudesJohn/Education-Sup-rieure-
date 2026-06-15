/** Tableau de bord enseignant — Deep Focus. */

import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { ExamSession } from '@/types'

/* ——— Icônes inline ——— */

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 0a3 3 0 013 3v1.5M12 6a3 3 0 00-3 3v1.5M12 6v12m0 0l-3-3m3 3l3-3m-6-6h6" />
    </svg>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  )
}

export function TeacherDashboard() {
  const navigate = useNavigate()
  const { teacher } = useAuthStore()
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [stats, setStats] = useState({
    total_sessions: 0,
    active_sessions: 0,
    total_exercises: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [sessionsRes, dashboardRes] = await Promise.all([
        api.get('/teacher/sessions'),
        api.get('/teacher/dashboard'),
      ])
      setSessions(sessionsRes.data.items || sessionsRes.data)
      setStats(dashboardRes.data)
    } catch {
      // Silencieux
    } finally {
      setLoading(false)
    }
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case 'active': return 'Active'
      case 'completed': return 'Terminée'
      default: return 'Brouillon'
    }
  }

  const statusBadge = (s: string) => {
    switch (s) {
      case 'active': return 'badge badge-active'
      case 'completed': return 'badge badge-completed'
      default: return 'badge badge-draft'
    }
  }

  return (
    <Layout title={`Bon retour, ${teacher?.full_name?.split(' ')[0] || 'Enseignant'}`}>
      <div className="space-y-6">

        {/* ===== Carte de profil glass ===== */}
        {teacher && (
          <div className="glass-card glass-card-hover animate-fade-in-up">
            <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-cyan/20 to-violet-iq/20 flex items-center justify-center border border-white/5 flex-shrink-0">
                <span className="text-white text-lg font-heading font-bold leading-none">
                  {teacher.full_name.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white">{teacher.full_name}</p>
                <p className="text-sm text-muted">
                  {teacher.institution}
                  {teacher.discipline && <span> — {teacher.discipline}</span>}
                </p>
              </div>
              <Link
                to="/teacher/sessions"
                className="btn btn-primary btn-sm sm:btn-lg shrink-0"
              >
                <PlusIcon className="w-4 h-4" />
                Nouvelle session
              </Link>
            </div>
          </div>
        )}

        {/* ===== Statistiques ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Sessions actives', value: stats.active_sessions, icon: ClockIcon, color: 'text-neon-cyan', gradient: 'from-neon-cyan/10 to-transparent' },
            { label: 'Total sessions', value: stats.total_sessions, icon: ChartIcon, color: 'text-violet-iq', gradient: 'from-violet-iq/10 to-transparent' },
            { label: 'Exercices créés', value: stats.total_exercises, icon: BrainIcon, color: 'text-amber-iq', gradient: 'from-amber-iq/10 to-transparent' },
            { label: 'Corrections IA', value: <SparklesIcon className="w-5 h-5" />, icon: SparklesIcon, color: 'text-neon-cyan', gradient: 'from-neon-cyan/10 to-transparent' },
          ].map((stat, i) => (
            <div key={stat.label} className={`
              relative overflow-hidden rounded-xl border border-white/5 bg-midnight/60
              card-hover animate-fade-in-up
            `}
              style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} pointer-events-none`} />
              <div className="relative p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <p className="font-heading text-2xl sm:text-3xl font-semibold text-white leading-none tracking-tight">
                  {loading ? (
                    <span className="inline-block w-10 h-7 bg-white/5 rounded shimmer" />
                  ) : stat.value}
                </p>
                <p className="text-sm text-muted mt-1">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ===== Actions rapides ===== */}
        <h2 className="font-heading text-lg font-semibold text-white">Actions rapides</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              to: '/teacher/sessions',
              title: 'Nouvelle session',
              desc: 'Configurez et lancez une épreuve',
              icon: PlusIcon,
              borderGlow: 'hover:border-neon-cyan/25',
              iconGradient: 'from-neon-cyan to-cyan-400',
              iconBg: 'bg-neon-cyan/10',
            },
            {
              to: '/teacher/exercises',
              title: 'Banque de questions',
              desc: 'Gérez vos exercices et variantes',
              icon: DocIcon,
              borderGlow: 'hover:border-violet-iq/25',
              iconGradient: 'from-violet-iq to-purple-400',
              iconBg: 'bg-violet-iq/10',
            },
            {
              to: '/teacher/sessions',
              title: 'Corrections',
              desc: 'Corrigez et validez les copies',
              icon: CheckCircleIcon,
              borderGlow: 'hover:border-amber-iq/25',
              iconGradient: 'from-amber-iq to-orange-400',
              iconBg: 'bg-amber-iq/10',
            },
          ].map((action, i) => (
            <Link
              key={action.title}
              to={action.to}
              className={`group relative overflow-hidden rounded-xl border border-white/5 bg-midnight/60 p-5 ${action.borderGlow} card-hover active:scale-[0.98]`}
              style={{ animationDelay: `${0.1 + i * 0.08}s` }}
            >
              <div className={`w-10 h-10 rounded-lg ${action.iconBg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}>
                <action.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-medium text-white group-hover:text-neon-cyan transition-colors duration-200">{action.title}</h3>
              <p className="text-sm text-muted mt-0.5">{action.desc}</p>
            </Link>
          ))}
        </div>

        {/* ===== Sessions récentes ===== */}
        <div className="rounded-xl border border-white/5 bg-midnight/60 overflow-hidden">
          {/* En-tête */}
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-heading font-semibold text-white">Sessions récentes</h3>
            <Link
              to="/teacher/sessions"
              className="text-sm text-neon-cyan hover:text-neon-cyan-dim font-medium transition-colors"
            >
              Voir tout →
            </Link>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="flex items-center justify-center gap-2 text-muted">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Chargement...
              </div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto mb-4 border border-white/5">
                <DocIcon className="w-8 h-8 text-muted/50" />
              </div>
              <p className="text-muted font-medium">Aucune session pour le moment</p>
              <Link
                to="/teacher/sessions"
                className="inline-block mt-3 text-sm text-neon-cyan hover:text-neon-cyan-dim font-medium transition-colors"
              >
                Créer votre première session
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {sessions.slice(0, 5).map((session, i) => (
                <div
                  key={session.id}
                  className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-all duration-200 cursor-pointer card-hover"
                  onClick={() => navigate(`/teacher/sessions/${session.id}`)}
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      session.status === 'active' ? 'bg-neon-cyan shadow-[0_0_8px_rgba(6,242,219,0.4)]' :
                      session.status === 'completed' ? 'bg-success' : 'bg-slate-mid'
                    }`} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-white truncate">{session.title}</p>
                      <p className="text-xs text-muted mt-0.5 truncate">
                        {session.subject} — {session.student_count} étudiants
                      </p>
                    </div>
                  </div>
                  <span className={statusBadge(session.status) + ' shrink-0 ml-3'}>
                    {statusLabel(session.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
