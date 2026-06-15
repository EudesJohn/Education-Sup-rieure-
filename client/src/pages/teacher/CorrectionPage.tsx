/** Page de correction — Salle d'Examen. */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { api } from '@/services/api'

interface CorrectionData {
  submission: {
    id: number; student_name: string; student_number: string
    class_name: string | null; university: string | null
    submitted_at: string; auto_submitted: boolean
  }
  exam_content: string
  student_content: string
  correction: {
    id: number | null; ai_score: number | null; ai_feedback: string | null
    ai_detailed_scores: string | null; ai_corrected_at: string | null
    teacher_score: number | null; teacher_feedback: string | null
    final_score: number | null; correction_status: string; grading_system: string
  }
}

function CorrectionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    teacher_reviewed: 'badge-completed', ai_corrected: 'badge-warning', pending: 'badge-draft',
  }
  const labels: Record<string, string> = {
    teacher_reviewed: 'Validée', ai_corrected: 'Corrigée IA', pending: 'En attente',
  }
  return <span className={`badge ${styles[status] || 'badge-draft'}`}>{labels[status] || status}</span>
}

export function CorrectionPage() {
  const { sessionId, submissionId } = useParams<{ sessionId: string; submissionId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<CorrectionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [teacherScore, setTeacherScore] = useState('')
  const [teacherFeedback, setTeacherFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [runningAI, setRunningAI] = useState(false)

  useEffect(() => { if (submissionId) fetchSubmission() }, [submissionId])

  const fetchSubmission = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/grading/submissions/${submissionId}`)
      const d = res.data as CorrectionData; setData(d)
      if (d.correction?.teacher_score !== null) {
        setTeacherScore(String(d.correction.teacher_score))
        setTeacherFeedback(d.correction.teacher_feedback || '')
      }
    } catch (err: any) { setError(err.response?.data?.detail || 'Erreur de chargement') }
    finally { setLoading(false) }
  }

  const handleAICorrection = async () => {
    setRunningAI(true)
    try { await api.post(`/grading/submissions/${submissionId}/correct-ai`); fetchSubmission() }
    catch (err: any) { setError(err.response?.data?.detail || 'Erreur de correction IA') }
    finally { setRunningAI(false) }
  }

  const handleSaveReview = async () => {
    if (!data?.correction?.id) return; setSaving(true)
    try {
      await api.post(`/grading/corrections/${data.correction.id}/review`, {
        teacher_score: parseFloat(teacherScore), teacher_feedback: teacherFeedback,
      }); fetchSubmission()
    } catch (err: any) { setError(err.response?.data?.detail || 'Erreur lors de la sauvegarde') }
    finally { setSaving(false) }
  }

  const renderContent = (content: string) => {
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) {
        return parsed.map((item: any, idx: number) => (
          <div key={idx} className="mb-4 p-4 bg-slate-mid/30 rounded-md border border-marge">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm text-white">{item.exercise_title || item.exercise_id}</h4>
              <span className="text-xs text-muted">{item.points} pts</span>
            </div>
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{item.content || item.instructions}</p>
          </div>
        ))
      }
    } catch {}
    return <div className="prose prose-sm max-w-none whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: content }} />
  }

  if (loading) {
    return <Layout title="Correction"><div className="text-center py-12 text-muted">Chargement...</div></Layout>
  }
  if (!data) {
    return <Layout title="Correction"><div className="text-center py-12 text-correcteur">{error || 'Données introuvables'}</div></Layout>
  }

  const maxScore = data.correction.grading_system === '20' ? 20
    : data.correction.grading_system === '100' ? 100
    : data.correction.grading_system === '10' ? 10 : 20

  return (
    <Layout title={`Correction — ${data.submission.student_name}`}>
      <div className="space-y-5">
        {error && (
          <div className="bg-correcteur-clair border border-correcteur/20 text-correcteur px-4 py-3 rounded-md text-sm animate-fade-in">{error}</div>
        )}

        {/* Info étudiant */}
        <div className="card card-hover p-4 text-sm animate-fade-in">
          <div className="flex flex-wrap items-center gap-4 lg:gap-6">
            <span className="text-text-secondary">Étudiant : <strong className="text-white">{data.submission.student_name}</strong></span>
            <span className="text-text-secondary">N° : <strong className="text-white">{data.submission.student_number}</strong></span>
            <span className="text-text-secondary">Classe : <strong className="text-white">{data.submission.class_name || '-'}</strong></span>
            <span className="text-text-secondary">Soumis le : <strong className="text-white">{new Date(data.submission.submitted_at).toLocaleString('fr-FR')}</strong></span>
            <span className="ml-auto"><CorrectionStatusBadge status={data.correction.correction_status} /></span>
          </div>
        </div>

        {/* Vue côte-à-côte */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card-plain overflow-hidden animate-fade-in-up"
            style={{ animationDelay: '0.1s' }}>
            <div className="px-4 py-3 bg-slate-mid/30 border-b border-marge">
              <h3 className="font-medium text-sm text-white">📋 Épreuve originale</h3>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto text-sm">{renderContent(data.exam_content)}</div>
          </div>
          <div className="card-plain overflow-hidden animate-fade-in-up"
            style={{ animationDelay: '0.2s' }}>
            <div className="px-4 py-3 bg-slate-mid/30 border-b border-marge">
              <h3 className="font-medium text-sm text-white">📝 Copie de l'étudiant</h3>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto text-sm whitespace-pre-wrap">
              {data.student_content || <span className="text-muted italic">Copie vide (soumission automatique)</span>}
            </div>
          </div>
        </div>

        {/* Section correction */}
        <div className="card-plain">
          <div className="px-5 py-4 border-b border-marge">
            <h3 className="font-heading font-semibold text-white">Correction</h3>
          </div>
          <div className="p-5 space-y-5">
            {/* Résultat IA */}
            {data.correction.ai_score !== null && (
              <div className="p-5 bg-vert-moyen/5 rounded-md border border-vert-moyen/20">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm text-neon-cyan">Correction IA</h4>
                  <span className="text-xl font-heading font-bold text-neon-cyan">{data.correction.ai_score}/{maxScore}</span>
                </div>
                <p className="text-sm text-neon-cyan/80 whitespace-pre-wrap">{data.correction.ai_feedback || 'Aucun feedback'}</p>
                {data.correction.ai_detailed_scores && (
                  <div className="mt-3 pt-3 border-t border-vert-moyen/20">
                    <h5 className="text-xs font-medium text-neon-cyan mb-2">Détail par exercice :</h5>
                    <pre className="text-xs text-neon-cyan/70 whitespace-pre-wrap">
                      {(() => {
                        try {
                          const scores = JSON.parse(data.correction.ai_detailed_scores)
                          return scores.map((s: any, i: number) =>
                            `${i + 1}. ${s.exercise || 'Exercice'}: ${s.score}/${s.max_points || '?'} — ${s.comment || ''}`
                          ).join('\n')
                        } catch { return data.correction.ai_detailed_scores }
                      })()}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Pas de correction IA */}
            {data.correction.correction_status === 'pending' && (
              <div className="text-center py-6">
                <p className="text-sm text-text-secondary mb-3">Cette copie n'a pas encore été corrigée par l'IA.</p>
                <button onClick={handleAICorrection} disabled={runningAI}
                  className="btn btn-primary">
                  {runningAI ? 'Correction IA en cours...' : 'Lancer la correction IA'}
                </button>
              </div>
            )}

            {/* Révision enseignant */}
            <div className="border-t border-marge pt-5">
              <h4 className="font-medium text-sm text-white mb-4">Révision enseignant</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Note ({data.correction.grading_system})</label>
                  <input type="number" value={teacherScore} onChange={(e) => setTeacherScore(e.target.value)}
                    step="0.5" min="0" max={maxScore}
                    className="input" placeholder={`Note /${maxScore}`} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white mb-1.5">Feedback</label>
                  <textarea value={teacherFeedback} onChange={(e) => setTeacherFeedback(e.target.value)}
                    rows={2} className="input resize-none"
                    placeholder="Commentaire pédagogique..." />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveReview} disabled={saving || !data.correction.id}
                  className="btn btn-primary font-semibold">
                  {saving ? 'Sauvegarde...' : 'Valider la correction'}
                </button>
                <button onClick={() => navigate(`/teacher/sessions/${sessionId}`)}
                  className="btn btn-ghost">
                  Retour à la session
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
