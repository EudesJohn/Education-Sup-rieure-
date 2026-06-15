/** Admin — Gestion des filières. */

import { useState, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { adminApi } from '@/services/api'
import type { Filiere, Institution } from '@/types'

export function AdminFilieres() {
  const [items, setItems] = useState<Filiere[]>([])
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Filiere | null>(null)
  const [formName, setFormName] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formInstitution, setFormInstitution] = useState<number | ''>('')
  const [filterInst, setFilterInst] = useState<number | ''>('')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [instRes, filRes] = await Promise.all([
        adminApi.listInstitutions(),
        adminApi.listFilieres(),
      ])
      setInstitutions(instRes.data)
      setItems(filRes.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally { setLoading(false) }
  }

  const filteredItems = filterInst
    ? items.filter((f) => f.institution_id === filterInst)
    : items

  const handleSave = async () => {
    try {
      if (editing) {
        await adminApi.updateFiliere(editing.id, { name: formName, code: formCode })
      } else {
        await adminApi.createFiliere({ name: formName, code: formCode, institution_id: formInstitution as number })
      }
      setShowForm(false); setEditing(null); setFormName(''); setFormCode('')
      await fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la sauvegarde')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette filière ? Les classes liées seront aussi supprimées.')) return
    try {
      await adminApi.deleteFiliere(id)
      await fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  return (
    <Layout title="Filières">
      <div className="space-y-5">
        {error && (
          <div className="bg-rose-accent/10 border border-rose-accent/20 text-rose-accent px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <p className="text-muted/60 text-sm">{filteredItems.length} filière(s)</p>
            <select
              value={filterInst}
              onChange={(e) => setFilterInst(e.target.value ? Number(e.target.value) : '')}
              className="input text-sm py-1.5 w-auto"
            >
              <option value="">Tous les établissements</option>
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          </div>
          <button onClick={() => { setEditing(null); setFormName(''); setFormCode(''); setFormInstitution(''); setShowForm(true) }}
            className="btn btn-primary btn-sm">
            + Ajouter
          </button>
        </div>

        {showForm && (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
            <select value={editing ? editing.institution_id : formInstitution}
              onChange={(e) => setFormInstitution(Number(e.target.value))}
              className="input" disabled={!!editing} required>
              <option value="">Sélectionner un établissement</option>
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
              placeholder="Nom de la filière" className="input" autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
            <input type="text" value={formCode} onChange={(e) => setFormCode(e.target.value)}
              placeholder="Code (optionnel, ex: INFO-MATH)" className="input" />
            <div className="flex gap-2">
              <button onClick={handleSave} className="btn btn-primary btn-sm" disabled={!formName.trim() || (!editing && !formInstitution)}>
                {editing ? 'Modifier' : 'Créer'}
              </button>
              <button onClick={() => { setShowForm(false); setEditing(null) }} className="btn btn-ghost btn-sm">Annuler</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted/50">Chargement...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-muted/50">
            <p className="text-lg mb-2">Aucune filière</p>
            <p className="text-sm">Créez d'abord un établissement, puis ajoutez des filières.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredItems.map((item) => {
              const inst = institutions.find((i) => i.id === item.institution_id)
              return (
                <div key={item.id} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/[0.06] transition-colors">
                  <div>
                    <p className="text-white font-medium">{item.name} {item.code && <span className="text-muted/40 text-xs">({item.code})</span>}</p>
                    <p className="text-muted/40 text-xs mt-0.5">{inst?.name || 'Établissement inconnu'} · {new Date(item.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditing(item); setFormName(item.name); setFormCode(item.code || ''); setFormInstitution(item.institution_id); setShowForm(true) }}
                      className="btn btn-ghost btn-xs">Modifier</button>
                    <button onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-xs text-rose-accent">Supprimer</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
