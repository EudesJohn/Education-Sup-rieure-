/** Admin — Gestion des enseignants (promotion admin). */

import { useState, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { ConfirmModal } from '@/components/ConfirmModal'
import { AdminListSkeleton } from '@/components/Skeleton'
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

export function AdminTeachers() {
  const [teachers, setTeachers] = useState<TeacherInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<{ id: number; name: string; newRole: string } | null>(null)

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
    if (!confirmTarget) return
    const { id, newRole } = confirmTarget
    try {
      setSuccessMsg('')
      setError('')
      const res = await api.put(`/admin/teachers/${id}/role`, { role: newRole })
      setSuccessMsg(res.data.message || `Rôle mis à jour avec succès`)
      setConfirmTarget(null)
      await fetchTeachers()
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la mise à jour du rôle')
      setConfirmTarget(null)
    }
  }

  const openConfirm = (teacher: TeacherInfo, newRole: string) => {
    setConfirmTarget({ id: teacher.id, name: teacher.full_name, newRole })
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
                    const isAdmin = t.role === 'admin'
                    return (
                      <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-white">{t.full_name}</span>
                        </td>
                        <td className="px-5 py-3.5 text-text-secondary">{t.email}</td>
                        <td className="px-5 py-3.5 text-text-secondary">{t.institution}</td>
                        <td className="px-5 py-3.5 text-text-secondary">{t.discipline}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            isAdmin
                              ? 'bg-violet-900/30 text-violet-iq border border-violet-500/20'
                              : 'bg-white/5 text-text-secondary border border-white/10'
                          }`}>
                            {isAdmin ? 'Admin' : 'Enseignant'}
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
                          {isAdmin ? (
                            <button
                              onClick={() => openConfirm(t, 'teacher')}
                              className="px-3 py-1.5 rounded-md text-xs font-medium
                                bg-amber-900/20 text-amber-400 hover:bg-amber-900/40
                                border border-amber-500/20 transition-all"
                            >
                              Rétrograder
                            </button>
                          ) : (
                            <button
                              onClick={() => openConfirm(t, 'admin')}
                              className="px-3 py-1.5 rounded-md text-xs font-medium
                                bg-violet-900/20 text-violet-iq hover:bg-violet-900/40
                                border border-violet-500/20 transition-all"
                            >
                              Promouvoir admin
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {confirmTarget && (
        <ConfirmModal
          open={true}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={handleRoleChange}
          title={confirmTarget.newRole === 'admin' ? 'Promouvoir administrateur' : 'Rétrograder en enseignant'}
          confirmLabel={confirmTarget.newRole === 'admin' ? 'Promouvoir' : 'Rétrograder'}
          variant={confirmTarget.newRole === 'admin' ? 'default' : 'warning'}
          message={
            confirmTarget.newRole === 'admin'
              ? `Donner les droits d'administration à ${confirmTarget.name} ?`
              : `Retirer les droits d'administration de ${confirmTarget.name} ?`
          }
        />
        )}
      </div>
    </Layout>
  )
}
