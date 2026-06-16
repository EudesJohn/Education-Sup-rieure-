/** ConfirmModal — Dialogue de confirmation stylisé PEAN.
 *  Remplace les `confirm()` natifs. */

import { ReactNode } from 'react'

interface ConfirmModalProps {
  open: boolean
  title?: string
  message: string | ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title = 'Confirmer',
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null

  const iconMap = {
    danger: {
      bg: 'bg-rose-accent/10',
      border: 'border-rose-accent/20',
      icon: 'text-rose-accent',
      btn: 'btn-danger',
    },
    warning: {
      bg: 'bg-amber-iq/10',
      border: 'border-amber-iq/20',
      icon: 'text-amber-iq',
      btn: 'btn-amber',
    },
    default: {
      bg: 'bg-neon-cyan/10',
      border: 'border-neon-cyan/20',
      icon: 'text-neon-cyan',
      btn: 'btn-primary',
    },
  }

  const v = iconMap[variant]

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="w-full max-w-md glass-card p-6 rounded-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icône */}
        <div className={`w-12 h-12 mx-auto mb-4 rounded-full ${v.bg} flex items-center justify-center border ${v.border}`}>
          <svg className={`w-6 h-6 ${v.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {variant === 'danger' ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            )}
          </svg>
        </div>

        {/* Titre */}
        <h3 id="confirm-modal-title" className="text-lg font-heading font-semibold text-white text-center mb-2">
          {title}
        </h3>

        {/* Message */}
        <div className="text-sm text-muted/70 text-center mb-5">
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="btn-ghost flex-1 text-sm py-2.5 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`${v.btn} flex-1 text-sm py-2.5 disabled:opacity-50`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {confirmLabel}...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
