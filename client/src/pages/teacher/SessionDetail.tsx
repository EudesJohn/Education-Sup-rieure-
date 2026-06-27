/** Détail d'une session — Salle d'Examen. */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { AdminListSkeleton } from '@/components/Skeleton'
import { api, studentListApi, accessCodeApi } from '@/services/api'
import type { ExamSession, StudentList, SessionListStatus } from '@/types'

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
  const [showExamForm, setShowExamForm] = useState(false)
  const [examMode, setExamMode] = useState<'ai_generated' | 'shared'>('ai_generated')
  const [examTextContent, setExamTextContent] = useState('')
  const [examFile, setExamFile] = useState<File | null>(null)
  const [examNumQuestions, setExamNumQuestions] = useState(3)
  const [examExerciseType, setExamExerciseType] = useState<string>('mixed')
  const [examGenerating, setExamGenerating] = useState(false)
  const [examResult, setExamResult] = useState<any>(null)
  const [examError, setExamError] = useState('')
  // Prévisualisation exercices partagés
  const [sharedPreview, setSharedPreview] = useState<{ content: string; type: 'code' | 'open' }[] | null>(null)
  const [showSharedPreview, setShowSharedPreview] = useState(false)

  const [studentLists, setStudentLists] = useState<StudentList[]>([])
  const [listStatus, setListStatus] = useState<SessionListStatus | null>(null)
  const [showListPicker, setShowListPicker] = useState(false)
  const [assigningList, setAssigningList] = useState(false)

  // Access codes
  const [accessCodes, setAccessCodes] = useState<any[] | null>(null)
  const [accessCodeStats, setAccessCodeStats] = useState({ total: 0, used: 0, remaining: 0 })
  const [showAccessCodes, setShowAccessCodes] = useState(false)
  const [generatingCodes, setGeneratingCodes] = useState(false)

  useEffect(() => { if (id) fetchSession() }, [id])
  useEffect(() => { if (id) fetchSubmissions() }, [id, statusFilter])
  useEffect(() => { if (id) fetchListStatus() }, [id])

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

  const handleGenerateExams = async () => {
    if (!id) return
    if (!examFile && !examTextContent.trim()) {
      setExamError('Veuillez fournir un fichier ou un texte')
      return
    }
    setExamGenerating(true); setExamError(''); setExamResult(null)
    try {
      let res
      if (examFile) {
        // Fichier → FormData (multipart)
        const formData = new FormData()
        formData.append('file', examFile)
        formData.append('num_questions', String(examNumQuestions))
        formData.append('exercise_type', examExerciseType)
        res = await api.post(`/teacher/sessions/${id}/upload-exam`, formData)
      } else {
        // Texte seul → JSON (évite les 502 liés au multipart)
        res = await api.post(`/teacher/sessions/${id}/upload-exam-json`, {
          text_content: examTextContent.trim(),
          num_questions: examNumQuestions,
          exercise_type: examExerciseType,
        })
      }
      setExamResult(res.data)
      await fetchSession()
    } catch (err: any) {
      const serverMsg = err.response?.data?.detail
      const statusCode = err.response?.status
      console.error(`Upload exam failed (${statusCode}):`, serverMsg || err.message)
      setExamError(serverMsg || `Erreur ${statusCode || 'réseau'} lors de la génération`)
    } finally {
      setExamGenerating(false)
    }
  }

  const handlePublishContent = async (exercisesConfig?: { content: string; type: 'code' | 'open' }[]) => {
    if (!id) return
    if (!examFile && !examTextContent.trim()) {
      setExamError('Veuillez fournir un fichier ou un texte')
      return
    }
    setExamGenerating(true); setExamError(''); setExamResult(null)
    try {
      const formData = new FormData()
      if (examFile) {
        formData.append('file', examFile)
      } else if (examTextContent.trim()) {
        formData.append('text_content', examTextContent.trim())
      }
      // Si l'enseignant a configuré les types d'exercices, les envoyer
      if (exercisesConfig) {
        formData.append('exercises_config', JSON.stringify(exercisesConfig))
      }

      const res = await api.post(`/teacher/sessions/${id}/publish-content`, formData)
      setExamResult(res.data)
      setSharedPreview(null)
      setShowSharedPreview(false)
      await fetchSession()
    } catch (err: any) {
      setExamError(err.response?.data?.detail || "Erreur lors de la publication")
    } finally {
      setExamGenerating(false)
    }
  }

  /** Parse le contenu en exercices potentiels pour prévisualisation */
  const parseSharedContent = (text: string): { content: string; type: 'code' | 'open' }[] => {
    if (!text.trim()) return []
    const lines = text.split('\n')
    const exercises: { content: string; type: 'code' | 'open' }[] = []
    let currentLines: string[] = []
    let inCodeBlock = false

    const flushBlock = () => {
      if (currentLines.length === 0) return
      const block = currentLines.join('\n').trim()
      if (!block) return
      // Heuristique : détecter si c'est du code
      const isCode = inCodeBlock || looksLikeCode(block)
      exercises.push({ content: block, type: isCode ? 'code' : 'open' })
      currentLines = []
    }

    for (const line of lines) {
      const stripped = line.trim()
      if (stripped.startsWith('```')) {
        if (inCodeBlock) { inCodeBlock = false; flushBlock() }
        else { flushBlock(); inCodeBlock = true }
        continue
      }
      // Nouvel exercice détecté par numérotation (1., 2., etc.) ou titre ###
      if (!inCodeBlock && (stripped.match(/^\d+[.)]\s/) || stripped.startsWith('### ')) && currentLines.length > 0) {
        flushBlock()
      }
      currentLines.push(line)
    }
    flushBlock()

    // Si un seul bloc, vérifier qu'il contient bien des séparateurs
    if (exercises.length === 1 && text.split('\n').length > 3) {
      // Forcer la séparation par blocs de texte vides
      const blocks = text.split(/\n\s*\n/).filter(b => b.trim())
      if (blocks.length > 1) {
        return blocks.map(b => ({
          content: b.trim(),
          type: looksLikeCode(b.trim()) ? 'code' : 'open',
        }))
      }
    }

    return exercises.length > 0 ? exercises : [{ content: text.trim(), type: looksLikeCode(text.trim()) ? 'code' : 'open' }]
  }

  /** Heuristique simple pour détecter le code */
  const looksLikeCode = (text: string): boolean => {
    if (!text.trim() || text.split('\n').length < 2) return false
    const codePatterns = [
      /\b(def|class|import|from|return|print)\s+/,
      /\bfunction\s+\w+\s*\(/,
      /\b(const|let|var)\s+\w+\s*=/,
      /(int|void|String|float)\s+\w+\s*\(/,
      /#include\s*</,
      /\b(SELECT|FROM|WHERE|INSERT|CREATE)\b/,
      /[{};]/,
    ]
    let score = 0
    for (const line of text.split('\n')) {
      const s = line.trim()
      if (!s) continue
      if (s.endsWith('{') || s.endsWith('}')) score += 0.5
      if (s.endsWith(';')) score += 0.5
      for (const p of codePatterns) {
        if (p.test(s)) { score += 1; break }
      }
    }
    return score >= 2
  }

  /** Ouvrir la prévisualisation des exercices partagés */
  const openSharedPreview = () => {
    const text = examTextContent.trim() || ''
    if (!text) { setExamError('Veuillez d\'abord saisir le contenu de l\'épreuve'); return }
    const parsed = parseSharedContent(text)
    setSharedPreview(parsed)
    setShowSharedPreview(true)
  }

  /** Publier avec la configuration choisie */
  const confirmSharedPublish = () => {
    setShowSharedPreview(false)
    handlePublishContent(sharedPreview!)
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

  const handleDeleteSession = async () => {
    if (!id) return
    if (!confirm('Supprimer cette session ? Cette action est irréversible.')) return
    try {
      await api.delete(`/teacher/sessions/${id}`)
      navigate('/teacher/sessions')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
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

  const fetchListStatus = async () => {
    if (!id) return
    try {
      const res = await studentListApi.getSessionListStatus(Number(id))
      setListStatus(res.data)
    } catch { /* pas de liste associée */ }
  }

  const openListPicker = async () => {
    try {
      const res = await studentListApi.list({ status: 'active' })
      setStudentLists(res.data)
      setShowListPicker(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement des listes')
    }
  }

  const handleAssignList = async (listId: number) => {
    if (!id) return
    setAssigningList(true)
    try {
      await studentListApi.assignToList(Number(id), { list_id: listId })
      setShowListPicker(false)
      await fetchSession()
      await fetchListStatus()
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur lors de l'association de la liste")
    } finally {
      setAssigningList(false)
    }
  }

  const fetchAccessCodes = async () => {
    if (!id) return
    try {
      const res = await accessCodeApi.list(Number(id))
      setAccessCodes(res.data.codes || [])
      setAccessCodeStats({
        total: res.data.total || 0,
        used: res.data.used || 0,
        remaining: res.data.remaining || 0,
      })
    } catch { /* pas de codes générés */ }
  }

  const handleGenerateCodes = async () => {
    if (!id) return
    setGeneratingCodes(true)
    try {
      await accessCodeApi.generate(Number(id))
      await fetchAccessCodes()
      setShowAccessCodes(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur lors de la génération des codes")
    } finally {
      setGeneratingCodes(false)
    }
  }

  const handleRemoveList = async () => {
    if (!id) return
    if (!confirm('Dissocier la liste/la classe de cette session ?')) return
    try {
      const payload = listStatus?.status === 'class'
        ? { class_id: null }
        : { student_list_id: null }
      await api.put(`/teacher/sessions/${id}`, payload)
      await fetchSession()
      await fetchListStatus()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la dissociation')
    }
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
        {examResult && !showExamForm && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-lg text-sm animate-fade-in flex items-center gap-2">
            <span>✅</span>
            <span><strong>{examResult.generated}</strong> épreuves générées{examResult.message ? ` — ${examResult.message}` : ''}</span>
            <button onClick={() => setExamResult(null)} className="ml-auto text-emerald-400/60 hover:text-emerald-400">✕</button>
          </div>
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

                {/* Student list association */}
                <div className="mt-4 pt-4 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted/60 uppercase tracking-wider mb-1">Liste d'étudiants</p>
                      {listStatus?.has_list ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white">{listStatus.list?.name}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            listStatus.is_consistent
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-amber-500/15 text-amber-400'
                          }`}>
                            {listStatus.is_consistent ? 'Cohérent' : 'Incohérent'}
                          </span>
                          {listStatus.list && (
                            <span className="text-xs text-muted/50">
                              {listStatus.entries_count} étudiants
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted/50">Aucune liste associée</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {listStatus?.has_list ? (
                        <>
                          {listStatus.status !== 'class' && (
                            <button onClick={openListPicker} className="btn-ghost text-xs px-3 py-1.5">
                              Changer
                            </button>
                          )}
                          <button onClick={handleRemoveList} className="btn-ghost text-xs px-3 py-1.5 text-rose-accent hover:text-rose-accent">
                            Dissocier
                          </button>
                        </>
                      ) : (
                        <button onClick={openListPicker} className="btn-ghost text-xs px-3 py-1.5">
                          Associer une liste
                        </button>
                      )}
                    </div>
                  </div>
                  {listStatus?.message && !listStatus.is_consistent && (
                    <p className="mt-2 text-xs text-amber-400/80">{listStatus.message}</p>
                  )}
                </div>

                {/* Access codes section */}
                {listStatus?.has_list && session.status !== 'completed' && (
                  <div className="mt-3 pt-4 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-xs text-muted/60 uppercase tracking-wider mb-1">Codes d'accès</p>
                        {accessCodes && accessCodeStats.total > 0 ? (
                          <p className="text-sm text-white/80">
                            {accessCodeStats.total} codes générés —
                            <span className="text-emerald-400 ml-1">{accessCodeStats.remaining} disponibles</span>
                            <span className="text-muted/50 ml-1">/ {accessCodeStats.used} utilisés</span>
                          </p>
                        ) : (
                          <p className="text-sm text-muted/50">Générer des codes PIN uniques par étudiant</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {accessCodes && accessCodeStats.total > 0 && (
                          <button onClick={() => setShowAccessCodes(!showAccessCodes)}
                            className="btn-ghost text-xs px-3 py-1.5">
                            {showAccessCodes ? 'Masquer' : 'Afficher'}
                          </button>
                        )}
                        <button
                          onClick={handleGenerateCodes}
                          disabled={generatingCodes}
                          className="btn-primary text-xs px-3 py-1.5"
                        >
                          {generatingCodes ? 'Génération...' : accessCodes?.length ? 'Régénérer' : 'Générer les codes'}
                        </button>
                      </div>
                    </div>

                    {/* Table des codes */}
                    {showAccessCodes && accessCodes && accessCodes.length > 0 && (
                      <div className="mt-3 animate-fade-in">
                        <div className="bg-white/[0.02] rounded-lg border border-white/[0.06] overflow-hidden">
                          <div className="max-h-48 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-white/[0.03]">
                                  <th className="text-left px-3 py-2 text-muted/60 font-medium">Étudiant</th>
                                  <th className="text-left px-3 py-2 text-muted/60 font-medium">N°</th>
                                  <th className="text-center px-3 py-2 text-muted/60 font-medium">Code PIN</th>
                                  <th className="text-center px-3 py-2 text-muted/60 font-medium">Statut</th>
                                </tr>
                              </thead>
                              <tbody>
                                {accessCodes.map((code) => (
                                  <tr key={code.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                                    <td className="px-3 py-2 text-white">{code.student_name}</td>
                                    <td className="px-3 py-2 text-muted/70 font-mono">{code.student_number}</td>
                                    <td className="px-3 py-2 text-center">
                                      <span className="font-mono font-bold text-neon-cyan text-sm tracking-widest">
                                        {code.access_pin}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {code.is_used ? (
                                        <span className="text-muted/50">Utilisé</span>
                                      ) : (
                                        <span className="text-emerald-400/80">Disponible</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <p className="mt-2 text-[10px] text-muted/40">
                          L'étudiant peut s'identifier avec son code PIN sur la page de connexion au lieu de saisir son nom.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {session.status === 'draft' && (
                  <>
                    {hasGeneratedExams ? (
                      <>
                        <button onClick={handleLaunch} className="btn btn-primary text-sm">
                          Lancer la session
                        </button>
                        <button onClick={() => setShowExamForm(!showExamForm)}
                          className="btn btn-secondary text-sm">
                          🔄 Régénérer les épreuves
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setShowExamForm(!showExamForm)}
                        className={`btn text-sm ${showExamForm ? 'btn-primary' : 'btn-secondary'}`}>
                        📄 Générer les épreuves
                      </button>
                    )}
                    <button onClick={handleDeleteSession}
                      className="btn btn-ghost text-sm text-rose-500 hover:bg-rose-500/10">
                      Supprimer
                    </button>
                  </>
                )}
                {session.status === 'active' && (
                  <button onClick={handleComplete} className="btn btn-primary text-sm">
                    Terminer la session
                  </button>
                )}
                {(session.status === 'completed' || session.status === 'active') && (
                  <>
                    <Link to={`/teacher/sessions/${id}/results`}
                      className="btn btn-secondary text-sm">
                      Résultats
                    </Link>
                    {session.status === 'completed' && (
                      <button onClick={handleDeleteSession}
                        className="btn btn-ghost text-sm text-rose-500 hover:bg-rose-500/10">
                        Supprimer
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Unified exam generation form */}
        {showExamForm && session?.status === 'draft' && (
          <div className="card animate-scale-in overflow-hidden">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-heading font-semibold text-white">
                    {hasGeneratedExams ? '🔄 Régénérer les épreuves' : '📄 Épreuve'}
                  </h3>
                  <p className="text-xs text-muted/60 mt-0.5">
                    Uploadez un sujet (PDF/Word/TXT/MD) ou collez le texte.
                  </p>
                </div>
                <button onClick={() => setShowExamForm(false)}
                  className="text-muted hover:text-white transition-colors p-1">✕</button>
              </div>

              <div className="space-y-3">
                {/* File upload */}
                <div className="border-2 border-dashed border-marge rounded-xl p-4 text-center hover:border-neon-cyan/30 transition-colors">
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.md"
                    onChange={(e) => setExamFile(e.target.files?.[0] || null)}
                    className="text-sm text-muted/60 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-neon-cyan/10 file:text-neon-cyan hover:file:bg-neon-cyan/20 file:cursor-pointer cursor-pointer file:transition-colors w-full"
                  />
                  {examFile && (
                    <p className="mt-2 text-xs text-neon-cyan/80">{examFile.name}</p>
                  )}
                </div>

                {/* Mode : Generation IA vs Partage */}
                <div>
                  <label className="block text-xs text-muted/60 mb-2">Mode de distribution</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setExamMode('ai_generated')}
                      className={`flex-1 px-3 py-2.5 rounded-lg text-left transition-all border ${
                        examMode === 'ai_generated'
                          ? 'bg-violet-iq/10 border-violet-iq/30 text-violet-iq'
                          : 'bg-white/[0.04] border-white/[0.08] text-muted hover:border-white/20'
                      }`}
                    >
                      <span className="block text-sm font-medium">🤖 Génération IA</span>
                      <span className="block text-[10px] opacity-60 mt-0.5">Épreuve unique par étudiant avec variantes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExamMode('shared')}
                      className={`flex-1 px-3 py-2.5 rounded-lg text-left transition-all border ${
                        examMode === 'shared'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-white/[0.04] border-white/[0.08] text-muted hover:border-white/20'
                      }`}
                    >
                      <span className="block text-sm font-medium">📋 Épreuve partagée</span>
                      <span className="block text-[10px] opacity-60 mt-0.5">Même contenu pour tous les étudiants</span>
                    </button>
                  </div>
                </div>

                {/* AI options : exercise type + num questions */}
                {examMode === 'ai_generated' && (
                  <>
                    <div>
                      <label className="block text-xs text-muted/60 mb-2">Type de questions à générer</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: 'mixed', label: '📝 Mixte', desc: 'QCM + développement' },
                          { value: 'qcm', label: '🔘 QCM', desc: 'Choix multiples' },
                          { value: 'open', label: '✍️ Rédaction', desc: 'Questions ouvertes' },
                          { value: 'code', label: '💻 Code', desc: 'Exercices de programmation' },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setExamExerciseType(opt.value)}
                            className={`flex-1 min-w-[120px] px-3 py-2 rounded-lg text-left transition-all border ${
                              examExerciseType === opt.value
                                ? 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
                                : 'bg-white/[0.04] border-white/[0.08] text-muted hover:border-white/20'
                            }`}
                          >
                            <span className="block text-sm font-medium">{opt.label}</span>
                            <span className="block text-[10px] opacity-60 mt-0.5">{opt.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Or text paste */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/[0.08]" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-deep-space px-3 text-muted/50">ou</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Shared mode : indicateur de detection automatique */}
                {examMode === 'shared' && (
                  <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 text-xs text-emerald-400/80 flex items-start gap-2.5">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <span className="font-medium text-emerald-400">Détection automatique activée</span>
                      <p className="text-emerald-400/60 mt-0.5">
                        Les blocs de code <code className="px-1 py-0.5 rounded bg-emerald-500/10 text-[10px]">```...</code> sont détectés automatiquement.
                        Les exercices de code auront un éditeur de code, les autres une zone de texte avec éditeur de formules.
                      </p>
                    </div>
                  </div>
                )}

                <textarea
                  value={examTextContent}
                  onChange={(e) => setExamTextContent(e.target.value)}
                  placeholder={examMode === 'ai_generated' ? "Collez le texte du sujet ici... (si vous n'avez pas de fichier)" : "Collez le contenu de l'épreuve ici..."}
                  rows={4}
                  className="input w-full resize-y"
                />

                {/* Num questions + Generate/ Publish button */}
                <div className="flex items-center justify-between gap-3">
                  {examMode === 'ai_generated' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={examNumQuestions}
                        onChange={(e) => setExamNumQuestions(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
                        min={1}
                        max={20}
                        className="input w-16 text-center text-sm"
                        title="Nombre de questions"
                      />
                      <span className="text-xs text-muted/60">questions</span>
                    </div>
                  )}
                  {examMode === 'shared' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={openSharedPreview}
                        disabled={!examTextContent.trim() && !examFile}
                        className="btn-ghost text-xs px-3 py-2"
                      >
                        🔍 Prévisualiser
                      </button>
                    </div>
                  )}
                  <button
                    onClick={examMode === 'ai_generated' ? handleGenerateExams : openSharedPreview}
                    disabled={examGenerating || (!examFile && !examTextContent.trim())}
                    className={`btn whitespace-nowrap ${
                      examMode === 'shared'
                        ? 'btn-primary bg-emerald-500 hover:bg-emerald-500/90 text-white'
                        : 'btn-primary'
                    }`}
                  >
                    {examGenerating ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {examMode === 'shared' ? 'Publication...' : 'Génération en cours...'}
                      </span>
                    ) : examMode === 'shared' ? '📋 Publier' : 'Générer les épreuves'}
                  </button>
                </div>

                {/* Modal prévisualisation exercices partagés */}
                {showSharedPreview && sharedPreview && (
                  <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="w-full max-w-2xl bg-midnight rounded-2xl border border-white/10 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
                      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                        <h3 className="font-heading font-semibold text-white text-lg">
                          🔍 Configurer les exercices
                        </h3>
                        <button onClick={() => setShowSharedPreview(false)}
                          className="text-muted hover:text-white transition-colors p-1">✕</button>
                      </div>
                      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                        <p className="text-xs text-muted/50 mb-4">
                          Choisissez le type de chaque exercice. Le système propose une détection automatique,
                          mais vous pouvez modifier manuellement.
                        </p>
                        {sharedPreview.map((ex, i) => (
                          <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-white">Exercice {i + 1}</span>
                              <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5 border border-white/10">
                                <button
                                  onClick={() => {
                                    const updated = [...sharedPreview]
                                    updated[i] = { ...updated[i], type: 'open' }
                                    setSharedPreview(updated)
                                  }}
                                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                    ex.type === 'open'
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                                      : 'text-muted/50 hover:text-white border border-transparent'
                                  }`}
                                >
                                  ✍️ Texte
                                </button>
                                <button
                                  onClick={() => {
                                    const updated = [...sharedPreview]
                                    updated[i] = { ...updated[i], type: 'code' }
                                    setSharedPreview(updated)
                                  }}
                                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                    ex.type === 'code'
                                      ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30 shadow-sm'
                                      : 'text-muted/50 hover:text-white border border-transparent'
                                  }`}
                                >
                                  💻 Code
                                </button>
                              </div>
                            </div>
                            <pre className="text-xs text-text-secondary/70 whitespace-pre-wrap line-clamp-4 font-mono bg-deep-space/50 rounded-lg p-2 border border-white/5">
                              {ex.content}
                            </pre>
                          </div>
                        ))}
                      </div>
                      <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
                        <span className="text-xs text-muted/50">
                          {sharedPreview.length} exercice{sharedPreview.length > 1 ? 's' : ''} détecté{sharedPreview.length > 1 ? 's' : ''}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => setShowSharedPreview(false)}
                            className="btn-ghost text-sm px-4 py-2">
                            Annuler
                          </button>
                          <button onClick={confirmSharedPublish}
                            disabled={examGenerating}
                            className="btn-primary bg-emerald-500 hover:bg-emerald-500/90 text-white text-sm px-6 py-2">
                            {examGenerating ? 'Publication...' : '✅ Confirmer la publication'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {examError && (
                  <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-3 rounded-lg text-sm">{examError}</div>
                )}

                {examResult && (
                  <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 animate-fade-in space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-white font-medium">
                        ✅ <strong>{examResult.generated}</strong> épreuve{examResult.generated > 1 ? 's' : ''} {examResult.mode === 'shared' ? 'publiée' : 'générée'}{examResult.generated > 1 ? 's' : ''}
                      </p>
                      {examResult.exercises_created !== undefined && (
                        <span className="text-xs text-muted/60">
                          {examResult.exercises_created ?? 0} question{(examResult.exercises_created ?? 0) > 1 ? 's' : ''} créée{(examResult.exercises_created ?? 0) > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {examResult.warnings?.length > 0 && (
                      <div className="text-xs text-amber-400/80 space-y-0.5">
                        {examResult.warnings.map((w: string, i: number) => (
                          <p key={i}>⚠️ {w}</p>
                        ))}
                      </div>
                    )}
                    <div className="grid gap-2 mt-2">
                      {examResult.exercises?.map((ex: any) => (
                        <div key={ex.id} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-white/[0.04] text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white">{ex.title}</span>
                            {ex.type && (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                                ex.type === 'code'
                                  ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/20'
                                  : ex.type === 'qcm'
                                  ? 'bg-violet-iq/10 text-violet-iq border-violet-iq/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              }`}>
                                {ex.type_label || ex.type}
                                {ex.type === 'code' && ex.language && (
                                  <span className="text-[9px] opacity-70">({ex.language})</span>
                                )}
                              </span>
                            )}
                          </div>
                          <span className="text-muted/60 text-xs">
                            {examResult.mode === 'shared'
                              ? `${ex.points} pts`
                              : `${ex.variants_count} variante${ex.variants_count > 1 ? 's' : ''}`
                            }
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* List picker modal */}
        {showListPicker && (
          <div className="card animate-scale-in overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-heading font-semibold text-white">Associer une liste d'étudiants</h3>
              <button onClick={() => setShowListPicker(false)}
                className="text-muted hover:text-white transition-colors p-1">✕</button>
            </div>
            <div className="p-5 max-h-[50vh] overflow-y-auto space-y-2">
              {studentLists.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted/70 mb-2">Aucune liste active disponible.</p>
                  <Link to="/teacher/student-lists"
                    className="text-sm text-neon-cyan hover:text-neon-cyan font-medium">
                    Créer une liste d'abord →
                  </Link>
                </div>
              ) : (
                studentLists.map((lst) => (
                  <button
                    key={lst.id}
                    onClick={() => handleAssignList(lst.id)}
                    disabled={assigningList}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] hover:border-neon-cyan/20 bg-white/[0.02] hover:bg-white/[0.04] transition-all text-left disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-muted/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-white">{lst.name}</span>
                        {lst.groupe && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{lst.groupe}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted/60 mt-0.5">
                        {lst.student_count} étudiant{lst.student_count > 1 ? 's' : ''}
                        {lst.original_filename && ` · ${lst.original_filename}`}
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                    </svg>
                  </button>
                ))
              )}
            </div>
            {studentLists.length > 0 && (
              <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
                <span className="text-xs text-muted/50">
                  {assigningList ? 'Association...' : `${studentLists.length} liste${studentLists.length > 1 ? 's' : ''} disponible${studentLists.length > 1 ? 's' : ''}`}
                </span>
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
            <AdminListSkeleton rows={5} />
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
