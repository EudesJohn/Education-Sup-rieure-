// Types pour l'API PEAN

/** Réponse paginée standard de l'API. */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  skip: number
  limit: number
}

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

// ========== Student List (RF-02) ==========

export interface StudentList {
  id: number
  teacher_id: number
  name: string
  groupe?: string
  original_filename?: string
  file_type: string
  student_count: number
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}

export interface StudentListEntry {
  id: number
  list_id: number
  student_name: string
  student_number: string
  email?: string
  class_name?: string
  row_index: number
}

export interface ImportPreview {
  headers: string[]
  column_mapping: {
    student_name: string | null
    student_number: string | null
    email: string | null
    class_name: string | null
  }
  confidence: number
  total_rows: number
  preview_rows: Record<string, string>[]
  error_rows: { row: number; reason: string; data?: Record<string, string> }[]
  warnings: string[]
  original_filename: string
  file_type: string
}

export interface ListAssignRequest {
  list_id: number
}

export interface SessionListStatus {
  has_list: boolean
  list: {
    id: number
    name: string
    groupe?: string
    file_type: string
    student_count: number
  } | null
  status: 'no_list' | 'list_deleted' | 'consistent' | 'inconsistent'
  is_consistent: boolean
  entries_count: number
  session_student_count: number
  message: string | null
}

// ========== Pedagogical Documents (RF-06) ==========

export interface PedagogicalDocument {
  id: number
  title: string
  description?: string
  subject?: string
  academic_level?: string
  document_type: 'course' | 'td' | 'tp' | 'exam' | 'correction' | 'reference' | 'other'
  file_type?: string
  file_url?: string
  file_size?: number
  original_filename?: string
  tags?: string[]
  is_favorite: boolean
  author?: string
  year?: string
  ai_classification?: {
    subject: string
    academic_level: string
    document_type: string
    keywords: string[]
    summary: string
    confidence: number
  }
  download_count: number
  reference_count: number
  status: string
  created_at: string
  updated_at?: string
}

export interface DocumentUploadResponse {
  id: number
  title: string
  subject?: string
  document_type: string
  academic_level?: string
  file_url?: string
  file_type: string
  file_size: number
  original_filename: string
  ai_classification: {
    subject: string
    academic_level: string
    document_type: string
    keywords: string[]
    summary: string
    confidence: number
  }
  message: string
}

export interface PedagogicalSuggestion {
  category: string
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  reason: string
}

export interface SessionAiReport {
  session_id: number
  session_title: string
  summary: string
  highlights: string[]
  recommendations: string[]
  statistics: {
    average_score?: number
    median_score?: number
    success_rate?: number
    highest_score?: number
    lowest_score?: number
    total_submissions?: number
  }
  generated_at: string
}

// ========== Correction Annotations (RF-10) ==========

export interface CorrectionAnnotation {
  id: number
  correction_id: number
  submission_id: number
  teacher_id: number
  exercise_id?: number
  annotation_type: 'comment' | 'correction' | 'highlight' | 'remark' | 'error' | 'praise'
  selection_start?: number
  selection_end?: number
  selected_text?: string
  content: string
  score?: number
  max_score?: number
  is_resolved: boolean
  resolved_at?: string
  created_at: string
  updated_at: string
}

export interface RubricCriterion {
  id: string
  name: string
  max_points: number
  description?: string
}

export interface CorrectionRubric {
  id: number
  session_id: number
  teacher_id: number
  title: string
  description?: string
  criteria: RubricCriterion[]
  max_score?: number
  is_active: boolean
  created_at: string
}

export interface SubmissionNavigation {
  submissions: { submission_id: number; student_name: string; student_number: string }[]
  current_index: number
  total: number
}

// ========== Admin Hierarchy (v6) ==========

export interface Filiere {
  id: number
  institution_id: number
  name: string
  code?: string
  description?: string
  created_at: string
  updated_at?: string
}

export interface AcademicYear {
  id: number
  name: string
  start_date?: string
  end_date?: string
  is_current: boolean
  created_at: string
}

export interface StudyLevel {
  id: number
  name: string
  created_at: string
}

export interface Class {
  id: number
  filiere_id: number
  academic_year_id: number
  study_level_id?: number
  name: string
  level?: string
  created_at: string
}

export interface ClassStudent {
  id: number
  class_id: number
  student_name: string
  student_number: string
  email?: string
  created_at: string
}

export interface Institution {
  id: number
  name: string
  created_by: number
  created_at: string
  updated_at?: string
}

export interface Subject {
  id: number
  name: string
  created_by: number
  created_at: string
  updated_at?: string
}
