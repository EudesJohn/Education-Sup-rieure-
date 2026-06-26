/** Gestion des listes d'étudiants — RF-02 Dossiers Pédagogiques.
 *
 * Permet à l'enseignant de :
 * 1. Créer une nouvelle liste et y ajouter des étudiants manuellement
 * 2. Ajouter des étudiants un par un (nom + matricule + email + classe)
 * 3. Gérer plusieurs listes
 * 4. Voir le détail d'une liste avec ses entrées
 */

import { useEffect, useState } from 'react'
import { Layout } from '@/components/Layout'
import { studentListApi, teacherApi } from '@/services/api'
import type { StudentList, StudentListEntry, Institution, Filiere, AcademicYear, Class, ClassStudent } from '@/types'

// =============================================================
// Types locaux
// =============================================================

type ViewMode = 'list' | 'create' | 'detail'

interface ManualEntry {
  student_name: string
  student_number: string
  email: string
  class_name: string
}

const emptyEntry = (): ManualEntry => ({
  student_name: '',
  student_number: '',
  email: '',
  class_name: '',
})

// =============================================================
// Page principale
// =============================================================

export function StudentListsPage() {
  const [view, setView] = useState<ViewMode>('list')
  const [lists, setLists] = useState<StudentList[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchLists = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await studentListApi.list()
      setLists(res.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors du chargement des listes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLists() }, [])

  const handleDeleted = () => {
    setView('list')
    setSelectedId(null)
    fetchLists()
  }

  const handleSelect = (id: number) => {
    setSelectedId(id)
    setView('detail')
  }

  return (
    <Layout title="Listes d'étudiants">
      {/* Message d'erreur */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-accent/10 border border-rose-accent/20 text-rose-accent text-sm animate-fade-in">
          {error}
        </div>
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted/70">
          {lists.length} liste{lists.length > 1 ? 's' : ''} enregistrée{lists.length > 1 ? 's' : ''}
        </p>
        {view === 'list' && (
          <button
            onClick={() => setView('create')}
            className="btn-primary text-sm px-5 py-2.5"
          >
            <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nouvelle liste
          </button>
        )}
        {(view === 'create' || view === 'detail') && (
          <button
            onClick={() => { setView('list'); setSelectedId(null) }}
            className="btn-ghost text-sm px-4 py-2"
          >
            ← Retour aux listes
          </button>
        )}
      </div>

      {/* Contenu selon la vue */}
      {view === 'list' && (
        loading
          ? <LoadingSkeleton />
          : <ListsTable lists={lists} onSelect={handleSelect} onDeleted={handleDeleted} />
      )}
      {view === 'create' && (
        <CreateListWizard
          onDone={() => { setView('list'); fetchLists() }}
          onCancel={() => setView('list')}
        />
      )}
      {view === 'detail' && selectedId !== null && (
        <DetailView
          listId={selectedId}
          onBack={() => { setView('list'); setSelectedId(null) }}
          onDeleted={handleDeleted}
        />
      )}
    </Layout>
  )
}

// =============================================================
// Sous-composants
// =============================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-xl bg-white/[0.03]" />
      ))}
    </div>
  )
}

// =============================================================
// Liste des listes
// =============================================================

function ListsTable({
  lists,
  onSelect,
  onDeleted,
}: {
  lists: StudentList[]
  onSelect: (id: number) => void
  onDeleted: () => void
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (!window.confirm('Supprimer cette liste ? Cette action est irréversible.')) return
    setDeletingId(id)
    try {
      await studentListApi.delete(id)
      onDeleted()
    } catch {
      setDeletingId(null)
    }
  }

  if (lists.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/[0.03] flex items-center justify-center">
          <svg className="w-8 h-8 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-white/70 mb-2">Aucune liste d'étudiants</h3>
        <p className="text-sm text-muted/50 max-w-md mx-auto mb-6">
          Créez votre première liste et ajoutez vos étudiants manuellement.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {lists.map((lst) => (
        <div
          key={lst.id}
          onClick={() => onSelect(lst.id)}
          className="card flex items-center gap-4 p-4 cursor-pointer hover:border-neon-cyan/20 transition-all duration-200"
        >
          {/* Icône */}
          <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>

          {/* Infos */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h3 className="font-medium text-white truncate">{lst.name}</h3>
              {lst.groupe && (
                <span className="badge-amber text-[10px] px-2 py-0.5">{lst.groupe}</span>
              )}
              <StatusBadge status={lst.status} />
            </div>
            <p className="text-xs text-muted/60 mt-1">
              {lst.student_count} étudiant{lst.student_count > 1 ? 's' : ''}
              {' · '}
              {new Date(lst.created_at).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </p>
          </div>

          {/* Actions */}
          <button
            onClick={(e) => handleDelete(e, lst.id)}
            disabled={deletingId === lst.id}
            className="p-2 rounded-lg text-muted/40 hover:text-rose-accent hover:bg-rose-accent/10 transition-all disabled:opacity-50"
            title="Supprimer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

// =============================================================
// Création manuelle d'une liste
// =============================================================

function CreateListWizard({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<'info' | 'students' | 'done'>('info')
  const [listName, setListName] = useState('')
  const [groupe, setGroupe] = useState('')
  const [listId, setListId] = useState<number | null>(null)
  const [entries, setEntries] = useState<ManualEntry[]>([emptyEntry()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Hiérarchie pour import depuis une classe
  const [showImportFromClass, setShowImportFromClass] = useState(false)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [classStudents, setClassStudents] = useState<ClassStudent[]>([])
  const [selectedInst, setSelectedInst] = useState<number | ''>('')
  const [selectedFiliere, setSelectedFiliere] = useState<number | ''>('')
  const [selectedYear, setSelectedYear] = useState<number | ''>('')
  const [selectedClass, setSelectedClass] = useState<number | ''>('')
  const [importingStudents, setImportingStudents] = useState(false)
  const [loadingClassStudents, setLoadingClassStudents] = useState(false)

  // Gestionnaires hiérarchiques pour l'import depuis une classe
  const handleInstitutionChange = async (instId: number | '') => {
    setSelectedInst(instId)
    setSelectedFiliere('')
    setSelectedClass('')
    setFilieres([])
    setClasses([])
    setClassStudents([])
    if (instId) {
      try {
        const res = await teacherApi.listFilieres(instId as number)
        setFilieres(Array.isArray(res.data) ? res.data : [])
      } catch { /* ignore */ }
    }
  }

  const handleFiliereChange = async (filiereId: number | '') => {
    setSelectedFiliere(filiereId)
    setSelectedClass('')
    setClasses([])
    setClassStudents([])
    if (filiereId && selectedYear) {
      try {
        const res = await teacherApi.listClasses(filiereId as number, selectedYear as number)
        setClasses(Array.isArray(res.data) ? res.data : [])
      } catch { /* ignore */ }
    }
  }

  const handleYearChange = async (yearId: number | '') => {
    setSelectedYear(yearId)
    setSelectedClass('')
    setClasses([])
    setClassStudents([])
    if (yearId && selectedFiliere) {
      try {
        const res = await teacherApi.listClasses(selectedFiliere as number, yearId as number)
        setClasses(Array.isArray(res.data) ? res.data : [])
      } catch { /* ignore */ }
    }
  }

  const handleClassSelect = async (classId: number | '') => {
    setSelectedClass(classId)
    setClassStudents([])
    if (classId) {
      setLoadingClassStudents(true)
      try {
        const res = await teacherApi.listClassStudents(classId as number)
        setClassStudents(Array.isArray(res.data) ? res.data : [])
      } catch { /* ignore */ }
      finally { setLoadingClassStudents(false) }
    }
  }

  const importAllFromClass = () => {
    const newEntries = classStudents.map(s => ({
      student_name: s.student_name,
      student_number: s.student_number,
      email: s.email || '',
      class_name: '',
    }))
    // Merge with existing entries, avoiding duplicates by student_number
    const existingNumbers = new Set(entries.map(e => e.student_number))
    const toAdd = newEntries.filter(e => !existingNumbers.has(e.student_number))
    setEntries(prev => [...prev, ...toAdd])
    setShowImportFromClass(false)
    setClassStudents([])
    setSelectedInst('')
    setSelectedFiliere('')
    setSelectedYear('')
    setSelectedClass('')
  }

  // Étape 1 : Créer la liste vide
  const handleCreateList = async () => {
    if (!listName.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await studentListApi.confirm({
        name: listName.trim(),
        groupe: groupe.trim() || undefined,
        column_mapping: { student_name: 'Nom', student_number: 'Matricule', email: 'Email', class_name: 'Classe' },
        entries: [],
        original_filename: null,
        file_type: 'manual',
      })
      // La route confirm retourne { list: { id: ... }, ... }
      const newId = res.data?.list?.id ?? res.data?.id
      setListId(newId)
      setStep('students')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la création de la liste')
    } finally {
      setSaving(false)
    }
  }

  // Ajout d'une ligne vide
  const addRow = () => setEntries(prev => [...prev, emptyEntry()])

  // Mise à jour d'une cellule
  const updateEntry = (idx: number, field: keyof ManualEntry, value: string) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  // Supprimer une ligne
  const removeRow = (idx: number) => {
    setEntries(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }

  // Étape 2 : Enregistrer les étudiants
  const handleSaveStudents = async () => {
    if (!listId) return
    const valid = entries.filter(e => e.student_name.trim() || e.student_number.trim())
    if (valid.length === 0) {
      setError('Ajoutez au moins un étudiant avant de valider.')
      return
    }
    setSaving(true)
    setError('')
    try {
      // Ajouter chaque étudiant via l'API
      for (const entry of valid) {
        await studentListApi.addStudent(listId, {
          student_name: entry.student_name.trim(),
          student_number: entry.student_number.trim(),
          email: entry.email.trim() || undefined,
          class_name: entry.class_name.trim() || undefined,
        })
      }
      setStep('done')
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur lors de l'ajout des étudiants")
    } finally {
      setSaving(false)
    }
  }

  // Succès
  if (step === 'done') {
    return (
      <div className="card p-10 text-center animate-scale-in">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Liste créée avec succès !</h3>
        <p className="text-sm text-muted/60 mb-6">
          Les étudiants peuvent désormais rejoindre les sessions avec leur matricule.
        </p>
        <button onClick={onDone} className="btn-primary px-6 py-2.5">
          Voir les listes
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {error && (
        <div className="p-4 rounded-xl bg-rose-accent/10 border border-rose-accent/20 text-rose-accent text-sm animate-fade-in">
          {error}
        </div>
      )}

      {/* Étape 1 : Infos de la liste */}
      {step === 'info' && (
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Nouvelle liste d'étudiants</h3>
            <p className="text-sm text-muted/60">Renseignez les informations de base de votre liste pédagogique.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted/70 mb-1.5">
                Nom de la liste <span className="text-rose-accent">*</span>
              </label>
              <input
                type="text"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                className="input w-full"
                placeholder="ex: L2 Informatique 2025-26"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted/70 mb-1.5">Groupe (optionnel)</label>
              <input
                type="text"
                value={groupe}
                onChange={(e) => setGroupe(e.target.value)}
                className="input w-full"
                placeholder="ex: Groupe A, TD1..."
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={onCancel} className="btn-ghost text-sm px-5 py-2.5">
              Annuler
            </button>
            <button
              onClick={handleCreateList}
              disabled={!listName.trim() || saving}
              className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50"
            >
              {saving ? 'Création...' : 'Continuer →'}
            </button>
          </div>
        </div>
      )}

      {/* Étape 2 : Ajout des étudiants */}
      {step === 'students' && (
        <div className="space-y-4">
          {/* Import depuis une classe */}
          <div className="card p-5">
            <button
              type="button"
              onClick={() => {
                setShowImportFromClass(!showImportFromClass)
                if (!showImportFromClass && institutions.length === 0) {
                  teacherApi.listInstitutions().then(r => setInstitutions(Array.isArray(r.data) ? r.data : [])).catch(() => {})
                  teacherApi.listAcademicYears().then(r => setAcademicYears(Array.isArray(r.data) ? r.data : [])).catch(() => {})
                }
              }}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-ambre" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008z" />
                </svg>
                <span className="font-medium text-white">Importer depuis une classe</span>
              </div>
              <svg className={`w-4 h-4 text-muted/50 transition-transform ${showImportFromClass ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {showImportFromClass && (
              <div className="mt-4 space-y-4 animate-fade-in">
                {/* Sélecteurs hiérarchiques */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted/70 mb-1">Établissement</label>
                    <select value={selectedInst} onChange={(e) => handleInstitutionChange(e.target.value ? Number(e.target.value) : '')}
                      className="input text-sm">
                      <option value="">— Sélectionner —</option>
                      {institutions.map(inst => (
                        <option key={inst.id} value={inst.id}>{inst.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted/70 mb-1">Filière</label>
                    <select value={selectedFiliere} onChange={(e) => handleFiliereChange(e.target.value ? Number(e.target.value) : '')}
                      className="input text-sm" disabled={!selectedInst}>
                      <option value="">— Sélectionner —</option>
                      {filieres.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted/70 mb-1">Année académique</label>
                    <select value={selectedYear} onChange={(e) => handleYearChange(e.target.value ? Number(e.target.value) : '')}
                      className="input text-sm">
                      <option value="">— Sélectionner —</option>
                      {academicYears.map(y => (
                        <option key={y.id} value={y.id}>{y.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted/70 mb-1">Classe</label>
                    <select value={selectedClass} onChange={(e) => handleClassSelect(e.target.value ? Number(e.target.value) : '')}
                      className="input text-sm" disabled={!selectedFiliere || !selectedYear}>
                      <option value="">— Sélectionner —</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Étudiants de la classe */}
                {loadingClassStudents && (
                  <div className="text-center py-4 text-sm text-muted/60">Chargement des étudiants...</div>
                )}

                {!loadingClassStudents && selectedClass && classStudents.length === 0 && (
                  <div className="text-center py-4 text-sm text-muted/50">
                    Aucun étudiant inscrit dans cette classe.
                  </div>
                )}

                {!loadingClassStudents && classStudents.length > 0 && (
                  <>
                    <div className="overflow-x-auto max-h-48 overflow-y-auto border border-white/[0.06] rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-deep-space">
                          <tr className="border-b border-white/[0.06]">
                            <th className="text-left py-2 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">Nom</th>
                            <th className="text-left py-2 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">Matricule</th>
                            <th className="text-left py-2 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">Email</th>
                          </tr>
                        </thead>
                        <tbody>
                          {classStudents.map((s, i) => (
                            <tr key={s.id} className="border-b border-white/[0.03] last:border-0">
                              <td className="py-1.5 px-3 text-white/90">{s.student_name}</td>
                              <td className="py-1.5 px-3 text-muted/70 font-mono text-xs">{s.student_number}</td>
                              <td className="py-1.5 px-3 text-muted/50 text-xs">{s.email || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={importAllFromClass}
                        className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                        </svg>
                        Ajouter {classStudents.length} étudiant(s) à la liste
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Saisie manuelle */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-white">Ajout manuel</h3>
                <p className="text-xs text-muted/60 mt-0.5">
                  Liste : <span className="text-neon-cyan">{listName}</span>
                  {groupe && <span className="ml-2 badge-amber text-[10px] px-1.5 py-0.5">{groupe}</span>}
                </p>
              </div>
              <button
                onClick={addRow}
                className="btn-ghost text-sm px-4 py-2 flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Ajouter une ligne
              </button>
            </div>

            {/* Tableau de saisie */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">#</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">
                      Nom complet <span className="text-rose-accent">*</span>
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">
                      Matricule <span className="text-rose-accent">*</span>
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">Email</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">Classe</th>
                    <th className="py-2.5 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, idx) => (
                    <tr key={idx} className="border-b border-white/[0.03] last:border-0 group">
                      <td className="py-2 px-3 text-muted/40 text-xs w-8">{idx + 1}</td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={entry.student_name}
                          onChange={(e) => updateEntry(idx, 'student_name', e.target.value)}
                          className="input w-full text-sm py-1.5"
                          placeholder="Jean Dupont"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={entry.student_number}
                          onChange={(e) => updateEntry(idx, 'student_number', e.target.value)}
                          className="input w-full text-sm py-1.5"
                          placeholder="20240001"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="email"
                          value={entry.email}
                          onChange={(e) => updateEntry(idx, 'email', e.target.value)}
                          className="input w-full text-sm py-1.5"
                          placeholder="jean@univ.edu"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={entry.class_name}
                          onChange={(e) => updateEntry(idx, 'class_name', e.target.value)}
                          className="input w-full text-sm py-1.5"
                          placeholder="L2 Info"
                        />
                      </td>
                      <td className="py-1.5 px-2 w-8">
                        <button
                          onClick={() => removeRow(idx)}
                          disabled={entries.length === 1}
                          className="p-1.5 rounded-lg text-muted/30 hover:text-rose-accent hover:bg-rose-accent/10 transition-all opacity-0 group-hover:opacity-100 disabled:hidden"
                          title="Supprimer cette ligne"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Raccourci clavier */}
            <p className="text-xs text-muted/40 mt-3">
              💡 Astuce : utilisez <strong>« Importer depuis une classe »</strong> ci-dessus ou ajoutez manuellement chaque étudiant.
            </p>
          </div>

          {/* Compteur */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted/60">
              {entries.filter(e => e.student_name.trim() || e.student_number.trim()).length} étudiant(s) à enregistrer
            </span>
            <div className="flex items-center gap-3">
              <button onClick={onCancel} className="btn-ghost text-sm px-5 py-2.5">
                Annuler
              </button>
              <button
                onClick={handleSaveStudents}
                disabled={saving || entries.every(e => !e.student_name.trim() && !e.student_number.trim())}
                className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : `Enregistrer la liste`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================
// Détail d'une liste
// =============================================================

function DetailView({
  listId,
  onBack,
  onDeleted,
}: {
  listId: number
  onBack: () => void
  onDeleted: () => void
}) {
  const [list, setList] = useState<StudentList | null>(null)
  const [entries, setEntries] = useState<StudentListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEntry, setNewEntry] = useState<ManualEntry>(emptyEntry())
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})

  const fetchDetail = async () => {
    setLoading(true)
    try {
      const [lstRes, entriesRes] = await Promise.all([
        studentListApi.get(listId),
        studentListApi.entries(listId),
      ])
      // La route GET /student-lists/{id} retourne { list: {...}, entries: [...] }
      // ou directement l'objet selon la version du backend
      const listData = lstRes.data?.list ?? lstRes.data
      setList(listData)
      setEntries(entriesRes.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDetail() }, [listId])

  const handleAddStudent = async () => {
    if (!newEntry.student_name.trim() && !newEntry.student_number.trim()) return
    setAdding(true)
    setError('')
    try {
      await studentListApi.addStudent(listId, {
        student_name: newEntry.student_name.trim(),
        student_number: newEntry.student_number.trim(),
        email: newEntry.email.trim() || undefined,
        class_name: newEntry.class_name.trim() || undefined,
      })
      setNewEntry(emptyEntry())
      setShowAddForm(false)
      fetchDetail()
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur lors de l'ajout")
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteEntry = async (entryId: number) => {
    if (!window.confirm('Supprimer cet étudiant de la liste ?')) return
    try {
      await studentListApi.deleteEntry(listId, entryId)
      setEntries(prev => prev.filter(e => e.id !== entryId))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  // === Édition inline ===

  const startEdit = (entry: StudentListEntry) => {
    setEditingId(entry.id)
    setEditForm({
      student_name: entry.student_name || '',
      student_number: entry.student_number || '',
      email: entry.email || '',
      class_name: entry.class_name || '',
    })
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
    setError('')
  }

  const handleEditChange = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  const saveEdit = async (entryId: number) => {
    const payload: Record<string, string> = {}
    if (editForm.student_name.trim()) payload.student_name = editForm.student_name.trim()
    if (editForm.student_number.trim()) payload.student_number = editForm.student_number.trim()
    if (editForm.email.trim()) payload.email = editForm.email.trim()
    if (editForm.class_name.trim()) payload.class_name = editForm.class_name.trim()

    setError('')
    try {
      await studentListApi.updateEntry(listId, entryId, payload)
      setEditingId(null)
      setEditForm({})
      fetchDetail()
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur lors de la modification")
    }
  }

  if (loading) return <LoadingSkeleton />

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-4 rounded-xl bg-rose-accent/10 border border-rose-accent/20 text-rose-accent text-sm">
          {error}
        </div>
      )}

      {/* En-tête de la liste */}
      {list && (
        <div className="card p-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{list.name}</h2>
            <div className="flex items-center gap-2.5 mt-1.5">
              {list.groupe && <span className="badge-amber text-[10px] px-2 py-0.5">{list.groupe}</span>}
              <StatusBadge status={list.status} />
              <span className="text-xs text-muted/60">
                {list.student_count} étudiant{list.student_count > 1 ? 's' : ''}
              </span>
              <span className="text-xs text-muted/40">
                · Créée le {new Date(list.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowAddForm(prev => !prev)}
            className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
            </svg>
            Ajouter un étudiant
          </button>
        </div>
      )}

      {/* Formulaire d'ajout */}
      {showAddForm && (
        <div className="card p-5 animate-fade-in border border-neon-cyan/20">
          <h4 className="font-medium text-white mb-4">Nouvel étudiant</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-muted/70 mb-1">Nom complet *</label>
              <input
                type="text"
                value={newEntry.student_name}
                onChange={(e) => setNewEntry(prev => ({ ...prev, student_name: e.target.value }))}
                className="input w-full text-sm"
                placeholder="Jean Dupont"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted/70 mb-1">Matricule *</label>
              <input
                type="text"
                value={newEntry.student_number}
                onChange={(e) => setNewEntry(prev => ({ ...prev, student_number: e.target.value }))}
                className="input w-full text-sm"
                placeholder="20240001"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted/70 mb-1">Email</label>
              <input
                type="email"
                value={newEntry.email}
                onChange={(e) => setNewEntry(prev => ({ ...prev, email: e.target.value }))}
                className="input w-full text-sm"
                placeholder="jean@univ.edu"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted/70 mb-1">Classe</label>
              <input
                type="text"
                value={newEntry.class_name}
                onChange={(e) => setNewEntry(prev => ({ ...prev, class_name: e.target.value }))}
                className="input w-full text-sm"
                placeholder="L2 Info"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button onClick={() => { setShowAddForm(false); setNewEntry(emptyEntry()) }} className="btn-ghost text-sm px-4 py-2">
              Annuler
            </button>
            <button
              onClick={handleAddStudent}
              disabled={adding || (!newEntry.student_name.trim() && !newEntry.student_number.trim())}
              className="btn-primary text-sm px-5 py-2 disabled:opacity-50"
            >
              {adding ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}

      {/* Tableau des étudiants */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-white">
            Étudiants inscrits
            <span className="ml-2 text-xs font-normal text-muted/50">({entries.length})</span>
          </h3>
        </div>

        {entries.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-10 h-10 text-muted/30 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <p className="text-sm text-muted/50">Aucun étudiant dans cette liste</p>
            <p className="text-xs text-muted/40 mt-1">Cliquez sur « Ajouter un étudiant » pour commencer.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">#</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">Nom complet</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">Matricule</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">Email</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider">Classe</th>
                  <th className="py-2.5 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  editingId === entry.id ? (
                    /* Mode édition inline */
                    <tr key={entry.id} className="border-b border-neon-cyan/20 bg-neon-cyan/5">
                      <td className="py-2 px-3 text-muted/40 text-xs">{idx + 1}</td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={editForm.student_name || ''}
                          onChange={(e) => handleEditChange('student_name', e.target.value)}
                          className="input w-full text-sm py-1.5"
                          placeholder="Nom complet"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={editForm.student_number || ''}
                          onChange={(e) => handleEditChange('student_number', e.target.value)}
                          className="input w-full text-sm py-1.5"
                          placeholder="Matricule"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="email"
                          value={editForm.email || ''}
                          onChange={(e) => handleEditChange('email', e.target.value)}
                          className="input w-full text-sm py-1.5"
                          placeholder="Email"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={editForm.class_name || ''}
                          onChange={(e) => handleEditChange('class_name', e.target.value)}
                          className="input w-full text-sm py-1.5"
                          placeholder="Classe"
                        />
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => saveEdit(entry.id)}
                            className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-all"
                            title="Enregistrer"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1.5 rounded-lg text-muted/40 hover:text-rose-accent hover:bg-rose-accent/10 transition-all"
                            title="Annuler"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    /* Mode affichage normal */
                    <tr key={entry.id} className="border-b border-white/[0.03] last:border-0 group hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-3 text-muted/40 text-xs">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-white/90">{entry.student_name || '—'}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-xs bg-white/[0.06] px-2 py-0.5 rounded-md text-neon-cyan/80">
                          {entry.student_number || '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted/60 text-xs">{entry.email || '—'}</td>
                      <td className="py-2.5 px-3 text-muted/60 text-xs">{entry.class_name || '—'}</td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => startEdit(entry)}
                            className="p-1.5 rounded-lg text-muted/30 hover:text-neon-cyan hover:bg-neon-cyan/10 transition-all"
                            title="Modifier cet étudiant"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="p-1.5 rounded-lg text-muted/30 hover:text-rose-accent hover:bg-rose-accent/10 transition-all"
                            title="Retirer cet étudiant"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================
// Micro-composants
// =============================================================

function StatusBadge({ status }: { status: string }) {
  const active = status === 'active'
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
      active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.06] text-muted/50'
    }`}>
      {active ? 'Active' : 'Archivée'}
    </span>
  )
}
