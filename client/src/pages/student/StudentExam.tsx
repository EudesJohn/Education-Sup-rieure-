/** Page de composition étudiante avec mode kiosque sécurisé — Deep Focus. */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CodeEditor, ExecConsole, TestResultsView } from '@/components/CodeEditor'
import { FormulaEditor } from '@/components/FormulaEditor'
import { KioskMode } from '@/components/KioskMode'
import { api, accessCodeApi } from '@/services/api'
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
  session?: { grading_system?: string }
}

interface ParsedExercise {
  exercise_id: number; exercise_title: string; difficulty: string
  points: number; instructions: string; variant_id: number
  content: string; data_overrides: any
  exercise_type?: string; language?: string
  // Pour les fichiers uploades
  type?: string; filename?: string; url?: string; mime_type?: string
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
    student_name: '', student_number: '',
  })
  const [accessPin, setAccessPin] = useState('')
  const [pinAuthing, setPinAuthing] = useState(false)

  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [studentToken, setStudentToken] = useState('')
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false)
  const [showTimeWarning, setShowTimeWarning] = useState(false)
  const [showExitWarning, setShowExitWarning] = useState(false)
  const [exitWarningCount, setExitWarningCount] = useState(0)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [examPanelOpen, setExamPanelOpen] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoSubmittedRef = useRef(false)
  const answersRef = useRef<Record<string, string>>({})
  const autoSubmitFnRef = useRef<() => Promise<void>>(async () => {})
  const timeWarningShownRef = useRef(false)
  const alert10minPlayedRef = useRef(false)
  const submissionInFlightRef = useRef(false)

  // ==================== État pour le code (isolé par exercice) ====================
  const [consoleLinesMap, setConsoleLinesMap] = useState<Record<number, ConsoleLine[]>>({})
  const [consoleVisibleMap, setConsoleVisibleMap] = useState<Record<number, boolean>>({})
  // runningSet = ensemble des exercices en cours d'exécution simultanée
  const [runningSet, setRunningSet] = useState<Set<number>>(new Set())
  /** @deprecated use runningSet */ const runningCodeExId = null
  const [testResultsMap, setTestResultsMap] = useState<Record<number, any>>({})
  const [codeLanguage, setCodeLanguage] = useState('python')
  const [showCodeTestResultsMap, setShowCodeTestResultsMap] = useState<Record<number, boolean>>({})
  const [stdinMap, setStdinMap] = useState<Record<number, string>>({})

  // Restaurer le brouillon sauvegardé localement
  useEffect(() => {
    const saved = localStorage.getItem(`pean_draft_${code}_${form.student_number}`)
    if (saved) {
      try { setAnswers(JSON.parse(saved)) } catch { setAnswers({}) }
    }
  }, [code, form.student_number])

  const handlePinAuth = async () => {
    if (!accessPin.trim() || accessPin.length !== 6) {
      setErrorMsg('Code PIN invalide (6 chiffres requis)')
      return
    }
    if (!form.student_number.trim()) {
      setErrorMsg('Veuillez saisir votre numéro d\'étudiant')
      return
    }
    setPinAuthing(true); setErrorMsg('')
    try {
      const res = await accessCodeApi.authenticateByPin(
        accessPin,
        '',
        form.student_number.trim(),
      )
      const d = res.data
      setForm((prev) => ({ ...prev, student_name: d.student_name }))
      // Se connecter à la session avec les données vérifiées
      const joinRes = await api.post(`/sessions/${d.session_code}/join`, {
        student_name: d.student_name,
        student_number: d.student_number,
        class_name: d.class_name || null,
        university: '',
      })
      setSessionInfo(joinRes.data.session)
      setStudentToken(joinRes.data.student_token)
      setStep('ready')
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Code PIN invalide ou déjà utilisé')
    } finally {
      setPinAuthing(false)
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
      try {
        const parsed = JSON.parse(exam.content)
        if (Array.isArray(parsed)) {
          // Répartir les points automatiquement si certains exercices ont 0 point
          const totalPts = parseInt(exam.session?.grading_system || '20', 10) || 20
          const hasZero = parsed.some((e: any) => !e.points || e.points <= 0)
          if (hasZero && parsed.length > 0) {
            const perEx = Math.floor(totalPts / parsed.length)
            const remainder = totalPts - perEx * parsed.length
            parsed.forEach((e: any, i: number) => { e.points = perEx + (i === 0 ? remainder : 0) })
          }
          setExercises(parsed)
        }
      } catch {}
      setStep('composition')
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "Erreur lors du chargement de l'épreuve")
      setStep('error')
    }
  }

  // Synchronisation des refs avec les valeurs courantes
  answersRef.current = answers

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
        // Avertissement à 5 minutes (300s) — une seule fois
        if (prev === 301 && !timeWarningShownRef.current) {
          timeWarningShownRef.current = true
          setTimeout(() => setShowTimeWarning(true), 100)
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

  // Alerte sonore à 10 minutes — joue un bip d'avertissement
  useEffect(() => {
    if (step !== 'composition' || alert10minPlayedRef.current) return
    if (timeLeft === 600) {
      alert10minPlayedRef.current = true
      try {
        // Utilise la Web Audio API pour un bip d'avertissement
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        osc.type = 'sine'
        gain.gain.value = 0.15
        osc.start()
        osc.stop(ctx.currentTime + 0.3)
        // Second bip plus aigu
        setTimeout(() => {
          const osc2 = ctx.createOscillator()
          const gain2 = ctx.createGain()
          osc2.connect(gain2)
          gain2.connect(ctx.destination)
          osc2.frequency.value = 1320
          osc2.type = 'sine'
          gain2.gain.value = 0.2
          osc2.start()
          osc2.stop(ctx.currentTime + 0.4)
        }, 400)
      } catch { /* Audio non disponible */ }
    }
  }, [timeLeft, step])

  // Auto-save toutes les 30s + mise à jour live de l'indicateur
  useEffect(() => {
    if (step !== 'composition') return
    // Sauvegarde immédiate au démarrage
    localStorage.setItem(`pean_draft_${code}_${form.student_number}`, JSON.stringify(answersRef.current))
    setLastSaved(new Date())

    const autoSave = setInterval(() => {
      localStorage.setItem(`pean_draft_${code}_${form.student_number}`, JSON.stringify(answersRef.current))
      setLastSaved(new Date())
    }, 30000)

    // Rafraîchit l'affichage "dernière sauvegarde il y a Xs" toutes les 5s
    const refreshDisplay = setInterval(() => {
      setLastSaved((prev) => prev ? new Date(prev.getTime()) : null)
    }, 5000)

    return () => { clearInterval(autoSave); clearInterval(refreshDisplay) }
  }, [step, code, form.student_number])

  const handleSubmitConfirm = () => {
    setShowConfirmSubmit(true)
  }

  const handleSubmit = async () => {
    if (submitting || submissionInFlightRef.current) return
    submissionInFlightRef.current = true
    setSubmitting(true); setShowConfirmSubmit(false)
    try {
      await api.post('/student/submit', {
        content: JSON.stringify(answers),
        auto_submitted: false,
        class_name: null,
        university: null,
      }, {
        params: { session_code: code, student_number: form.student_number, student_name: form.student_name },
        headers: { 'X-Student-Token': studentToken },
      })
      localStorage.removeItem(`pean_draft_${code}_${form.student_number}`)
      setStep('submitted')
    } catch (err: any) {
      submissionInFlightRef.current = false
      setErrorMsg(err.response?.data?.detail || 'Erreur lors de la soumission')
    }
    finally { setSubmitting(false) }
  }

  const handleRetrySubmit = () => {
    setErrorMsg('')
    handleSubmit()
  }

  const handleAutoSubmit = useCallback(async () => {
    if (autoSubmittedRef.current) return; autoSubmittedRef.current = true
    try {
      await api.post('/student/submit', {
        content: JSON.stringify(answers || {}),
        auto_submitted: true,
        class_name: null,
        university: null,
      }, {
        params: { session_code: code, student_number: form.student_number, student_name: form.student_name },
        headers: { 'X-Student-Token': studentToken },
      }); setStep('submitted')
    } catch { setStep('submitted') }
  }, [answers, code, form.student_number, form.student_name, studentToken])

  // Synchronise la ref pour que le timer ait toujours la dernière version
  autoSubmitFnRef.current = handleAutoSubmit

  const handleExitAttempt = useCallback(() => {
    // 1ère tentative = avertissement
    if (exitWarningCount === 0) {
      setExitWarningCount(1)
      setShowExitWarning(true)
      // Notifier le professeur
      api.post('/student/exit-attempt', {}, {
        params: { session_code: code, student_number: form.student_number },
        headers: studentToken ? { 'X-Student-Token': studentToken } : {},
      }).catch(() => {})
      return
    }
    // 2ème tentative = soumission forcée
    autoSubmitFnRef.current().catch(() => {})
  }, [exitWarningCount, code, form.student_number, studentToken])

  const handleConfirmWarning = useCallback(async () => {
    setShowExitWarning(false)
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
    } catch (err) {
      console.error("Failed to re-enter fullscreen:", err)
    }
  }, [])

  // Détecter si l'épreuve contient des exercices de code
  const hasCodeExercises = exercises.some((ex) => ex.exercise_type === 'code')

  // Définir le langage par défaut d'après le premier exercice code trouvé
  useEffect(() => {
    if (hasCodeExercises) {
      const codeEx = exercises.find((ex) => ex.exercise_type === 'code')
      if (codeEx?.language) setCodeLanguage(codeEx.language)
    }
  }, [hasCodeExercises, exercises])

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

          <div className="space-y-4">
            <div className="text-center mb-2">
              <p className="text-sm text-muted/70">
                Saisissez votre matricule et le code PIN à 6 chiffres fourni par votre enseignant
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Numéro d'étudiant (matricule) *</label>
              <input type="text" value={form.student_number}
                onChange={(e) => setForm({ ...form, student_number: e.target.value })}
                className="input" placeholder="MAT2024001" required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Code PIN</label>
              <input
                type="text"
                value={accessPin}
                onChange={(e) => setAccessPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input text-center text-2xl font-mono font-bold tracking-[0.3em] py-4"
                placeholder="• • • • • •"
                maxLength={6}
                inputMode="numeric"
              />
            </div>
            <button
              onClick={handlePinAuth}
              disabled={pinAuthing || accessPin.length !== 6 || !form.student_number.trim()}
              className="btn btn-primary w-full py-3 font-semibold btn-ripple disabled:opacity-50"
            >
              {pinAuthing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Vérification...
                </span>
              ) : (
                'Accéder à l\'épreuve'
              )}
            </button>
          </div>
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
            <p className="font-medium text-amber-iq mb-2"> Règles de composition</p>
            <ul className="text-amber-iq/70 space-y-1 text-xs">
              <li>• L'épreuve se déroule en plein écran verrouillé</li>
              <li>• Toute tentative de sortie sera signalée à l'enseignant</li>
              <li>• Un second départ entraîne la soumission immédiate</li>
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

  // Helper : parser les choix QCM depuis le contenu (A) ... (B) ... (C) ... (D) ...
  const parseQCMChoices = (content: string, dataOverrides?: any): string[] => {
    if (dataOverrides && Array.isArray(dataOverrides.choices) && dataOverrides.choices.length === 4) {
      return dataOverrides.choices
    }
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

  const getAnswer = (exId: number): string => answers[String(exId)] || ''
  const setAnswer = (exId: number, value: string) =>
    setAnswers(prev => ({ ...prev, [String(exId)]: value }))

  // ==================== Composition ====================
  if (step === 'composition') {
    const hasCodeEx = exercises.some((ex) => ex.exercise_type === 'code')

    return (
      <>
      {/* Modal de confirmation de soumission */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md glass-card p-6 rounded-xl animate-scale-in">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-lg font-heading font-semibold text-white text-center mb-2">
              Confirmer la soumission
            </h3>
            <p className="text-sm text-muted/70 text-center mb-4">
              Êtes-vous sûr de vouloir soumettre votre copie ? Cette action est définitive.
            </p>
            <div className="bg-white/[0.03] rounded-lg p-3 mb-5 text-xs space-y-1.5 text-muted/60">
              <p>Étudiant : <span className="text-white">{form.student_name}</span></p>
              <p>N° étudiant : <span className="text-white">{form.student_number}</span></p>
              <p>Temps restant : <span className={`font-mono ${timeLeft < 300 ? 'text-rose-accent' : 'text-neon-cyan'}`}>{formatTime(timeLeft)}</span></p>
              <p>Exercices : <span className="text-white">{exercises.length}</span></p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmSubmit(false)}
                className="btn-ghost flex-1 text-sm py-2.5">
                Continuer à composer
              </button>
              <button onClick={handleSubmit}
                disabled={submitting}
                className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50">
                {submitting ? 'Soumission...' : 'Confirmer la soumission'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'avertissement temporel (5 minutes) */}
      {showTimeWarning && (
        <div className="fixed inset-0 z-[9997] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-sm glass-card p-6 rounded-xl animate-scale-in">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-accent/10 flex items-center justify-center border border-rose-accent/20">
              <svg className="w-7 h-7 text-rose-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-lg font-heading font-semibold text-white text-center mb-2">
              ⏰ Il reste moins de 5 minutes !
            </h3>
            <p className="text-sm text-muted/70 text-center mb-5">
              Votre copie sera soumise automatiquement à la fin du temps imparti. Vérifiez que vos réponses sont complètes.
            </p>
            <button onClick={() => setShowTimeWarning(false)}
              className="btn-primary w-full text-sm py-2.5">
              J'ai compris
            </button>
          </div>
        </div>
      )}

      {/* Modal d'avertissement sortie (1ère tentative) */}
      {showExitWarning && (
        <div className="fixed inset-0 z-[9997] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md glass-card p-8 rounded-xl animate-scale-in border-2 border-rose-accent/50 shadow-xl shadow-rose-accent/10">
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-rose-accent/15 flex items-center justify-center border-2 border-rose-accent/30">
              <svg className="w-8 h-8 text-rose-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-xl font-heading font-bold text-rose-accent text-center mb-3">
               TENTATIVE DE FRAUDE DÉTECTÉE
            </h3>
            <div className="bg-rose-accent/5 border border-rose-accent/15 rounded-xl p-4 mb-5 space-y-2">
              <p className="text-sm text-rose-accent/90 text-center font-medium">
                Vous avez essayé de quitter l'épreuve. Ce comportement a été <strong className="text-white">signalé à votre enseignant</strong>.
              </p>
              <div className="border-t border-rose-accent/10 pt-2 mt-2">
                <p className="text-sm text-white font-bold text-center">
                   PROCHAINE TENTATIVE = SOUMISSION IMMÉDIATE
                </p>
                <p className="text-xs text-rose-accent/70 text-center mt-1">
                  Si vous quittez à nouveau, votre copie sera soumise automatiquement et vous <strong className="text-rose-accent">perdrez l'accès à l'épreuve</strong>.
                </p>
              </div>
            </div>
            <button onClick={handleConfirmWarning}
              className="btn-primary w-full text-sm py-3 font-bold bg-rose-accent hover:bg-rose-accent/90 text-white border border-rose-accent/30 hover:border-rose-accent/50 transition-all shadow-lg shadow-rose-accent/20">
              J'ai compris, je reste dans l'épreuve
            </button>
          </div>
        </div>
      )}

      <KioskMode onExitAttempt={handleExitAttempt} warningActive={showExitWarning}>
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
              {/* Bouton repli/déplie épreuve (mobile) */}
              <button
                onClick={() => setExamPanelOpen(!examPanelOpen)}
                className="lg:hidden p-1.5 rounded-lg text-muted/60 hover:text-white hover:bg-white/5 transition-all"
                title={examPanelOpen ? 'Masquer l\'énoncé' : 'Afficher l\'énoncé'}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {examPanelOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  )}
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-3">
              {/* Indicateur de sauvegarde */}
              {lastSaved && (
                <span className="text-[10px] text-muted/50 hidden sm:inline-flex items-center gap-1">
                  <svg className="w-3 h-3 text-emerald-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Sauvegarde {Math.max(0, Math.round((Date.now() - lastSaved.getTime()) / 1000))}s
                </span>
              )}

              <span className="text-xs text-muted hidden sm:inline">Temps restant :</span>
              <span className={`font-mono text-lg font-bold tabular-nums ${
                timeLeft < 300 ? 'text-rose-accent animate-pulse' : 'text-neon-cyan'
              }`}>
                {formatTime(timeLeft)}
              </span>
              <button onClick={handleSubmitConfirm} disabled={submitting}
                className={`btn btn-sm font-medium ${timeLeft < 300 ? 'btn-danger animate-glow-pulse' : 'btn-primary'}`}>
                {submitting ? 'Soumission...' : 'Envoyer'}
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
              <button onClick={handleRetrySubmit} disabled={submitting}
                className="ml-auto text-xs px-3 py-1 rounded-lg bg-rose-accent/20 hover:bg-rose-accent/30 transition-all">
                {submitting ? 'Nouvelle tentative...' : 'Réessayer'}
              </button>
            </div>
          )}

          {/* Zone de composition — chaque exercice a son propre champ de saisie */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Panneau latéral repliable (mobile) : énoncé seul */}
            <div className={`lg:w-2/5 bg-midnight/40 p-4 lg:p-6 overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/5 transition-all duration-300 ${
              examPanelOpen ? 'max-h-[35vh] lg:max-h-none' : 'max-h-0 lg:max-h-none lg:w-12 lg:min-w-[3rem] overflow-hidden'
            }`}>
              <h2 className="font-heading font-bold text-lg mb-4 text-white">
                {examContent?.subject || 'Épreuve'}
              </h2>

              {(() => {
                // Verifier si le contenu contient un fichier sujet uploade
                const fileSubject = Array.isArray(exercises) ? exercises.find((ex) => ex.type === 'file_subject') : null
                if (fileSubject) {
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-4 bg-midnight/80 rounded-xl border border-white/5">
                        <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 flex items-center justify-center border border-neon-cyan/20 flex-shrink-0">
                          <svg className="w-5 h-5 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{fileSubject.filename}</p>
                          <p className="text-xs text-muted/60">Sujet d'examen — fichier déposé par l'enseignant</p>
                        </div>
                        <a href={fileSubject.url} target="_blank" rel="noopener noreferrer"
                          className="btn btn-primary btn-sm whitespace-nowrap">
                          Ouvrir le sujet
                        </a>
                      </div>
                      {fileSubject.mime_type === 'application/pdf' && (
                        <div className="bg-midnight/80 rounded-xl border border-white/5 overflow-hidden">
                          <iframe
                            src={fileSubject.url}
                            className="w-full h-[60vh]"
                            title="Sujet d'examen"
                          />
                        </div>
                      )}
                    </div>
                  )
                }
                return exercises.length > 0 ? (
                  <div className="space-y-4">
                    {exercises.map((ex, idx) => (
                      <div key={ex.exercise_id || idx} className="p-4 bg-midnight/80 rounded-xl border border-white/5 card-hover">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-sm text-white">
                            {ex.exercise_title || `Exercice ${idx + 1}`}
                            <span className="ml-2 text-[10px] font-mono opacity-50">
                              {ex.exercise_type === 'qcm' ? 'QCM' : ex.exercise_type === 'code' ? 'Code' : ex.exercise_type === 'open' ? 'Rédaction' : ex.exercise_type}
                            </span>
                          </h3>
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
                )
              })()}

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
                    {timeLeft < 300 ? ' Il reste moins de 5 minutes !' : ''}
                  </p>
                </div>
              )}
            </div>

            {/* Panneau droit : réponses par exercice */}
            <div className="flex-1 flex flex-col bg-deep-space overflow-y-auto">
              <div className="px-4 lg:px-6 py-2.5 bg-midnight border-b border-white/5 text-xs text-muted font-medium">
                Zone de réponse{hasCodeEx ? ' — Chaque exercice de code a sa propre console indépendante' : ''}
              </div>
              <div className="flex-1 p-4 lg:p-6 space-y-6 overflow-y-auto">
                {exercises.filter(e => e.type !== 'file_subject').map((ex, idx) => {
                  const exId = ex.exercise_id || idx
                  const exType = ex.exercise_type || 'open'
                  const answer = getAnswer(exId)

                  return (
                    <div key={exId} className="p-4 bg-midnight/60 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-white">
                          {ex.exercise_title || `Exercice ${idx + 1}`}
                          <span className="ml-2 text-[10px] font-mono opacity-50">
                            {exType === 'qcm' ? 'QCM' : exType === 'code' ? 'Code' : 'Rédaction'}
                          </span>
                        </h4>
                        <span className="text-[10px] font-mono text-amber-iq/70 bg-amber-iq/10 px-2 py-0.5 rounded-full border border-amber-iq/15">
                          {ex.points} pts
                        </span>
                      </div>

                      {/* QCM : radios boutons */}
                      {exType === 'qcm' && (
                        <div className="space-y-2">
                          {(() => {
                            const choices = parseQCMChoices(ex.content || ex.instructions || '', ex.data_overrides)
                            if (choices.length === 4) {
                              return choices.map((choice) => {
                                const letter = choice.charAt(0)
                                const isSelected = answer === letter
                                return (
                                  <label
                                    key={letter}
                                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
                                      isSelected
                                        ? 'bg-neon-cyan/10 border-neon-cyan/30 text-white'
                                        : 'bg-white/[0.03] border-white/5 text-text-secondary hover:bg-white/[0.06]'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`qcm_${exId}`}
                                      value={letter}
                                      checked={isSelected}
                                      onChange={() => setAnswer(exId, letter)}
                                      className="w-4 h-4 accent-neon-cyan"
                                    />
                                    <span className="text-sm">{choice}</span>
                                  </label>
                                )
                              })
                            }
                            // Fallback : textarea si choix non detectes
                            return (
                              <textarea
                                value={answer}
                                onChange={(e) => setAnswer(exId, e.target.value)}
                                placeholder="Votre réponse..."
                                className="input w-full h-20 text-sm"
                              />
                            )
                          })()}
                        </div>
                      )}

                      {/* Question ouverte : éditeur avec support formules */}
                      {exType === 'open' && (
                        <FormulaEditor
                          value={answer}
                          onChange={(v) => setAnswer(exId, v)}
                          placeholder="Rédigez votre réponse ici..."
                        />
                      )}

                      {/* Code : éditeur avec console indépendante par exercice */}
                      {exType === 'code' && (
                        <div className="space-y-3">
                          {/* En-tête console — nom de l'exercice */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono bg-violet-iq/10 text-violet-iq px-2 py-0.5 rounded border border-violet-iq/20">
                              Terminal #{idx + 1}
                            </span>
                            {ex.language && (
                              <span className="text-[10px] font-mono bg-white/5 text-muted px-1.5 py-0.5 rounded border border-white/5">{ex.language}</span>
                            )}
                            <button
                              onClick={async () => {
                                setRunningSet(prev => new Set(prev).add(exId))
                                setConsoleVisibleMap(prev => ({ ...prev, [exId]: true }))
                                setTestResultsMap(prev => ({ ...prev, [exId]: null }))
                                setShowCodeTestResultsMap(prev => ({ ...prev, [exId]: false }))
                                // Message si le code utilise input() sans stdin fourni
                                if (!stdinMap[exId] && /input\(|readline|scanf|cin\s*>>|Scanner|System\.in/.test(answer)) {
                                  setConsoleLinesMap(prev => ({ ...prev, [exId]: [
                                    { type: 'system', text: ' Données d\'entrée : tapez dans le champ $ en bas de la console puis cliquez "Exécuter"' },
                                    { type: 'system', text: ' Exécution en cours...' },
                                  ]}))
                                } else {
                                  setConsoleLinesMap(prev => ({ ...prev, [exId]: [{ type: 'system', text: ' Exécution en cours...' }] }))
                                }
                                try {
                                  const result = await judgeApi.runCode({
                                    code: answer,
                                    language: ex.language || codeLanguage,
                                    stdin: stdinMap[exId] || '',
                                    session_code: code,
                                    student_number: form.student_number,
                                  })
                                  const lines: ConsoleLine[] = []
                                  if (result.error) lines.push({ type: 'error', text: ` ${result.error}` })
                                  if (result.stdout) lines.push({ type: 'stdout', text: result.stdout })
                                  if (result.stderr) lines.push({ type: 'stderr', text: result.stderr })
                                  if (result.exit_code !== 0 && !result.error) lines.push({ type: 'stderr', text: `Process exited with code ${result.exit_code}` })
                                  if (lines.length === 0) lines.push({ type: 'stdout', text: '(aucune sortie)' })
                                  lines.push({ type: 'system', text: ` Terminé en ${result.time_seconds}s` })
                                  setConsoleLinesMap(prev => ({ ...prev, [exId]: lines }))
                                } catch (err: any) {
                                  setConsoleLinesMap(prev => ({ ...prev, [exId]: [{ type: 'error', text: `Erreur : ${err.response?.data?.detail || err.message || "Impossible d'exécuter le code"}` }] }))
                                } finally {
                                  setRunningSet(prev => { const s = new Set(prev); s.delete(exId); return s })
                                }
                              }}
                              disabled={runningSet.has(exId) || !answer.trim()}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-cyan/10 hover:bg-neon-cyan/20 disabled:opacity-40 disabled:cursor-not-allowed text-neon-cyan text-xs font-medium rounded-lg transition-all border border-neon-cyan/20"
                            >
                              {runningSet.has(exId) ? (
                                <><span className="w-3 h-3 border border-neon-cyan/50 border-t-neon-cyan rounded-full animate-spin" /> Exécution...</>
                              ) : ' Exécuter'}
                            </button>
                            <button
                              onClick={async () => {
                                setRunningSet(prev => new Set(prev).add(exId))
                                setConsoleVisibleMap(prev => ({ ...prev, [exId]: false }))
                                setTestResultsMap(prev => ({ ...prev, [exId]: null }))
                                setShowCodeTestResultsMap(prev => ({ ...prev, [exId]: true }))
                                const testCases = ex.data_overrides?.test_cases || ex.data_overrides?.tests || []
                                try {
                                  const result = await judgeApi.submitCode({
                                    code: answer,
                                    language: ex.language || codeLanguage,
                                    test_cases: testCases,
                                    session_code: code,
                                    student_number: form.student_number,
                                  })
                                  setTestResultsMap(prev => ({ ...prev, [exId]: result }))
                                } catch (err: any) {
                                  setShowCodeTestResultsMap(prev => ({ ...prev, [exId]: true }))
                                  setTestResultsMap(prev => ({ ...prev, [exId]: { passed: 0, total: 0, results: [{ description: 'Erreur', passed: false, input: '', expected_output: '', actual_output: err.response?.data?.detail || err.message, error: err.response?.data?.detail || err.message }] } }))
                                } finally {
                                  setRunningSet(prev => { const s = new Set(prev); s.delete(exId); return s })
                                }
                              }}
                              disabled={runningSet.has(exId) || !answer.trim()}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-iq/10 hover:bg-amber-iq/20 disabled:opacity-40 disabled:cursor-not-allowed text-amber-iq text-xs font-medium rounded-lg transition-all border border-amber-iq/20"
                            >
                              Tester
                            </button>
                            {/* Effacer la console de cet exercice */}
                            {(consoleLinesMap[exId]?.length > 0 || testResultsMap[exId]) && (
                              <button
                                onClick={() => {
                                  setConsoleLinesMap(prev => ({ ...prev, [exId]: [] }))
                                  setTestResultsMap(prev => ({ ...prev, [exId]: null }))
                                  setShowCodeTestResultsMap(prev => ({ ...prev, [exId]: false }))
                                  setConsoleVisibleMap(prev => ({ ...prev, [exId]: false }))
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-muted text-xs rounded-lg transition-all border border-white/5"
                                title="Effacer la console"
                              >
                                 Vider
                              </button>
                            )}
                          </div>

                          <CodeEditor
                            value={answer}
                            onChange={(v) => setAnswer(exId, v)}
                            language={ex.language || codeLanguage}
                            onLanguageChange={(l) => setCodeLanguage(l)}
                            placeholder="Écrivez votre code ici..."
                            height="280px"
                          />


                          {/* Console indépendante — avec entrée terminal intégrée */}
                          <ExecConsole
                            lines={consoleLinesMap[exId] || []}
                            visible={!!consoleVisibleMap[exId]}
                            onToggle={() => setConsoleVisibleMap(prev => ({ ...prev, [exId]: !prev[exId] }))}
                            loading={runningSet.has(exId)}
                            stdinValue={stdinMap[exId] || ''}
                            onStdinChange={(v) => setStdinMap(prev => ({ ...prev, [exId]: v }))}
                            stdinPlaceholder="Tapez les données d'entrée ici (appuyez sur Exécuter pour envoyer)..."
                          />
                          {showCodeTestResultsMap[exId] && testResultsMap[exId] && (
                            <TestResultsView
                              results={testResultsMap[exId].results}
                              passed={testResultsMap[exId].passed}
                              total={testResultsMap[exId].total}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </KioskMode>
      </>
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
