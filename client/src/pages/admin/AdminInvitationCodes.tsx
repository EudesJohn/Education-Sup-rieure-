/** Admin — Gestion des codes d'invitation enseignants.
 *  Permet de generer, lister et revoquer les codes. */

import { useState, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { AdminListSkeleton } from '@/components/Skeleton'
import { api } from '@/services/api'

interface InvitationCode {
  id: number
  code: string
  created_by: number
  is_active: boolean
  used_by: number | null
  used_at: string | null
  expires_at: string | null
  created_at: string
  notes: string
  created_by_teacher?: { full_name: string; email: string }
  used_by_teacher?: { full_name: string; email: string }
}

interface Stats {
  total: number
  used: number
  active: number
}

export function AdminInvitationCodes() {
  const [codes, setCodes] = useState<InvitationCode[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false)
  const [genCount, setGenCount] = useState(5)
  const [genNotes, setGenNotes] = useState('')
  const [genExpiry, setGenExpiry] = useState(90)
  const [generating, setGenerating] = useState(false)
  const [generatedCodes, setGeneratedCodes] = useState<InvitationCode[]>([])

  // Revoke confirm
  const [revokeTarget, setRevokeTarget] = useState<{ id: number; code: string } | null>(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const [codesRes, statsRes] = await Promise.all([
        api.get('/admin/invitation-codes', { params: { limit: 100, include_used: true } }),
        api.get('/admin/invitation-codes/stats'),
      ])
      setCodes(Array.isArray(codesRes.data) ? codesRes.data : [])
      setStats(statsRes.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await api.post('/admin/invitation-codes', {
        count: genCount,
        notes: genNotes,
        expires_in_days: genExpiry || null,
      })
      setGeneratedCodes(res.data.codes || [])
      setSuccessMsg(`${res.data.count} code(s) genere(s) avec succes`)
      setShowGenerate(false)
      await fetchData()
      setTimeout(() => setSuccessMsg(''), 5000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de generation')
    } finally {
      setGenerating(false)
    }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    try {
      setError('')
      await api.post(`/admin/invitation-codes/${revokeTarget.id}/revoke`)
      setSuccessMsg(`Code ${revokeTarget.code} revoque`)
      setRevokeTarget(null)
      await fetchData()
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur lors de la revocation')
      setRevokeTarget(null)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setSuccessMsg(`Code ${text} copie dans le presse-papier`)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  const copyAllToClipboard = () => {
    const allCodes = codes.filter(c => c.is_active && !c.used_by).map(c => c.code).join('\n')
    if (allCodes) {
      navigator.clipboard.writeText(allCodes)
      setSuccessMsg('Tous les codes actifs copies dans le presse-papier')
      setTimeout(() => setSuccessMsg(''), 3000)
    }
  }

  const isExpired = (code: InvitationCode) => {
    if (!code.expires_at) return false
    const expires = new Date(code.expires_at)
    return expires < new Date()
  }

  return (
    <Layout title="Codes d'invitation enseignants">
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

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-4 text-center">
              <p className="text-2xl font-heading font-semibold text-neon-cyan">{stats.active}</p>
              <p className="text-xs text-text-secondary mt-1">Codes disponibles</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-heading font-semibold text-amber-iq">{stats.used}</p>
              <p className="text-xs text-text-secondary mt-1">Codes utilises</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-heading font-semibold text-white-clair">{stats.total}</p>
              <p className="text-xs text-text-secondary mt-1">Total</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => { setShowGenerate(true); setGeneratedCodes([]) }}
            className="btn btn-primary btn-ripple"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Generer des codes
          </button>
          {codes.filter(c => c.is_active && !c.used_by).length > 0 && (
            <button
              onClick={copyAllToClipboard}
              className="btn btn-ghost"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              Copier tous les codes
            </button>
          )}
        </div>

        {/* Generated codes display */}
        {generatedCodes.length > 0 && (
          <div className="card p-5 border border-emerald-500/20 bg-emerald-900/10">
            <h3 className="font-heading font-semibold text-emerald-400 mb-3">
              Codes generes
            </h3>
            <div className="space-y-2">
              {generatedCodes.map((c) => (
                <div key={c.code}
                  className="flex items-center justify-between bg-deep-space/50 rounded-lg px-4 py-2.5 font-mono"
                >
                  <span className="text-white tracking-widest text-sm">{c.code}</span>
                  <button
                    onClick={() => copyToClipboard(c.code)}
                    className="text-xs text-neon-cyan hover:text-neon-cyan-dim transition-colors"
                  >
                    Copier
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tableau des codes */}
        {loading ? (
          <AdminListSkeleton rows={6} />
        ) : codes.length === 0 ? (
          <div className="text-center py-12 text-muted">
            Aucun code d'invitation genere pour le moment
          </div>
        ) : (
          <div className="card-plain overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-marge/50 text-xs text-text-secondary uppercase tracking-wider">
                    <th className="text-left px-5 py-3 font-medium">Code</th>
                    <th className="text-left px-5 py-3 font-medium">Notes</th>
                    <th className="text-center px-5 py-3 font-medium">Statut</th>
                    <th className="text-left px-5 py-3 font-medium">Cree par</th>
                    <th className="text-left px-5 py-3 font-medium">Utilise par</th>
                    <th className="text-left px-5 py-3 font-medium">Expire</th>
                    <th className="text-center px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-marge/30">
                  {codes.map((c) => {
                    const expired = isExpired(c)
                    const used = !!c.used_by
                    const active = c.is_active && !used && !expired
                    return (
                      <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => copyToClipboard(c.code)}
                            className="font-mono tracking-widest text-white font-medium hover:text-neon-cyan transition-colors"
                            title="Copier le code"
                          >
                            {c.code}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-text-secondary text-xs">
                          {c.notes || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {used ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                              bg-amber-900/20 text-amber-400 border border-amber-500/20">
                              Utilise
                            </span>
                          ) : expired ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                              bg-rose-900/20 text-rose-400 border border-rose-500/20">
                              Expire
                            </span>
                          ) : !c.is_active ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                              bg-muted/10 text-muted border border-white/10">
                              Revogue
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                              bg-emerald-900/20 text-emerald-400 border border-emerald-500/20">
                              Actif
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-text-secondary text-xs">
                          {c.created_by_teacher
                            ? `${c.created_by_teacher.full_name}`
                            : `#${c.created_by}`}
                        </td>
                        <td className="px-5 py-3.5 text-text-secondary text-xs">
                          {c.used_by_teacher
                            ? `${c.used_by_teacher.full_name} (${c.used_by_teacher.email})`
                            : used ? `#${c.used_by}` : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-text-secondary text-xs">
                          {c.expires_at
                            ? new Date(c.expires_at).toLocaleDateString('fr-FR')
                            : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {active ? (
                            <button
                              onClick={() => setRevokeTarget({ id: c.id, code: c.code })}
                              className="px-3 py-1.5 rounded-md text-xs font-medium
                                bg-rose-900/20 text-rose-400 hover:bg-rose-900/40
                                border border-rose-500/20 transition-all"
                            >
                              Revoquer
                            </button>
                          ) : (
                            <span className="text-muted text-xs">—</span>
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

        {/* Modal generer */}
        {showGenerate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowGenerate(false)}>
            <div className="card p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-heading text-lg font-semibold text-white mb-4">
                Generer des codes d'invitation
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Nombre de codes</label>
                  <input
                    type="number"
                    value={genCount}
                    onChange={(e) => setGenCount(Math.max(1, Math.min(100, Number(e.target.value))))}
                    className="input"
                    min={1}
                    max={100}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Notes (optionnel)
                  </label>
                  <input
                    type="text"
                    value={genNotes}
                    onChange={(e) => setGenNotes(e.target.value)}
                    className="input"
                    placeholder="Ex: Session 2025-2026, Departement Maths"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Expiration (jours)
                  </label>
                  <input
                    type="number"
                    value={genExpiry}
                    onChange={(e) => setGenExpiry(Number(e.target.value) || 0)}
                    className="input"
                    min={1}
                    max={365}
                  />
                  <p className="text-[11px] text-text-secondary mt-1">
                    Laissez 0 pour aucune expiration
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowGenerate(false)}
                    className="btn btn-ghost flex-1"
                    disabled={generating}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleGenerate}
                    className="btn btn-primary flex-1 btn-ripple"
                    disabled={generating}
                  >
                    {generating ? 'Generation...' : 'Generer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal revocation */}
        {revokeTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setRevokeTarget(null)}>
            <div className="card p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-heading text-lg font-semibold text-white mb-2">Revoquer le code</h3>
              <p className="text-sm text-text-secondary mb-1">
                Voulez-vous vraiment revoquer le code ?
              </p>
              <p className="font-mono tracking-widest text-white text-center py-3 text-lg bg-deep-space/50 rounded-lg mb-4">
                {revokeTarget.code}
              </p>
              <p className="text-xs text-rose-accent mb-4">
                Ce code ne pourra plus etre utilise pour l'inscription.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setRevokeTarget(null)}
                  className="btn btn-ghost flex-1"
                >
                  Annuler
                </button>
                <button
                  onClick={handleRevoke}
                  className="btn bg-rose-accent hover:bg-rose-accent/80 text-white flex-1 btn-ripple"
                >
                  Revoquer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
