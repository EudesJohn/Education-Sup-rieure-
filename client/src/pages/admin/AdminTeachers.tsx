/** Admin — Gestion des enseignants (rôles hiérarchiques). */

import { useState, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { ConfirmModal } from '@/components/ConfirmModal'
import { AdminListSkeleton } from '@/components/Skeleton'
import { useAuthStore } from '@/stores/authStore'
import { hasMinRole } from '@/types'
import { api } from '@/services/api'

interface TeacherInfo {
  id: number
  email: string
  full_name: string
  institution: string
  discipline: string
  is_verified: boolean
  role?: string
  created_at: string
  sessions_count: number
  exercises_count: number
}

const ROLE_NAMES: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  cd: 'CD',
  teacher: 'Enseignant',
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-amber-900/30 text-amber-iq border border-amber-500/20',
  admin: 'bg-violet-900/30 text-violet-iq border border-violet-500/20',
  cd: 'bg-blue-900/30 text-blue-400 border border-blue-500/20',
  teacher: 'bg-white/5 text-text-secondary border border-white/10',
}

export function AdminTeachers() {
  const [teachers, setTeachers] = useState<TeacherInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [confirmAction, setConfirmAction] = useState<{
    id: number; name: string; newRole: string; action: string
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)

  const { teacher: currentTeacher } = useAuthStore()
  const currentRole = currentTeacher?.role || 'teacher'

  useEffect(() => { fetchTeachers() }, [])

  const fetchTeachers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/admin/teachers')
      setTeachers(Array.isArray(res.data) ? res.data : [])
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async () => {
    if (!confirmAction) return
    const { id, newRole } = confirmAction
    try {
      setSuccessMsg('')
      setError('')
      const res = await api.put(`/admin/teachers/${id}/role`, { role: newRole })
      setSuccessMsg(res.data.message || `Rôle mis à jour avec succès`)
      setConfirmAction(null)
      await fetchTeachers()
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la mise à jour du rôle')
      setConfirmAction(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const { id } = deleteTarget
    try {
      setSuccessMsg('')
      setError('')
      const res = await api.delete(`/admin/teachers/${id}`)
      setSuccessMsg(res.data.message || 'Enseignant supprimé')
      setDeleteTarget(null)
      await fetchTeachers()
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
      setDeleteTarget(null)
    }
  }

  return (
    <Layout title="Gestion des enseignants">
      <div className="space-y-5">
        {error && (
          <div className="bg-correcteur-clair border border-correcteur/20 text-correcteur px-4 py-3 rounded-md text-sm animate-fade-in">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-900/30 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-md text-sm animate-fade-in">
            {successMsg}
          </div>
        )}

        {loading ? (
          <AdminListSkeleton rows={6} />
        ) : teachers.length === 0 ? (
          <div className="text-center py-12 text-muted">
            Aucun enseignant inscrit pour le moment
          </div>
        ) : (
          <div className="card-plain overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-marge/50 text-xs text-text-secondary uppercase tracking-wider">
                    <th className="text-left px-5 py-3 font-medium">Nom</th>
                    <th className="text-left px-5 py-3 font-medium">Email</th>
                    <th className="text-left px-5 py-3 font-medium">Établissement</th>
                    <th className="text-left px-5 py-3 font-medium">Discipline</th>
                    <th className="text-center px-5 py-3 font-medium">Rôle</th>
                    <th className="text-center px-5 py-3 font-medium">Vérifié</th>
                    <th className="text-center px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-marge/30">
                  {teachers.map((t) => {
                    const role = t.role || 'teacher'
                    const roleName = ROLE_NAMES[role] || role
                    const roleColor = ROLE_COLORS[role] || ROLE_COLORS.teacher

                    return (
                      <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-white">{t.full_name}</span>
                        </td>
                        <td className="px-5 py-3.5 text-text-secondary">{t.email}</td>
                        <td className="px-5 py-3.5 text-text-secondary">{t.institution}</td>
                        <td className="px-5 py-3.5 text-text-secondary">{t.discipline}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleColor}`}>
                            {roleName}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {t.is_verified ? (
                            <span className="text-emerald-400 text-lg">✓</span>
                          ) : (
                            <span className="text-muted text-lg">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {/* Actions selon le rôle de l'utilisateur connecté */}
                            {role === 'teacher' && (
                              <>
                                {hasMinRole(currentRole, 'admin') && (
                                  <>
                                    <button
                                      onClick={() => setConfirmAction({
                                        id: t.id, name: t.full_name, newRole: 'cd',
                                        action: 'Promouvoir CD',
                                      })}
                                      className="px-3 py-1.5 rounded-md text-xs font-medium
                                        bg-blue-900/20 text-blue-400 hover:bg-blue-900/40
                                        border border-blue-500/20 transition-all"
                                    >
                                      CD
                                    </button>
                                    {hasMinRole(currentRole, 'super_admin') && (
                                      <button
                                        onClick={() => setConfirmAction({
                                          id: t.id, name: t.full_name, newRole: 'admin',
                                          action: 'Promouvoir Admin',
                                        })}
                                        className="px-3 py-1.5 rounded-md text-xs font-medium
                                          bg-violet-900/20 text-violet-iq hover:bg-violet-900/40
                                          border border-violet-500/20 transition-all"
                                      >
                                        Admin
                                      </button>
                                    )}
                                  </>
                                )}
                                <button
                                  onClick={() => setDeleteTarget({ id: t.id, name: t.full_name })}
                                  className="px-3 py-1.5 rounded-md text-xs font-medium
                                    bg-rose-900/20 text-rose-400 hover:bg-rose-900/40
                                    border border-rose-500/20 transition-all"
                                >
                                  Supprimer
                                </button>
                              </>
                            )}
                            {role === 'cd' && (
                              <>
                                {hasMinRole(currentRole, 'super_admin') && (
                                  <button
                                    onClick={() => setConfirmAction({
                                      id: t.id, name: t.full_name, newRole: 'admin',
                                      action: 'Promouvoir Admin',
                                    })}
                                    className="px-3 py-1.5 rounded-md text-xs font-medium
                                      bg-violet-900/20 text-violet-iq hover:bg-violet-900/40
                                      border border-violet-500/20 transition-all"
                                  >
                                    Admin
                                  </button>
                                )}
                                <button
                                  onClick={() => setConfirmAction({
                                    id: t.id, name: t.full_name, newRole: 'teacher',
                                    action: 'Rétrograder',
                                  })}
                                  className="px-3 py-1.5 rounded-md text-xs font-medium
                                    bg-amber-900/20 text-amber-400 hover:bg-amber-900/40
                                    border border-amber-500/20 transition-all"
                                >
                                  Enseignant
                                </button>
                              </>
                            )}
                            {role === 'admin' && hasMinRole(currentRole, 'super_admin') && (
                              <>
                                <button
                                  onClick={() => setConfirmAction({
                                    id: t.id, name: t.full_name, newRole: 'teacher',
                                    action: 'Rétrograder',
                                  })}
                                  className="px-3 py-1.5 rounded-md text-xs font-medium
                                    bg-amber-900/20 text-amber-400 hover:bg-amber-900/40
                                    border border-amber-500/20 transition-all"
                                >
                                  Enseignant
                                </button>
                                <button
                                  onClick={() => setConfirmAction({
                                    id: t.id, name: t.full_name, newRole: 'super_admin',
                                    action: 'Promouvoir Super Admin',
                                  })}
                                  className="px-3 py-1.5 rounded-md text-xs font-medium
                                    bg-amber-900/20 text-amber-iq hover:bg-amber-900/40
                                    border border-amber-500/20 transition-all"
                                >
                                  Super Admin
                                </button>
                              </>
                            )}
                            {role === 'super_admin' && hasMinRole(currentRole, 'super_admin') && (
                              <span className="text-xs text-text-secondary">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {confirmAction && (
          <ConfirmModal
            open={true}
            onCancel={() => setConfirmAction(null)}
            onConfirm={handleRoleChange}
            title={confirmAction.action}
            confirmLabel={confirmAction.action}
            variant={
              confirmAction.newRole === 'teacher' ? 'warning'
              : confirmAction.newRole === 'super_admin' ? 'danger'
              : 'default'
            }
            message={
              confirmAction.newRole !== 'teacher'
                ? `Attribuer le rôle "${ROLE_NAMES[confirmAction.newRole] || confirmAction.newRole}" à ${confirmAction.name} ?`
                : `Retirer les droits de gestion de ${confirmAction.name} et le repasser en enseignant ?`
            }
          />
        )}

        {deleteTarget && (
          <ConfirmModal
            open={true}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
            title="Supprimer l'enseignant"
            confirmLabel="Supprimer définitivement"
            variant="danger"
            message={
              <>
                Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget.name}</strong> ?
                <br /><br />
                Cette action est <strong>irréversible</strong>. Toutes les données associées
                (sessions, exercices, listes d'étudiants, documents pédagogiques) seront
                également supprimées.
              </>
            }
          />
        )}
      </div>
    </Layout>
  )
}
