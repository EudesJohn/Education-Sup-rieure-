#!/usr/bin/env node

/**
 * Mock serveur PEAN — remplace le backend FastAPI + PostgreSQL
 * pour le développement local. Aucune base de données nécessaire.
 *
 * Usage :
 *   node scripts/mock-server.mjs
 *
 * Le Vite dev server proxy /api → localhost:8000, donc ce serveur
 * répond à la place du vrai backend.
 *
 * Toutes les données sont stockées en mémoire et réinitialisées
 * à chaque redémarrage.
 */

import http from 'node:http'
import { randomUUID } from 'node:crypto'

// ============================================================
// Mini-router
// ============================================================
class Router {
  #routes = []

  get(path, handler) { this.#routes.push(['GET', path, handler]) }
  post(path, handler) { this.#routes.push(['POST', path, handler]) }
  put(path, handler) { this.#routes.push(['PUT', path, handler]) }
  delete(path, handler) { this.#routes.push(['DELETE', path, handler]) }

  /** Convertit /teacher/sessions/:id en regex avec paramètres nommés. */
  match(method, pathname) {
    for (const [m, pattern, handler] of this.#routes) {
      if (m !== method) continue
      // Construire une regex depuis le pattern :id → (?<id>[^/]+)
      const paramNames = []
      const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
        paramNames.push(name)
        return '([^/]+)'
      })
      const re = new RegExp(`^${regexStr}$`)
      const m2 = pathname.match(re)
      if (m2) {
        const params = {}
        paramNames.forEach((name, i) => { params[name] = m2[i + 1] })
        return { handler, params }
      }
    }
    return null
  }
}

// ============================================================
// Fake JWT (encodage base64 simple, PAS sécurisé)
// ============================================================
function makeToken(payload) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `mock-jwt.${b64}.fake-signature`
}

function decodeToken(token) {
  try {
    const parts = token?.split('.')
    if (parts?.length !== 3) return null
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  } catch { return null }
}

// ============================================================
// Base de données en mémoire
// ============================================================
const db = {
  users: [
    {
      id: 1, email: 'jean.konan@univ-ci.edu', password: 'password123',
      full_name: 'Dr. Jean Konan', role: 'teacher', is_active: true,
      subject: 'Mathématiques', university: 'Université Félix Houphouët-Boigny',
    },
    {
      id: 2, email: 'admin@pean.edu', password: 'admin123',
      full_name: 'Admin PEAN', role: 'admin', is_active: true,
    },
  ],
  sessions: [],
  exercises: [],
  submissions: [],
  corrections: [],
  incidents: [],
  nextId: { session: 1, exercise: 1, variant: 1, submission: 1, correction: 1, incident: 1 },
}

// ============================================================
// Données de départ — exercices préremplis
// ============================================================
function seedExercises() {
  const exs = [
    {
      id: db.nextId.exercise++, title: 'Dérivation — Calcul de dérivées',
      subject: 'Mathématiques', difficulty: 'medium', exercise_type: 'open',
      instructions: 'Calculez la dérivée des fonctions suivantes :<br><br>1. f(x) = 3x² + 2x - 5<br>2. g(x) = sin(2x)<br>3. h(x) = ln(x² + 1)',
      correct_answer: '1. f\'(x) = 6x + 2<br>2. g\'(x) = 2cos(2x)<br>3. h\'(x) = 2x/(x² + 1)',
      points: 15, variants: [
        { id: db.nextId.variant++, variant_order: 1, content: 'f(x)=3x²+2x-5, g(x)=sin(2x), h(x)=ln(x²+1)' },
        { id: db.nextId.variant++, variant_order: 2, content: 'f(x)=5x³-2x, g(x)=cos(3x), h(x)=ln(x³+2)' },
      ],
    },
    {
      id: db.nextId.exercise++, title: 'QCM — Limites et continuité',
      subject: 'Mathématiques', difficulty: 'hard', exercise_type: 'qcm',
      instructions: 'Répondez aux questions suivantes :<br><br>1. Quelle est la limite de sin(x)/x quand x→0 ?<br>2. La fonction f(x)=|x| est-elle dérivable en 0 ?<br>3. Quel est le théorème des valeurs intermédiaires ?',
      correct_answer: '1. 1<br>2. Non<br>3. Si f continue sur [a,b], alors pour tout k entre f(a) et f(b), il existe c∈[a,b] tel que f(c)=k',
      points: 20, variants: [],
    },
    {
      id: db.nextId.exercise++, title: 'Algorithmique — Tri par insertion',
      subject: 'Informatique', difficulty: 'medium', exercise_type: 'code',
      instructions: 'Implémentez l\'algorithme du tri par insertion en Python.<br><br>La fonction doit prendre une liste en entrée et retourner la liste triée.',
      correct_answer: 'def tri_insertion(arr):\n    for i in range(1, len(arr)):\n        key = arr[i]\n        j = i - 1\n        while j >= 0 and arr[j] > key:\n            arr[j + 1] = arr[j]\n            j -= 1\n        arr[j + 1] = key\n    return arr',
      points: 25, language: 'python', variants: [],
    },
    {
      id: db.nextId.exercise++, title: 'Équations différentielles',
      subject: 'Mathématiques', difficulty: 'hard', exercise_type: 'open',
      instructions: 'Résolvez les équations différentielles suivantes :<br><br>1. y\' + 2y = 0<br>2. y\'\' - 3y\' + 2y = 0',
      correct_answer: '1. y = Ce^(-2x)<br>2. y = C₁e^x + C₂e^(2x)',
      points: 20, variants: [
        { id: db.nextId.variant++, variant_order: 1, content: 'y\' + 2y=0, y\'\'-3y\'+2y=0' },
        { id: db.nextId.variant++, variant_order: 2, content: 'y\' - 3y=0, y\'\'+y\'-6y=0' },
      ],
    },
  ]
  db.exercises.push(...exs)
}

function seedSessions() {
  const now = Date.now()
  db.sessions.push(
    {
      id: db.nextId.session++, title: 'DS1 Analyse — L2 Maths',
      subject: 'Mathématiques', description: 'Premier devoir surveillé d\'analyse',
      status: 'completed', access_code: 'MATH2024',
      duration_seconds: 5400, grading_system: '20', correction_mode: 'ai_then_teacher',
      student_count: 48, exams_generated: 48, exams_submitted: 45, exams_started: 48,
      created_at: new Date(now - 604800000).toISOString(),
      teacher_name: 'Dr. Jean Konan',
    },
    {
      id: db.nextId.session++, title: 'TD Algorithmique — L1 Info',
      subject: 'Informatique', description: 'Travaux dirigés — algorithmes de tri',
      status: 'active', access_code: 'ALGO2024',
      duration_seconds: 3600, grading_system: '20', correction_mode: 'ai_only',
      student_count: 32, exams_generated: 32, exams_submitted: 18, exams_started: 28,
      created_at: new Date(now - 259200000).toISOString(),
      teacher_name: 'Dr. Jean Konan',
    },
    {
      id: db.nextId.session++, title: 'Examen — Probabilités L3',
      subject: 'Mathématiques', description: 'Examen final de probabilités',
      status: 'draft', access_code: 'PROBA24',
      duration_seconds: 7200, grading_system: '20', correction_mode: 'ai_then_teacher',
      student_count: 36, exams_generated: 0, exams_submitted: 0, exams_started: 0,
      created_at: new Date(now - 86400000).toISOString(),
      teacher_name: 'Dr. Jean Konan',
    },
  )
}

// Semences initiales
seedExercises()
seedSessions()

// ============================================================
// Utilitaires
// ============================================================
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function csvBlob(res, csv) {
  res.writeHead(200, {
    'Content-Type': 'text/csv',
    'Content-Disposition': 'attachment; filename="resultats.csv"',
  })
  res.end(csv)
}

function requireAuth(token) {
  if (!token) return null
  const payload = decodeToken(token.replace('Bearer ', ''))
  if (!payload) return null
  const user = db.users.find(u => u.id === payload.user_id)
  return user || null
}

/** Transforme un accès en snake_case comme dans le vrai backend. */
function toSnake(obj) {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(toSnake)
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      const sk = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase())
      result[sk] = toSnake(value)
    }
    return result
  }
  return obj
}

// ============================================================
// Construction des routes
// ============================================================
const router = new Router()

// ---- Auth ----
router.post('/api/auth/login', (req, res, body) => {
  const user = db.users.find(u => u.email === body.email && u.password === body.password)
  if (!user) return json(res, { detail: 'Email ou mot de passe incorrect' }, 401)

  const payload = { user_id: user.id, role: user.role, sub: user.email }
  const token = makeToken(payload)
  const refreshToken = makeToken({ ...payload, type: 'refresh' })

  json(res, toSnake({
    accessToken: token, refreshToken,
    teacher: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, university: user.university },
  }))
})

router.post('/api/auth/register', (req, res, body) => {
  if (db.users.find(u => u.email === body.email)) {
    return json(res, { detail: 'Cet email est déjà utilisé' }, 400)
  }
  const user = {
    id: db.users.length + 1, email: body.email, password: body.password,
    full_name: body.full_name, role: 'teacher', is_active: true,
    university: body.university || '',
    subject: body.subject || '',
  }
  db.users.push(user)

  const payload = { user_id: user.id, role: 'teacher', sub: user.email }
  const token = makeToken(payload)
  json(res, toSnake({
    accessToken: token, refreshToken: makeToken({ ...payload, type: 'refresh' }),
    teacher: { id: user.id, email: user.email, fullName: user.full_name, role: 'teacher', university: user.university },
  }), 201)
})

router.post('/api/auth/refresh', (req, res, body) => {
  const payload = decodeToken(body.refresh_token)
  if (!payload) return json(res, { detail: 'Token invalide' }, 401)
  const user = db.users.find(u => u.id === payload.user_id)
  if (!user) return json(res, { detail: 'Utilisateur introuvable' }, 401)
  const newPayload = { user_id: user.id, role: user.role, sub: user.email }
  json(res, { access_token: makeToken(newPayload) })
})

router.post('/api/auth/verify-email', (req, res) => json(res, { message: 'Email vérifié avec succès' }))
router.post('/api/auth/forgot-password', (req, res) => json(res, { message: 'Email de réinitialisation envoyé' }))
router.post('/api/auth/reset-password', (req, res) => json(res, { message: 'Mot de passe réinitialisé avec succès' }))

router.get('/api/auth/me', (req, res) => {
  const user = requireAuth(req.headers.authorization)
  if (!user) return json(res, { detail: 'Non authentifié' }, 401)
  json(res, toSnake({
    id: user.id, email: user.email, fullName: user.full_name,
    role: user.role, university: user.university, subject: user.subject, isActive: user.is_active,
  }))
})

// ---- Teacher Profile ----
router.get('/api/teacher/profile', (req, res) => {
  const user = requireAuth(req.headers.authorization)
  if (!user) return json(res, { detail: 'Non authentifié' }, 401)
  json(res, toSnake({
    id: user.id, email: user.email, fullName: user.full_name,
    role: user.role, university: user.university, subject: user.subject, isActive: user.is_active,
  }))
})

router.put('/api/teacher/profile', (req, res, body) => {
  const user = requireAuth(req.headers.authorization)
  if (!user) return json(res, { detail: 'Non authentifié' }, 401)
  Object.assign(user, body)
  json(res, toSnake({
    id: user.id, email: user.email, fullName: user.full_name,
    role: user.role, university: user.university, subject: user.subject,
  }))
})

// ---- Teacher Dashboard ----
router.get('/api/teacher/dashboard', (req, res) => {
  const user = requireAuth(req.headers.authorization)
  if (!user) return json(res, { detail: 'Non authentifié' }, 401)

  const activeSessions = db.sessions.filter(s => s.status === 'active')
  json(res, toSnake({
    totalSessions: db.sessions.length,
    activeSessions: activeSessions.length,
    totalStudents: db.sessions.reduce((sum, s) => sum + s.student_count, 0),
    totalExercises: db.exercises.length,
    recentSessions: db.sessions.slice(-3).reverse(),
  }))
})

// ---- Teacher Sessions ----
router.get('/api/teacher/sessions', (req, res) => {
  const user = requireAuth(req.headers.authorization)
  if (!user) return json(res, { detail: 'Non authentifié' }, 401)

  const url = new URL(req.url, 'http://localhost')
  const status = url.searchParams.get('status')
  let sessions = [...db.sessions]
  if (status) sessions = sessions.filter(s => s.status === status)
  json(res, toSnake({ items: sessions, total: sessions.length }))
})

router.post('/api/teacher/sessions', (req, res, body) => {
  const user = requireAuth(req.headers.authorization)
  if (!user) return json(res, { detail: 'Non authentifié' }, 401)

  const session = {
    id: db.nextId.session++,
    title: body.title || 'Nouvelle session',
    subject: body.subject || '',
    description: body.description || '',
    status: 'draft',
    access_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
    duration_seconds: body.duration_seconds || 3600,
    grading_system: body.grading_system || '20',
    correction_mode: body.correction_mode || 'ai_then_teacher',
    student_count: 0,
    exams_generated: 0,
    exams_submitted: 0,
    exams_started: 0,
    created_at: new Date().toISOString(),
    teacher_name: user.full_name,
  }
  db.sessions.push(session)
  json(res, toSnake(session), 201)
})

router.get('/api/teacher/sessions/:id', (req, res, { id }) => {
  const sid = parseInt(id)
  const session = db.sessions.find(s => s.id === sid)
  if (!session) return json(res, { detail: 'Session introuvable' }, 404)
  json(res, toSnake(session))
})

router.put('/api/teacher/sessions/:id', (req, res, body, { id }) => {
  const sid = parseInt(id)
  const session = db.sessions.find(s => s.id === sid)
  if (!session) return json(res, { detail: 'Session introuvable' }, 404)
  Object.assign(session, body)
  json(res, toSnake(session))
})

router.delete('/api/teacher/sessions/:id', (req, res, body, { id }) => {
  const sid = parseInt(id)
  const idx = db.sessions.findIndex(s => s.id === sid)
  if (idx === -1) return json(res, { detail: 'Session introuvable' }, 404)
  db.sessions.splice(idx, 1)
  json(res, { message: 'Session supprimée' })
})

router.post('/api/teacher/sessions/:id/launch', (req, res, body, { id }) => {
  const sid = parseInt(id)
  const session = db.sessions.find(s => s.id === sid)
  if (!session) return json(res, { detail: 'Session introuvable' }, 404)
  session.status = 'active'
  json(res, toSnake(session))
})

router.post('/api/teacher/sessions/:id/complete', (req, res, body, { id }) => {
  const sid = parseInt(id)
  const session = db.sessions.find(s => s.id === sid)
  if (!session) return json(res, { detail: 'Session introuvable' }, 404)
  session.status = 'completed'
  json(res, toSnake(session))
})

router.post('/api/teacher/sessions/:id/generate-exams', (req, res, body, { id }) => {
  const sid = parseInt(id)
  const session = db.sessions.find(s => s.id === sid)
  if (!session) return json(res, { detail: 'Session introuvable' }, 404)
  session.exams_generated = session.student_count
  json(res, toSnake({ message: 'Épreuves générées', count: session.student_count }))
})

// ---- Exercises ----
router.get('/api/exams/exercises', (req, res) => {
  const user = requireAuth(req.headers.authorization)
  if (!user) return json(res, { detail: 'Non authentifié' }, 401)
  json(res, toSnake(db.exercises))
})

router.get('/api/exams/exercises/:id', (req, res, { id }) => {
  const eid = parseInt(id)
  const exercise = db.exercises.find(e => e.id === eid)
  if (!exercise) return json(res, { detail: 'Exercice introuvable' }, 404)
  json(res, toSnake(exercise))
})

router.post('/api/exams/exercises', (req, res, body) => {
  const user = requireAuth(req.headers.authorization)
  if (!user) return json(res, { detail: 'Non authentifié' }, 401)
  const exercise = {
    id: db.nextId.exercise++,
    title: body.title || 'Nouvel exercice',
    subject: body.subject || '',
    difficulty: body.difficulty || 'medium',
    exercise_type: body.exercise_type || 'open',
    instructions: body.instructions || '',
    correct_answer: body.correct_answer || '',
    points: parseInt(body.points) || 10,
    variants: [],
  }
  db.exercises.push(exercise)
  json(res, toSnake(exercise), 201)
})

router.put('/api/exams/exercises/:id', (req, res, body, { id }) => {
  const eid = parseInt(id)
  const exercise = db.exercises.find(e => e.id === eid)
  if (!exercise) return json(res, { detail: 'Exercice introuvable' }, 404)
  Object.assign(exercise, body)
  json(res, toSnake(exercise))
})

router.delete('/api/exams/exercises/:id', (req, res, body, { id }) => {
  const eid = parseInt(id)
  const idx = db.exercises.findIndex(e => e.id === eid)
  if (idx === -1) return json(res, { detail: 'Exercice introuvable' }, 404)
  db.exercises.splice(idx, 1)
  json(res, { message: 'Exercice supprimé' })
})

router.post('/api/exams/exercises/:id/variants', (req, res, body, { id }) => {
  const eid = parseInt(id)
  const exercise = db.exercises.find(e => e.id === eid)
  if (!exercise) return json(res, { detail: 'Exercice introuvable' }, 404)
  const variant = {
    id: db.nextId.variant++,
    variant_order: (exercise.variants?.length || 0) + 1,
    content: body.content || '',
  }
  if (!exercise.variants) exercise.variants = []
  exercise.variants.push(variant)
  json(res, toSnake(variant), 201)
})

router.get('/api/exams/exercises/:id/variants', (req, res, { id }) => {
  const eid = parseInt(id)
  const exercise = db.exercises.find(e => e.id === eid)
  if (!exercise) return json(res, { detail: 'Exercice introuvable' }, 404)
  json(res, toSnake(exercise.variants || []))
})

router.post('/api/exams/upload', (req, res) => {
  json(res, { url: '/uploads/mock-file.pdf', filename: 'document.pdf' })
})

// ---- Student ----
router.post('/api/sessions/:code/join', (req, res, body, { code }) => {
  const session = db.sessions.find(s => s.access_code === code && s.status !== 'draft')
  if (!session) return json(res, { detail: 'Code de session invalide ou session inactive' }, 404)

  const studentToken = makeToken({ session_code: code, student_number: body.student_number, role: 'student' })
  json(res, toSnake({
    session: { id: session.id, title: session.title, subject: session.subject, duration_seconds: session.duration_seconds, grading_system: session.grading_system },
    studentToken,
  }))
})

router.get('/api/student/exam', (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const sessionCode = url.searchParams.get('session_code')
  const session = db.sessions.find(s => s.access_code === sessionCode)
  if (!session) return json(res, { detail: 'Session introuvable' }, 404)

  // Associe quelques exercices à l'épreuve
  const content = JSON.stringify(db.exercises.slice(0, 3).map((ex, i) => ({
    exercise_id: ex.id,
    exercise_title: ex.title,
    difficulty: ex.difficulty,
    points: ex.points,
    instructions: ex.instructions,
    variant_id: ex.variants?.[0]?.id || null,
    content: ex.variants?.[0]?.content || ex.instructions,
    exercise_type: ex.exercise_type,
    language: ex.language || null,
  })))

  const exam_id = session.id * 100 + 1
  json(res, toSnake({
    exam_id,
    session_id: session.id,
    duration_seconds: session.duration_seconds,
    title: session.title,
    subject: session.subject,
    content,
    status: 'started',
    started_at: new Date().toISOString(),
  }))
})

router.post('/api/student/submit', (req, res, body) => {
  const submission = {
    id: db.nextId.submission++,
    content: body.content || '',
    submitted_at: new Date().toISOString(),
    auto_submitted: body.auto_submitted || false,
  }
  db.submissions.push(submission)
  json(res, toSnake({ message: 'Copie soumise avec succès', submission_id: submission.id }))
})

router.post('/api/student/incident', (req, res) => {
  const incident = {
    id: db.nextId.incident++,
    ...req.body,
    timestamp: new Date().toISOString(),
    severity: 'low',
  }
  db.incidents.push(incident)
  json(res, toSnake({ message: 'Incident signalé', incident_id: incident.id }))
})

router.get('/api/sessions/:code/status', (req, res, { code }) => {
  const session = db.sessions.find(s => s.access_code === code)
  if (!session) return json(res, { detail: 'Session introuvable' }, 404)
  json(res, toSnake({ status: session.status, title: session.title }))
})

// ---- Grading ----
router.get('/api/grading/sessions/:id/submissions', (req, res, { id }) => {
  const sid = parseInt(id)

  // Générer des soumissions fictives
  const names = [
    { name: 'Kouamé Adjoa', number: 'MAT2023001', class: 'L2 Maths' },
    { name: 'Konan Yao', number: 'MAT2023002', class: 'L2 Maths' },
    { name: 'N\'Guessan Aya', number: 'MAT2023003', class: 'L2 Maths' },
    { name: 'Brou Jérôme', number: 'MAT2023004', class: 'L2 Maths' },
    { name: 'Koffi Amenan', number: 'MAT2023005', class: 'L2 Maths' },
    { name: 'Zadi Franck', number: 'MAT2023006', class: 'L2 Maths' },
    { name: 'Ahoussi Esther', number: 'MAT2023007', class: 'L2 Maths' },
    { name: 'Tano Éric', number: 'MAT2023008', class: 'L2 Maths' },
  ]

  const url = new URL(req.url, 'http://localhost')
  const statusFilter = url.searchParams.get('status')

  const submissions = names.map((n, i) => {
    const statuses = ['pending', 'ai_corrected', 'teacher_reviewed']
    const status = statuses[i % 3]
    const scores = { pending: null, ai_corrected: 8 + Math.random() * 10, teacher_reviewed: 10 + Math.random() * 8 }
    return {
      submission_id: sid * 100 + i + 1,
      student_name: n.name,
      student_number: n.number,
      class_name: n.class,
      submitted_at: new Date(Date.now() - (names.length - i) * 600000).toISOString(),
      auto_submitted: i > 4,
      correction_status: status,
      final_score: status === 'teacher_reviewed' ? Math.round((scores[status] + 2) * 10) / 10 : null,
      ai_score: status !== 'pending' ? Math.round(scores[status] * 10) / 10 : null,
    }
  })

  const filtered = statusFilter ? submissions.filter(s => s.correction_status === statusFilter) : submissions
  json(res, toSnake({ items: filtered, total: filtered.length }))
})

router.get('/api/grading/submissions/:id', (req, res, { id }) => {
  const subId = parseInt(id)
  const aiScore = 10 + Math.random() * 8
  const data = {
    submission: {
      id: subId,
      student_name: 'Kouamé Adjoa',
      student_number: 'MAT2023001',
      class_name: 'L2 Maths',
      university: 'Université Félix Houphouët-Boigny',
      submitted_at: new Date(Date.now() - 3600000).toISOString(),
      auto_submitted: false,
    },
    exam_content: JSON.stringify([
      { exercise_title: 'Dérivation', points: 15, instructions: 'Calculez les dérivées...' },
      { exercise_title: 'Limites', points: 20, instructions: 'Étudiez les limites...' },
    ]),
    student_content: '<p>Voici ma réponse à l\'exercice de dérivation :</p><p>f\'(x) = 6x + 2</p><p>g\'(x) = 2cos(2x)</p>',
    correction: {
      id: subId + 1000,
      ai_score: Math.round(aiScore * 10) / 10,
      ai_feedback: 'L\'étudiant a correctement calculé les dérivées de base. La méthode est bonne, mais il manque des justifications pour les cas complexes. La rédaction est claire et bien structurée.',
      ai_detailed_scores: JSON.stringify([
        { exercise: 'Dérivation', score: 12, max_points: 15, comment: 'Dérivées correctes, justifications partielles' },
        { exercise: 'Limites', score: 8, max_points: 20, comment: 'Raisonnement incomplet' },
      ]),
      ai_corrected_at: new Date().toISOString(),
      teacher_score: null,
      teacher_feedback: null,
      final_score: null,
      correction_status: 'ai_corrected',
      grading_system: '20',
    },
  }
  json(res, toSnake(data))
})

router.post('/api/grading/submissions/:id/correct-ai', (req, res) => {
  const score = 8 + Math.random() * 10
  json(res, toSnake({
    correction_id: parseInt(req.url.split('/')[4]) + 1000,
    ai_score: Math.round(score * 10) / 10,
    ai_feedback: 'Correction effectuée par l\'IA. Résultats satisfaisants dans l\'ensemble.',
    correction_status: 'ai_corrected',
  }))
})

router.post('/api/grading/corrections/:id/review', (req, res, body) => {
  json(res, toSnake({
    message: 'Correction validée par l\'enseignant',
    correction_status: 'teacher_reviewed',
    final_score: parseFloat(body.teacher_score) || 0,
  }))
})

router.post('/api/grading/sessions/:id/correct-all', (req, res) => {
  json(res, { message: 'Correction IA lancée pour toutes les copies en attente', count: 3 })
})

router.get('/api/grading/sessions/:id/results', (req, res, { id }) => {
  const names = [
    { name: 'Kouamé Adjoa', number: 'MAT2023001', class: 'L2 Maths' },
    { name: 'Konan Yao', number: 'MAT2023002', class: 'L2 Maths' },
    { name: 'N\'Guessan Aya', number: 'MAT2023003', class: 'L2 Maths' },
    { name: 'Brou Jérôme', number: 'MAT2023004', class: 'L2 Maths' },
    { name: 'Koffi Amenan', number: 'MAT2023005', class: 'L2 Maths' },
    { name: 'Zadi Franck', number: 'MAT2023006', class: 'L2 Maths' },
    { name: 'Ahoussi Esther', number: 'MAT2023007', class: 'L2 Maths' },
    { name: 'Tano Éric', number: 'MAT2023008', class: 'L2 Maths' },
  ]

  const items = names.map((n, i) => {
    const ai = Math.round((8 + Math.random() * 10) * 10) / 10
    const teacher = i < 5 ? Math.round((10 + Math.random() * 8) * 10) / 10 : null
    return {
      student_name: n.name,
      student_number: n.number,
      class_name: n.class,
      submitted_at: new Date(Date.now() - i * 3600000).toISOString(),
      correction_status: i < 5 ? 'teacher_reviewed' : i < 7 ? 'ai_corrected' : 'pending',
      ai_score: ai,
      teacher_score: teacher,
      final_score: teacher || ai,
      grading_system: '20',
    }
  })

  json(res, toSnake({
    session_title: 'DS1 Analyse — L2 Maths',
    subject: 'Mathématiques',
    grading_system: '20',
    total_students: 48,
    corrected: 5,
    items,
    skip: 0,
    limit: 500,
  }))
})

router.get('/api/grading/sessions/:id/results/export', (req, res) => {
  const csv = `Étudiant;N° étudiant;Note IA;Note enseignant;Note finale\nKouamé Adjoa;MAT2023001;14.5;15.0;15.0\nKonan Yao;MAT2023002;12.0;13.5;13.5\nN'Guessan Aya;MAT2023003;16.0;16.5;16.5\nBrou Jérôme;MAT2023004;8.5;10.0;10.0\nKoffi Amenan;MAT2023005;11.0;12.0;12.0\n`
  csvBlob(res, csv)
})

router.get('/api/grading/sessions/:id/qcm-analysis', (req, res) => {
  json(res, toSnake({
    session_id: parseInt(id),
    total_students: 48,
    questions: [
      { question_id: 1, text: 'Limite de sin(x)/x en 0', correct_rate: 0.72, answers_distribution: { A: 0.12, B: 0.72, C: 0.10, D: 0.06 } },
      { question_id: 2, text: 'Dérivabilité de |x| en 0', correct_rate: 0.58, answers_distribution: { Vrai: 0.42, Faux: 0.58 } },
    ],
  }))
})

// ---- Admin ----
router.get('/api/admin/stats', (req, res) => {
  json(res, toSnake({
    total_teachers: 12,
    total_sessions: db.sessions.length,
    active_sessions: db.sessions.filter(s => s.status === 'active').length,
    total_exercises: db.exercises.length,
    total_submissions: db.submissions.length + 120,
    total_incidents: db.incidents.length + 3,
    total_corrections: 85,
    incident_breakdown: {
      tab_switch: 2,
      copy_paste: 1,
      multiple_screens: 1,
      timeout: 1,
    },
  }))
})

router.get('/api/admin/incidents', (req, res) => {
  json(res, toSnake([
    { id: 1, incident_type: 'tab_switch', severity: 'high', student_name: 'Kouamé Adjoa', session_title: 'DS1 Analyse — L2 Maths', timestamp: new Date(Date.now() - 1800000).toISOString() },
    { id: 2, incident_type: 'copy_paste', severity: 'medium', student_name: 'Konan Yao', session_title: 'TD Algorithmique', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: 3, incident_type: 'multiple_screens', severity: 'critical', student_name: 'N\'Guessan Aya', session_title: 'DS1 Analyse', timestamp: new Date(Date.now() - 7200000).toISOString() },
  ]))
})

router.get('/api/admin/sessions', (req, res) => {
  const activeSessions = db.sessions.filter(s => s.status === 'active')
  json(res, toSnake(activeSessions))
})

// ---- Judge ----
router.get('/api/judge/languages', (req, res) => {
  json(res, [
    { id: 'python', name: 'Python', extension: '.py' },
    { id: 'javascript', name: 'JavaScript (Node.js)', extension: '.js' },
    { id: 'java', name: 'Java', extension: '.java' },
    { id: 'cpp', name: 'C++', extension: '.cpp' },
    { id: 'c', name: 'C', extension: '.c' },
  ])
})

router.post('/api/judge/run', (req, res, body) => {
  // Simuler une exécution de code
  json(res, {
    stdout: 'Résultat de l\'exécution...\nHello, World!\n',
    stderr: '',
    exit_code: 0,
    time_seconds: 0.035,
    error: null,
  })
})

router.post('/api/judge/submit', (req, res) => {
  json(res, {
    passed: 3,
    total: 5,
    results: [
      { description: 'Test avec des valeurs positives', passed: true, input: '[3, 1, 4, 1, 5]', expected_output: '[1, 1, 3, 4, 5]', actual_output: '[1, 1, 3, 4, 5]' },
      { description: 'Test avec des valeurs négatives', passed: true, input: '[-5, -2, -8, -1]', expected_output: '[-8, -5, -2, -1]', actual_output: '[-8, -5, -2, -1]' },
      { description: 'Liste vide', passed: true, input: '[]', expected_output: '[]', actual_output: '[]' },
      { description: 'Déjà trié', passed: false, input: '[1, 2, 3, 4, 5]', expected_output: '[1, 2, 3, 4, 5]', actual_output: '[1, 2, 3]' },
      { description: 'Valeurs dupliquées', passed: false, input: '[5, 3, 5, 3, 1]', expected_output: '[1, 3, 3, 5, 5]', actual_output: '[1, 3, 5, 3, 5]' },
    ],
  })
})

// Catch-all pour les routes non trouvées
router.get('/api/health', (req, res) => json(res, { status: 'ok', mock: true }))

// ============================================================
// Serveur HTTP
// ============================================================
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Student-Token')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  // Parser le body JSON
  const url = new URL(req.url, 'http://localhost')
  let body = ''

  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    let parsed = {}
    try { parsed = body ? JSON.parse(body) : {} } catch {}
    parsed = parsed || {}

    // Router
    const route = router.match(req.method, url.pathname)

    if (!route) {
      console.warn(`  ⚠️  Route non mockée: ${req.method} ${url.pathname}`)
      return json(res, { detail: `Route non implémentée dans le mock: ${req.method} ${url.pathname}` }, 501)
    }

    try {
      console.log(`  → ${req.method} ${url.pathname}`)
      route.handler(req, res, parsed, route.params)
    } catch (err) {
      console.error(`  ❌ Erreur sur ${req.method} ${url.pathname}:`, err)
      json(res, { detail: 'Erreur interne du serveur mock' }, 500)
    }
  })
})

const PORT = 8000
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║         🎯  MOCK SERVEUR PEAN  🎯              ║
╠══════════════════════════════════════════════════╣
║  Sans base de données — toutes les données       ║
║  sont en mémoire et pré-remplies.                 ║
║                                                  ║
║  http://localhost:${PORT}                          ║
║                                                  ║
║  Comptes de test :                               ║
║  ─────────────────                               ║
║  Enseignant : jean.konan@univ-ci.edu             ║
║  Mot de passe : password123                      ║
║                                                  ║
║  Admin : admin@pean.edu                          ║
║  Mot de passe : admin123                         ║
║                                                  ║
║  Codes session : MATH2024 / ALGO2024 / PROBA24   ║
╚══════════════════════════════════════════════════╝
  `)
})
