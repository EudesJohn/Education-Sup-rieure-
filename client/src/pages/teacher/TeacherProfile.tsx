import { useState, useRef, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import QRCode from 'qrcode'

export function TeacherProfile() {
  const { teacher, updateTeacher } = useAuthStore()

  // === Changement de mot de passe ===
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  // === 2FA Setup ===
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [twofaMsg, setTwofaMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [twofaLoading, setTwofaLoading] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  // === 2FA Disable ===
  const [disableCode, setDisableCode] = useState('')
  const [disableMsg, setDisableMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [disableLoading, setDisableLoading] = useState(false)

  const is2FAEnabled = teacher?.is_2fa_enabled

  // --- Password ---
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordMsg(null)
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: 'Les nouveaux mots de passe ne correspondent pas.' })
      return
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ ok: false, text: 'Le mot de passe doit faire au moins 8 caractères.' })
      return
    }
    setPasswordLoading(true)
    try {
      const res = await authApi.changePassword(currentPassword, newPassword)
      setPasswordMsg({ ok: true, text: res.data.message || 'Mot de passe modifié avec succès.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setPasswordMsg({ ok: false, text: err.response?.data?.detail || 'Erreur lors du changement de mot de passe.' })
    } finally {
      setPasswordLoading(false)
    }
  }

  // --- QR code rendering ---
  useEffect(() => {
    if (provisioningUri && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, provisioningUri, {
        width: 200,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      })
    }
  }, [provisioningUri])

  // --- 2FA Setup ---
  const handleSetup2FA = async () => {
    setTwofaMsg(null)
    setTwofaLoading(true)
    try {
      const res = await authApi.setup2FA()
      setProvisioningUri(res.data.provisioning_uri)
      setSecret(res.data.secret)
      setVerifyCode('')
    } catch (err: any) {
      setTwofaMsg({ ok: false, text: err.response?.data?.detail || 'Erreur lors de la configuration 2FA.' })
    } finally {
      setTwofaLoading(false)
    }
  }

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    setTwofaMsg(null)
    if (verifyCode.length !== 6) {
      setTwofaMsg({ ok: false, text: 'Le code doit faire 6 chiffres.' })
      return
    }
    setTwofaLoading(true)
    try {
      const res = await authApi.verify2FA(verifyCode)
      setTwofaMsg({ ok: true, text: res.data.message || '2FA activée avec succès.' })
      setProvisioningUri(null)
      setSecret(null)
      setVerifyCode('')
      // Mettre à jour le store local
      updateTeacher({ is_2fa_enabled: true })
    } catch (err: any) {
      setTwofaMsg({ ok: false, text: err.response?.data?.detail || 'Code invalide. Réessayez.' })
    } finally {
      setTwofaLoading(false)
    }
  }

  // --- 2FA Disable ---
  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    setDisableMsg(null)
    if (disableCode.length !== 6) {
      setDisableMsg({ ok: false, text: 'Le code doit faire 6 chiffres.' })
      return
    }
    setDisableLoading(true)
    try {
      const res = await authApi.disable2FA(disableCode)
      setDisableMsg({ ok: true, text: res.data.message || '2FA désactivée.' })
      setDisableCode('')
      updateTeacher({ is_2fa_enabled: false })
      setProvisioningUri(null)
      setSecret(null)
    } catch (err: any) {
      setDisableMsg({ ok: false, text: err.response?.data?.detail || 'Code invalide. Réessayez.' })
    } finally {
      setDisableLoading(false)
    }
  }

  return (
    <Layout title="Sécurité">
      <div className="max-w-2xl space-y-8">
        {/* ---- Sécurité du compte ---- */}
        <div className="glass-card p-6 space-y-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-violet-iq/20 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-violet-iq" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div>
              <h2 className="font-heading text-lg font-semibold text-white">Sécurité du compte</h2>
              <p className="text-sm text-text-secondary">{teacher?.email}</p>
            </div>
          </div>

          {/* Statut 2FA */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${is2FAEnabled ? 'bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-muted/40'}`} />
              <span className="text-sm text-white/80">
                Authentification à deux facteurs (2FA)
              </span>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              is2FAEnabled
                ? 'bg-success-light text-success'
                : 'bg-white/[0.05] text-muted'
            }`}>
              {is2FAEnabled ? 'Activée' : 'Désactivée'}
            </span>
          </div>

          {/* Dernière connexion — info depuis le store */}
          <p className="text-xs text-muted/60">
            Compte créé le {teacher?.created_at ? new Date(teacher.created_at).toLocaleDateString('fr-FR') : '—'}
          </p>
        </div>

        {/* ---- Changer le mot de passe ---- */}
        <div className="glass-card p-6">
          <h3 className="font-heading text-base font-semibold text-white mb-4">Changer le mot de passe</h3>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Mot de passe actuel</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input"
                required
                minLength={8}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Nouveau mot de passe</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Confirmer</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  required
                  minLength={8}
                />
              </div>
            </div>
            {passwordMsg && (
              <p className={`text-sm ${passwordMsg.ok ? 'text-success' : 'text-rose-accent'}`}>
                {passwordMsg.text}
              </p>
            )}
            <button type="submit" disabled={passwordLoading} className="btn btn-primary">
              {passwordLoading ? 'Modification...' : 'Changer le mot de passe'}
            </button>
          </form>
        </div>

        {/* ---- 2FA ---- */}
        <div className="glass-card p-6">
          <h3 className="font-heading text-base font-semibold text-white mb-4">
            Authentification à deux facteurs
          </h3>

          {!is2FAEnabled && !provisioningUri && (
            <div>
              <p className="text-sm text-text-secondary mb-4">
                Ajoutez une couche de sécurité supplémentaire à votre compte.
                Après activation, vous devrez saisir un code à 6 chiffres
                depuis votre application d'authentification (Google Authenticator, Authy…).
              </p>
              <button onClick={handleSetup2FA} disabled={twofaLoading} className="btn btn-primary">
                {twofaLoading ? 'Préparation...' : 'Activer la 2FA'}
              </button>
            </div>
          )}

          {provisioningUri && !is2FAEnabled && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                1. Scannez ce QR code avec <strong className="text-white">Google Authenticator</strong> ou <strong className="text-white">Authy</strong>.
              </p>

              {/* QR Code généré côté client */}
              <div className="inline-block p-3 bg-white rounded-xl">
                <canvas ref={qrCanvasRef} width={200} height={200} />
              </div>

              {secret && (
                <p className="text-xs text-muted/60">
                  Ou saisissez manuellement la clé : <code className="text-neon-cyan text-[11px]">{secret}</code>
                </p>
              )}

              <form onSubmit={handleVerify2FA} className="space-y-3">
                <p className="text-sm text-text-secondary">
                  2. Saisissez le code à 6 chiffres généré par l'application :
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="input !w-32 text-center text-lg font-mono tracking-widest"
                    required
                  />
                  <button type="submit" disabled={twofaLoading || verifyCode.length !== 6} className="btn btn-primary">
                    {twofaLoading ? 'Vérification...' : 'Confirmer'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setProvisioningUri(null); setSecret(null); setTwofaMsg(null) }}
                  className="text-xs text-muted/50 hover:text-muted transition-colors"
                >
                  ← Recommencer
                </button>
              </form>

              {twofaMsg && (
                <p className={`text-sm ${twofaMsg.ok ? 'text-success' : 'text-rose-accent'}`}>
                  {twofaMsg.text}
                </p>
              )}
            </div>
          )}

          {is2FAEnabled && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-success">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                La double authentification est active
              </div>

              <form onSubmit={handleDisable2FA} className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Pour désactiver la 2FA, saisissez un code valide depuis votre application :
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="input !w-32 text-center text-lg font-mono tracking-widest"
                    required
                  />
                  <button type="submit" disabled={disableLoading || disableCode.length !== 6} className="btn btn-danger">
                    {disableLoading ? 'Désactivation...' : 'Désactiver la 2FA'}
                  </button>
                </div>
              </form>

              {disableMsg && (
                <p className={`text-sm ${disableMsg.ok ? 'text-success' : 'text-rose-accent'}`}>
                  {disableMsg.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
