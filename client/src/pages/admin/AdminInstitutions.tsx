/** Admin — Gestion des établissements. */

import { useState, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { adminApi } from '@/services/api'
import type { Institution } from '@/types'

export function AdminInstitutions() {
  const [items, setItems] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Institution | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')

  useEffect(() => { fetchItems() }, [])

  const fetchItems = async () => {
    try {
      setLoading(true)
      const res = await adminApi.listInstitutions()
      setItems(res.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      if (editing) {
        await adminApi.updateInstitution(editing.id, { name: formName })
      } else {
        await adminApi.createInstitution({ name: formName })
      }
      setShowForm(false)
      setEditing(null)
      setFormName('')
      await fetchItems()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la sauvegarde')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cet établissement ?')) return
    try {
      await adminApi.deleteInstitution(id)
      await fetchItems()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  const openEdit = (item: Institution) => {
    setEditing(item)
    setFormName(item.name)
    setShowForm(true)
  }

  const openCreate = () => {
    setEditing(null)
    setFormName('')
    setShowForm(true)
  }

  return (
    <Layout title="Établissements">
      <div className="space-y-5">
        {error && (
          <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <div className="flex justify-between items-center">
          <p className="text-muted/60 text-sm">{items.length} établissement(s)</p>
          <button onClick={openCreate} className="btn btn-primary btn-sm">
            + Ajouter
          </button>
        </div>

        {showForm && (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Nom de l'établissement"
              className="input"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <div className="flex gap-2">
              <button onClick={handleSave} className="btn btn-primary btn-sm" disabled={!formName.trim()}>
                {editing ? 'Modifier' : 'Créer'}
              </button>
              <button onClick={() => { setShowForm(false); setEditing(null) }} className="btn btn-ghost btn-sm">
                Annuler
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted/50">Chargement...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted/50">
            <p className="text-lg mb-2">Aucun établissement</p>
            <p className="text-sm">Créez le premier établissement pour commencer.</p>
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
                  <button onClick={() => openEdit(item)} className="btn btn-ghost btn-xs">Modifier</button>
                  <button onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-xs text-rose-accent">Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
