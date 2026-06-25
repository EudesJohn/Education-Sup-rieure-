# 🔍 Rapport d'Audit & Déploiement — PEAN v2.0

Ce document présente l'audit final du projet PEAN (Plateforme d'Évaluation Académique Numérique) suite aux récentes corrections de sécurité et au déploiement en production sur Vercel.

---

## 📊 Résumé Global du Statut

| Composant | Statut | Résultat |
|---|---|---|
| 🔒 **Sécurité Backend** | **Sécurisé** | HMAC-SHA256, Rate Limiting & validation des inputs actifs. |
| 🛡️ **Sécurité Frontend** | **Sécurisé** | Protection XSS par DOMPurify & pages d'authentification ajoutées. |
| 🧪 **Tests Backend** | **100% Succès** | **177/177 tests validés** (`pytest`). |
| 🏗️ **Build Frontend** | **100% Succès** | Build Vite de production réussi sans aucune erreur TypeScript. |
| 🚀 **Déploiement Backend** | **En Ligne** | `https://server-taupe-mu.vercel.app` (Statut 200) |
| 🚀 **Déploiement Frontend** | **En Ligne** | `https://education-sup-rieure-r1h3.vercel.app` (Statut 200) |

---

## 🔒 Audit de Sécurité : Résolutions et Correctifs

L'analyse de sécurité initiale avait relevé plusieurs vulnérabilités. Voici le statut actuel de chaque point après nos correctifs :

### 1. Hash des identifiants étudiants (`hash_student_identifier`)
- **Problème initial** : Utilisation d'un simple SHA-256 sans sel clé (`student_number:session_id`), permettant la pré-génération de hashs et l'usurpation d'identité.
- **Correction** : Remplacement par un algorithme **HMAC-SHA256** utilisant la variable secrète `JWT_SECRET_KEY` comme clé de signature.
- **Fichier** : `server/core/security.py`

### 2. Endpoint de signalement d'incidents étudiants (`/student/incident`)
- **Problème initial** : Aucune authentification requise. N'importe qui pouvait flooder le système de faux incidents et forcer la soumission automatique de copies d'autres étudiants.
- **Correction** : 
  1. Ajout de la validation du header **`X-Student-Token`** propre à la session de l'étudiant.
  2. Implémentation du **`RateLimiter`** sur cet endpoint pour bloquer les tentatives de flood.
- **Fichier** : `server/api/students/router.py`

### 3. Protection contre les failles XSS (Frontend)
- **Problème initial** : Utilisation potentielle de rendus HTML bruts (`dangerouslySetInnerHTML`) sans nettoyage des scripts malveillants.
- **Correction** : Intégration de **`DOMPurify`** pour assainir le rendu Markdown et LaTeX.
- **Fichier** : `client/src/components/RichEditor.tsx`

### 4. Limitation des connexions WebSocket
- **Problème initial** : Pas de limitation du nombre de sockets ouverts. Possibilité de saturer les connexions du serveur.
- **Correction** : Limitation stricte à **5 connexions WebSocket simultanées par canal** (enseignant ou étudiant).
- **Fichier** : `server/api/ws.py`

### 5. Robustesse lors de la soumission de copies
- **Correction 1** : Limitation de la taille du contenu textuel soumis par l'étudiant à **500 Ko** pour éviter la saturation de Supabase.
- **Correction 2** : Résolution du bug de perte des adresses d'attachements (`attachment_urls`) lors de la soumission mixte (fichiers + texte).
- **Correction 3** : Correction d'une faille `KeyError` dans le chien de garde (`session_watchdog.py`) lors de l'expiration d'une session.
- **Fichier** : `server/api/students/router.py`

---

## 🚀 Déploiement en Production (Vercel)

Les deux applications sont déployées séparément sur Vercel :

### 1. Backend API (`server`)
- **URL** : [https://server-taupe-mu.vercel.app/api/docs](https://server-taupe-mu.vercel.app/api/docs)
- **Vérification d'état** :
  ```json
  {
    "status": "ok",
    "version": "1.0.0",
    "app": "PEAN - Plateforme d'Évaluation Académique Numérique"
  }
  ```
- **Configuration** : Les secrets de production (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET_KEY`, `GROQ_API_KEY`) ont été mis à jour de façon sécurisée via Vercel CLI.

### 2. Frontend client (`education-sup-rieure-r1h3`)
- **URL** : [https://education-sup-rieure-r1h3.vercel.app](https://education-sup-rieure-r1h3.vercel.app)
- **Communication backend** : Configurée via la variable d'environnement Vercel `VITE_API_URL` pointant vers notre backend de production.
- **Nouvelles routes fonctionnelles** :
  - Login : `/login`
  - Mot de passe oublié : `/forgot-password` (avec lien actif sur la page de connexion)
  - Réinitialisation de mot de passe : `/reset-password`
  - Vérification d'e-mail : `/verify-email`

---

## ⚠️ Limitations architecturales inhérentes à Vercel

> [!WARNING]
> **WebSockets en Serverless** : Vercel s'appuie sur des architectures Serverless éphémères. Les connexions WebSockets (utilisées pour le monitoring des étudiants en temps réel) ne sont pas supportées de manière persistante sur les fonctions serverless de Vercel. Si le monitoring temps réel par WebSocket est indispensable en production, il est recommandé de migrer le backend vers un serveur dédié (VPS type OVH/DigitalOcean) à l'aide du `docker-compose.prod.yml` présent à la racine.

> [!WARNING]
> **Chien de garde des sessions (Watchdog)** : La boucle asynchrone qui clôture automatiquement les examens expirés s'exécute dans le cycle de vie de FastAPI. Sur Vercel Serverless, l'exécution s'arrête dès que la requête se termine. La clôture automatique ne se fera donc que lors de requêtes entrantes, ou devra être déléguée à un service de cron externe (ex. *Vercel Cron Jobs* ou *Supabase pg_cron*).

---

## 📈 Backlog de Recommandations Futures

1. **Stockage JWT sécurisé** : Remplacer le `localStorage` par des cookies `HttpOnly + Secure + SameSite=Strict` pour prémunir totalement le frontend de toute tentative de vol de token en cas de faille XSS.
2. **Sandbox de code** : Actuellement, l'exécution du code étudiant est désactivée par défaut en production pour des raisons de sécurité (`ENABLE_CODE_EXECUTION=false`). Pour l'activer, configurez l'API pour utiliser un microservice de bac à sable isolé comme **Judge0** sous Docker.
3. **Supabase migrations** : Uniformiser les schémas SQL (`supabase_schema_v1` à `v9`) en utilisant l'historique officiel des migrations Supabase CLI.
