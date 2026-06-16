/** Admin — Gestion des niveaux d'étude. */

import { useState, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { ConfirmModal } from '@/components/ConfirmModal'
import { AdminListSkeleton } from '@/components/Skeleton'
import { adminApi } from '@/services/api'
import type { StudyLevel } from '@/types'

export function AdminStudyLevels() {
  const [items, setItems] = useState<StudyLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<StudyLevel | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<StudyLevel | null>(null)

  useEffect(() => { fetchItems() }, [])

  const fetchItems = async () => {
    try {
      setLoading(true)
      const res = await adminApi.listStudyLevels()
      setItems(res.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally { setLoading(false) }
  }

  const handleSave = async () => {
    try {
      if (editing) {
        await adminApi.updateStudyLevel(editing.id, { name: formName })
      } else {
        await adminApi.createStudyLevel({ name: formName })
      }
      setShowForm(false); setEditing(null); setFormName('')
      await fetchItems()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la sauvegarde')
    }
  }

  const handleDelete = async (id: number) => {
    setDeleteTarget(null)
    try {
      await adminApi.deleteStudyLevel(id)
      await fetchItems()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  return (
    <Layout title="Niveaux d'étude">
      <div className="space-y-5">
        {error && (
          <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-3 rounded-lg text-sm">{error}</div>
        )}
        <div className="flex justify-between items-center">
          <p className="text-muted/60 text-sm">{items.length} niveau(x)</p>
          <button onClick={() => { setEditing(null); setFormName(''); setShowForm(true) }} className="btn btn-primary btn-sm">
            + Ajouter
          </button>
        </div>
        {showForm && (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
              placeholder="Ex: Licence 1, Master 2..." className="input" autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
            <div className="flex gap-2">
              <button onClick={handleSave} className="btn btn-primary btn-sm" disabled={!formName.trim()}>
                {editing ? 'Modifier' : 'Créer'}
              </button>
              <button onClick={() => { setShowForm(false); setEditing(null) }} className="btn btn-ghost btn-sm">Annuler</button>
            </div>
          </div>
        )}
        {loading ? (
          <AdminListSkeleton rows={3} />
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted/50">
            <p className="text-lg mb-2">Aucun niveau d'étude</p>
            <p className="text-sm">Créez le premier niveau (ex: Licence 1, Master 1...).</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <div key={item.id} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/[0.06] transition-colors">
                <div>
                  <p className="text-white font-medium">{item.name}</p>
                  <p className="text-muted/40 text-xs mt-0.5">Créé le {new Date(item.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(item); setFormName(item.name); setShowForm(true) }} className="btn btn-ghost btn-xs">Modifier</button>
                  <button onClick={() => setDeleteTarget(item)} className="btn btn-ghost btn-xs text-rose-accent">Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ConfirmModal
          open={deleteTarget !== null}
          title="Supprimer le niveau d'étude"
          message={`Êtes-vous sûr de vouloir supprimer "${deleteTarget?.name}" ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          variant="danger"
          onConfirm={() => handleDelete(deleteTarget!.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </Layout>
  )
}
