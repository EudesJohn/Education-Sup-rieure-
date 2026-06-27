/** Page de correction — RF-10.
 *
 * Fonctionnalités :
 * 1. Vue côte-à-côte épreuve / copie
 * 2. Correction IA avec scores détaillés
 * 3. Annotations sur la copie (sélection de texte + commentaire)
 * 4. Navigation entre soumissions (précédent / suivant)
 * 5. Grille d'évaluation (rubric)
 * 6. Révision enseignant (note + feedback)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { gradingApi } from '@/services/api'

// Rendu de formules LaTeX dans le texte
import katex from 'katex'
import DOMPurify from 'dompurify'

// ---- Types locaux ----

interface SubmissionData {
  id: number; student_name: string; student_number: string
  class_name: string | null; university: string | null
  submitted_at: string; auto_submitted: boolean
}

interface CorrectionData {
  id: number | null; ai_score: number | null; ai_feedback: string | null
  ai_detailed_scores: string | null; ai_corrected_at: string | null
  teacher_score: number | null; teacher_feedback: string | null
  final_score: number | null; correction_status: string; grading_system: string
}

interface CorrectionDetail {
  submission: SubmissionData
  exam_content: string
  student_content: string
  correction: CorrectionData
}

interface Annotation {
  id: number; correction_id: number; submission_id: number
  annotation_type: string; selection_start: number | null
  selection_end: number | null; selected_text: string | null
  content: string; score: number | null; max_score: number | null
  is_resolved: boolean; created_at: string
}

interface NavEntry {
  submission_id: number; student_name: string; student_number: string
}

interface RubricCriterion {
  id: string; name: string; max_points: number; description?: string
}

interface Rubric {
  id: number; title: string; description?: string
  criteria: RubricCriterion[]; max_score: number | null
}

// ---- Helpers ----

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    teacher_reviewed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    ai_corrected: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    pending: 'bg-white/[0.06] text-muted/60 border-white/10',
  }
  const labels: Record<string, string> = {
    teacher_reviewed: 'Validée', ai_corrected: 'Corrigée IA', pending: 'En attente',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${styles[status] || 'bg-white/[0.06]'}`}>
      {labels[status] || status}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// =============================================================
// PAGE PRINCIPALE
// =============================================================

export function CorrectionPage() {
  const { sessionId, submissionId } = useParams<{ sessionId: string; submissionId: string }>()
  const navigate = useNavigate()

  const [data, setData] = useState<CorrectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Annotation state
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false)
  const [newAnnotation, setNewAnnotation] = useState({ content: '', annotation_type: 'comment' })

  // Navigation state
  const [navList, setNavList] = useState<NavEntry[]>([])
  const [currentNavIdx, setCurrentNavIdx] = useState(-1)

  // Revision state
  const [teacherScore, setTeacherScore] = useState('')
  const [teacherFeedback, setTeacherFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [runningAI, setRunningAI] = useState(false)

  // Rubric state
  const [rubrics, setRubrics] = useState<Rubric[]>([])
  const [selectedRubric, setSelectedRubric] = useState<Rubric | null>(null)
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({})

  // ---- Chargement ----

  const fetchSubmission = useCallback(async () => {
    if (!submissionId) return
    setLoading(true); setError('')
    try {
      const res = await gradingApi.getSubmissionDetail(Number(submissionId))
      const d = res.data as CorrectionDetail; setData(d)
      if (d.correction.teacher_score !== null) {
        setTeacherScore(String(d.correction.teacher_score))
        setTeacherFeedback(d.correction.teacher_feedback || '')
      } else {
        // Pre-fill AI score as default teacher score
        setTeacherScore(d.correction.ai_score !== null ? String(d.correction.ai_score) : '')
        setTeacherFeedback(d.correction.ai_feedback || '')
      }
      // Load annotations
      fetchAnnotations(Number(submissionId))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally { setLoading(false) }
  }, [submissionId])

  const fetchAnnotations = async (subId: number) => {
    try {
      const res = await gradingApi.getAnnotations(subId)
      setAnnotations(res.data)
    } catch { /* ignore */ }
  }

  const fetchNavigation = useCallback(async () => {
    if (!sessionId || !submissionId) return
    try {
      const res = await gradingApi.getSubmissionNavigation(Number(sessionId), Number(submissionId))
      setNavList(res.data.submissions || [])
      setCurrentNavIdx(res.data.current_index ?? -1)
    } catch { /* ignore */ }
  }, [sessionId, submissionId])

  /** Rendu d'un texte contenant des formules LaTeX ($...$ et \[...\]) */
  const renderFormattedText = (text: string): string => {
    if (!text) return ''
    // Remplacer les formules display \[...\] d'abord, puis inline $...$
    let html = text
      .replace(/\\\[(.+?)\\\]/gs, (_, formula) => {
        try {
          return katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })
        } catch { return `<span class="text-rose-400 text-xs">⚠️ ${DOMPurify.sanitize(formula)}</span>` }
      })
      .replace(/\$(.+?)\$/g, (_, formula) => {
        try {
          return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false })
        } catch { return `<span class="text-rose-400 text-xs">⚠️ ${DOMPurify.sanitize(formula)}</span>` }
      })
    return html
  }

  const fetchRubrics = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await gradingApi.getRubrics(Number(sessionId))
      setRubrics(res.data || [])
    } catch { /* ignore */ }
  }, [sessionId])

  useEffect(() => { fetchSubmission(); fetchNavigation(); fetchRubrics() }, [fetchSubmission, fetchNavigation, fetchRubrics])

  // ---- Actions ----

  const handleAICorrection = async () => {
    if (!submissionId) return; setRunningAI(true)
    try { await gradingApi.correctWithAI(Number(submissionId)); fetchSubmission() }
    catch (err: any) { setError(err.response?.data?.detail || 'Erreur de correction IA') }
    finally { setRunningAI(false) }
  }

  const handleSaveReview = async () => {
    if (!data?.correction?.id) return; setSaving(true)
    try {
      await gradingApi.teacherReview(data.correction.id, {
        teacher_score: parseFloat(teacherScore),
        teacher_feedback: teacherFeedback,
      })
      fetchSubmission()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la sauvegarde')
    } finally { setSaving(false) }
  }

  const handleAddAnnotation = async () => {
    if (!submissionId || !newAnnotation.content.trim()) return
    try {
      await gradingApi.addAnnotation(Number(submissionId), {
        content: newAnnotation.content,
        annotation_type: newAnnotation.annotation_type,
      })
      setNewAnnotation({ content: '', annotation_type: 'comment' })
      fetchAnnotations(Number(submissionId))
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur d'annotation")
    }
  }

  const handleDeleteAnnotation = async (annId: number) => {
    if (!submissionId) return
    try { await gradingApi.deleteAnnotation(Number(submissionId), annId); fetchAnnotations(Number(submissionId)) }
    catch { /* ignore */ }
  }

  const navigateToSubmission = (subId: number) => {
    navigate(`/teacher/sessions/${sessionId}/correction/${subId}`, { replace: true })
  }

  // ---- Rendu du contenu ----

  const renderContent = (content: string) => {
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) {
        return parsed.map((item: any, idx: number) => (
          <div key={idx} className="mb-4 p-4 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm text-white">{item.exercise_title || `Exercice ${idx + 1}`}</h4>
              <span className="text-xs text-muted/60">{item.points || item.max_points || '?'} pts</span>
            </div>
            {item.instructions && (
              <p className="text-xs text-muted/50 italic mb-2">{item.instructions}</p>
            )}
            <p className="text-sm text-white/80 whitespace-pre-wrap">{item.content || item.question || ''}</p>
          </div>
        ))
      }
    } catch {}
    return (
      <div className="prose prose-sm max-w-none prose-invert whitespace-pre-wrap text-sm text-white/80"
           dangerouslySetInnerHTML={{ __html: content }} />
    )
  }

  const renderStudentContent = (content: string, examContent: string) => {
    // Si vide, afficher un placeholder
    if (!content || content.trim() === '') {
      return (
        <div className="flex items-center justify-center h-48 text-muted/40 italic text-sm">
          Copie vide (soumission automatique)
        </div>
      )
    }

    // Essayer de parser la copie étudiante (toujours un objet JSON { exId: answer })
    let parsedContent: Record<string, string> | null = null
    try {
      const p = JSON.parse(content)
      if (typeof p === 'object' && p !== null && !Array.isArray(p)) {
        parsedContent = p
      }
    } catch { /* pas du JSON, affichage brut */ }

    // Essayer de parser l'épreuve (soit un tableau d'exercices, soit du texte brut)
    let exercises: any[] | null = null
    try {
      const e = JSON.parse(examContent)
      if (Array.isArray(e)) exercises = e
    } catch { /* épreuve en texte brut (mode partagé) */ }

    // CAS A : On a la copie + les exercices → affichage exercice par exercice
    if (exercises && parsedContent) {
      return exercises.map((ex: any, idx: number) => {
        const exId = ex.exercise_id || idx
        const answer = parsedContent![String(exId)] || ''

        const typeIcon = ex.exercise_type === 'qcm' ? '🔘'
          : ex.exercise_type === 'code' ? '💻'
          : ex.exercise_type === 'open' ? '✍️'
          : '📝'

        const isQCM = ex.exercise_type === 'qcm'
        const qcmChoices = isQCM ? parseQCMContent(ex.content || ex.instructions || '') : []

        return (
          <div key={exId} className="mb-4 p-4 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm text-white flex items-center gap-1.5">
                {typeIcon} {ex.exercise_title || `Exercice ${idx + 1}`}
                <span className="text-[10px] text-muted/50 font-mono">{ex.exercise_type}</span>
              </h4>
              <span className="text-xs text-muted/50">{ex.points} pts</span>
            </div>

            {ex.instructions && (
              <p className="text-xs text-muted/50 italic mb-2 border-l-2 border-white/10 pl-2">{ex.instructions}</p>
            )}

            {isQCM && answer ? (
              <div className="space-y-1.5">
                {qcmChoices.map((choice) => {
                  const letter = choice.charAt(0)
                  const isSelected = answer.toUpperCase() === letter
                  return (
                    <div key={letter}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isSelected
                          ? 'bg-neon-cyan/10 border border-neon-cyan/20 text-white font-medium'
                          : 'text-muted/60 border border-transparent'
                      }`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        isSelected ? 'bg-neon-cyan/20 text-neon-cyan' : 'bg-white/5 text-muted/40'
                      }`}>{letter}</span>
                      <span>{choice.substring(2)}</span>
                      {isSelected && <span className="ml-auto text-[10px] text-neon-cyan">✓ choisie</span>}
                    </div>
                  )
                })}
                {!answer.trim() && (
                  <p className="text-sm text-muted/40 italic">Aucune réponse</p>
                )}
              </div>
            ) : ex.exercise_type === 'code' ? (
              <pre className="text-sm text-white/80 bg-deep-space/80 rounded-lg p-3 font-mono leading-relaxed overflow-x-auto border border-white/5 whitespace-pre-wrap">
                {answer || <span className="italic text-muted/40">Aucun code</span>}
              </pre>
            ) : (
              <div className="text-sm text-white/80 leading-relaxed bg-deep-space/40 rounded-lg p-3 border border-white/5"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderFormattedText(answer)) }}
              />
            )}
          </div>
        )
      })
    }

    // CAS B : On a la copie JSON mais pas les exercices structurés (mode partagé)
    if (parsedContent) {
      const entries = Object.entries(parsedContent).filter(([_, v]) => v.trim())
      if (entries.length === 0) {
        return (
          <div className="flex items-center justify-center h-48 text-muted/40 italic text-sm">
            Copie vide (soumission automatique)
          </div>
        )
      }
      return (
        <div className="space-y-3">
          {entries.map(([key, answer]) => {
            // Vérifier si la réponse ressemble à du code
            const looksLikeCode = answer.includes('\n')
              && (answer.includes('{') || answer.includes(';') || answer.includes('def ') || answer.includes('function'))
            return (
              <div key={key} className="p-4 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <h4 className="font-medium text-sm text-white mb-2 flex items-center gap-1.5">
                  {looksLikeCode ? '💻' : '✍️'} Question {key}
                </h4>
                {looksLikeCode ? (
                  <pre className="text-sm text-white/80 bg-deep-space/80 rounded-lg p-3 font-mono border border-white/5 whitespace-pre-wrap overflow-x-auto">
                    {answer}
                  </pre>
                ) : (
                  <div className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed bg-deep-space/40 rounded-lg p-3 border border-white/5">
                    {answer}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )
    }

    // CAS C : Texte brut impossible à parser
    const html = renderFormattedText(content)
    return (
      <div className="text-sm text-white/80 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
      />
    )
  }

  /** Parse les choix QCM depuis le contenu texte (A)... (B)... etc. */
  const parseQCMContent = (content: string): string[] => {
    const choices: string[] = []
    const regex = /\(?([A-D])\)?\s*[.:)]?\s*(.+?)(?=\s*\(?[A-D]\)?\s*[.:)]?\s*|$)/g
    let match
    while ((match = regex.exec(content)) !== null) {
      const letter = match[1]
      const text = match[2].trim()
      if (['A', 'B', 'C', 'D'].includes(letter) && text) {
        choices.push(`${letter}) ${text}`)
      }
    }
    return choices.length === 4 ? choices : []
  }

  // ---- Loading / Error ----

  if (loading) {
    return (
      <Layout title="Correction">
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
            <p className="text-sm text-muted/60">Chargement de la copie...</p>
          </div>
        </div>
      </Layout>
    )
  }

  if (!data) {
    return (
      <Layout title="Correction">
        <div className="text-center py-20">
          <p className="text-rose-accent">{error || 'Données introuvables'}</p>
          <button onClick={() => navigate(-1)} className="btn-ghost mt-4 text-sm">
            Retour
          </button>
        </div>
      </Layout>
    )
  }

  const maxScore = data.correction.grading_system === '20' ? 20
    : data.correction.grading_system === '100' ? 100
    : data.correction.grading_system === '10' ? 10 : 20

  return (
    <Layout title={`${data.submission.student_name}`}>
      <div className="space-y-5">

        {/* Error banner */}
        {error && (
          <div className="p-3 rounded-lg bg-rose-accent/10 border border-rose-accent/20 text-rose-accent text-sm animate-fade-in flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        )}

        {/* Barre de navigation entre soumissions */}
        {navList.length > 1 && (
          <div className="card p-3 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted/60">Copie</span>
              <span className="font-medium text-white">{currentNavIdx + 1}</span>
              <span className="text-muted/40">/ {navList.length}</span>
            </div>
            <div className="flex gap-2">
              <button
                disabled={currentNavIdx <= 0}
                onClick={() => navigateToSubmission(navList[currentNavIdx - 1].submission_id)}
                className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30"
              >
                ← Précédent
              </button>
              <select
                value={data.submission.id}
                onChange={(e) => navigateToSubmission(Number(e.target.value))}
                className="input text-xs py-1.5 px-2 max-w-[180px]"
              >
                {navList.map((s) => (
                  <option key={s.submission_id} value={s.submission_id}>
                    {s.student_name} ({s.student_number})
                  </option>
                ))}
              </select>
              <button
                disabled={currentNavIdx < 0 || currentNavIdx >= navList.length - 1}
                onClick={() => navigateToSubmission(navList[currentNavIdx + 1].submission_id)}
                className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30"
              >
                Suivant →
              </button>
            </div>
          </div>
        )}

        {/* Info étudiant */}
        <div className="card p-4 animate-fade-in">
          <div className="flex flex-wrap items-center gap-3 lg:gap-5 text-sm">
            <span className="text-muted/60">
              Étudiant : <strong className="text-white">{data.submission.student_name}</strong>
            </span>
            <span className="text-muted/60">
              N° : <strong className="text-white">{data.submission.student_number}</strong>
            </span>
            {data.submission.class_name && (
              <span className="text-muted/60">
                Classe : <strong className="text-white">{data.submission.class_name}</strong>
              </span>
            )}
            <span className="text-muted/60">
              Soumis le : <strong className="text-white">{formatDate(data.submission.submitted_at)}</strong>
            </span>
            <span className="ml-auto">{statusBadge(data.correction.correction_status)}</span>
          </div>
        </div>

        {/* Vue côte-à-côte */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Épreuve originale */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
              <h3 className="font-medium text-sm text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
                Épreuve originale
              </h3>
            </div>
            <div className="p-4 max-h-[55vh] overflow-y-auto">
              {renderContent(data.exam_content)}
            </div>
          </div>

          {/* Copie étudiante + Annotations */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 bg-white/[0.03] border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-medium text-sm text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-iq" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                Copie de l'étudiant
              </h3>
              <button
                onClick={() => setShowAnnotationPanel(!showAnnotationPanel)}
                className={`btn-ghost text-xs px-3 py-1.5 ${showAnnotationPanel ? 'text-neon-cyan bg-neon-cyan/10' : ''}`}
              >
                <svg className="w-3.5 h-3.5 inline mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                Annotations ({annotations.length})
              </button>
            </div>
            <div className="p-4 max-h-[55vh] overflow-y-auto">
              {renderStudentContent(data.student_content, data.exam_content)}

              {/* Annotations existantes */}
              {annotations.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-2">
                  <h4 className="text-xs font-medium text-muted/60 uppercase tracking-wider">
                    Annotations
                  </h4>
                  {annotations.map((ann) => (
                    <div key={ann.id} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-medium text-muted/50 uppercase">
                              {ann.annotation_type === 'comment' ? 'Commentaire' :
                               ann.annotation_type === 'error' ? 'Erreur' :
                               ann.annotation_type === 'praise' ? 'Félicitation' :
                               ann.annotation_type === 'remark' ? 'Remarque' :
                               ann.annotation_type === 'correction' ? 'Correction' : 'Surlignage'}
                            </span>
                            {ann.score !== null && (
                              <span className="text-[10px] text-muted/60">{ann.score}/{ann.max_score || '?'} pts</span>
                            )}
                          </div>
                          <p className="text-sm text-white/80">{ann.content}</p>
                          {ann.selected_text && (
                            <p className="text-xs text-muted/50 italic mt-1 truncate">
                              « {ann.selected_text} »
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteAnnotation(ann.id)}
                          className="p-1 rounded text-muted/30 hover:text-rose-accent opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Ajouter une annotation */}
              {showAnnotationPanel && (
                <div className="mt-4 pt-4 border-t border-white/[0.06] animate-fade-in">
                  <h4 className="text-xs font-medium text-white mb-3">Ajouter une annotation</h4>
                  <div className="flex gap-2 mb-3">
                    {['comment', 'error', 'praise', 'remark', 'correction'].map((t) => (
                      <button key={t}
                        onClick={() => setNewAnnotation({ ...newAnnotation, annotation_type: t })}
                        className={`text-[10px] px-2.5 py-1 rounded-full border font-medium transition-all ${
                          newAnnotation.annotation_type === t
                            ? 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
                            : 'bg-white/[0.03] border-white/[0.06] text-muted/60 hover:text-white'
                        }`}
                      >
                        {t === 'comment' ? '💬' : t === 'error' ? '❌' : t === 'praise' ? '🌟' : t === 'remark' ? '📌' : '✏️'}
                        {' '}{t}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAnnotation.content}
                      onChange={(e) => setNewAnnotation({ ...newAnnotation, content: e.target.value })}
                      placeholder="Votre commentaire..."
                      className="input flex-1 text-sm"
                    />
                    <button onClick={handleAddAnnotation} disabled={!newAnnotation.content.trim()}
                      className="btn-primary text-sm px-4 py-2 disabled:opacity-40">
                      Ajouter
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section correction */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Colonne gauche : Résultat IA + Révision enseignant */}
          <div className="lg:col-span-2 space-y-5">

            {/* Résultat IA */}
            {data.correction.ai_score !== null && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-white flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                    Correction IA
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-neon-cyan font-heading">
                      {data.correction.ai_score}
                      <span className="text-sm text-muted/50">/{maxScore}</span>
                    </span>
                    {data.correction.ai_corrected_at && (
                      <span className="text-[10px] text-muted/40">{formatDate(data.correction.ai_corrected_at)}</span>
                    )}
                  </div>
                </div>

                {/* Feedback IA */}
                <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed mb-4">
                  {data.correction.ai_feedback || 'Aucun feedback détaillé'}
                </p>

                {/* Scores détaillés */}
                {data.correction.ai_detailed_scores && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted/60 uppercase tracking-wider">Détail par exercice</h4>
                    {(() => {
                      try {
                        const scores = JSON.parse(data.correction.ai_detailed_scores)
                        const details = scores.ai_detailed || scores
                        return (Array.isArray(details) ? details : []).map((s: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03]">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white/80 truncate">{s.exercise || `Exercice ${i + 1}`}</p>
                              {s.comment && <p className="text-xs text-muted/50 truncate">{s.comment}</p>}
                            </div>
                            <span className="text-sm font-medium text-white ml-3">
                              {s.score}<span className="text-muted/50">/{s.max_points || '?'}</span>
                            </span>
                          </div>
                        ))
                      } catch { return null }
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Pas de correction IA */}
            {data.correction.correction_status === 'pending' && (
              <div className="card p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                  </svg>
                </div>
                <p className="text-sm text-muted/60 mb-4">
                  Cette copie n'a pas encore été corrigée par l'IA. Lancez la correction automatique ou saisissez la note manuellement.
                </p>
                <button onClick={handleAICorrection} disabled={runningAI}
                  className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50">
                  {runningAI ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Correction IA en cours...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                      Lancer la correction IA
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Révision enseignant */}
            <div className="card p-5">
              <h3 className="font-medium text-white text-sm mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-iq" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                </svg>
                Révision enseignant
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-muted/70 mb-1.5">
                    Note <span className="text-muted/40">({data.correction.grading_system})</span>
                  </label>
                  <input
                    type="number" value={teacherScore}
                    onChange={(e) => setTeacherScore(e.target.value)}
                    step="0.5" min="0" max={maxScore}
                    className="input text-lg font-bold"
                    placeholder={`0 / ${maxScore}`}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-muted/70 mb-1.5">
                    Feedback enseignant
                  </label>
                  <textarea
                    value={teacherFeedback}
                    onChange={(e) => setTeacherFeedback(e.target.value)}
                    rows={3} className="input resize-none text-sm"
                    placeholder="Commentaire pédagogique pour l'étudiant..."
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveReview} disabled={saving || !data.correction.id}
                  className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50">
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Valider la correction
                    </span>
                  )}
                </button>
                <button onClick={() => navigate(`/teacher/sessions/${sessionId}/results`)}
                  className="btn-ghost text-sm px-4 py-2.5">
                  Résultats
                </button>
              </div>
            </div>
          </div>

          {/* Colonne droite : Grille d'évaluation */}
          <div className="space-y-5">
            {rubrics.length > 0 && (
              <div className="card p-5">
                <h3 className="font-medium text-white text-sm mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                  </svg>
                  Grille d'évaluation
                </h3>
                <div className="space-y-1 mb-4">
                  <select
                    value={selectedRubric?.id || ''}
                    onChange={(e) => {
                      const r = rubrics.find(r => r.id === Number(e.target.value))
                      setSelectedRubric(r || null)
                      setRubricScores({})
                    }}
                    className="input text-xs py-1.5 w-full"
                  >
                    <option value="">Sélectionner une grille</option>
                    {rubrics.map((r) => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </select>
                </div>

                {selectedRubric && (
                  <div className="space-y-3">
                    {selectedRubric.criteria.map((c) => (
                      <div key={c.id}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-white/80">{c.name}</label>
                          <span className="text-[10px] text-muted/50">max {c.max_points}</span>
                        </div>
                        <input
                          type="number"
                          value={rubricScores[c.id] ?? ''}
                          onChange={(e) => setRubricScores({ ...rubricScores, [c.id]: Number(e.target.value) })}
                          min={0} max={c.max_points} step={0.5}
                          className="input text-xs py-1.5 w-full"
                          placeholder={`0 - ${c.max_points}`}
                        />
                        {c.description && (
                          <p className="text-[10px] text-muted/50 mt-0.5">{c.description}</p>
                        )}
                      </div>
                    ))}
                    <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
                      <span className="text-xs text-muted/60">Total</span>
                      <span className="text-sm font-bold text-white">
                        {Object.values(rubricScores).reduce((a, b) => a + (b || 0), 0)}
                        <span className="text-muted/50 font-normal"> / {selectedRubric.max_score || selectedRubric.criteria.reduce((a, c) => a + c.max_points, 0)}</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
