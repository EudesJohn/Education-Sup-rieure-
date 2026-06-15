/** Garde d'authentification — protège les routes nécessitant un compte enseignant. */

import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

interface AuthGuardProps {
  children: ReactNode
  requiredRole?: 'teacher' | 'admin'
}

export function AuthGuard({ children, requiredRole = 'teacher' }: AuthGuardProps) {
  const { isAuthenticated, isLoading, loadFromStorage, teacher } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredRole === 'admin' && teacher?.role !== 'admin') {
    return <Navigate to="/teacher/dashboard" replace />
  }

  if (requiredRole === 'teacher' && teacher?.role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  return <>{children}</>
}
