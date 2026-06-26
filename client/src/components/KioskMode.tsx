/** Mode kiosque sécurisé — Version durcie (RF-09 / CDC v2.2 §7.6).
 *
 * Protection multicouche :
 * - Plein écran verrouillé avec re-vérification périodique
 * - Blocage immédiat des pertes de focus (pas de délai exploitable)
 * - Compteur de violations → soumission forcée après 3 incidents
 * - Interception des touches : Escape, F11, PrintScreen, Alt+Tab,
 *   Alt+F4, Ctrl+W, Ctrl+N, Meta (Windows/Command)
 * - Blocage context-menu, copie, coupe, collage, sélection
 * - Détection de capture d'écran (visibility + resize)
 * - Overlay de verrouillage visuel en cas de détection
 */

import { useEffect, useRef, useCallback, useState, type ReactNode } from 'react'

interface KioskModeProps {
  children: ReactNode
  onExitAttempt: () => void
  enabled?: boolean
  maxViolations?: number
}

const MAX_VIOLATIONS_DEFAULT = 3

export function KioskMode({
  children,
  onExitAttempt,
  enabled = true,
  maxViolations = MAX_VIOLATIONS_DEFAULT,
}: KioskModeProps) {
  const isFullscreen = useRef(false)
  const exitTriggered = useRef(false)
  const violationCount = useRef(0)
  const fullscreenCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const [locked, setLocked] = useState(false)

  const triggerExit = useCallback(() => {
    if (exitTriggered.current) return
    exitTriggered.current = true
    setLocked(true)
    onExitAttempt()
  }, [onExitAttempt])

  const recordViolation = useCallback(() => {
    if (exitTriggered.current) return
    violationCount.current += 1
    if (violationCount.current >= maxViolations) {
      triggerExit()
    }
  }, [maxViolations, triggerExit])

  // ====== Plein écran ======

  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen()
      isFullscreen.current = true
    } catch {
      // Plein écran refusé — on continue en surveillance renforcée
    }
  }, [])

  const handleFullscreenChange = useCallback(() => {
    if (!enabled || exitTriggered.current) return

    if (!document.fullscreenElement) {
      // Réessayer immédiatement de reprendre le plein écran
      enterFullscreen().then(() => {
        // Si toujours pas en plein écran après tentative, c'est une violation
        if (!document.fullscreenElement) {
          recordViolation()
        }
      })
    }
  }, [enabled, enterFullscreen, recordViolation])

  // ====== Visibilité et Focus (sans délai) ======

  const handleVisibilityChange = useCallback(() => {
    if (!enabled || exitTriggered.current) return
    if (document.hidden) {
      recordViolation()
      onExitAttempt()
    }
  }, [enabled, recordViolation, onExitAttempt])

  const handleWindowBlur = useCallback(() => {
    if (!enabled || exitTriggered.current) return
    // PAS de setTimeout — vérification synchrone immédiate
    recordViolation()
    if (!document.hasFocus()) {
      onExitAttempt()
    }
  }, [enabled, recordViolation, onExitAttempt])

  // ====== Copie / Collage / Sélection ======

  const handleContextMenu = useCallback((e: MouseEvent) => {
    if (!enabled) return
    e.preventDefault()
    e.stopPropagation()
  }, [enabled])

  const handleCopyEvent = useCallback((e: ClipboardEvent) => {
    if (!enabled) return
    e.preventDefault()
    e.stopPropagation()
    recordViolation()
  }, [enabled, recordViolation])

  const handleSelectStart = useCallback((e: Event) => {
    if (!enabled) return
    e.preventDefault()
  }, [enabled])

  // ====== Clavier ======

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || exitTriggered.current) return

      const isEscape = e.key === 'Escape'
      const isF11 = e.key === 'F11'
      const isAltTab = e.altKey && e.key === 'Tab'
      const isAltF4 = e.altKey && (e.key === 'F4' || e.code === 'F4')
      const isWinKey = e.key === 'Meta' || e.key === 'OS'
      const isPrintScreen = e.key === 'PrintScreen'
      const isCtrlW = (e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')
      const isCtrlN = (e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')
      const isCtrlShiftI = e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')
      const isCtrlU = (e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')
      const isCtrlR = (e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')
      const isCtrlShiftC = e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')

      // Escape = violation grave → soumission forcée
      if (isEscape) {
        e.preventDefault()
        e.stopPropagation()
        triggerExit()
        return
      }

      // Touches dangereuses
      const dangerous = isF11 || isAltTab || isAltF4 || isWinKey || isPrintScreen
      const devTools = isCtrlShiftI || isCtrlU || isCtrlShiftC
      const closeWindow = isCtrlW || isCtrlN
      const refresh = isCtrlR

      if (dangerous || devTools || closeWindow || refresh) {
        e.preventDefault()
        e.stopPropagation()
        recordViolation()
      }
    },
    [enabled, recordViolation, triggerExit]
  )

  // ====== Redimensionnement suspect ======

  const handleResize = useCallback(() => {
    if (!enabled || exitTriggered.current) return
    // Si la fenêtre rétrécit significativement, c'est suspect
    if (window.innerWidth < screen.width * 0.8 || window.innerHeight < screen.height * 0.8) {
      recordViolation()
    }
  }, [enabled, recordViolation])

  // ====== Effet principal ======

  useEffect(() => {
    if (!enabled) return

    // Plein écran au montage
    enterFullscreen()

    // Vérification périodique du plein écran (toutes les 5s)
    fullscreenCheckInterval.current = setInterval(() => {
      if (exitTriggered.current) {
        if (fullscreenCheckInterval.current) {
          clearInterval(fullscreenCheckInterval.current)
        }
        return
      }
      if (!document.fullscreenElement) {
        enterFullscreen().then(() => {
          if (!document.fullscreenElement && !exitTriggered.current) {
            recordViolation()
          }
        })
      }
    }, 5000)

    // Événements de sortie
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)

    // Copie & sélection
    document.addEventListener('copy', handleCopyEvent)
    document.addEventListener('cut', handleCopyEvent)
    document.addEventListener('paste', handleCopyEvent)
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('selectstart', handleSelectStart)

    // Clavier
    document.addEventListener('keydown', handleKeyDown, true) // capture phase

    // Redimensionnement
    window.addEventListener('resize', handleResize)

    // CSS anti-sélection globale
    const style = document.createElement('style')
    style.id = 'kiosk-anti-select'
    style.textContent = `
      * { user-select: none !important; -webkit-user-select: none !important; }
      input, textarea, [contenteditable] { user-select: text !important; -webkit-user-select: text !important; }
    `
    document.head.appendChild(style)

    return () => {
      if (fullscreenCheckInterval.current) {
        clearInterval(fullscreenCheckInterval.current)
      }

      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)

      document.removeEventListener('copy', handleCopyEvent)
      document.removeEventListener('cut', handleCopyEvent)
      document.removeEventListener('paste', handleCopyEvent)
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('selectstart', handleSelectStart)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('resize', handleResize)

      const s = document.getElementById('kiosk-anti-select')
      if (s) s.remove()

      // Quitter le plein écran
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [
    enabled,
    handleFullscreenChange,
    handleVisibilityChange,
    handleWindowBlur,
    handleCopyEvent,
    handleContextMenu,
    handleSelectStart,
    handleKeyDown,
    handleResize,
    enterFullscreen,
    recordViolation,
  ])

  // ====== Overlay de verrouillage ======
  if (locked) {
    return (
      <div className="fixed inset-0 z-[9999] bg-deep-space flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <div className="w-20 h-20 mx-auto rounded-full bg-rose-accent/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-rose-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-2xl font-heading font-semibold text-white">
            Session verrouillée
          </h2>
          <p className="text-muted/70 max-w-md mx-auto">
            Une tentative de sortie non autorisée a été détectée.
            Votre copie a été soumise automatiquement.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
