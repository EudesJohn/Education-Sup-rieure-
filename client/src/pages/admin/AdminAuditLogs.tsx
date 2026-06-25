/** Admin — Consultation des logs d'audit. */

import { useState, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { adminApi } from '@/services/api'
import type { AuditLogEntry, AuditLogsResponse } from '@/types'

const ACTOR_TYPES = ['', 'teacher', 'admin', 'student', 'system']
const ACTIONS = [
  '',
  'access_codes_generated',
  'student_authenticated_by_pin',
  'student_list_upload',
  'student_list_created',
  'student_list_deleted',
  'list_assigned_to_session',
  'matricule_verification_blocked',
  'matricule_verification_failed',
  'document_uploaded',
  'document_deleted',
]
const RESOURCE_TYPES = ['', 'session', 'student_list', 'pedagogical_document']

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function ActorIcon({ actorType }: { actorType: string }) {
  switch (actorType) {
    case 'teacher':
      return <span className="text-neon-cyan" title="Enseignant">👨‍🏫</span>
    case 'admin':
      return <span className="text-amber-iq" title="Administrateur">🛡️</span>
    case 'student':
      return <span className="text-vert-exam" title="Étudiant">🎓</span>
    case 'system':
      return <span className="text-muted" title="Système">⚙️</span>
    default:
      return <span className="text-muted">❓</span>
  }
}

export function AdminAuditLogs() {
  const [data, setData] = useState<AuditLogsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actorType, setActorType] = useState('')
  const [action, setAction] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [skip, setSkip] = useState(0)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const limit = 50

  useEffect(() => {
    setSkip(0)
  }, [actorType, action, resourceType])

  useEffect(() => {
    fetchLogs()
  }, [actorType, action, resourceType, skip])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      const res = await adminApi.listAuditLogs({
        actor_type: actorType || undefined,
        action: action || undefined,
        resource_type: resourceType || undefined,
        skip,
        limit,
      })
      setData(res.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0
  const currentPage = Math.floor(skip / limit) + 1

  return (
    <Layout title="Journal d'audit">
      <div className="space-y-5">
        {error && (
          <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Filtres */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[140px]">
            <label className="block text-xs text-muted/60 mb-1">Acteur</label>
            <select value={actorType} onChange={(e) => setActorType(e.target.value)} className="input text-sm py-1.5">
              <option value="">Tous</option>
              {ACTOR_TYPES.filter(Boolean).map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-xs text-muted/60 mb-1">Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value)} className="input text-sm py-1.5">
              <option value="">Toutes</option>
              {ACTIONS.filter(Boolean).map((a) => (
                <option key={a} value={a}>{formatAction(a)}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs text-muted/60 mb-1">Ressource</label>
            <select value={resourceType} onChange={(e) => setResourceType(e.target.value)} className="input text-sm py-1.5">
              <option value="">Toutes</option>
              {RESOURCE_TYPES.filter(Boolean).map((r) => (
                <option key={r} value={r}>{formatAction(r)}</option>
              ))}
            </select>
          </div>
          <div className="text-xs text-muted/40 pb-1">
            {data ? `${data.total} résultat(s)` : ''}
          </div>
        </div>

        {/* Tableau */}
        {loading ? (
          <div className="text-center py-12 text-muted">
            <svg className="animate-spin w-5 h-5 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Chargement...
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="text-center py-12 text-muted/50">
            <p className="text-lg mb-2">Aucun log</p>
            <p className="text-sm">Aucune activité enregistrée pour les filtres sélectionnés.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-marge/30 text-muted/60 text-xs uppercase tracking-wider">
                  <th className="text-left py-3 px-3 font-medium">Date</th>
                  <th className="text-left py-3 px-3 font-medium">Acteur</th>
                  <th className="text-left py-3 px-3 font-medium">Action</th>
                  <th className="text-left py-3 px-3 font-medium">Ressource</th>
                  <th className="text-left py-3 px-3 font-medium">IP</th>
                  <th className="w-8 py-3 px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-marge/20">
                {data.data.map((entry) => (
                  <tr key={entry.id}
                    className={`hover:bg-white/[0.03] transition-colors ${expandedRow === entry.id ? 'bg-white/[0.05]' : ''}`}>
                    <td className="py-2.5 px-3 text-white/80 whitespace-nowrap text-xs">
                      {new Date(entry.created_at).toLocaleString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <ActorIcon actorType={entry.actor_type} />
                        <span className="text-white capitalize">{entry.actor_type}</span>
                        {entry.actor_id != null && (
                          <span className="text-muted/40 text-xs">#{entry.actor_id}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="badge badge-draft text-xs">{formatAction(entry.action)}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white/60 text-xs capitalize">{formatAction(entry.resource_type)}</span>
                        {entry.resource_id != null && (
                          <span className="text-muted/40 text-xs">#{entry.resource_id}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-muted/50 text-xs font-mono">
                      {entry.ip_address || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {entry.details && (
                        <button
                          onClick={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}
                          className="text-muted/40 hover:text-white transition-colors text-xs"
                          title="Voir les détails"
                        >
                          {expandedRow === entry.id ? '▲' : '▼'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Détails dépliés */}
            {expandedRow != null && (() => {
              const entry = data.data.find((e) => e.id === expandedRow)
              if (!entry?.details) return null
              let parsed: any = null
              try { parsed = JSON.parse(entry.details) } catch { /* pas du JSON */ }
              return (
                <div className="bg-white/[0.04] border-t border-marge/20 px-4 py-3 animate-fade-in">
                  <p className="text-xs text-muted/60 mb-1.5">Détails</p>
                  {parsed ? (
                    <pre className="text-xs text-white/70 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {JSON.stringify(parsed, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-xs text-white/70">{entry.details}</p>
                  )}
                </div>
              )
            })()}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-3 border-t border-marge/20">
                <button
                  onClick={() => setSkip(Math.max(0, skip - limit))}
                  disabled={skip === 0}
                  className="btn btn-ghost btn-xs disabled:opacity-30"
                >
                  ← Précédent
                </button>
                <span className="text-xs text-muted/60">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => { if (skip + limit < data.total) setSkip(skip + limit) }}
                  disabled={skip + limit >= data.total}
                  className="btn btn-ghost btn-xs disabled:opacity-30"
                >
                  Suivant →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
