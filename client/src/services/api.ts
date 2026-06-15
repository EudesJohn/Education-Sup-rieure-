/** Client API Axios pour PEAN. */

import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
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

// ========== API Auth ==========

export const authApi = {
  register: (data: any) => api.post('/auth/register', data),
  login: (data: any) => api.post('/auth/login', data),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refresh_token: refreshToken }),
  verifyEmail: (token: string) => api.post('/auth/verify-email', { token }),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),
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
    return api.post('/exams/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
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
}
