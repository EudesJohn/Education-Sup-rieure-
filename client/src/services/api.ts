/** Client API Axios pour PEAN.
 *
 * L'URL de base est configurable via VITE_API_URL (fichier .env ou variable
 * d'environnement Vercel). En production, elle pointe vers le backend FastAPI.
 * Voir client/.env.example pour les valeurs possibles.
 */

import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'https://server-taupe-mu.vercel.app/api'

// === Helpers ===

export async function uploadFile(url: string, file: File, onProgress?: (pct: number) => void) {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(url, formData, {
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
}

const api = axios.create({
  baseURL: API_BASE,
})

// Intercepteur : ajouter le token JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pean_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Intercepteur : rafraîchir le token si 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = localStorage.getItem('pean_refresh_token')
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE}/auth/refresh`, {
            refresh_token: refreshToken,
          })
          const { access_token } = res.data
          localStorage.setItem('pean_access_token', access_token)
          originalRequest.headers.Authorization = `Bearer ${access_token}`
          return api(originalRequest)
        } catch {
          // Refresh échoué → déconnexion
          localStorage.removeItem('pean_access_token')
          localStorage.removeItem('pean_refresh_token')
          window.location.href = '/login'
        }
      }
    }

    return Promise.reject(error)
  },
)

export default api
export { api }

// ========== API Student Lists (RF-02) ==========

export const studentListApi = {
  /** Créer une liste (entrées vides au départ) */
  confirm: (data: {
    name: string
    groupe?: string
    column_mapping: Record<string, string>
    entries: Record<string, any>[]
    original_filename?: string | null
    file_type?: string
  }) => api.post('/teacher/student-lists/confirm', data),

  /** Lister les listes de l'enseignant */
  list: (params?: { status?: string }) => api.get('/teacher/student-lists', { params }),

  /** Détail d'une liste (métadonnées) */
  get: (id: number) => api.get(`/teacher/student-lists/${id}`),

  /** Lister les entrées d'une liste */
  entries: (id: number) => api.get(`/teacher/student-lists/${id}/entries`),

  /** Ajouter manuellement un étudiant à une liste */
  addStudent: (listId: number, data: {
    student_name: string
    student_number: string
    email?: string
    class_name?: string
  }) => api.post(`/teacher/student-lists/${listId}/entries`, data),

  /** Modifier les métadonnées d'une liste */
  update: (id: number, data: { name?: string; groupe?: string; status?: string }) =>
    api.put(`/teacher/student-lists/${id}`, data),

  /** Supprimer une liste */
  delete: (id: number) => api.delete(`/teacher/student-lists/${id}`),

  /** Modifier une entrée individuelle */
  updateEntry: (listId: number, entryId: number, data: Record<string, any>) =>
    api.put(`/teacher/student-lists/${listId}/entries/${entryId}`, data),

  /** Supprimer une entrée */
  deleteEntry: (listId: number, entryId: number) =>
    api.delete(`/teacher/student-lists/${listId}/entries/${entryId}`),

  /** Associer une liste à une session */
  assignToList: (sessionId: number, data: { list_id: number }) =>
    api.post(`/teacher/sessions/${sessionId}/assign-list`, data),

  /** Vérifier l'état liste ↔ session */
  getSessionListStatus: (sessionId: number) =>
    api.get(`/teacher/sessions/${sessionId}/list-status`),
}

// ========== API Auth ==========

export const authApi = {
  register: (data: any) => api.post('/auth/register', data),
  login: (data: any) => api.post('/auth/login', data),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refresh_token: refreshToken }),
  verifyEmail: (token: string) => api.post('/auth/verify-email', { token }),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }),
  setup2FA: () => api.get('/auth/2fa/setup'),
  verify2FA: (code: string) => api.post('/auth/2fa/verify', { code }),
  disable2FA: (code: string) => api.post('/auth/2fa/disable', { code }),
}

// ========== API Teacher ==========

export const teacherApi = {
  getProfile: () => api.get('/teacher/profile'),
  updateProfile: (data: any) => api.put('/teacher/profile', data),
  getDashboard: () => api.get('/teacher/dashboard'),
  getSessions: (params?: any) => api.get('/teacher/sessions', { params }),
  createSession: (data: any) => api.post('/teacher/sessions', data),
  getSession: (id: number) => api.get(`/teacher/sessions/${id}`),
  updateSession: (id: number, data: any) => api.put(`/teacher/sessions/${id}`, data),
  deleteSession: (id: number) => api.delete(`/teacher/sessions/${id}`),
  launchSession: (id: number) => api.post(`/teacher/sessions/${id}/launch`),
  completeSession: (id: number) => api.post(`/teacher/sessions/${id}/complete`),

  // Hiérarchie (v6)
  listInstitutions: () => api.get('/teacher/institutions'),
  listFilieres: (institutionId?: number) =>
    api.get('/teacher/filieres', { params: { institution_id: institutionId } }),
  listAcademicYears: () => api.get('/teacher/academic-years'),
  listStudyLevels: () => api.get('/teacher/study-levels'),
  listClasses: (filiereId?: number, academicYearId?: number, studyLevelId?: number) =>
    api.get('/teacher/classes', {
      params: { filiere_id: filiereId, academic_year_id: academicYearId, study_level_id: studyLevelId },
    }),
  listClassStudents: (classId: number) => api.get(`/teacher/classes/${classId}/students`),
}

// ========== API Exams ==========

export const examsApi = {
  getExercises: () => api.get('/exams/exercises'),
  getExercise: (id: number) => api.get(`/exams/exercises/${id}`),
  createExercise: (data: any) => api.post('/exams/exercises', data),
  updateExercise: (id: number, data: any) => api.put(`/exams/exercises/${id}`, data),
  deleteExercise: (id: number) => api.delete(`/exams/exercises/${id}`),
  getExerciseVariants: (id: number) => api.get(`/exams/exercises/${id}/variants`),
  addVariant: (exerciseId: number, data: any) => api.post(`/exams/exercises/${exerciseId}/variants`, data),
  uploadFile: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/exams/upload', formData)
  },
}

// ========== API Student ==========

export const studentApi = {
  joinSession: (code: string, data: any) => api.post(`/sessions/${code}/join`, data),
  getExam: (params: { session_code: string; student_number: string }) => api.get('/student/exam', { params }),
  submit: (data: any, studentToken: string, params: Record<string, string>) =>
    api.post('/student/submit', data, {
      params,
      headers: { 'X-Student-Token': studentToken },
    }),
  reportIncident: (data: any) => api.post('/student/incident', data),
  getSessionStatus: (code: string) => api.get(`/sessions/${code}/status`),
}

// ========== API Grading ==========

export const gradingApi = {
  getSubmissions: (sessionId: number, params?: any) => api.get(`/grading/sessions/${sessionId}/submissions`, { params }),
  getSubmissionDetail: (submissionId: number) => api.get(`/grading/submissions/${submissionId}`),
  correctWithAI: (submissionId: number) => api.post(`/grading/submissions/${submissionId}/correct-ai`),
  teacherReview: (correctionId: number, data: any) => api.post(`/grading/corrections/${correctionId}/review`, data),
  correctAllPending: (sessionId: number) => api.post(`/grading/sessions/${sessionId}/correct-all`),
  getSessionResults: (sessionId: number, params?: any) => api.get(`/grading/sessions/${sessionId}/results`, { params }),
  exportResultsCsv: (sessionId: number) => api.get(`/grading/sessions/${sessionId}/results/export`),
  getQcmAnalysis: (sessionId: number) => api.get(`/grading/sessions/${sessionId}/qcm-analysis`),
  // Annotations (RF-10)
  getAnnotations: (submissionId: number) => api.get(`/grading/submissions/${submissionId}/annotations`),
  addAnnotation: (submissionId: number, data: any) => api.post(`/grading/submissions/${submissionId}/annotations`, data),
  updateAnnotation: (submissionId: number, annotationId: number, data: any) =>
    api.put(`/grading/submissions/${submissionId}/annotations/${annotationId}`, data),
  deleteAnnotation: (submissionId: number, annotationId: number) =>
    api.delete(`/grading/submissions/${submissionId}/annotations/${annotationId}`),
  // Navigation entre soumissions
  getSubmissionNavigation: (sessionId: number, currentSubmissionId?: number) =>
    api.get(`/grading/sessions/${sessionId}/submissions/navigation`, {
      params: currentSubmissionId ? { current_submission_id: currentSubmissionId } : {}
    }),
  // Rubrics (grilles d'évaluation)
  getRubrics: (sessionId: number) => api.get(`/grading/sessions/${sessionId}/rubrics`),
  createRubric: (sessionId: number, data: any) => api.post(`/grading/sessions/${sessionId}/rubrics`, data),
  updateRubric: (sessionId: number, rubricId: number, data: any) =>
    api.put(`/grading/sessions/${sessionId}/rubrics/${rubricId}`, data),
  deleteRubric: (sessionId: number, rubricId: number) =>
    api.delete(`/grading/sessions/${sessionId}/rubrics/${rubricId}`),
}

// ========== API Pedagogical Documents (RF-06) ==========

export const documentApi = {
  /** Uploader un document → stockage + classification IA */
  upload: (file: File, title?: string, description?: string, onProgress?: (pct: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)
    if (title) formData.append('title', title)
    if (description) formData.append('description', description)
    return api.post('/teacher/documents/upload', formData, {
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
  },

  /** Lister les documents */
  list: (params?: { type?: string; subject?: string; limit?: number; offset?: number }) =>
    api.get('/teacher/documents', { params }),

  /** Compter les documents par type */
  getCounts: () => api.get('/teacher/documents/counts'),

  /** Détail d'un document */
  get: (id: number) => api.get(`/teacher/documents/${id}`),

  /** Modifier un document */
  update: (id: number, data: Record<string, any>) =>
    api.put(`/teacher/documents/${id}`, data),

  /** Supprimer un document */
  delete: (id: number) => api.delete(`/teacher/documents/${id}`),

  /** Recherche intelligente */
  search: (query: string, limit?: number) =>
    api.post('/teacher/documents/search', { query, limit }),

  /** Suggestions pédagogiques pour une session */
  getSuggestions: (sessionId: number) =>
    api.get(`/teacher/sessions/${sessionId}/suggestions`),

  /** Rapport de session généré par IA */
  getAiReport: (sessionId: number) =>
    api.get(`/teacher/sessions/${sessionId}/ai-report`),
}

// ========== API Admin (v6 — hiérarchie) ==========

export const adminApi = {
  // Institutions
  listInstitutions: () => api.get('/admin/institutions'),
  createInstitution: (data: { name: string }) => api.post('/admin/institutions', data),
  updateInstitution: (id: number, data: { name: string }) => api.put(`/admin/institutions/${id}`, data),
  deleteInstitution: (id: number) => api.delete(`/admin/institutions/${id}`),

  // Subjects
  listSubjects: () => api.get('/admin/subjects'),
  createSubject: (data: { name: string }) => api.post('/admin/subjects', data),
  updateSubject: (id: number, data: { name: string }) => api.put(`/admin/subjects/${id}`, data),
  deleteSubject: (id: number) => api.delete(`/admin/subjects/${id}`),

  // Filieres
  listFilieres: (institutionId?: number) =>
    api.get('/admin/filieres', { params: institutionId ? { institution_id: institutionId } : {} }),
  createFiliere: (data: { name: string; institution_id: number; code?: string; description?: string }) =>
    api.post('/admin/filieres', data),
  getFiliere: (id: number) => api.get(`/admin/filieres/${id}`),
  updateFiliere: (id: number, data: any) => api.put(`/admin/filieres/${id}`, data),
  deleteFiliere: (id: number) => api.delete(`/admin/filieres/${id}`),

  // Academic Years
  listAcademicYears: () => api.get('/admin/academic-years'),
  createAcademicYear: (data: any) => api.post('/admin/academic-years', data),
  getAcademicYear: (id: number) => api.get(`/admin/academic-years/${id}`),
  updateAcademicYear: (id: number, data: any) => api.put(`/admin/academic-years/${id}`, data),
  deleteAcademicYear: (id: number) => api.delete(`/admin/academic-years/${id}`),

  // Study Levels
  listStudyLevels: () => api.get('/admin/study-levels'),
  createStudyLevel: (data: { name: string }) => api.post('/admin/study-levels', data),
  getStudyLevel: (id: number) => api.get(`/admin/study-levels/${id}`),
  updateStudyLevel: (id: number, data: { name: string }) => api.put(`/admin/study-levels/${id}`, data),
  deleteStudyLevel: (id: number) => api.delete(`/admin/study-levels/${id}`),

  // Classes
  listClasses: (filiereId?: number, academicYearId?: number) =>
    api.get('/admin/classes', { params: { filiere_id: filiereId, academic_year_id: academicYearId } }),
  createClass: (data: any) => api.post('/admin/classes', data),
  getClass: (id: number) => api.get(`/admin/classes/${id}`),
  updateClass: (id: number, data: any) => api.put(`/admin/classes/${id}`, data),
  deleteClass: (id: number) => api.delete(`/admin/classes/${id}`),

  // Class Students
  listClassStudents: (classId: number) => api.get(`/admin/classes/${classId}/students`),
  addClassStudent: (classId: number, data: any) => api.post(`/admin/classes/${classId}/students`, data),
  updateClassStudent: (id: number, data: any) => api.put(`/admin/classes/students/${id}`, data),
  deleteClassStudent: (id: number) => api.delete(`/admin/classes/students/${id}`),
  importClassStudents: (classId: number, students: any[]) =>
    api.post(`/admin/classes/${classId}/students/import`, { students }),

  // Audit Logs
  listAuditLogs: (params?: { actor_type?: string; action?: string; resource_type?: string; skip?: number; limit?: number }) =>
    api.get('/admin/audit-logs', { params }),
}

// ========== API Session Access Codes ==========

export const accessCodeApi = {
  /** Générer des codes PIN pour tous les étudiants d'une session */
  generate: (sessionId: number) =>
    api.post(`/teacher/sessions/${sessionId}/generate-access-codes`),

  /** Lister les codes d'accès d'une session */
  list: (sessionId: number) =>
    api.get(`/teacher/sessions/${sessionId}/access-codes`),

  /** Regénérer le code PIN d'un étudiant spécifique */
  regenerate: (sessionId: number, studentNumber: string) =>
    api.post(`/teacher/sessions/${sessionId}/access-codes/${encodeURIComponent(studentNumber)}/regenerate`),

  /** Télécharger le PDF des codes d'accès */
  downloadPdf: (sessionId: number) =>
    api.get(`/teacher/sessions/${sessionId}/access-codes/pdf`, {
      responseType: 'blob',
    }),

  /** Authentifier un étudiant par son PIN + nom + matricule */
  authenticateByPin: (pin: string, studentName: string, studentNumber: string) =>
    api.post('/sessions/auth-by-pin', { access_pin: pin, student_name: studentName, student_number: studentNumber }),
}
