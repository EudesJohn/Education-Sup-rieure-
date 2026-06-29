/** Admin — Gestion des étudiants d'une spécialité. */

import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { ConfirmModal } from '@/components/ConfirmModal'
import { AdminListSkeleton } from '@/components/Skeleton'
import { adminApi } from '@/services/api'
import type { Class, ClassStudent, Filiere, AcademicYear } from '@/types'

export function AdminClassStudents() {
  const { classId } = useParams<{ classId: string }>()
  const [cls, setCls] = useState<Class | null>(null)
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [students, setStudents] = useState<ClassStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ClassStudent | null>(null)
  const [formName, setFormName] = useState('')
  const [formNumber, setFormNumber] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ClassStudent | null>(null)

  useEffect(() => { if (classId) fetchData() }, [classId])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [clsRes, studentsRes, filRes, yearRes] = await Promise.all([
        adminApi.getClass(Number(classId)),
        adminApi.listClassStudents(Number(classId)),
        adminApi.listFilieres(),
        adminApi.listAcademicYears(),
      ])
      setCls(clsRes.data)
      setStudents(studentsRes.data)
      setFilieres(filRes.data)
      setYears(yearRes.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally { setLoading(false) }
  }

  const getFiliereName = (id: number) => filieres.find((f) => f.id === id)?.name || '?'
  const getYearName = (id: number) => years.find((y) => y.id === id)?.name || '?'

  const handleSave = async () => {
    try {
      if (editing) {
        await adminApi.updateClassStudent(editing.id, { student_name: formName, student_number: formNumber, email: formEmail })
      } else {
        await adminApi.addClassStudent(Number(classId), { student_name: formName, student_number: formNumber, email: formEmail })
      }
      setShowForm(false); setEditing(null); setFormName(''); setFormNumber(''); setFormEmail('')
      await fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la sauvegarde')
    }
  }

  const handleDelete = async (id: number) => {
    setDeleteTarget(null)
    try {
      await adminApi.deleteClassStudent(id)
      await fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  const handleImport = async () => {
    const lines = importText.trim().split('\n').filter(Boolean)
    const students = lines.map((line) => {
      const parts = line.split(',').map((s) => s.trim())
      return {
        student_name: parts[0] || '',
        student_number: parts[1] || '',
        email: parts[2] || null,
      }
    }).filter((s) => s.student_name && s.student_number)

    if (students.length === 0) {
      setError('Format invalide. Utilisez: Nom,Matricule,Email (un par ligne)')
      return
    }

    try {
      setImportLoading(true)
      await adminApi.importClassStudents(Number(classId), students)
      setImportText('')
      setShowImport(false)
      await fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'import')
    } finally {
      setImportLoading(false)
    }
  }

  return (
    <Layout title={cls ? `Étudiants — ${cls.name}` : 'Étudiants'}>
      <div className="space-y-5">
        {error && (
          <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Infos spécialité */}
        {cls && (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-white font-medium">{cls.name} {cls.level && <span className="text-muted/60">({cls.level})</span>}</p>
              <p className="text-muted/40 text-xs mt-0.5">
                {getFiliereName(cls.filiere_id)} · {getYearName(cls.academic_year_id)}
              </p>
            </div>
            <Link to="/admin/classes" className="btn btn-ghost btn-xs">← Toutes les spécialités</Link>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center">
          <p className="text-muted/60 text-sm">{students.length} étudiant(s)</p>
          <div className="flex gap-2">
            <button onClick={() => { setShowImport(!showImport); setShowForm(false) }}
              className="btn btn-ghost btn-sm">
              Importer CSV
            </button>
            <button onClick={() => { setEditing(null); setFormName(''); setFormNumber(''); setFormEmail(''); setShowForm(true); setShowImport(false) }}
              className="btn btn-primary btn-sm">
              + Ajouter
            </button>
          </div>
        </div>

        {/* Import */}
        {showImport && (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
            <p className="text-sm text-muted/70">
              Collez les étudiants au format : <code className="text-neon-cyan">Nom,Matricule,Email</code> (un par ligne)
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="input min-h-[120px] font-mono text-sm"
              placeholder="Jean Dupont,MAT2024001,jean@example.com&#10;Marie Curie,MAT2024002,marie@example.com"
            />
            <div className="flex gap-2">
              <button onClick={handleImport} className="btn btn-primary btn-sm" disabled={importLoading || !importText.trim()}>
                {importLoading ? 'Importation...' : 'Importer'}
              </button>
              <button onClick={() => setShowImport(false)} className="btn btn-ghost btn-sm">Annuler</button>
            </div>
          </div>
        )}

        {/* Formulaire ajout */}
        {showForm && (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
              placeholder="Nom et prénoms" className="input" autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
            <input type="text" value={formNumber} onChange={(e) => setFormNumber(e.target.value)}
              placeholder="Matricule" className="input" />
            <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
              placeholder="Email (optionnel)" className="input" />
            <div className="flex gap-2">
              <button onClick={handleSave} className="btn btn-primary btn-sm" disabled={!formName.trim() || !formNumber.trim()}>
                {editing ? 'Modifier' : 'Ajouter'}
              </button>
              <button onClick={() => { setShowForm(false); setEditing(null) }} className="btn btn-ghost btn-sm">Annuler</button>
            </div>
          </div>
        )}

        {/* Tableau étudiants */}
        {loading ? (
          <AdminListSkeleton rows={5} />
        ) : students.length === 0 ? (
          <div className="text-center py-12 text-muted/50">
            <p className="text-lg mb-2">Aucun étudiant dans cette spécialité</p>
            <p className="text-sm">Ajoutez des étudiants un par un ou importez-les depuis un CSV.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="py-3 px-3 text-muted/60 font-medium text-xs uppercase tracking-wider">Nom</th>
                  <th className="py-3 px-3 text-muted/60 font-medium text-xs uppercase tracking-wider">Matricule</th>
                  <th className="py-3 px-3 text-muted/60 font-medium text-xs uppercase tracking-wider">Email</th>
                  <th className="py-3 px-3 text-muted/60 font-medium text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 text-white">{s.student_name}</td>
                    <td className="py-3 px-3 text-muted/80 font-mono text-xs">{s.student_number}</td>
                    <td className="py-3 px-3 text-muted/60 text-xs">{s.email || '-'}</td>
                    <td className="py-3 px-3 text-right">
                      <button onClick={() => { setEditing(s); setFormName(s.student_name); setFormNumber(s.student_number); setFormEmail(s.email || ''); setShowForm(true); setShowImport(false) }}
                        className="btn btn-ghost btn-xs mr-1">Modifier</button>
                      <button onClick={() => setDeleteTarget(s)} className="btn btn-ghost btn-xs text-rose-accent">Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ConfirmModal
          open={deleteTarget !== null}
          title="Supprimer l'étudiant"
          message={`Êtes-vous sûr de vouloir supprimer "${deleteTarget?.student_name}" (${deleteTarget?.student_number}) ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          variant="danger"
          onConfirm={() => handleDelete(deleteTarget!.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </Layout>
  )
}
