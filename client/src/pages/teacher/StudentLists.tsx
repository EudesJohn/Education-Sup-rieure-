/** Gestion des listes d'étudiants — RF-02 Import et Vérification.
 *
 * Permet à l'enseignant de :
 * 1. Uploader un fichier (CSV/XLSX/PDF) → parsing + preview
 * 2. Valider et sauvegarder la liste
 * 3. Gérer plusieurs listes
 * 4. Voir le détail d'une liste (entrées)
 */

import { useEffect, useState, useRef } from 'react'
import { Layout } from '@/components/Layout'
import { studentListApi } from '@/services/api'
import type { StudentList, StudentListEntry, ImportPreview } from '@/types'

// =============================================================
// Types locaux
// =============================================================

type ViewMode = 'list' | 'import' | 'detail'

// =============================================================
// Page principale
// =============================================================

export function StudentListsPage() {
  const [view, setView] = useState<ViewMode>('list')
  const [lists, setLists] = useState<StudentList[]>([])
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
    fetchLists()
  }

  return (
    <Layout title="Listes d'étudiants">
      {/* Message d'erreur */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-accent/10 border border-rose-accent/20 text-rose-accent text-sm animate-fade-in">
          {error}
        </div>
      )}

      {/* Bouton d'import */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted/70">
          {lists.length} liste{lists.length > 1 ? 's' : ''} enregistrée{lists.length > 1 ? 's' : ''}
        </p>
        {view === 'list' && (
          <button
            onClick={() => setView('import')}
            className="btn-primary text-sm px-5 py-2.5"
          >
            <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Importer une liste
          </button>
        )}
      </div>

      {/* Contenu selon la vue */}
      {view === 'list' && (
        loading ? <LoadingSkeleton /> : <ListsTable lists={lists} onSelect={(id) => setView('detail')} onDeleted={handleDeleted} />
      )}
      {view === 'import' && (
        <ImportWizard onDone={() => { setView('list'); fetchLists() }} onCancel={() => setView('list')} />
      )}
      {view === 'detail' && (
        <DetailView onBack={() => setView('list')} onDeleted={handleDeleted} />
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-white/70 mb-2">Aucune liste d'étudiants</h3>
        <p className="text-sm text-muted/50 max-w-md mx-auto mb-6">
          Importez un fichier CSV, Excel ou PDF contenant les noms et matricules de vos étudiants.
        </p>
        <button
          onClick={() => {} /* parent handles this via view='import' */}
          className="btn-primary text-sm px-5 py-2.5"
        >
          Importer une liste
        </button>
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
          {/* Icône type fichier */}
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0">
            <FileTypeIcon type={lst.file_type} />
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
              {lst.original_filename && ` · ${lst.original_filename}`}
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
// Import Wizard (upload → preview → confirm)
// =============================================================

type ImportStep = 'upload' | 'preview' | 'done'

function ImportWizard({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<ImportStep>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [listName, setListName] = useState('')
  const [groupe, setGroupe] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile)
    setStep('upload')
    setUploadProgress(0)
    setError('')

    const ext = selectedFile.name.split('.').pop()?.toLowerCase()
    if (!ext || !['csv', 'xlsx', 'xls', 'pdf'].includes(ext)) {
      setError(`Format non supporté : .${ext}. Formats acceptés : .csv, .xlsx, .xls, .pdf`)
      return
    }

    try {
      const res = await studentListApi.upload(selectedFile)
      setPreview(res.data)

      // Suggérer un nom basé sur le fichier
      const baseName = selectedFile.name.replace(/\.[^/.]+$/, '')
      setListName(baseName)
      setStep('preview')
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur lors de l'analyse du fichier")
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }

  const handleConfirm = async () => {
    if (!preview || !listName.trim()) return
    setError('')

    try {
      await studentListApi.confirm({
        name: listName.trim(),
        groupe: groupe.trim() || undefined,
        column_mapping: {
          student_name: preview.column_mapping.student_name || '',
          student_number: preview.column_mapping.student_number || '',
          email: preview.column_mapping.email || '',
          class_name: preview.column_mapping.class_name || '',
        },
        entries: preview.preview_rows,
        original_filename: preview.original_filename,
        file_type: preview.file_type,
      })
      setStep('done')
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur lors de la création de la liste")
    }
  }

  // Étape finale : succès
  if (step === 'done') {
    return (
      <div className="card p-10 text-center animate-scale-in">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Liste importée avec succès !</h3>
        <p className="text-sm text-muted/60 mb-6">
          Les étudiants peuvent désormais rejoindre les sessions avec leur matricule.
        </p>
        <button onClick={onDone} className="btn-primary px-6 py-2.5">
          Retour aux listes
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-4 rounded-xl bg-rose-accent/10 border border-rose-accent/20 text-rose-accent text-sm animate-fade-in">
          {error}
        </div>
      )}

      {/* Étape 1 : Upload */}
      {step === 'upload' && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="card p-10 text-center border-2 border-dashed border-white/10 hover:border-neon-cyan/30 transition-all cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />

          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/[0.04] flex items-center justify-center">
            <svg className="w-8 h-8 text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Importer une liste d'étudiants</h3>
          <p className="text-sm text-muted/60 max-w-md mx-auto mb-1">
            Glissez-déposez un fichier CSV, Excel (.xlsx) ou PDF, ou cliquez pour parcourir
          </p>
          <p className="text-xs text-muted/40">
            Formats supportés : .csv, .xlsx, .xls, .pdf (max 10 Mo)
          </p>

          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mt-5 max-w-xs mx-auto">
              <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-violet-iq transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted/50 mt-1.5">{uploadProgress}%</p>
            </div>
          )}
        </div>
      )}

      {/* Étape 2 : Preview */}
      {step === 'preview' && preview && (
        <div className="space-y-5">
          {/* Configuration */}
          <div className="card p-5 space-y-4">
            <h3 className="font-medium text-white">Configuration de la liste</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted/70 mb-1.5">Nom de la liste *</label>
                <input
                  type="text"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  className="input w-full"
                  placeholder="ex: L2 Maths 2025-26"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted/70 mb-1.5">Groupe (optionnel)</label>
                <input
                  type="text"
                  value={groupe}
                  onChange={(e) => setGroupe(e.target.value)}
                  className="input w-full"
                  placeholder="ex: Groupe A"
                />
              </div>
            </div>

            {/* Mapping détecté */}
            <div className="p-4 rounded-xl bg-white/[0.03]">
              <p className="text-xs font-medium text-muted/60 mb-2.5 uppercase tracking-wider">Colonnes détectées</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <MappingBadge label="Nom" value={preview.column_mapping.student_name} />
                <MappingBadge label="Matricule" value={preview.column_mapping.student_number} />
                <MappingBadge label="Email" value={preview.column_mapping.email} />
                <MappingBadge label="Classe" value={preview.column_mapping.class_name} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-muted/50">Confiance :</span>
                <div className="h-1.5 w-20 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400"
                    style={{ width: `${Math.round(preview.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted/50">{Math.round(preview.confidence * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Tableau de preview */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-white">
                Aperçu ({preview.total_rows} étudiant{preview.total_rows > 1 ? 's' : ''})
              </h3>
              <span className="text-xs text-muted/50">10 premières lignes</span>
            </div>

            {preview.headers.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {preview.headers.map((h, i) => (
                        <th key={i} className="text-left py-2.5 px-3 text-xs font-medium text-muted/60 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview_rows.map((row, i) => (
                      <tr key={i} className="border-b border-white/[0.03] last:border-0">
                        {preview.headers.map((h, j) => (
                          <td key={j} className="py-2 px-3 text-sm text-white/80 whitespace-nowrap">
                            {row[h] ?? '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Erreurs et avertissements */}
          {(preview.error_rows.length > 0 || preview.warnings.length > 0) && (
            <div className="card p-5 space-y-3">
              {preview.error_rows.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-rose-accent mb-2">
                    {preview.error_rows.length} ligne{preview.error_rows.length > 1 ? 's' : ''} ignorée{preview.error_rows.length > 1 ? 's' : ''}
                  </p>
                  <div className="space-y-1">
                    {preview.error_rows.map((err, i) => (
                      <p key={i} className="text-xs text-rose-accent/70">
                        Ligne {err.row} : {err.reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-400/80 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onCancel} className="btn-ghost text-sm px-5 py-2.5">
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={!listName.trim()}
              className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50"
            >
              Confirmer la liste
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================
// Détail d'une liste
// =============================================================

function DetailView({ onBack, onDeleted }: { onBack: () => void; onDeleted: () => void }) {
  // Note: in a real scenario we'd pass listId via state/params
  // For now this is a placeholder showing the pattern
  return (
    <div className="text-center py-16">
      <p className="text-muted/50">Sélectionnez une liste depuis la vue précédente.</p>
      <button onClick={onBack} className="btn-ghost text-sm mt-4 px-5 py-2.5">
        Retour
      </button>
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

function FileTypeIcon({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    csv: 'text-emerald-400',
    xlsx: 'text-blue-400',
    xls: 'text-blue-400',
    pdf: 'text-rose-400',
  }
  return (
    <span className={`text-xs font-bold uppercase ${colorMap[type] || 'text-muted/50'}`}>
      {type}
    </span>
  )
}

function MappingBadge({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={`p-2.5 rounded-lg text-center ${value ? 'bg-emerald-500/10' : 'bg-white/[0.03]'}`}>
      <p className="text-[10px] text-muted/50 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm font-medium truncate ${value ? 'text-emerald-300' : 'text-muted/40'}`}>
        {value || 'Non détecté'}
      </p>
    </div>
  )
}
