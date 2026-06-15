/**
 * PEAN Kiosk — Processus principal Electron
 *
 * Mode kiosque sécurisé pour les examens :
 * - Plein écran verrouillé (impossible de sortir)
 * - Barre des tâches masquée
 * - Raccourcis clavier système bloqués
 * - Communication IPC avec la page de composition
 * - Watchdog de perte de focus avec notification enseignant
 */

const { app, BrowserWindow, globalShortcut, ipcMain, powerMonitor, screen } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({
  schema: {
    serverUrl: { type: 'string', default: 'http://localhost:8000' },
    sessionCode: { type: 'string', default: '' },
    fullscreen: { type: 'boolean', default: true },
    devToolsEnabled: { type: 'boolean', default: false },
  },
});

let mainWindow = null;
let watchdogInterval = null;
let focusLostCount = 0;


function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    fullscreen: store.get('fullscreen'),
    frame: false,                // Pas de barre de titre système
    autoHideMenuBar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,           // Pas visible dans la barre des tâches
    alwaysOnTop: false,          // Ne pas rester au-dessus en cas d'incident
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      disableDialogs: true,
    },
  });

  // Charger le serveur PEAN (packagé ou distant)
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL(store.get('serverUrl'));
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'extraResources', 'client', 'index.html'));
  }

  // Activer DevTools seulement en mode développement
  if (isDev && store.get('devToolsEnabled')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Bloquer la navigation hors du domaine
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedUrl = isDev
      ? store.get('serverUrl')
      : 'file://' + path.join(__dirname, '..', 'extraResources', 'client').replace(/\\/g, '/');

    if (!url.startsWith(allowedUrl)) {
      event.preventDefault();
      mainWindow.loadURL(allowedUrl);
    }
  });

  // Bloquer les fenêtres popup
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Événements de focus
  mainWindow.on('focus', () => handleFocusRestored());
  mainWindow.on('blur', () => handleFocusLost());
}

/**
 * Verrouille le système en mode kiosque :
 * - Désactive Alt+F4, Ctrl+W, Ctrl+Q, F11, Escape, etc.
 * - Empêche l'ouverture du gestionnaire de tâches (Alt+Ctrl+Suppr est système, non interceptable)
 */
function registerSecurityShortcuts() {
  // Raccourcis de navigation
  const forbiddenKeys = [
    { accelerator: 'Alt+F4', reason: 'Fermeture fenêtre' },
    { accelerator: 'CommandOrControl+W', reason: 'Fermeture onglet/navigation' },
    { accelerator: 'CommandOrControl+Q', reason: 'Quitter application' },
    { accelerator: 'F11', reason: 'Sortie plein écran' },
    { accelerator: 'CommandOrControl+N', reason: 'Nouvelle fenêtre' },
    { accelerator: 'CommandOrControl+T', reason: 'Nouvel onglet' },
    { accelerator: 'Escape', reason: 'Sortie plein écran' },
  ];

  for (const { accelerator, reason } of forbiddenKeys) {
    globalShortcut.register(accelerator, () => {
      logSecurityIncident('keyboard_shortcut', reason);
      // Re-forcer le plein écran immédiatement
      if (mainWindow && !mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(true);
      }
    });
  }
}

/**
 * Démarre le watchdog de perte de focus.
 * Vérifie toutes les 5 secondes si la fenêtre est au premier plan.
 */
function startWatchdog() {
  if (watchdogInterval) clearInterval(watchdogInterval);

  watchdogInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (!mainWindow.isFocused()) {
      focusLostCount++;
      logSecurityIncident('focus_loss', `Focus perdu x${focusLostCount}`);
      mainWindow.setFullScreen(true);
      mainWindow.focus();
      mainWindow.webContents.send('security-alert', {
        type: 'focus_loss',
        count: focusLostCount,
        timestamp: new Date().toISOString(),
      });
    }
  }, 5000);
}

function handleFocusLost() {
  focusLostCount++;
  logSecurityIncident('focus_loss', `Focus perdu (event) x${focusLostCount}`);
  if (mainWindow) {
    mainWindow.webContents.send('security-alert', {
      type: 'focus_loss',
      count: focusLostCount,
      timestamp: new Date().toISOString(),
    });
  }
}

function handleFocusRestored() {
  if (mainWindow && !mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(true);
  }
}

function logSecurityIncident(type, details) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('incident-log', {
      type,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * IPC Handlers — Communication entre le renderer et le processus principal
 */
function registerIpcHandlers() {
  ipcMain.handle('kiosk:get-config', () => ({
    fullscreen: store.get('fullscreen'),
    serverUrl: store.get('serverUrl'),
    sessionCode: store.get('sessionCode'),
  }));

  ipcMain.handle('kiosk:set-session', (_event, sessionCode) => {
    store.set('sessionCode', sessionCode);
    return { success: true };
  });

  ipcMain.handle('kiosk:exit', () => {
    // Exit uniquement si autorisé (code de déverrouillage)
    // Pour l'instant : demande de confirmation
    return { success: true, canExit: false };
  });

  ipcMain.handle('kiosk:get-focus-stats', () => ({
    focusLostCount,
  }));

  ipcMain.handle('kiosk:lock', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(true);
      mainWindow.focus();
    }
    return { success: true };
  });
}

// ======================== Lifecycle ========================

app.whenReady().then(() => {
  createWindow();
  registerSecurityShortcuts();
  registerIpcHandlers();
  startWatchdog();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Ne pas quitter automatiquement (kiosque)
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (watchdogInterval) clearInterval(watchdogInterval);
});

// Empêcher la fermeture via les moyens standards
app.on('before-quit', (event) => {
  event.preventDefault();
});

// Désactiver le menu natif
app.applicationMenu = null;
