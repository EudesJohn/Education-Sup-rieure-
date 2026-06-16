/** Store Zustand pour l'authentification. */

import { create } from 'zustand'
import { api } from '@/services/api'
import type { Teacher } from '@/types'

interface AuthState {
  teacher: Teacher | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  isAuthenticated: boolean

  login: (email: string, password: string) => Promise<void>
  register: (data: {
    email: string
    password: string
    full_name: string
    institution: string
    institution_id?: number
    discipline: string
  }) => Promise<void>
  logout: () => void
  loadFromStorage: () => void
  fetchProfile: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  teacher: null,
  accessToken: null,
  refreshToken: null,
  isLoading: false,
  isAuthenticated: false,

  loadFromStorage: () => {
    const accessToken = localStorage.getItem('pean_access_token')
    const refreshToken = localStorage.getItem('pean_refresh_token')
    const teacherJson = localStorage.getItem('pean_teacher')

    if (accessToken && refreshToken) {
      set({
        accessToken,
        refreshToken,
        teacher: (() => {
          try { return teacherJson ? JSON.parse(teacherJson) : null }
          catch { localStorage.removeItem('pean_teacher'); return null }
        })(),
        isAuthenticated: true,
      })
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/auth/login', { email, password })
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

  logout: () => {
    localStorage.removeItem('pean_access_token')
    localStorage.removeItem('pean_refresh_token')
    localStorage.removeItem('pean_teacher')
    set({
      teacher: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
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
}))
