import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { TeacherDashboard } from '@/pages/teacher/TeacherDashboard'
import { TeacherSessions } from '@/pages/teacher/TeacherSessions'
import { SessionDetail } from '@/pages/teacher/SessionDetail'
import { ExerciseBank } from '@/pages/teacher/ExerciseBank'
import { StudentListsPage } from '@/pages/teacher/StudentLists'
import { DocumentLibraryPage } from '@/pages/teacher/DocumentLibrary'
import { CorrectionPage } from '@/pages/teacher/CorrectionPage'
import { SessionResults } from '@/pages/teacher/SessionResults'
import { StudentExam } from '@/pages/student/StudentExam'
import { AdminDashboard } from '@/pages/admin/AdminDashboard'
import { AuthGuard } from '@/components/AuthGuard'
import { useAuthStore } from '@/stores/authStore'

function App() {
  const { loadFromStorage } = useAuthStore()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  return (
    <Routes>
      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Enseignant (protégé) */}
      <Route
        path="/teacher/dashboard"
        element={
          <AuthGuard>
            <TeacherDashboard />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/sessions"
        element={
          <AuthGuard>
            <TeacherSessions />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/sessions/:id"
        element={
          <AuthGuard>
            <SessionDetail />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/sessions/:id/results"
        element={
          <AuthGuard>
            <SessionResults />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/sessions/:sessionId/correction/:submissionId"
        element={
          <AuthGuard>
            <CorrectionPage />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/exercises"
        element={
          <AuthGuard>
            <ExerciseBank />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/student-lists"
        element={
          <AuthGuard>
            <StudentListsPage />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/student-lists/*"
        element={
          <AuthGuard>
            <StudentListsPage />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/documents"
        element={
          <AuthGuard>
            <DocumentLibraryPage />
          </AuthGuard>
        }
      />

      {/* Étudiant */}
      <Route path="/exam/:code" element={<StudentExam />} />

      {/* Admin (protégé) */}
      <Route
        path="/admin"
        element={
          <AuthGuard requiredRole="admin">
            <AdminDashboard />
          </AuthGuard>
        }
      />

      {/* Redirection par défaut */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
