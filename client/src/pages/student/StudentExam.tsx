/** Page de composition étudiante avec mode kiosque sécurisé — Deep Focus. */

import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { RichEditor } from '@/components/RichEditor'
import { CodeEditor, ExecConsole, TestResultsView } from '@/components/CodeEditor'
import { KioskMode } from '@/components/KioskMode'
import { api } from '@/services/api'
import { judgeApi } from '@/services/judge'
import type { ConsoleLine } from '@/components/CodeEditor'
import { ParticleBackground } from '@/components/ParticleBackground'

interface SessionInfo {
  id: number; title: string; subject: string
  duration_seconds: number; grading_system: string
}

interface ExamContent {
  exam_id: number; session_id: number; duration_seconds: number
  title: string; subject: string; content: string
  status: string; started_at: string | null
}

interface ParsedExercise {
  exercise_id: number; exercise_title: string; difficulty: string
  points: number; instructions: string; variant_id: number
  content: string; data_overrides: any
  exercise_type?: string; language?: string
}

export function StudentExam() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [step, setStep] = useState<'identification' | 'ready' | 'composition' | 'submitted' | 'error'>('identification')
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [examContent, setExamContent] = useState<ExamContent | null>(null)
  const [exercises, setExercises] = useState<ParsedExercise[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  const [form, setForm] = useState({
    student_name: '', student_number: '', class_name: '', university: '',
  })

  const [answerContent, setAnswerContent] = useState('')
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [studentToken, setStudentToken] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoSubmittedRef = useRef(false)
  const answerRef = useRef('')
  const autoSubmitFnRef = useRef<() => Promise<void>>(async () => {})

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault(); setErrorMsg('')
    try {
      const res = await api.post(`/sessions/${code}/join`, {
        student_name: form.student_name, student_number: form.student_number,
        class_name: form.class_name || null, university: form.university || null,
      })
      setSessionInfo(res.data.session); setStudentToken(res.data.student_token); setStep('ready')
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Code de session invalide ou session inactive')
    }
  }

  const startExam = async () => {
    try {
      const res = await api.get('/student/exam', {
        params: { session_code: code, student_number: form.student_number },
        headers: { 'X-Student-Token': studentToken },
      })
      const exam = res.data as ExamContent
      setExamContent(exam); setTimeLeft(exam.duration_seconds)
      try { const parsed = JSON.parse(exam.content); if (Array.isArray(parsed)) setExercises(parsed) } catch {}
      setStep('composition')
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "Erreur lors du chargement de l'épreuve")
      setStep('error')
    }
  }

  // Synchronisation des refs avec les valeurs courantes
  answerRef.current = answerContent

  // Timer : décompte pur, sans effet de bord
  useEffect(() => {
    if (step !== 'composition') return
    autoSubmittedRef.current = false
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [step])

  // Déclenche l'auto-submit quand le temps atteint 0
  useEffect(() => {
    if (step === 'composition' && timeLeft <= 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true
      autoSubmitFnRef.current().catch(() => {})
    }
  }, [timeLeft, step])

  // Auto-save toutes les 30s — utilise answerRef pour ne pas reset l'interval
  useEffect(() => {
    if (step !== 'composition') return
    const autoSave = setInterval(() => {
      localStorage.setItem(`pean_draft_${code}_${form.student_number}`, answerRef.current)
    }, 30000)
    return () => clearInterval(autoSave)
  }, [step, code, form.student_number])

  const handleSubmit = async () => {
    if (submitting) return; setSubmitting(true)
    try {
      await api.post('/student/submit', {
        content: answerContent,
        auto_submitted: false,
        class_name: form.class_name || null,
        university: form.university || null,
      }, {
        params: { session_code: code, student_number: form.student_number, student_name: form.student_name },
        headers: { 'X-Student-Token': studentToken },
      })
      localStorage.removeItem(`pean_draft_${code}_${form.student_number}`)
      setStep('submitted')
    } catch (err: any) { setErrorMsg(err.response?.data?.detail || 'Erreur lors de la soumission') }
    finally { setSubmitting(false) }
  }

  const handleAutoSubmit = useCallback(async () => {
    if (autoSubmittedRef.current) return; autoSubmittedRef.current = true
    try {
      await api.post('/student/submit', {
        content: answerContent || '',
        auto_submitted: true,
        class_name: form.class_name || null,
        university: form.university || null,
      }, {
        params: { session_code: code, student_number: form.student_number, student_name: form.student_name },
        headers: { 'X-Student-Token': studentToken },
      }); setStep('submitted')
    } catch { setStep('submitted') }
  }, [answerContent, code, form.student_number, form.student_name, studentToken])

  // Synchronise la ref pour que le timer ait toujours la dernière version
  autoSubmitFnRef.current = handleAutoSubmit

  const handleExitAttempt = useCallback(() => { autoSubmitFnRef.current().catch(() => {}) }, [])

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // ==================== Écran d'identification ====================
  if (step === 'identification') {
    return (
      <div className="min-h-screen bg-deep-space flex items-center justify-center px-4 relative overflow-hidden">
        <ParticleBackground density={40} speed={0.6} />
        <div className="absolute inset-0 pointer-events-none z-[1]" aria-hidden="true">
          <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(6, 242, 219, 0.05) 0%, transparent 60%)' }} />
        </div>
        <div className="w-full max-w-lg glass-card p-8 relative z-10 animate-scale-in">
          <div className="text-center mb-6">
            <div className="relative inline-flex mb-3">
              <div className="w-14 h-14 bg-gradient-to-br from-neon-cyan to-violet-iq rounded-xl flex items-center justify-center shadow-lg shadow-neon-cyan/20">
                <svg className="w-7 h-7 text-deep-space" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
            </div>
            <h1 className="font-heading text-xl font-bold text-white">Accès à l'épreuve</h1>
            <p className="text-sm text-muted mt-1">
              Code de session : <span className="font-mono font-bold text-neon-cyan">{code}</span>
            </p>
          </div>

          {errorMsg && (
            <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-3 rounded-lg text-sm mb-4">{errorMsg}</div>
          )}

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Nom et prénoms *</label>
              <input type="text" value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })}
                className="input" placeholder="Jean Dupont" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Numéro d'étudiant *</label>
              <input type="text" value={form.student_number} onChange={(e) => setForm({ ...form, student_number: e.target.value })}
                className="input" placeholder="MAT2024001" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Classe</label>
                <input type="text" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })}
                  className="input" placeholder="L2 Maths" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Université</label>
                <input type="text" value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })}
                  className="input" placeholder="Université" />
              </div>
            </div>
            <button type="submit"
              className="btn btn-primary w-full py-3 font-semibold btn-ripple">
              Accéder à l'épreuve
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ==================== Écran prêt à commencer ====================
  if (step === 'ready') {
    return (
      <div className="min-h-screen bg-deep-space flex items-center justify-center px-4 relative overflow-hidden">
        <ParticleBackground density={40} speed={0.6} />
        <div className="absolute inset-0 pointer-events-none z-[1]" aria-hidden="true">
          <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(6, 242, 219, 0.05) 0%, transparent 60%)' }} />
        </div>
        <div className="w-full max-w-lg glass-card p-8 text-center relative z-10 animate-scale-in">
          <div className="w-16 h-16 rounded-xl bg-success/10 flex items-center justify-center mx-auto mb-4 border border-success/20">
            <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-heading text-xl font-bold text-white mb-2">Identifié avec succès</h2>
          <p className="text-sm text-muted mb-1">{sessionInfo?.title} — {sessionInfo?.subject}</p>
          <p className="text-sm text-muted/60 mb-6">Durée : {sessionInfo ? Math.floor(sessionInfo.duration_seconds / 60) : '?'} minutes</p>

          <div className="bg-amber-iq/5 border border-amber-iq/15 rounded-xl p-4 mb-6 text-left text-sm">
            <p className="font-medium text-amber-iq mb-2">⚠️ Règles de composition</p>
            <ul className="text-amber-iq/70 space-y-1 text-xs">
              <li>• L'épreuve se déroule en plein écran verrouillé</li>
              <li>• Toute tentative de sortie entraîne la soumission immédiate</li>
              <li>• À la fin du temps imparti, votre copie est soumise automatiquement</li>
              <li>• La sauvegarde est automatique toutes les 30 secondes</li>
            </ul>
          </div>

          <button onClick={startExam}
            className="btn btn-primary px-10 py-3 font-semibold btn-ripple">
            Commencer l'épreuve
          </button>
        </div>
      </div>
    )
  }

  // ==================== État pour le code ====================
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([])
  const [consoleVisible, setConsoleVisible] = useState(false)
  const [runningCode, setRunningCode] = useState(false)
  const [testResults, setTestResults] = useState<{
    passed: number; total: number
    results: Array<{
      description?: string; passed: boolean
      input: string; expected_output: string
      actual_output: string; error?: string
    }>
  } | null>(null)
  const [codeLanguage, setCodeLanguage] = useState('python')
  const [showCodeTestResults, setShowCodeTestResults] = useState(false)

  // Détecter si l'épreuve contient des exercices de code
  const hasCodeExercises = exercises.some((ex) => ex.exercise_type === 'code')

  // Définir le langage par défaut d'après le premier exercice code trouvé
  useEffect(() => {
    if (hasCodeExercises) {
      const codeEx = exercises.find((ex) => ex.exercise_type === 'code')
      if (codeEx?.language) setCodeLanguage(codeEx.language)
    }
  }, [hasCodeExercises, exercises])

  const handleRunCode = async () => {
    setRunningCode(true)
    setConsoleVisible(true)
    setTestResults(null)
    setShowCodeTestResults(false)
    setConsoleLines([{ type: 'system', text: 'Exécution en cours...' }])

    try {
      const result = await judgeApi.runCode({
        code: answerContent,
        language: codeLanguage,
      })

      const lines: ConsoleLine[] = []

      if (result.error) {
        lines.push({ type: 'error', text: `❌ ${result.error}` })
      }

      if (result.stdout) {
        lines.push({ type: 'stdout', text: result.stdout })
      }

      if (result.stderr) {
        lines.push({ type: 'stderr', text: result.stderr })
      }

      if (result.exit_code !== 0 && !result.error) {
        lines.push({ type: 'stderr', text: `Process exited with code ${result.exit_code}` })
      }

      if (lines.length === 0) {
        lines.push({ type: 'stdout', text: '' })
      }

      lines.push({ type: 'system', text: `Terminé en ${result.time_seconds}s` })
      setConsoleLines(lines)
    } catch (err: any) {
      setConsoleLines([
        { type: 'error', text: `Erreur : ${err.response?.data?.detail || err.message || 'Impossible d\'exécuter le code'}` },
      ])
    } finally {
      setRunningCode(false)
    }
  }

  const handleSubmitCode = async () => {
    setRunningCode(true)
    setConsoleVisible(false)
    setTestResults(null)
    setShowCodeTestResults(true)

    try {
      const result = await judgeApi.submitCode({
        code: answerContent,
        language: codeLanguage,
        test_cases: [],
      })
      setTestResults(result)
    } catch (err: any) {
      setShowCodeTestResults(true)
      setTestResults({
        passed: 0,
        total: 0,
        results: [{
          description: 'Erreur',
          passed: false,
          input: '',
          expected_output: '',
          actual_output: err.response?.data?.detail || err.message,
          error: err.response?.data?.detail || err.message,
        }],
      })
    } finally {
      setRunningCode(false)
    }
  }

  // ==================== Composition ====================
  if (step === 'composition') {
    const CodeComposition = (
      <>
        <div className="px-4 lg:px-6 py-2.5 bg-midnight border-b border-white/5 text-xs text-muted font-medium flex items-center justify-between">
          <span>Zone de réponse — Éditeur de code</span>
          <div className="flex items-center gap-2">
            {/* Bouton Exécuter */}
            <button
              onClick={handleRunCode}
              disabled={runningCode || !answerContent.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-cyan/10 hover:bg-neon-cyan/20 disabled:opacity-40 disabled:cursor-not-allowed text-neon-cyan text-xs font-medium rounded-lg transition-all border border-neon-cyan/20"
            >
              {runningCode ? (
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {runningCode ? 'Exécution...' : '▶ Exécuter'}
            </button>

            {/* Bouton Tester */}
            <button
              onClick={handleSubmitCode}
              disabled={runningCode || !answerContent.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-iq/10 hover:bg-amber-iq/20 disabled:opacity-40 disabled:cursor-not-allowed text-amber-iq text-xs font-medium rounded-lg transition-all border border-amber-iq/20"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Tester
            </button>
          </div>
        </div>

        <div className="flex-1 p-4 lg:p-6 flex flex-col gap-4 overflow-y-auto">
          <CodeEditor
            value={answerContent}
            onChange={setAnswerContent}
            language={codeLanguage}
            onLanguageChange={setCodeLanguage}
            placeholder="Écrivez votre code ici..."
            height="350px"
          />

          {/* Console d'exécution */}
          <ExecConsole
            lines={consoleLines}
            visible={consoleVisible}
            onToggle={() => setConsoleVisible(!consoleVisible)}
            loading={runningCode}
          />

          {/* Résultats des tests */}
          {showCodeTestResults && testResults && (
            <TestResultsView
              results={testResults.results}
              passed={testResults.passed}
              total={testResults.total}
            />
          )}
        </div>
      </>
    )

    const TextComposition = (
      <>
        <div className="px-4 lg:px-6 py-2.5 bg-midnight border-b border-white/5 text-xs text-muted font-medium">
          Zone de réponse — Rédigez votre copie ici
        </div>
        <div className="flex-1 p-4 lg:p-6">
          <RichEditor
            value={answerContent}
            onChange={setAnswerContent}
            placeholder="Rédigez votre réponse ici... Vous pouvez utiliser le formatage de texte et les formules mathématiques avec LaTeX (ex: \frac{a}{b})"
            minHeight="100%"
          />
        </div>
      </>
    )

    return (
      <KioskMode onExitAttempt={handleExitAttempt}>
        <div className="min-h-screen bg-deep-space flex flex-col">
          {/* Barre de statut */}
          <header className="bg-midnight/90 backdrop-blur-md border-b border-white/5 text-white px-4 lg:px-6 py-2.5 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-neon-cyan to-violet-iq flex items-center justify-center shadow-lg shadow-neon-cyan/15">
                <span className="text-deep-space text-[10px] font-bold">P</span>
              </div>
              <span className="text-muted hidden sm:inline">|</span>
              <span className="text-sm font-medium text-white hidden sm:inline">{examContent?.title}</span>
              <span className="text-muted hidden sm:inline">|</span>
              <span className="text-xs text-muted">{form.student_name}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted hidden sm:inline">Temps restant :</span>
              <span className={`font-mono text-lg font-bold tabular-nums ${
                timeLeft < 300 ? 'text-rose-accent animate-pulse' : 'text-neon-cyan'
              }`}>
                {formatTime(timeLeft)}
              </span>
              <button onClick={handleSubmit} disabled={submitting || runningCode}
                className={`btn btn-sm font-medium ${timeLeft < 300 ? 'btn-danger animate-glow-pulse' : 'btn-primary'}`}>
                {(submitting || runningCode) ? 'Soumission...' : 'Envoyer'}
              </button>
            </div>
          </header>

          {/* Message d'erreur */}
          {errorMsg && (
            <div className="bg-rose-accent/10 border-b border-rose-accent/20 text-rose-accent px-4 lg:px-6 py-3 text-sm flex items-center gap-2 animate-fade-in">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Zone de composition */}
          <div className="flex-1 flex flex-col lg:flex-row">
            {/* Panneau gauche : épreuve */}
            <div className="lg:w-2/5 bg-midnight/40 p-4 lg:p-6 overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/5 max-h-[35vh] lg:max-h-none">
              <h2 className="font-heading font-bold text-lg mb-4 text-white">
                {examContent?.subject || 'Épreuve'}
              </h2>

              {exercises.length > 0 ? (
                <div className="space-y-4">
                  {exercises.map((ex, idx) => (
                    <div key={ex.exercise_id || idx} className="p-4 bg-midnight/80 rounded-xl border border-white/5 card-hover">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-sm text-white">{ex.exercise_title || `Exercice ${idx + 1}`}</h3>
                        <span className="text-xs font-semibold text-amber-iq bg-amber-iq/10 px-2 py-0.5 rounded-full border border-amber-iq/20">
                          {ex.points} pts
                        </span>
                      </div>
                      {ex.exercise_type === 'code' && (
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-[10px] font-mono bg-neon-cyan/10 text-neon-cyan px-1.5 py-0.5 rounded border border-neon-cyan/15">Code</span>
                          {ex.language && (
                            <span className="text-[10px] font-mono bg-white/5 text-muted px-1.5 py-0.5 rounded border border-white/5">{ex.language}</span>
                          )}
                        </div>
                      )}
                      <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                        {ex.content || ex.instructions}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {examContent?.content || 'Chargement du contenu...'}
                </div>
              )}

              {/* Barre de progression */}
              {timeLeft > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-1000 ${
                        timeLeft < 300 ? 'bg-rose-accent' : timeLeft < 600 ? 'bg-amber-iq' : 'bg-neon-cyan'
                      }`}
                      style={{ width: `${examContent ? (timeLeft / examContent.duration_seconds) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs text-muted/60 mt-1 text-right">
                    {timeLeft < 300 ? '⚠️ Il reste moins de 5 minutes !' : ''}
                  </p>
                </div>
              )}
            </div>

            {/* Panneau droit : éditeur */}
            <div className="flex-1 flex flex-col bg-deep-space">
              {hasCodeExercises ? CodeComposition : TextComposition}
            </div>
          </div>
        </div>
      </KioskMode>
    )
  }

  // ==================== Soumis avec succès ====================
  if (step === 'submitted') {
    return (
      <div className="min-h-screen bg-deep-space flex items-center justify-center px-4 relative overflow-hidden">
        <ParticleBackground density={30} speed={0.4} />
        <div className="absolute inset-0 pointer-events-none z-[1]" aria-hidden="true">
          <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(16, 185, 129, 0.06) 0%, transparent 60%)' }} />
        </div>
        <div className="w-full max-w-md glass-card p-8 text-center relative z-10 animate-scale-in">
          <div className="relative inline-flex mb-6">
            <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center border border-success/20">
              <svg className="w-10 h-10 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <h2 className="font-heading text-2xl font-bold text-white mb-2">Copie soumise avec succès !</h2>
          <p className="text-sm text-muted mb-2">Votre copie a été transmise à votre enseignant.</p>
          <p className="text-xs text-muted/60 mb-6">{form.student_name} — {form.student_number}</p>
          <button onClick={() => navigate('/login')}
            className="btn btn-secondary px-6">
            Retour à l'accueil
          </button>
        </div>
      </div>
    )
  }

  // ==================== Erreur ====================
  return (
    <div className="min-h-screen bg-deep-space flex items-center justify-center px-4 relative overflow-hidden">
      <div className="w-full max-w-md glass-card p-8 text-center relative z-10 animate-scale-in">
        <div className="w-20 h-20 rounded-full bg-rose-accent/10 flex items-center justify-center mx-auto mb-6 border border-rose-accent/20">
          <svg className="w-10 h-10 text-rose-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="font-heading text-xl font-bold text-white mb-2">Erreur</h2>
        <p className="text-sm text-muted mb-6">{errorMsg}</p>
        <button onClick={() => navigate('/login')}
          className="btn btn-secondary px-6">
          Retour à l'accueil
        </button>
      </div>
    </div>
  )
}
