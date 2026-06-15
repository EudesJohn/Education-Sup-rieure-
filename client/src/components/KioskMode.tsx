/** Mode kiosque sécurisé pour la composition étudiante.

Détecte les tentatives de sortie du plein écran et déclenche
la soumission forcée de la copie.
*/

import { useEffect, useRef, useCallback, type ReactNode } from 'react'

interface KioskModeProps {
  children: ReactNode
  onExitAttempt: () => void
  enabled?: boolean
}

const EXIT_EVENTS = [
  'visibilitychange',
  'blur',
  'focusout',
  'copy',
  'cut',
  'contextmenu',
]

const SUSPICIOUS_KEY_COMBOS: Record<string, boolean> = {
  // Alt+Tab, Alt+Esc — déjà capturés par fullscreen API mais on renforce
}

export function KioskMode({ children, onExitAttempt, enabled = true }: KioskModeProps) {
  const isFullscreen = useRef(false)
  const exitTriggered = useRef(false)

  const triggerExit = useCallback(() => {
    if (exitTriggered.current) return
    exitTriggered.current = true
    onExitAttempt()
  }, [onExitAttempt])

  const handleFullscreenChange = useCallback(() => {
    if (!enabled || exitTriggered.current) return

    const inFullscreen = Boolean(document.fullscreenElement)
    isFullscreen.current = inFullscreen

    if (!inFullscreen && isFullscreen.current !== null) {
      triggerExit()
    }
  }, [enabled, triggerExit])

  const handleVisibilityChange = useCallback(() => {
    if (!enabled || exitTriggered.current) return
    if (document.hidden) {
      triggerExit()
    }
  }, [enabled, triggerExit])

  const handleWindowBlur = useCallback(() => {
    if (!enabled || exitTriggered.current) return
    // Petit délai pour éviter les faux positifs (ex: Alt+Tab)
    setTimeout(() => {
      if (!document.hasFocus() && !exitTriggered.current) {
        triggerExit()
      }
    }, 100)
  }, [enabled, triggerExit])

  const handleContextMenu = useCallback((e: MouseEvent) => {
    if (!enabled) return
    e.preventDefault()
  }, [enabled])

  const handleCopy = useCallback((e: ClipboardEvent) => {
    if (!enabled) return
    e.preventDefault()
  }, [enabled])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || exitTriggered.current) return

      // Intercepter les touches dangereuses
      const isEscape = e.key === 'Escape'
      const isF11 = e.key === 'F11'
      const isAltTab = e.altKey && e.key === 'Tab'
      const isWinKey = e.key === 'Meta' || e.key === 'OS'
      const isPrintScreen = e.key === 'PrintScreen'

      if (isEscape) {
        e.preventDefault()
        triggerExit()
      }

      if (isF11 || isAltTab || isWinKey || isPrintScreen) {
        e.preventDefault()
      }
    },
    [enabled, triggerExit]
  )

  useEffect(() => {
    if (!enabled) return

    // Passer en plein écran
    const enterFullscreen = async () => {
      try {
        await document.documentElement.requestFullscreen()
        isFullscreen.current = true
      } catch {
        // Le plein écran peut être bloqué par le navigateur
        // Dans ce cas, on continue en mode "surveillance renforcée"
      }
    }
    enterFullscreen()

    // Écouteurs d'événements
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('copy', handleCopy)
    document.addEventListener('cut', handleCopy)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('cut', handleCopy)
      document.removeEventListener('keydown', handleKeyDown)

      // Quitter le plein écran
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [enabled, handleFullscreenChange, handleVisibilityChange, handleWindowBlur, handleContextMenu, handleCopy, handleKeyDown])

  return <>{children}</>
}
