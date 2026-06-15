# PEAN Kiosk — Application Desktop

Application Electron pour le mode kiosque sécurisé des examens PEAN.

## Sécurité

Contrairement au mode kiosque navigateur (KioskMode.tsx), la version Electron offre :

- **Blocage système** : La barre des tâches, le gestionnaire de fenêtres
  et les raccourcis système (Alt+F4, Ctrl+W, Ctrl+Q, etc.) sont désactivés.
- **Watchdog focus** : Vérifie toutes les 5s que la fenêtre est au premier plan.
- **Navigation verrouillée** : Impossible de naviguer hors du domaine PEAN.
- **Popup bloquées** : Toute tentative d'ouverture de popup est refusée.

## Installation

```bash
cd electron
npm install
```

## Développement

```bash
npm start
```

Le kiosque se connecte à `http://localhost:8000` par défaut.
Configurer via : `store.set('serverUrl', 'https://pean.example.com')`.

## Production

```bash
# Build le client d'abord
cd ../client && npm run build

# Puis packager l'app Electron
cd ../electron
npm run dist
```

Le client React packagé est copié dans `extraResources/client/`.

## Configuration

Stockée dans `electron-store` (fichier JSON) :
```json
{
  "serverUrl": "http://localhost:8000",
  "sessionCode": "",
  "fullscreen": true,
  "devToolsEnabled": false
}
```

## Architecture

```
electron/
├── main.js          # Processus principal (kiosque, IPC, watchdog)
├── preload.js       # Pont sécurisé renderer ↔ main
├── package.json     # Dépendances Electron + build config
└── README.md
```
