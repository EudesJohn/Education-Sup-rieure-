/** RÃ©sultats d'une session â€” Salle d'Examen. */

import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { api } from '@/services/api'

interface ResultRow {
  submission_id: number | null; student_name: string; student_number: string; class_name: string | null
  submitted_at: string | null; correction_status: string
  ai_score: number | null; teacher_score: number | null; final_score: number | null
  grading_system: string
}

interface ResultsResponse {
  session_title: string; subject: string; grading_system: string
  total_students: number; corrected: number
  items: ResultRow[]; skip: number; limit: number
}

export function SessionResults() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ResultsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { if (id) fetchResults() }, [id])

  const fetchResults = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/grading/sessions/${id}/results`, { params: { limit: 500 } })
      setData(res.data)
    } catch (err: any) { setError(err.response?.data?.detail || 'Erreur de chargement des rÃ©sultats') }
    finally { setLoading(false) }
  }

  const handleExportCsv = async () => {
    try {
      const res = await api.get(`/grading/sessions/${id}/results/export`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a'); link.href = url
      link.setAttribute('download', `resultats_session_${id}.csv`)
      document.body.appendChild(link); link.click(); link.remove()
      window.URL.revokeObjectURL(url)
    } catch { setError("Erreur lors de l'export CSV") }
  }

  if (loading) {
    return (
      <Layout title="RÃ©sultats">
        <div className="text-center py-12 text-muted">
          <svg className="animate-spin w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </Layout>
    )
  }

  if (error && !data) {
    return (
      <Layout title="RÃ©sultats">
        <div className="text-center py-12">
          <p className="text-correcteur font-medium">{error || 'Session introuvable'}</p>
          <Link to="/teacher/sessions" className="text-neon-cyan hover:text-neon-cyan mt-2 inline-block text-sm">
            Retour aux sessions
          </Link>
        </div>
      </Layout>
    )
  }

  const items = data?.items || []
  const correctedItems = items.filter((r) => r.correction_status !== 'pending')
  const notSubmitted = (data?.total_students ?? 0) - items.filter((r) => r.submitted_at).length
  const scores = correctedItems.map((r) => r.final_score ?? r.ai_score ?? 0).filter((s) => s !== null) as number[]
  const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-'
  const maxScore = scores.length > 0 ? Math.max(...scores).toFixed(1) : '-'
  const minScore = scores.length > 0 ? Math.min(...scores).toFixed(1) : '-'
  const gradingSystem = data?.grading_system || '20'

  // Distribution
  const bins = Array.from({ length: 5 }, (_, i) => {
    const lower = (parseInt(gradingSystem) / 5) * i
    const upper = (parseInt(gradingSystem) / 5) * (i + 1)
    const count = scores.filter((s) => s >= lower && (i === 4 ? s <= upper : s < upper)).length
    return { label: `${Math.round(lower)}-${Math.round(upper)}`, count, pct: scores.length > 0 ? (count / scores.length) * 100 : 0 }
  })

  const filtered = search
    ? items.filter((r) => r.student_name.toLowerCase().includes(search.toLowerCase()) || r.student_number.toLowerCase().includes(search.toLowerCase()))
    : items

  return (
    <Layout title={data?.session_title || 'RÃ©sultats'}>
      <div className="space-y-5">
        {error && (
          <div className="bg-correcteur-clair border border-correcteur/20 text-correcteur px-4 py-3 rounded-md text-sm">{error}</div>
        )}

        {/* En-tÃªte */}
        <div className="card p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="text-xl font-heading font-semibold text-white">
                {data?.session_title || 'RÃ©sultats de la session'}
              </h2>
              <p className="text-sm text-text-secondary mt-1">{data?.subject}</p>
            </div>
            <div className="flex gap-2">
              <Link to={`/teacher/sessions/${id}`}
                className="btn btn-ghost text-sm">
                Retour Ã  la session
              </Link>
              <button onClick={handleExportCsv} className="btn btn-primary text-sm">
                Exporter CSV
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total Ã©tudiants', value: String(data?.total_students ?? 0), color: 'text-white' },
            { label: 'Copies corrigÃ©es', value: String(correctedItems.length), color: 'text-neon-cyan' },
            { label: 'Non soumises', value: String(Math.max(0, notSubmitted)), color: 'text-amber-iq' },
            { label: 'Moyenne', value: `${avg}/${gradingSystem}`, color: 'text-neon-cyan' },
            { label: 'Min / Max', value: `${minScore} / ${maxScore}`, color: 'text-white' },
          ].map((s, i) => (
            <div key={s.label} className="card card-hover p-4 animate-fade-in-up"
              style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
              <p className="text-xs text-text-secondary">{s.label}</p>
              <p className={`text-xl font-heading font-semibold mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Distribution */}
        {scores.length > 0 && (
          <div className="card p-6">
            <h3 className="font-heading font-semibold text-white mb-4">Distribution des notes</h3>
            <div className="flex items-end gap-2 h-24">
              {bins.map((bin, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-text-secondary font-medium">{Math.round(bin.pct)}%</span>
                  <div className="w-full rounded-sm bg-gradient-to-t from-vert-moyen to-vert-feuille transition-all"
                    style={{ height: `${Math.max(4, bin.pct * 1.2)}px` }} />
                  <span className="text-xs text-muted">{bin.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recherche */}
        <div className="relative">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un Ã©tudiant..."
            className="input pl-10" />
          <svg className="absolute left-3 top-3.5 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Tableau */}
        <div className="card-plain overflow-hidden">
          <div className="px-5 py-4 border-b border-marge flex items-center justify-between">
            <h3 className="font-heading font-semibold text-white">
              Notes ({filtered.length})
              {search && items.length !== filtered.length && (
                <span className="text-sm text-text-secondary ml-2 font-normal">filtrÃ©s sur {items.length}</span>
              )}
            </h3>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center text-muted">
              {search ? 'Aucun rÃ©sultat pour cette recherche.' : 'Aucune donnÃ©e disponible.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-marge bg-slate-mid/30">
                    {['Étudiant', 'N° étudiant', 'Statut', 'Note IA', 'Note enseignant', 'Note finale', ''].map((h) => (
                      <th key={h} className="text-left px-5 py-3 font-medium text-text-secondary text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-marge/50">
                  {filtered.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-mid/30 transition-all duration-200" style={{ animationDelay: `${idx * 0.03}s` }}>
                      <td className="px-5 py-3.5 font-medium text-white">{row.student_name}</td>
                      <td className="px-5 py-3.5 text-text-secondary">{row.student_number}</td>
                      <td className="px-5 py-3.5">
                        <span className={`badge ${
                          row.correction_status === 'teacher_reviewed' ? 'badge-completed' :
                          row.correction_status === 'ai_corrected' ? 'badge-warning' : 'badge-draft'
                        }`}>
                          {row.correction_status === 'teacher_reviewed' ? 'ValidÃ©e'
                            : row.correction_status === 'ai_corrected' ? 'CorrigÃ©e IA'
                            : 'En attente'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary">
                        {row.ai_score !== null ? `${row.ai_score}/${gradingSystem}` : '-'}
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary">
                        {row.teacher_score !== null ? `${row.teacher_score}/${gradingSystem}` : '-'}
                      </td>
                      <td className="px-5 py-3.5 font-bold">
                        {row.final_score !== null ? (
                          <span className="text-white">{row.final_score}/{gradingSystem}</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {row.submission_id && (
                          <button
                            onClick={() => navigate(`/teacher/sessions/${id}/correction/${row.submission_id}`)}
                            className="btn-ghost text-xs px-2.5 py-1 whitespace-nowrap"
                          >
                            Voir la copie
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
