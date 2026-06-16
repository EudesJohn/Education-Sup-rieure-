/** Garde d'authentification — protège les routes nécessitant un compte enseignant.
 *  Les admins peuvent accéder aux routes enseignant ET admin selon leur activeRole. */

import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

interface AuthGuardProps {
  children: ReactNode
  requiredRole?: 'teacher' | 'admin'
}

export function AuthGuard({ children, requiredRole = 'teacher' }: AuthGuardProps) {
  const { isAuthenticated, isLoading, loadFromStorage, teacher, activeRole } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Route admin : seul un admin en mode admin peut y accéder
  if (requiredRole === 'admin') {
    if (teacher?.role !== 'admin' || activeRole !== 'admin') {
      return <Navigate to="/teacher/dashboard" replace />
    }
  }

  return <>{children}</>
}
