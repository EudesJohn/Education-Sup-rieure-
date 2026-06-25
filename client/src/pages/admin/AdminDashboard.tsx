/** Administration PEAN — Salle d'Examen. */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { api } from '@/services/api'

interface AdminStats {
  total_teachers: number; total_sessions: number; active_sessions: number
  total_exercises: number; total_submissions: number; total_incidents: number
  total_corrections: number; incident_breakdown: Record<string, number>
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [recentIncidents, setRecentIncidents] = useState<any[]>([])
  const [activeSessions, setActiveSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const [statsRes, incidentsRes, sessionsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/incidents', { params: { limit: 5 } }),
        api.get('/admin/sessions', { params: { status: 'active' } }),
      ])
      setStats(statsRes.data); setRecentIncidents(incidentsRes.data); setActiveSessions(sessionsRes.data)
    } catch (err: any) { setError(err.response?.data?.detail || 'Erreur de chargement') }
    finally { setLoading(false) }
  }

  return (
    <Layout title="Administration PEAN">
      <div className="space-y-5">
        {error && (
          <div className="bg-correcteur-clair border border-correcteur/20 text-correcteur px-4 py-3 rounded-md text-sm animate-fade-in">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted">
            <svg className="animate-spin w-6 h-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Chargement des statistiques...
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              {[
                { label: 'Enseignants', value: stats?.total_teachers ?? 0, color: 'text-neon-cyan' },
                { label: 'Sessions actives', value: stats?.active_sessions ?? 0, color: 'text-amber-iq' },
                { label: 'Sessions totales', value: stats?.total_sessions ?? 0, color: 'text-neon-cyan' },
                { label: 'Incidents', value: stats?.total_incidents ?? 0, color: 'text-correcteur' },
                { label: 'Exercices', value: stats?.total_exercises ?? 0, color: 'text-white-clair' },
                { label: 'Copies soumises', value: stats?.total_submissions ?? 0, color: 'text-muted' },
              ].map((stat, i) => (
                <div key={stat.label} className="card card-hover p-4 animate-fade-in-up"
                  style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                  <p className="text-xs text-text-secondary">{stat.label}</p>
                  <p className={`text-2xl font-heading font-semibold mt-1 ${stat.color}`}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Incidents breakdown */}
            {stats?.incident_breakdown && Object.keys(stats.incident_breakdown).length > 0 && (
              <div className="card card-hover p-5">
                <h3 className="font-heading font-semibold text-white mb-4">Types d'incidents</h3>
                <div className="space-y-2">
                  {Object.entries(stats.incident_breakdown).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between text-sm py-1.5 px-3 rounded-md hover:bg-white/[0.03]">
                      <span className="text-text-secondary capitalize">{type.replace(/_/g, ' ')}</span>
                      <span className="font-semibold text-white">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grille */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Sessions actives */}
              <div className="card-plain card-hover overflow-hidden">
                <div className="px-5 py-4 border-b border-marge">
                  <h3 className="font-heading font-semibold text-white">Sessions actives ({activeSessions.length})</h3>
                </div>
                {activeSessions.length === 0 ? (
                  <div className="p-8 text-center text-muted text-sm">Aucune session active pour le moment</div>
                ) : (
                  <div className="divide-y divide-marge/50">
                    {activeSessions.map((s: any) => (
                      <div key={s.id} className="px-5 py-4 hover:bg-white/[0.03] transition-colors">
                        <p className="font-medium text-sm text-white">{s.title}</p>
                        <p className="text-xs text-text-secondary mt-0.5">{s.teacher_name} — {s.subject} — {s.student_count} étudiants</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Incidents récents */}
              <div className="card-plain card-hover overflow-hidden">
                <div className="px-5 py-4 border-b border-marge">
                  <h3 className="font-heading font-semibold text-white">Incidents récents ({recentIncidents.length})</h3>
                </div>
                {recentIncidents.length === 0 ? (
                  <div className="p-8 text-center text-muted text-sm">Aucun incident de sécurité</div>
                ) : (
                  <div className="divide-y divide-marge/50">
                    {recentIncidents.map((inc: any) => (
                      <div key={inc.id} className="px-5 py-4 hover:bg-white/[0.03] transition-colors">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`badge ${
                            inc.severity === 'critical' || inc.severity === 'high' ? 'badge-danger' :
                            inc.severity === 'medium' ? 'badge-warning' : 'badge-draft'
                          }`}>
                            {inc.severity === 'critical' ? 'Critique'
                              : inc.severity === 'high' ? 'Élevée'
                              : inc.severity === 'medium' ? 'Moyenne'
                              : 'Basse'}
                          </span>
                          <span className="font-medium text-sm text-white capitalize">{inc.incident_type.replace(/_/g, ' ')}</span>
                        </div>
                        <p className="text-xs text-text-secondary">{inc.student_name} — {inc.session_title} — {new Date(inc.timestamp).toLocaleString('fr-FR')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Lien rapide vers le journal d'audit */}
            <Link to="/admin/audit-logs" className="block card-plain card-hover p-5 text-center group">
              <p className="font-heading font-semibold text-white group-hover:text-violet-iq transition-colors">
                📋 Voir le journal d'audit
              </p>
              <p className="text-xs text-text-secondary mt-1">Actions administrateurs, enseignants et système</p>
            </Link>
          </>
        )}
      </div>
    </Layout>
  )
}
