/**
 * Adaptateur Electron — Connecte le kiosque desktop à l'interface React.
 *
 * Ce composant encapsule l'examen étudiant avec la couche de sécurité
 * Electron (blocage OS, barre des tâches, raccourcis système).
 *
 * Utilisation dans StudentExam.tsx :
 *   import { useElectronKiosk } from '@/components/ElectronKioskAdapter';
 *
 *   const { isKiosk, focusLostCount, lockKiosk } = useElectronKiosk();
 */

import { useEffect, useState, useCallback } from 'react';

declare global {
  interface Window {
    peanKiosk?: {
      getConfig: () => Promise<{
        fullscreen: boolean;
        serverUrl: string;
        sessionCode: string;
      }>;
      setSession: (code: string) => Promise<{ success: boolean }>;
      lock: () => Promise<{ success: boolean }>;
      exit: () => Promise<{ success: boolean; canExit: boolean }>;
      getFocusStats: () => Promise<{ focusLostCount: number }>;
      onSecurityAlert: (
        callback: (data: {
          type: string;
          count: number;
          timestamp: string;
        }) => void
      ) => () => void;
      onIncidentLog: (
        callback: (data: {
          type: string;
          details: string;
          timestamp: string;
        }) => void
      ) => () => void;
    };
  }
}

export function useElectronKiosk() {
  const [isKiosk, setIsKiosk] = useState(false);
  const [focusLostCount, setFocusLostCount] = useState(0);
  const [lastAlert, setLastAlert] = useState<{
    type: string;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    setIsKiosk(!!window.peanKiosk);
  }, []);

  useEffect(() => {
    if (!window.peanKiosk) return;

    const unsubAlert = window.peanKiosk.onSecurityAlert((data) => {
      setFocusLostCount(data.count);
      setLastAlert({ type: data.type, timestamp: data.timestamp });

      // Envoyer l'incident au serveur PEAN
      fetch('/api/student/incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident_type: 'focus_loss',
          severity: data.count > 3 ? 'high' : 'medium',
          details: `Focus perdu x${data.count} détecté par Electron Kiosk`,
        }),
      }).catch(() => {
        // Le watchdog côté serveur gérera l'incident
      });
    });

    const unsubLog = window.peanKiosk.onIncidentLog((data) => {
      setLastAlert({ type: data.type, timestamp: data.timestamp });
    });

    return () => {
      unsubAlert();
      unsubLog();
    };
  }, []);

  const lockKiosk = useCallback(async () => {
    if (window.peanKiosk) {
      return window.peanKiosk.lock();
    }
    return { success: false };
  }, []);

  const setSessionCode = useCallback(async (code: string) => {
    if (window.peanKiosk) {
      return window.peanKiosk.setSession(code);
    }
    return { success: false };
  }, []);

  return {
    isKiosk,
    focusLostCount,
    lastAlert,
    lockKiosk,
    setSessionCode,
  };
}

/**
 * Intégration avec StudentExam.tsx :
 *
 * 1. Au montage du composant, appeler setSessionCode(code)
 * 2. À chaque perte de focus (détectée par KioskMode + Electron),
 *    envoyer un incident au serveur
 * 3. En cas de tentatives multiples (>5), déclencher l'auto-submission
 */
