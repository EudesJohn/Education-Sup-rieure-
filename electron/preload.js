/**
 * PEAN Kiosk — Script de préchargement (contextBridge)
 *
 * Expose une API sécurisée au renderer (React) pour interagir
 * avec le processus principal Electron.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('peanKiosk', {
  // Configuration
  getConfig: () => ipcRenderer.invoke('kiosk:get-config'),
  setSession: (sessionCode) => ipcRenderer.invoke('kiosk:set-session', sessionCode),

  // Contrôle du kiosque
  lock: () => ipcRenderer.invoke('kiosk:lock'),
  exit: () => ipcRenderer.invoke('kiosk:exit'),

  // Statistiques
  getFocusStats: () => ipcRenderer.invoke('kiosk:get-focus-stats'),

  // Écouteurs d'événements sécurité
  onSecurityAlert: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('security-alert', handler);
    return () => ipcRenderer.removeListener('security-alert', handler);
  },
  onIncidentLog: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('incident-log', handler);
    return () => ipcRenderer.removeListener('incident-log', handler);
  },
});
