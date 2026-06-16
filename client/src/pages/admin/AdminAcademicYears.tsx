/** Admin — Gestion des années académiques. */

import { useState, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { ConfirmModal } from '@/components/ConfirmModal'
import { AdminListSkeleton } from '@/components/Skeleton'
import { adminApi } from '@/services/api'
import type { AcademicYear } from '@/types'

export function AdminAcademicYears() {
  const [items, setItems] = useState<AcademicYear[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AcademicYear | null>(null)
  const [formName, setFormName] = useState('')
  const [formCurrent, setFormCurrent] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AcademicYear | null>(null)

  useEffect(() => { fetchItems() }, [])

  const fetchItems = async () => {
    try {
      setLoading(true)
      const res = await adminApi.listAcademicYears()
      setItems(res.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally { setLoading(false) }
  }

  const handleSave = async () => {
    try {
      if (editing) {
        await adminApi.updateAcademicYear(editing.id, { name: formName, is_current: formCurrent })
      } else {
        await adminApi.createAcademicYear({ name: formName, is_current: formCurrent })
      }
      setShowForm(false); setEditing(null); setFormName(''); setFormCurrent(false)
      await fetchItems()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la sauvegarde')
    }
  }

  const handleDelete = async (id: number) => {
    setDeleteTarget(null)
    try {
      await adminApi.deleteAcademicYear(id)
      await fetchItems()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  return (
    <Layout title="Années académiques">
      <div className="space-y-5">
        {error && (
          <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-3 rounded-lg text-sm">{error}</div>
        )}
        <div className="flex justify-between items-center">
          <p className="text-muted/60 text-sm">{items.length} année(s)</p>
          <button onClick={() => { setEditing(null); setFormName(''); setFormCurrent(false); setShowForm(true) }}
            className="btn btn-primary btn-sm">
            + Ajouter
          </button>
        </div>
        {showForm && (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
              placeholder="Ex: 2024-2025" className="input" autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
            <label className="flex items-center gap-2 text-sm text-muted/80">
              <input type="checkbox" checked={formCurrent} onChange={(e) => setFormCurrent(e.target.checked)}
                className="rounded border-white/20 bg-white/5" />
              Année en cours
            </label>
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
            <p className="text-lg mb-2">Aucune année académique</p>
            <p className="text-sm">Créez la première année (ex: 2024-2025).</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <div key={item.id} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/[0.06] transition-colors">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-white font-medium">{item.name}</p>
                    <p className="text-muted/40 text-xs mt-0.5">
                      {item.start_date && `Du ${item.start_date}`}{item.end_date && ` au ${item.end_date}`}
                    </p>
                  </div>
                  {item.is_current && (
                    <span className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      En cours
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(item); setFormName(item.name); setFormCurrent(item.is_current); setShowForm(true) }}
                    className="btn btn-ghost btn-xs">Modifier</button>
                  <button onClick={() => setDeleteTarget(item)} className="btn btn-ghost btn-xs text-rose-accent">Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ConfirmModal
          open={deleteTarget !== null}
          title="Supprimer l'année académique"
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
