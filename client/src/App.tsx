import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from '@/pages/auth/LoginPage'
import { LandingPage } from '@/pages/auth/LandingPage'
import { StudentLoginPage } from '@/pages/auth/StudentLoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { TeacherDashboard } from '@/pages/teacher/TeacherDashboard'
import { TeacherSessions } from '@/pages/teacher/TeacherSessions'
import { SessionDetail } from '@/pages/teacher/SessionDetail'
import { StudentListsPage } from '@/pages/teacher/StudentLists'
import { CorrectionPage } from '@/pages/teacher/CorrectionPage'
import { SessionResults } from '@/pages/teacher/SessionResults'
import { StudentExam } from '@/pages/student/StudentExam'
import { RoleChoicePage } from '@/pages/auth/RoleChoicePage'
import { AdminDashboard } from '@/pages/admin/AdminDashboard'
import { AdminTeachers } from '@/pages/admin/AdminTeachers'
import { AdminFilieres } from '@/pages/admin/AdminFilieres'
import { AdminAcademicYears } from '@/pages/admin/AdminAcademicYears'
import { AdminClasses } from '@/pages/admin/AdminClasses'
import { AdminClassStudents } from '@/pages/admin/AdminClassStudents'
import { AdminInstitutions } from '@/pages/admin/AdminInstitutions'
import { AdminSubjects } from '@/pages/admin/AdminSubjects'
import { AdminStudyLevels } from '@/pages/admin/AdminStudyLevels'
import { AdminAuditLogs } from '@/pages/admin/AdminAuditLogs'
import { AdminInvitationCodes } from '@/pages/admin/AdminInvitationCodes'
import { HelpPage } from '@/pages/HelpPage'
import { TeacherProfile } from '@/pages/teacher/TeacherProfile'
import { AuthGuard } from '@/components/AuthGuard'
import { useAuthStore } from '@/stores/authStore'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'

function App() {
  const { loadFromStorage } = useAuthStore()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  return (
    <Routes>
      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/etudiant" element={<StudentLoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/role-choice" element={<RoleChoicePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

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
        path="/teacher/profile"
        element={
          <AuthGuard>
            <TeacherProfile />
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
      <Route
        path="/admin/teachers"
        element={
          <AuthGuard requiredRole="admin">
            <AdminTeachers />
          </AuthGuard>
        }
      />
      <Route
        path="/admin/institutions"
        element={
          <AuthGuard requiredRole="admin">
            <AdminInstitutions />
          </AuthGuard>
        }
      />
      <Route
        path="/admin/filieres"
        element={
          <AuthGuard requiredRole="admin">
            <AdminFilieres />
          </AuthGuard>
        }
      />
      <Route
        path="/admin/subjects"
        element={
          <AuthGuard requiredRole="admin">
            <AdminSubjects />
          </AuthGuard>
        }
      />
      <Route
        path="/admin/academic-years"
        element={
          <AuthGuard requiredRole="admin">
            <AdminAcademicYears />
          </AuthGuard>
        }
      />
      <Route
        path="/admin/study-levels"
        element={
          <AuthGuard requiredRole="admin">
            <AdminStudyLevels />
          </AuthGuard>
        }
      />
      <Route
        path="/admin/classes"
        element={
          <AuthGuard requiredRole="admin">
            <AdminClasses />
          </AuthGuard>
        }
      />
      <Route
        path="/admin/classes/:classId/students"
        element={
          <AuthGuard requiredRole="admin">
            <AdminClassStudents />
          </AuthGuard>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <AuthGuard requiredRole="admin">
            <AdminAuditLogs />
          </AuthGuard>
        }
      />
      <Route
        path="/admin/invitation-codes"
        element={
          <AuthGuard requiredRole="admin">
            <AdminInvitationCodes />
          </AuthGuard>
        }
      />

      {/* Page d'accueil — choix enseignant / étudiant */}
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
