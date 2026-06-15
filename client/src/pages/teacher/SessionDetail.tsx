/** Détail d'une session — Salle d'Examen. */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { api } from '@/services/api'
import type { ExamSession } from '@/types'

interface SubmissionInfo {
  submission_id: number; student_name: string; student_number: string
  class_name: string | null; submitted_at: string; auto_submitted: boolean
  correction_status: string; final_score: number | null; ai_score: number | null
}

interface SessionWithExams extends ExamSession {
  exams_generated?: number; exams_pending?: number; exams_started?: number; exams_submitted?: number
}

export function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionWithExams | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [correcting, setCorrecting] = useState(false)
  const [correctingAll, setCorrectingAll] = useState(false)
  const [stats, setStats] = useState({ total: 0, waiting: 0, corrected: 0 })
  const [exercises, setExercises] = useState<any[]>([])
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<number[]>([])
  const [generating, setGenerating] = useState(false)
  const [showExercisePicker, setShowExercisePicker] = useState(false)

  useEffect(() => { if (id) fetchSession() }, [id])
  useEffect(() => { if (id) fetchSubmissions() }, [id, statusFilter])

  const fetchSession = async () => {
    try { const res = await api.get(`/teacher/sessions/${id}`); setSession(res.data) }
    catch (err: any) { setError(err.response?.data?.detail || 'Session introuvable') }
  }

  const fetchSubmissions = async () => {
    setLoading(true)
    try {
      const params = statusFilter ? { status: statusFilter } : {}
      const res = await api.get(`/grading/sessions/${id}/submissions`, { params })
      const data = res.data; const subs: SubmissionInfo[] = data.items || data
      setSubmissions(subs)
      setStats({
        total: subs.length,
        waiting: subs.filter((s) => s.correction_status === 'pending').length,
        corrected: subs.filter((s) => s.correction_status !== 'pending').length,
      })
    } catch (err: any) { setError(err.response?.data?.detail || 'Erreur de chargement') }
    finally { setLoading(false) }
  }

  const fetchExercises = async () => {
    try { const res = await api.get('/exams/exercises'); const data = res.data; setExercises(data.items || data) }
    catch (err: any) { setError(err.response?.data?.detail || 'Erreur de chargement des exercices') }
  }

  const openExercisePicker = () => { fetchExercises(); setShowExercisePicker(true) }
  const toggleExercise = (id: number) =>
    setSelectedExerciseIds((prev) => prev.includes(id) ? prev.filter((eid) => eid !== id) : [...prev, id])

  const handleGenerateExams = async () => {
    if (selectedExerciseIds.length === 0) return; setGenerating(true); setError('')
    try {
      await api.post(`/teacher/sessions/${id}/generate-exams`, { exercise_ids: selectedExerciseIds })
      setShowExercisePicker(false); setSelectedExerciseIds([]); await fetchSession()
    } catch (err: any) { setError(err.response?.data?.detail || 'Erreur lors de la génération') }
    finally { setGenerating(false) }
  }

  const handleLaunch = async () => {
    try { const res = await api.post(`/teacher/sessions/${id}/launch`); setSession(res.data) }
    catch (err: any) { setError(err.response?.data?.detail || 'Erreur au lancement') }
  }

  const handleComplete = async () => {
    if (!confirm('Terminer cette session ? Les étudiants ne pourront plus soumettre leur copie.')) return
    try { const res = await api.post(`/teacher/sessions/${id}/complete`); setSession(res.data) }
    catch (err: any) { setError(err.response?.data?.detail || 'Erreur lors de la fermeture') }
  }

  const handleCorrectSubmission = async (submissionId: number) => {
    setCorrecting(true)
    try { await api.post(`/grading/submissions/${submissionId}/correct-ai`); fetchSubmissions() }
    catch (err: any) { setError(err.response?.data?.detail || 'Erreur de correction') }
    finally { setCorrecting(false) }
  }

  const handleCorrectAll = async () => {
    if (!confirm(`Lancer la correction IA pour les ${stats.waiting} copies en attente ?`)) return
    setCorrectingAll(true)
    try { await api.post(`/grading/sessions/${id}/correct-all`); fetchSubmissions() }
    catch (err: any) { setError(err.response?.data?.detail || 'Erreur de correction automatique') }
    finally { setCorrectingAll(false) }
  }

  const hasGeneratedExams = (session?.exams_generated ?? 0) > 0

  if (!session && loading) {
    return (
      <Layout title="Session">
        <div className="text-center py-12 text-muted">
          <svg className="animate-spin w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={session?.title || 'Détail de la session'}>
      <div className="space-y-5">
        {error && (
          <div className="bg-correcteur-clair border border-correcteur/20 text-correcteur px-4 py-3 rounded-md text-sm animate-fade-in">{error}</div>
        )}

        {/* Info session */}
        {session && (
          <div className="card p-6 animate-fade-in">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-xl font-heading font-semibold text-white">{session.title}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                  {[
                    { label: 'Matière', value: session.subject },
                    { label: 'Durée', value: `${Math.floor(session.duration_seconds / 60)} min` },
                    { label: 'Étudiants', value: String(session.student_count) },
                    { label: 'Code', value: session.access_code, mono: true },
                    { label: 'Notation', value: `/${session.grading_system}` },
                    { label: 'Correction', value: session.correction_mode.replace(/_/g, ' + ') },
                    { label: 'Épreuves génér.', value: String(session.exams_generated ?? 0) },
                    { label: 'Soumises', value: String(session.exams_submitted ?? 0) },
                  ].map((item) => (
                    <div key={item.label}>
                      <span className="text-text-secondary text-xs">{item.label}</span>
                      <p className={`font-medium text-white ${item.mono ? 'font-mono text-neon-cyan' : ''}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {session.status === 'draft' && (
                  <>
                    {!hasGeneratedExams && (
                      <button onClick={openExercisePicker} className="btn btn-primary text-sm">
                        Générer les épreuves
                      </button>
                    )}
                    {hasGeneratedExams && (
                      <button onClick={handleLaunch} className="btn btn-primary text-sm">
                        Lancer la session
                      </button>
                    )}
                  </>
                )}
                {session.status === 'active' && (
                  <button onClick={handleComplete} className="btn btn-primary text-sm">
                    Terminer la session
                  </button>
                )}
                {(session.status === 'completed' || session.status === 'active') && (
                  <Link to={`/teacher/sessions/${id}/results`}
                    className="btn btn-secondary text-sm">
                    Résultats
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Exercise picker modal */}
        {showExercisePicker && (
          <div className="card animate-scale-in overflow-hidden">
            <div className="px-5 py-4 border-b border-marge flex items-center justify-between">
              <h3 className="font-heading font-semibold text-white">Sélectionner les exercices</h3>
              <button onClick={() => setShowExercisePicker(false)}
                className="text-muted hover:text-white transition-colors p-1">✕</button>
            </div>
            <div className="p-5 max-h-[50vh] overflow-y-auto space-y-2">
              {exercises.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-text-secondary mb-2">Aucun exercice dans votre banque.</p>
                  <Link to="/teacher/exercises"
                    className="text-sm text-neon-cyan hover:text-neon-cyan font-medium">
                    Créer des exercices d'abord →
                  </Link>
                </div>
              ) : (
                exercises.map((ex: any) => {
                  const isSelected = selectedExerciseIds.includes(ex.id)
                  const variantCount = (ex.variants?.length || 0)
                  return (
                    <label key={ex.id}
                      className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        isSelected ? 'border-vert-moyen/40 bg-vert-moyen/5' : 'border-marge hover:border-muted bg-surface'
                      }`}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => toggleExercise(ex.id)}
                        className="w-4 h-4 text-neon-cyan rounded border-marge focus:ring-vert-moyen" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-white">{ex.title}</span>
                          <span className="text-xs text-text-secondary capitalize">{ex.exercise_type}</span>
                          <span className="text-xs text-text-secondary">{ex.points} pts</span>
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {ex.subject} — {variantCount} variante{variantCount > 1 ? 's' : ''}
                        </p>
                      </div>
                      {variantCount === 0 && (
                        <span className="text-xs text-correcteur font-medium">Aucune variante</span>
                      )}
                    </label>
                  )
                })
              )}
            </div>
            {exercises.length > 0 && (
              <div className="px-5 py-3 border-t border-marge flex items-center justify-between bg-slate-mid/30">
                <span className="text-sm text-text-secondary">{selectedExerciseIds.length} exercice(s) sélectionné(s)</span>
                <button onClick={handleGenerateExams}
                  disabled={selectedExerciseIds.length === 0 || generating}
                  className="btn btn-primary text-sm">
                  {generating ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Génération...
                    </span>
                  ) : 'Générer les épreuves'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Stats bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total copies', value: stats.total, color: 'text-white' },
            { label: 'En attente', value: stats.waiting, color: 'text-amber-iq' },
            { label: 'Corrigées', value: stats.corrected, color: 'text-neon-cyan' },
            { label: 'Progression', value: stats.total > 0 ? `${Math.round((stats.corrected / stats.total) * 100)}%` : '0%', color: 'text-neon-cyan' },
          ].map((stat, i) => (
            <div key={stat.label} className="card card-hover p-4 animate-fade-in-up"
              style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
              <p className="text-sm text-text-secondary">{stat.label}</p>
              <p className={`text-2xl font-heading font-semibold mt-0.5 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 items-center">
          <button onClick={handleCorrectAll} disabled={correctingAll || stats.waiting === 0}
            className="btn btn-primary text-sm">
            {correctingAll ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Correction en cours...
              </span>
            ) : `Corriger tout (${stats.waiting})`}
          </button>
          <select value={statusFilter || ''} onChange={(e) => setStatusFilter(e.target.value || null)}
            className="input w-auto">
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="ai_corrected">Corrigée IA</option>
            <option value="teacher_reviewed">Validée</option>
          </select>
        </div>

        {/* Tableau des soumissions */}
        <div className="card-plain overflow-hidden">
          <div className="px-5 py-4 border-b border-marge">
            <h3 className="font-heading font-semibold text-white">Copies soumises ({submissions.length})</h3>
          </div>

          {loading ? (
            <div className="p-12 text-center text-muted">Chargement...</div>
          ) : submissions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 bg-slate-mid/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <p className="text-text-secondary font-medium">Aucune copie soumise</p>
              <p className="text-xs text-text-secondary mt-1">Les copies apparaîtront ici une fois les étudiants connectés.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-marge bg-slate-mid/30">
                    {['Étudiant', 'N° étudiant', 'Soumis le', 'Statut', 'Note IA', 'Note finale', ''].map((h) => (
                      <th key={h} className="text-left px-5 py-3 font-medium text-text-secondary text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-marge/50">
                  {submissions.map((sub, i) => (
                    <tr key={sub.submission_id} className="hover:bg-slate-mid/30 transition-all duration-200"
                      style={{ animationDelay: `${i * 0.035}s` }}>
                      <td className="px-5 py-3.5 font-medium text-white">{sub.student_name}</td>
                      <td className="px-5 py-3.5 text-text-secondary">{sub.student_number}</td>
                      <td className="px-5 py-3.5 text-text-secondary text-xs">
                        {new Date(sub.submitted_at).toLocaleString('fr-FR')}
                        {sub.auto_submitted && <span className="ml-1.5 text-amber-iq" title="Soumission automatique">auto</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`badge ${
                          sub.correction_status === 'pending' ? 'badge-draft' :
                          sub.correction_status === 'ai_corrected' ? 'badge-warning' : 'badge-completed'
                        }`}>
                          {sub.correction_status === 'pending' ? 'En attente'
                            : sub.correction_status === 'ai_corrected' ? 'Corrigée (IA)'
                            : 'Validée'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary">
                        {sub.ai_score !== null ? `${sub.ai_score}/20` : '-'}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-white">
                        {sub.final_score !== null ? `${sub.final_score}/${session?.grading_system || '20'}` : '-'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-1.5 justify-end">
                          {sub.correction_status === 'pending' && (
                            <button onClick={() => handleCorrectSubmission(sub.submission_id)} disabled={correcting}
                              className="btn-secondary text-xs px-2.5 py-1">
                              Corriger
                            </button>
                          )}
                          <button onClick={() => navigate(`/teacher/sessions/${id}/correction/${sub.submission_id}`)}
                            className="btn-ghost text-xs px-2.5 py-1">
                            Voir
                          </button>
                        </div>
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
