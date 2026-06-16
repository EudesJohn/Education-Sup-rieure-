/** Admin — Gestion des classes. */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { ConfirmModal } from '@/components/ConfirmModal'
import { AdminListSkeleton } from '@/components/Skeleton'
import { adminApi } from '@/services/api'
import type { Class, Filiere, AcademicYear, Institution, StudyLevel } from '@/types'

export function AdminClasses() {
  const [items, setItems] = useState<Class[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [levels, setLevels] = useState<StudyLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Class | null>(null)
  const [formName, setFormName] = useState('')
  const [formLevel, setFormLevel] = useState('')
  const [formLevelId, setFormLevelId] = useState<number | ''>('')
  const [formFiliere, setFormFiliere] = useState<number | ''>('')
  const [formYear, setFormYear] = useState<number | ''>('')
  const [deleteTarget, setDeleteTarget] = useState<Class | null>(null)
  const [filterFiliere, setFilterFiliere] = useState<number | ''>('')
  const [filterYear, setFilterYear] = useState<number | ''>('')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [filRes, yearRes, clsRes, instRes, levelsRes] = await Promise.all([
        adminApi.listFilieres(),
        adminApi.listAcademicYears(),
        adminApi.listClasses(),
        adminApi.listInstitutions(),
        adminApi.listStudyLevels(),
      ])
      setFilieres(filRes.data)
      setYears(yearRes.data)
      setItems(clsRes.data)
      setInstitutions(instRes.data)
      setLevels(levelsRes.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally { setLoading(false) }
  }

  const filteredItems = items.filter((c) => {
    if (filterFiliere && c.filiere_id !== filterFiliere) return false
    if (filterYear && c.academic_year_id !== filterYear) return false
    return true
  })

  const handleSave = async () => {
    try {
      if (editing) {
        await adminApi.updateClass(editing.id, { name: formName, level: formLevel, study_level_id: formLevelId || null })
      } else {
        await adminApi.createClass({
          name: formName,
          level: formLevel,
          study_level_id: formLevelId || null,
          filiere_id: formFiliere,
          academic_year_id: formYear,
        })
      }
      setShowForm(false); setEditing(null); setFormName(''); setFormLevel(''); setFormLevelId('')
      await fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la sauvegarde')
    }
  }

  const handleDelete = async (id: number) => {
    setDeleteTarget(null)
    try {
      await adminApi.deleteClass(id)
      await fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  const getFiliereName = (id: number) => filieres.find((f) => f.id === id)?.name || '?'
  const getYearName = (id: number) => years.find((y) => y.id === id)?.name || '?'
  const getLevelName = (id?: number) => id ? levels.find((l) => l.id === id)?.name || '?' : ''
  const getInstitutionForFiliere = (filiereId: number) => {
    const f = filieres.find((fi) => fi.id === filiereId)
    if (!f) return ''
    const inst = institutions.find((i) => i.id === f.institution_id)
    return inst?.name || ''
  }

  return (
    <Layout title="Classes">
      <div className="space-y-5">
        {error && (
          <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-muted/60 text-sm">{filteredItems.length} classe(s)</p>
            <select value={filterFiliere} onChange={(e) => setFilterFiliere(e.target.value ? Number(e.target.value) : '')}
              className="input text-sm py-1.5 w-auto">
              <option value="">Toutes filières</option>
              {filieres.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value ? Number(e.target.value) : '')}
              className="input text-sm py-1.5 w-auto">
              <option value="">Toutes années</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>
          <button onClick={() => { setEditing(null); setFormName(''); setFormLevel(''); setFormLevelId(''); setFormFiliere(''); setFormYear(''); setShowForm(true) }}
            className="btn btn-primary btn-sm">
            + Ajouter
          </button>
        </div>

        {showForm && (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <select value={editing ? editing.filiere_id : formFiliere}
                onChange={(e) => setFormFiliere(Number(e.target.value))} className="input" disabled={!!editing} required>
                <option value="">Filière</option>
                {filieres.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <select value={editing ? editing.academic_year_id : formYear}
                onChange={(e) => setFormYear(Number(e.target.value))} className="input" disabled={!!editing} required>
                <option value="">Année académique</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
              <select value={editing ? (editing.study_level_id ?? '') : formLevelId}
                onChange={(e) => setFormLevelId(e.target.value ? Number(e.target.value) : '')} className="input">
                <option value="">Niveau d'étude</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
              placeholder="Nom de la classe (ex: L2 Mathématiques)" className="input" autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
            <input type="text" value={formLevel} onChange={(e) => setFormLevel(e.target.value)}
              placeholder="Niveau (optionnel, ex: L2)" className="input" />
            <div className="flex gap-2">
              <button onClick={handleSave} className="btn btn-primary btn-sm"
                disabled={!formName.trim() || (!editing && (!formFiliere || !formYear))}>
                {editing ? 'Modifier' : 'Créer'}
              </button>
              <button onClick={() => { setShowForm(false); setEditing(null) }} className="btn btn-ghost btn-sm">Annuler</button>
            </div>
          </div>
        )}

        {loading ? (
          <AdminListSkeleton rows={3} />
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-muted/50">
            <p className="text-lg mb-2">Aucune classe</p>
            <p className="text-sm">Créez d'abord une filière et une année académique, puis ajoutez des classes.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/[0.06] transition-colors">
                <div>
                  <p className="text-white font-medium">{item.name}</p>
                  <p className="text-muted/40 text-xs mt-0.5">
                    {getFiliereName(item.filiere_id)} · {getYearName(item.academic_year_id)}
                    {getInstitutionForFiliere(item.filiere_id) && ` · ${getInstitutionForFiliere(item.filiere_id)}`}
                    {getLevelName(item.study_level_id) && ` · ${getLevelName(item.study_level_id)}`}
                    {item.level && ` · ${item.level}`}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  <Link to={`/admin/classes/${item.id}/students`}
                    className="btn btn-ghost btn-xs text-neon-cyan">
                    Étudiants
                  </Link>
                  <button onClick={() => { setEditing(item); setFormName(item.name); setFormLevel(item.level || ''); setFormLevelId(item.study_level_id ?? ''); setFormFiliere(item.filiere_id); setFormYear(item.academic_year_id); setShowForm(true) }}
                    className="btn btn-ghost btn-xs">Modifier</button>
                  <button onClick={() => setDeleteTarget(item)} className="btn btn-ghost btn-xs text-rose-accent">Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ConfirmModal
          open={deleteTarget !== null}
          title="Supprimer la classe"
          message={`Êtes-vous sûr de vouloir supprimer "${deleteTarget?.name}" ? Les étudiants liés seront aussi supprimés.`}
          confirmLabel="Supprimer"
          variant="danger"
          onConfirm={() => handleDelete(deleteTarget!.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </Layout>
  )
}
