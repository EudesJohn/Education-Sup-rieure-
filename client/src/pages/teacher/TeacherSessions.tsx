/** Gestion des sessions — Salle d'Examen. */

import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { ConfirmModal } from '@/components/ConfirmModal'
import { AdminListSkeleton } from '@/components/Skeleton'
import { api } from '@/services/api'
import { teacherApi } from '@/services/api'
import type { ExamSession, Institution, Filiere, AcademicYear, Class } from '@/types'

interface PaginatedResponse<T> {
  items: T[]
  total: number
  skip: number
  limit: number
}

export function TeacherSessions() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExamSession | null>(null)
  const limit = 20
  const totalPages = Math.ceil(total / limit)

  // Hiérarchie classe
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedInst, setSelectedInst] = useState<number | ''>('')
  const [selectedFiliere, setSelectedFiliere] = useState<number | ''>('')
  const [selectedYear, setSelectedYear] = useState<number | ''>('')
  const [selectedClass, setSelectedClass] = useState<number | ''>('')

  const [form, setForm] = useState({
    title: '', subject: '',
    duration_hours: '1', duration_minutes: '0',
    student_count: '30', grading_system: '20',
    correction_mode: 'ai_assisted', description: '',
  })

  useEffect(() => { fetchSessions(0); fetchHierarchy() }, [])

  const fetchHierarchy = async () => {
    try {
      const [instRes, yearRes] = await Promise.all([
        teacherApi.listInstitutions(),
        teacherApi.listAcademicYears(),
      ])
      setInstitutions(instRes.data)
      setAcademicYears(yearRes.data)
    } catch { /* silencieux */ }
  }

  const handleInstitutionChange = async (instId: number | '') => {
    setSelectedInst(instId)
    setSelectedFiliere('')
    setSelectedClass('')
    setFilieres([])
    setClasses([])
    if (instId) {
      try {
        const res = await teacherApi.listFilieres(instId as number)
        setFilieres(res.data)
      } catch { /* silencieux */ }
    }
  }

  const handleFiliereChange = async (filiereId: number | '') => {
    setSelectedFiliere(filiereId)
    setSelectedClass('')
    setClasses([])
    if (filiereId && selectedYear) {
      try {
        const res = await teacherApi.listClasses(filiereId as number, selectedYear as number)
        setClasses(res.data)
      } catch { /* silencieux */ }
    }
  }

  const handleYearChange = async (yearId: number | '') => {
    setSelectedYear(yearId)
    setSelectedClass('')
    setClasses([])
    if (yearId && selectedFiliere) {
      try {
        const res = await teacherApi.listClasses(selectedFiliere as number, yearId as number)
        setClasses(res.data)
      } catch { /* silencieux */ }
    }
  }

  const fetchSessions = async (skip: number) => {
    setLoading(true)
    try {
      const res = await api.get<PaginatedResponse<ExamSession>>('/teacher/sessions', { params: { skip, limit } })
      setSessions(res.data.items)
      setTotal(res.data.total)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally { setLoading(false) }
  }

  const goToPage = (p: number) => {
    if (p < 0 || p >= totalPages) return
    setPage(p); fetchSessions(p * limit)
  }

  const resetForm = () => {
    setForm({ title: '', subject: '', duration_hours: '1', duration_minutes: '0',
      student_count: '30', grading_system: '20', correction_mode: 'ai_assisted', description: '' })
    setSelectedInst(''); setSelectedFiliere(''); setSelectedYear(''); setSelectedClass('')
    setShowCreateForm(false)
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    const duration_seconds = (parseInt(form.duration_hours) * 3600) + (parseInt(form.duration_minutes) * 60)
    try {
      const res = await api.post('/teacher/sessions', {
        title: form.title, subject: form.subject, description: form.description || null,
        duration_seconds, student_count: parseInt(form.student_count),
        grading_system: form.grading_system, correction_mode: form.correction_mode,
        auto_submit: true, show_results: false,
        class_id: selectedClass || null,
        academic_year_id: selectedYear || null,
      })
      setSessions([res.data, ...sessions]); resetForm()
    } catch (err: any) { setError(err.response?.data?.detail || "Erreur lors de la création") }
  }

  const handleLaunch = async (id: number) => {
    try {
      const res = await api.post(`/teacher/sessions/${id}/launch`)
      setSessions(sessions.map((s) => (s.id === id ? res.data : s)))
    } catch (err: any) { setError(err.response?.data?.detail || 'Erreur au lancement') }
  }

  const handleDelete = async (id: number) => {
    setDeleteTarget(null)
    try {
      await api.delete(`/teacher/sessions/${id}`)
      setSessions(sessions.filter((s) => s.id !== id))
    } catch (err: any) { setError(err.response?.data?.detail || 'Erreur à la suppression') }
  }

  return (
    <Layout title="Sessions d'évaluation">
      <div className="space-y-5">
        {error && (
          <div className="bg-correcteur-clair border border-correcteur/20 text-correcteur px-4 py-3 rounded-md text-sm animate-fade-in">
            {error}
          </div>
        )}

        {/* Header + Action */}
        <div className="flex items-center justify-between animate-fade-in">
          <p className="text-sm text-text-secondary">{total} session{total !== 1 ? 's' : ''}</p>
          <button onClick={() => { resetForm(); setShowCreateForm(true) }}
            className="btn btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Nouvelle session
          </button>
        </div>

        {/* Formulaire de création */}
        {showCreateForm && (
          <div className="card animate-scale-in p-6">
            <h3 className="font-heading font-semibold text-lg text-white mb-5">Configuration de la session</h3>
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white mb-1.5">Titre de la session *</label>
                  <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="input" placeholder="Partiel S1 — Mathématiques" required />
                </div>

                {/* Sélecteurs hiérarchiques classe */}
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Établissement</label>
                  <select value={selectedInst} onChange={(e) => handleInstitutionChange(e.target.value ? Number(e.target.value) : '')}
                    className="input">
                    <option value="">— Sélectionner —</option>
                    {institutions.map((inst) => (
                      <option key={inst.id} value={inst.id}>{inst.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Filière</label>
                  <select value={selectedFiliere} onChange={(e) => handleFiliereChange(e.target.value ? Number(e.target.value) : '')}
                    className="input" disabled={!selectedInst}>
                    <option value="">— Sélectionner —</option>
                    {filieres.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Année académique</label>
                  <select value={selectedYear} onChange={(e) => handleYearChange(e.target.value ? Number(e.target.value) : '')}
                    className="input">
                    <option value="">— Sélectionner —</option>
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Classe</label>
                  <select value={selectedClass} onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : ''
                    setSelectedClass(val)
                    const cls = classes.find((c) => c.id === val)
                    if (cls) {
                      // Auto-remplir le nombre d'étudiants quand une classe est sélectionnée
                      teacherApi.listClassStudents(cls.id).then((res) => {
                        if (res.data?.length) setForm((f) => ({ ...f, student_count: String(res.data.length) }))
                      }).catch(() => {})
                    }
                  }} className="input" disabled={!selectedFiliere || !selectedYear}>
                    <option value="">— Sélectionner —</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Matière *</label>
                  <input type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="input" placeholder="Mathématiques" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Description</label>
                  <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="input" placeholder="Examen de mi-semestre" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">Heures</label>
                    <input type="number" value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })}
                      className="input" min="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">Minutes</label>
                    <input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                      className="input" min="0" max="59" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Nombre d'étudiants *</label>
                  <input type="number" value={form.student_count} onChange={(e) => setForm({ ...form, student_count: e.target.value })}
                    className="input" min="1" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Système de notation</label>
                  <select value={form.grading_system} onChange={(e) => setForm({ ...form, grading_system: e.target.value })}
                    className="input">
                    <option value="20">Note /20</option>
                    <option value="100">Note /100</option>
                    <option value="10">Note /10</option>
                    <option value="50">Note /50</option>
                    <option value="letter">Lettres (A-F)</option>
                    <option value="custom">Barème personnalisé</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Mode de correction</label>
                  <select value={form.correction_mode} onChange={(e) => setForm({ ...form, correction_mode: e.target.value })}
                    className="input">
                    <option value="ai_only">Automatique (IA uniquement)</option>
                    <option value="ai_assisted">IA + Révision manuelle</option>
                    <option value="manual">Manuelle uniquement</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn btn-primary font-semibold">
                  Créer la session
                </button>
                <button type="button" onClick={resetForm} className="btn btn-ghost">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Liste des sessions */}
        <div className="card-plain overflow-hidden">
          {loading ? (
            <AdminListSkeleton rows={3} />
          ) : sessions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 bg-slate-mid/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <p className="text-text-secondary font-medium">Aucune session créée</p>
              <button onClick={() => { resetForm(); setShowCreateForm(true) }}
                className="mt-3 text-sm text-neon-cyan hover:text-white-clair font-medium">
                Créer votre première session
              </button>
            </div>
          ) : (
            <div className="divide-y divide-marge/50">
              {sessions.map((session, i) => (
                <div key={session.id} className="px-5 py-4 hover:bg-white/[0.03] transition-all duration-200 card-hover"
                  style={{ animationDelay: `${i * 0.04}s` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-white">{session.title}</h4>
                        <span className={`badge ${
                          session.status === 'active' ? 'badge-active' :
                          session.status === 'completed' ? 'badge-completed' :
                          session.status === 'cancelled' ? 'badge-danger' : 'badge-draft'
                        }`}>
                          {session.status === 'active' ? 'Active'
                            : session.status === 'completed' ? 'Terminée'
                            : session.status === 'cancelled' ? 'Annulée'
                            : 'Brouillon'}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary truncate">
                        {session.subject}
                        <span className="mx-1.5">·</span>
                        {Math.floor(session.duration_seconds / 60)} min
                        <span className="mx-1.5">·</span>
                        {session.student_count} étudiant{session.student_count > 1 ? 's' : ''}
                        <span className="mx-1.5">·</span>
                        Code : <span className="font-mono text-neon-cyan font-medium">{session.access_code}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      {session.status === 'draft' && (
                        <>
                          <button onClick={() => handleLaunch(session.id)}
                            className="btn-secondary text-xs px-3 py-1.5">
                            Lancer
                          </button>
                          <button onClick={() => setDeleteTarget(session)}
                            className="btn-danger text-xs px-3 py-1.5">
                            Supprimer
                          </button>
                        </>
                      )}
                      <button onClick={() => navigate(`/teacher/sessions/${session.id}`)}
                        className="btn-secondary text-xs px-3 py-1.5">
                        Détails
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 animate-fade-in">
            <button onClick={() => goToPage(page - 1)} disabled={page === 0}
              className="btn btn-ghost text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              ← Précédent
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const start = Math.max(0, Math.min(page - 3, totalPages - 7))
              const p = start + i
              return (
                <button key={p} onClick={() => goToPage(p)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    p === page ? 'bg-neon-cyan text-deep-space' : 'btn btn-ghost'
                  }`}>
                  {p + 1}
                </button>
              )
            })}
            <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}
              className="btn btn-ghost text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              Suivant →
            </button>
          </div>
        )}

        <ConfirmModal
          open={deleteTarget !== null}
          title="Supprimer la session"
          message={`Êtes-vous sûr de vouloir supprimer "${deleteTarget?.title}" ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          variant="danger"
          onConfirm={() => handleDelete(deleteTarget!.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </Layout>
  )
}
