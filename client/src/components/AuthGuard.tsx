/** Garde d'authentification — protège les routes selon le rôle.
 *
 *  Hiérarchie : super_admin > admin > cd > teacher
 *  Un rôle supérieur peut accéder aux routes des rôles inférieurs.
 */

import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { hasMinRole } from '@/types'

type RequiredRole = 'super_admin' | 'admin' | 'cd' | 'teacher'

interface AuthGuardProps {
  children: ReactNode
  requiredRole?: RequiredRole
}

export function AuthGuard({ children, requiredRole = 'teacher' }: AuthGuardProps) {
  const { isAuthenticated, isLoading, loadFromStorage, teacher } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  if (!isAuthenticated && !isLoading) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!isAuthenticated && isLoading) {
    return null
  }

  // Vérification hiérarchique du rôle
  if (requiredRole !== 'teacher' && teacher) {
    if (!hasMinRole(teacher.role, requiredRole)) {
      // Rediriger vers la page appropriée selon le rôle
      if (hasMinRole(teacher.role, 'admin')) {
        return <Navigate to="/admin" replace />
      }
      return <Navigate to="/teacher/dashboard" replace />
    }
  }

  return <>{children}</>
}
