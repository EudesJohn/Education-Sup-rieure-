/** Tableau de bord enseignant — Deep Focus. */

import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { PlusIcon, DocIcon, ChartIcon, CheckCircleIcon, ClockIcon, BrainIcon, SparklesIcon } from '@/components/icons'
import { AdminListSkeleton } from '@/components/Skeleton'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { ExamSession } from '@/types'

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
            <AdminListSkeleton rows={3} />
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
