/** Store Zustand pour les sessions d'examen en cours. */

import { create } from 'zustand'
import { api } from '@/services/api'
import type { ExamSession } from '@/types'

interface PaginatedResponse<T> {
  items: T[]
  total: number
  skip: number
  limit: number
}

interface SessionState {
  sessions: ExamSession[]
  totalSessions: number
  activeSession: ExamSession | null
  isLoading: boolean
  error: string | null
  page: number
  limit: number

  fetchSessions: (page?: number) => Promise<void>
  createSession: (data: Partial<ExamSession>) => Promise<ExamSession>
  launchSession: (id: number) => Promise<void>
  deleteSession: (id: number) => Promise<void>
  setActiveSession: (session: ExamSession | null) => void
  setPage: (page: number) => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  totalSessions: 0,
  activeSession: null,
  isLoading: false,
  error: null,
  page: 0,
  limit: 50,

  fetchSessions: async (page?: number) => {
    const state = get()
    const skip = page !== undefined ? page * state.limit : state.page * state.limit
    set({ isLoading: true, error: null })
    try {
      const res = await api.get<PaginatedResponse<ExamSession>>('/teacher/sessions', {
        params: { skip, limit: state.limit },
      })
      set({ sessions: res.data.items, totalSessions: res.data.total, isLoading: false, page: page ?? state.page })
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Erreur lors du chargement', isLoading: false })
    }
  },

  createSession: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/teacher/sessions', data)
      const session = res.data as ExamSession
      set((state) => ({
        sessions: [session, ...state.sessions],
        isLoading: false,
      }))
      return session
    } catch (err: any) {
      set({ error: err.response?.data?.detail || "Erreur lors de la création", isLoading: false })
      throw err
    }
  },

  launchSession: async (id: number) => {
    set({ error: null })
    try {
      const res = await api.post(`/teacher/sessions/${id}/launch`)
      const updated = res.data as ExamSession
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === id ? updated : s)),
        activeSession: state.activeSession?.id === id ? updated : state.activeSession,
      }))
    } catch (err: any) {
      set({ error: err.response?.data?.detail || "Erreur lors du lancement" })
      throw err
    }
  },

  deleteSession: async (id: number) => {
    try {
      await api.delete(`/teacher/sessions/${id}`)
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
      }))
    } catch (err: any) {
      set({ error: err.response?.data?.detail || "Erreur lors de la suppression" })
      throw err
    }
  },

  setActiveSession: (session) => set({ activeSession: session }),
  setPage: (page) => set({ page }),
}))
