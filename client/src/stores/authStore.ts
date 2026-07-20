/** Store Zustand pour l'authentification. */

import { create } from 'zustand'
import { api } from '@/services/api'
import { hasMinRole, type Teacher } from '@/types'

type ActiveRole = 'teacher' | 'admin' | 'cd' | 'super_admin'

interface AuthState {
  teacher: Teacher | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  isAuthenticated: boolean
  activeRole: ActiveRole
  twofaRequired: boolean
  twofaTempToken: string | null

  login: (email: string, password: string) => Promise<void>
  register: (data: {
    email: string
    password: string
    full_name: string
    invitation_code: string
    institution: string
    institution_id?: number
    institution_ids?: number[]
    discipline: string
    subject_ids?: number[]
  }) => Promise<void>
  logout: () => void
  loadFromStorage: () => void
  fetchProfile: () => Promise<void>
  setActiveRole: (role: ActiveRole) => void
  updateTeacher: (updates: Partial<Teacher>) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  teacher: null,
  accessToken: null,
  refreshToken: null,
  isLoading: false,
  isAuthenticated: false,
  activeRole: 'teacher',
  twofaRequired: false,
  twofaTempToken: null,

  loadFromStorage: () => {
    const accessToken = localStorage.getItem('pean_access_token')
    const refreshToken = localStorage.getItem('pean_refresh_token')
    const teacherJson = localStorage.getItem('pean_teacher')
    const savedRole = localStorage.getItem('pean_active_role')

    if (!accessToken || !refreshToken) return

    const teacher = (() => {
      try {
        return teacherJson ? JSON.parse(teacherJson) : null
      } catch {
        localStorage.removeItem('pean_teacher')
        return null
      }
    })()

    // Marquer isLoading=true pour que AuthGuard attende au lieu
    // de rediriger vers /login (évite le redirect loop après login).
    set({
      accessToken,
      refreshToken,
      teacher,
      isLoading: true,
      activeRole: teacher && hasMinRole(teacher.role, savedRole || 'teacher') ? (savedRole as ActiveRole) : 'teacher',
    })

    // Revalider token silencieusement
    api
      .get('/auth/me')
      .then((res) => {
        const nextTeacher = res.data
        localStorage.setItem('pean_teacher', JSON.stringify(nextTeacher))
        set({ teacher: nextTeacher, isAuthenticated: true, isLoading: false })
      })
      .catch(() => {
        get().logout()
      })
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/auth/login', { email, password })
      const { access_token, refresh_token, teacher, twofa_required, temp_token } = res.data

      if (twofa_required && temp_token) {
        // 2FA requise — stocker le temp_token sans session complète
        set({
          teacher,
          twofaRequired: true,
          twofaTempToken: temp_token,
          isLoading: false,
          isAuthenticated: false,
        })
        return
      }

      localStorage.setItem('pean_access_token', access_token)
      localStorage.setItem('pean_refresh_token', refresh_token)
      localStorage.setItem('pean_teacher', JSON.stringify(teacher))

      set({
        accessToken: access_token,
        refreshToken: refresh_token,
        teacher,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  register: async (data) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/auth/register', data)
      const { access_token, refresh_token, teacher } = res.data

      localStorage.setItem('pean_access_token', access_token)
      localStorage.setItem('pean_refresh_token', refresh_token)
      localStorage.setItem('pean_teacher', JSON.stringify(teacher))

      set({
        accessToken: access_token,
        refreshToken: refresh_token,
        teacher,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  updateTeacher: (updates: Partial<Teacher>) => {
    const current = get().teacher
    if (!current) return
    const next = { ...current, ...updates }
    localStorage.setItem('pean_teacher', JSON.stringify(next))
    set({ teacher: next })
  },

  logout: () => {
    localStorage.removeItem('pean_access_token')
    localStorage.removeItem('pean_refresh_token')
    localStorage.removeItem('pean_teacher')
    localStorage.removeItem('pean_active_role')
    set({
      teacher: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      twofaRequired: false,
      twofaTempToken: null,
    })
    window.location.href = '/login'
  },

  fetchProfile: async () => {
    try {
      const res = await api.get('/auth/me')
      const teacher = res.data
      localStorage.setItem('pean_teacher', JSON.stringify(teacher))
      set({ teacher })
    } catch {
      get().logout()
    }
  },

  setActiveRole: (role: ActiveRole) => {
    localStorage.setItem('pean_active_role', role)
    set({ activeRole: role })
  },
}))
