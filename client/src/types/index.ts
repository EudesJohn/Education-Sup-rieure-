// Types pour l'API PEAN

export interface Teacher {
  id: number
  email: string
  full_name: string
  role: 'teacher' | 'admin'
  institution: string
  discipline: string
  avatar_url?: string
  is_verified: boolean
  is_2fa_enabled: boolean
  created_at: string
}

export interface TeacherRegisterData {
  email: string
  password: string
  full_name: string
  institution: string
  discipline: string
}

export interface TeacherLoginData {
  email: string
  password: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  teacher: Teacher
}

export interface ExamSession {
  id: number
  teacher_id: number
  title: string
  subject: string
  duration_seconds: number
  student_count: number
  grading_system: string
  correction_mode: string
  access_code: string
  scheduled_start?: string
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  created_at: string
}

export interface Exercise {
  id: number
  teacher_id: number
  title: string
  subject: string
  difficulty: 'easy' | 'medium' | 'hard'
  exercise_type: 'open' | 'qcm' | 'numerical' | 'mixed' | 'code'
  instructions: string
  correct_answer?: string
  points: number
  language?: string
  variants: Variant[]
  created_at: string
}

export interface Variant {
  id: number
  exercise_id: number
  variant_order: number
  content: string
  data_overrides?: Record<string, any>
}

export interface GeneratedExam {
  id: number
  session_id: number
  hash: string
  content: string
  status: 'pending' | 'started' | 'submitted'
}

export interface StudentSubmission {
  student_name: string
  student_number: string
  class_name: string
  university: string
  content: string
}

export interface Correction {
  id: number
  submission_id: number
  ai_score?: number
  ai_feedback?: string
  teacher_score?: number
  teacher_feedback?: string
  correction_status: 'pending' | 'ai_corrected' | 'teacher_reviewed'
  final_score?: number
}

export interface SecurityIncident {
  id: number
  submission_id: number
  incident_type: string
  details: string
  timestamp: string
}

export type GradingSystem = '20' | '100' | '10' | '50' | 'letter' | 'custom'

// === Judge / Code Execution ===

export interface CodeRunRequest {
  code: string
  language: string
  stdin?: string
  session_code?: string
  student_number?: string
}

export interface CodeRunResponse {
  stdout: string
  stderr: string
  exit_code: number
  time_seconds: number
  error?: string
}

export interface TestCase {
  input: string
  expected_output: string
  description?: string
}

export interface CodeSubmitRequest {
  code: string
  language: string
  test_cases: TestCase[]
  session_code?: string
  student_number?: string
}

export interface TestResult {
  description?: string
  passed: boolean
  input: string
  expected_output: string
  actual_output: string
  error?: string
}

export interface CodeSubmitResponse {
  passed: number
  total: number
  results: TestResult[]
  execution_time: number
}

export const LANGUAGES: Record<string, string> = {
  python: 'Python 3',
  javascript: 'JavaScript (Node.js)',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  typescript: 'TypeScript',
  go: 'Go',
  rust: 'Rust',
  sqlite: 'SQLite',
  php: 'PHP',
  ruby: 'Ruby',
  r: 'R',
  bash: 'Bash',
}

export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  python: 'py',
  javascript: 'js',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  typescript: 'ts',
  go: 'go',
  rust: 'rs',
  sqlite: 'sql',
  php: 'php',
  ruby: 'rb',
  r: 'r',
  bash: 'sh',
}
