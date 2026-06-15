# PEAN — Plateforme d'Évaluation Académique Numérique

**Document de présentation technique et fonctionnelle**  
*À l'attention du chef de projet / chef d'équipe*

---

## 1. Vision & Objectif

PEAN est une **plateforme EdTech** destinée aux universités et établissements d'enseignement supérieur. Elle permet de :

- **Générer des épreuves uniques par étudiant** pour éliminer la triche
- **Gérer les sessions d'examen en temps réel** (de la création à la correction)
- **Corriger automatiquement via l'IA** avec révision manuelle par l'enseignant
- **Sécuriser la composition** avec un mode kiosque verrouillé

---

## 2. Stack Technique

### Backend

| Technologie | Rôle |
|---|---|
| **Python 3.12 + FastAPI** | API REST asynchrone |
| **SQLAlchemy 2.0** | ORM avec 8 modèles |
| **Pydantic V2** | Validation des données / schémas |
| **httpx** | Appels asynchrones aux API d'IA |
| **python-jose** | JWT (access + refresh tokens) |
| **PostgreSQL** | Base de données production |
| **SQLite** | Base de données développement / tests |
| **Redis** | Cache et files d'attente |
| **MinIO (S3)** | Stockage fichiers |

### Frontend

| Technologie | Rôle |
|---|---|
| **React 19 + TypeScript** | UI moderne et typée |
| **Vite** | Build rapide |
| **Tailwind CSS 4** | Design system |
| **Zustand** | State management (léger) |
| **React Router 6** | Routage SPA |
| **Tiptap / KaTeX** | Éditeur enrichi + formules mathématiques |

### Infrastructure

| Technologie | Rôle |
|---|---|
| **Docker / Docker Compose** | Conteneurisation |
| **GitHub Actions** | CI/CD |
| **Nginx** | Reverse proxy |

---

## 3. Architecture de l'Application

```
PEAN/
├── server/                          # Backend FastAPI
│   ├── main.py                      # Point d'entrée + lifespan
│   ├── core/
│   │   ├── config.py                # Variables d'environnement (Pydantic Settings)
│   │   ├── database.py              # Engine SQLAlchemy + session
│   │   ├── security.py              # JWT, hash password
│   │   └── dependencies.py          # Dépendances FastAPI (auth)
│   ├── models/                      # 8 modèles SQLAlchemy
│   │   ├── teacher.py               # Enseignants
│   │   ├── exam_session.py          # Sessions d'examen
│   │   ├── exercise.py              # Exercices
│   │   ├── variant.py               # Variantes d'exercices
│   │   ├── generated_exam.py        # Épreuves générées
│   │   ├── submission.py            # Copies soumises
│   │   ├── correction.py            # Corrections (IA + enseignant)
│   │   └── security_incident.py     # Incidents de sécurité
│   ├── schemas/                     # Schémas Pydantic (request/response)
│   ├── services/                    # Logique métier
│   │   ├── generator.py             # Moteur de génération aléatoire
│   │   ├── correction_ai.py         # Correction IA (3 fournisseurs)
│   │   ├── student.py               # Gestion étudiants
│   │   └── storage.py               # Stockage MinIO
│   ├── api/                         # 7 routeurs FastAPI
│   │   ├── auth/                    # Authentification JWT
│   │   ├── teachers/                # Profil enseignant
│   │   ├── sessions/                # Sessions d'examen (CRUD + lifecycle)
│   │   ├── exams/                   # Exercices & variantes
│   │   ├── students/                # Module étudiant
│   │   ├── grading/                 # Correction & notation
│   │   └── admin/                   # Administration
│   └── tests/                       # 14 tests pytest
├── client/                          # Frontend React
│   └── src/
│       ├── components/
│       │   ├── Layout.tsx           # Layout avec navigation
│       │   ├── AuthGuard.tsx        # Garde d'authentification
│       │   ├── KioskMode.tsx        # Mode kiosque sécurisé
│       │   └── RichEditor.tsx       # Éditeur de texte enrichi
│       ├── pages/
│       │   ├── auth/                # Login, Register
│       │   ├── teacher/             # Dashboard, Sessions, Exercices, Correction
│       │   ├── student/             # Identification, Composition
│       │   └── admin/               # Statistiques, Supervision
│       ├── stores/                  # Zustand (auth)
│       ├── services/                # Axios API client
│       └── types/                   # Interfaces TypeScript
├── docker-compose.yml               # PostgreSQL, Redis, MinIO, API
├── Dockerfile.server                 # Backend container
└── .github/workflows/               # CI/CD
```

---

## 4. Modèle de Données (8 entités)

### Relations principales

```
Teacher (1) ──→ (N) ExamSession
Teacher (1) ──→ (N) Exercise
Exercise (1) ──→ (N) Variant
ExamSession (1) ──→ (N) GeneratedExam
GeneratedExam (1) ──→ (1) Submission
Submission (1) ──→ (1) Correction
Submission (1) ──→ (N) SecurityIncident
```

### Détail des modèles

**Teacher** : email, password_hash, full_name, institution, discipline, is_verified, is_2fa_enabled, login_attempts, locked_until

**ExamSession** : teacher_id, title, subject, description, duration_seconds, student_count, grading_system, grading_details, correction_mode (auto/ai_assisted/manual), auto_submit, show_results, scheduled_start, access_code, status (draft/active/completed)

**Exercise** : teacher_id, title, subject, difficulty (easy/medium/hard), instructions, correct_answer, points, exercise_type (open/qcm/code/oral)

**Variant** : exercise_id, variant_order, content, data_overrides (JSON)

**GeneratedExam** : session_id, student_id_hash, variant_combo_hash, sha256_hash, content (JSON), status (pending/started/submitted)

**Submission** : generated_exam_id, student_name, student_number, class_name, university, content, auto_submitted, ip_address, user_agent, submitted_at

**Correction** : submission_id, teacher_id, ai_score, ai_feedback, ai_detailed_scores, ai_corrected_at, teacher_score, teacher_feedback, teacher_corrected_at, final_score, grading_system, correction_status (pending/ai_corrected/teacher_reviewed)

**SecurityIncident** : submission_id, incident_type, details, severity, timestamp

---

## 5. Fonctionnalités Détaillées

### 5.1 Module Enseignant

#### 🔐 Authentification & Sécurité
- Inscription avec email professionnel, institution, discipline
- Double token JWT : access token (60 min) + refresh token (7 jours)
- Protection par verrouillage après 5 tentatives échouées (15 min)
- 2FA disponible (authenticator)

#### 📝 Banque d'Exercices & Variantes
- CRUD complet des exercices
- Types supportés : question ouverte, QCM, code, oral
- Niveaux de difficulté : facile, moyen, difficile
- Système de **variantes** : chaque exercice peut avoir plusieurs versions (contenu différent, même structure). Les variantes sont la base du système anti-triche.
- Upload de fichiers (PDF, DOCX, images)

#### 📅 Gestion des Sessions d'Examen
- CRUD complet des sessions (create, read, update, delete)
- Configuration : matière, durée, nombre d'étudiants, système de notation
- Mode de correction : automatique / assistée IA / manuelle
- Cycle de vie : `Brouillon → Active → Terminée`
- Code d'accès généré automatiquement pour les étudiants

#### 🎲 Moteur de Génération Aléatoire d'Épreuves
C'est la fonctionnalité centrale et différenciante :

1. L'enseignant sélectionne N exercices (chacun avec ses variantes)
2. Pour chaque étudiant, le moteur **tire aléatoirement une combinaison** de variantes
3. Principe mathématique : pour K exercices avec Nᵢ variantes chacun → **∏ Nᵢ combinaisons uniques possibles**
4. Validation de capacité : le nombre d'épreuves uniques doit ≥ nombre d'étudiants
5. Chaque épreuve générée reçoit :
   - Un **hash SHA-256** unique de la combinaison
   - Un **hash de l'étudiant** (pour retrouver son épreuve sans stocker son identité en clair)
6. Le contenu est assemblé en JSON structuré

**Exemple concret :**
```
Session : 30 étudiants, 4 exercices
Exercice 1 → 3 variantes
Exercice 2 → 3 variantes
Exercice 3 → 2 variantes
Exercice 4 → 4 variantes
Total : 3 × 3 × 2 × 4 = 72 combinaisons > 30 étudiants ✓

→ Chaque étudiant reçoit une combinaison unique et différente de ses voisins
```

#### 📊 Suivi en Temps Réel
- Tableau de bord avec statistiques en direct
- Visualisation des copies : en attente / en cours / soumises
- Progression de la correction (%)
- Filtrage par statut

### 5.2 Module Étudiant

#### 🔌 Identification Simplifiée
- **Aucun compte requis** : les étudiants n'ont pas à s'inscrire
- Accès via un code de session (communiqué par l'enseignant)
- Saisie : nom, numéro étudiant, classe (optionnel), université (optionnel)
- Le système retrouve automatiquement l'épreuve générée pour cet étudiant

#### ✍️ Interface de Composition

**🛡️ Mode Kiosque Sécurisé :**
- Passage automatique en plein écran verrouillé
- Détection de sortie du plein écran → **soumission forcée immédiate**
- Interception des touches dangereuses : Echap, Alt+Tab, Windows, Impr. écran
- Blocage du clic droit, copier, couper
- Détection de perte de focus / changement d'onglet → soumission forcée
- Signalement d'incidents de sécurité

**📝 Éditeur de Texte Enrichi :**
- Barre d'outils complète : gras, italique, souligné, barré
- Titres (H1, H2, H3)
- Listes à puces et numérotées
- **Formules mathématiques LaTeX** via KaTeX (ex: `\frac{a}{b}`, `\sum_{i=0}^{n} x_i`)
- Insertion de tableaux
- Prévisualisation du rendu Markdown → HTML

**⏱️ Gestion du Temps :**
- Timer visible avec code couleur :
  - 🟢 Normal (temps > 10 min)
  - 🟠 Attention (temps < 10 min)
  - 🔥 Critique (temps < 5 min) — clignotant rouge
- Barre de progression proportionnelle
- **Sauvegarde automatique toutes les 30 secondes** dans le localStorage
- **Soumission automatique** à l'expiration du temps imparti
- Soumission volontaire à tout moment

#### 📤 Processus de Soumission
- Soumission volontaire (bouton "Envoyer")
- Soumission forcée (sortie du plein écran, expiration du temps)
- Double vérification : impossible de soumettre deux fois
- Enregistrement de l'adresse IP et du user-agent pour traçabilité

### 5.3 Module de Correction Intelligente (IA)

#### 🔄 Architecture Multi-Fournisseurs
```python
AI_PROVIDER = "openai"      # ou "anthropic" ou "gemini"
AI_MODEL = "gpt-4o"         # ou "claude-sonnet-4-6", "gemini-2.0-flash"
```

Le service `AICorrectionService` abstrait les appels aux 3 API :
- **OpenAI** : `gpt-4o` avec `response_format: json_object`
- **Anthropic** : `claude-sonnet-4-6` avec extraction JSON
- **Google Gemini** : `gemini-2.0-flash` avec extraction JSON

#### 📋 Processus de Correction

**Étape 1 — Construction du prompt :**
Le système prépare un prompt structuré contenant :
- Les règles de correction (raisonnement valorisé, erreurs mineures tolérées)
- Le système de notation (10, 20, 50, 100)
- L'énoncé original de l'épreuve
- La copie de l'étudiant à corriger
- Format de réponse JSON attendu

**Étape 2 — Appel IA :**
L'IA analyse la copie et retourne un JSON structuré :
```json
{
  "score": 14.5,
  "feedback": "Bon travail...",
  "detailed_scores": [
    { "exercise": "Exercice 1", "score": 7, "max_points": 10, "comment": "..." }
  ],
  "strengths": ["Maîtrise des concepts", "Raisonnement clair"],
  "weaknesses": ["Erreur de calcul dans l'exercice 3"],
  "overall_assessment": "Appréciation générale"
}
```

**Étape 3 — Calcul de la note finale :**
Conversion automatique selon le système de notation choisi.

**Étape 4 — Révision enseignant :**
L'enseignant peut :
- Voir la correction IA complète (score, feedback, scores détaillés)
- Ajuster la note (teacher_score)
- Ajouter son propre feedback
- Valider la correction → statut `teacher_reviewed`

**Étape 5 — Correction en lot :**
Bouton "Corriger tout" : corrige toutes les copies en attente d'une session en un clic.

#### 📊 Résultats & Export
- Vue consolidée des notes par session
- Colonnes : nom, numéro étudiant, statut, note IA, note finale
- Statistiques : total, corrigées, en attente, progression
- Export des résultats

### 5.4 Module Administration

#### 📈 Tableau de Bord Global
- Nombre total d'enseignants inscrits
- Nombre total de sessions créées
- Sessions actives en cours
- Nombre d'exercices dans la banque
- Copies soumises
- Corrections effectuées
- **Incidents de sécurité** (par type : sortie plein écran, changement onglet, etc.)

#### 👥 Supervision
- Liste complète des enseignants (email, établissement, discipline, vérification)
- Détail d'un enseignant : ses sessions, ses exercices
- Liste de toutes les sessions avec filtrage par statut
- Audit des incidents de sécurité avec détails (type, sévérité, étudiant, session)

---

## 6. API REST — Endpoints Complets

### Authentification (`/api/auth`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/register` | Inscription enseignant → tokens JWT |
| POST | `/login` | Connexion → tokens JWT |
| POST | `/refresh` | Rafraîchir le token |
| GET | `/me` | Profil de l'enseignant connecté |
| PUT | `/me` | Modifier son profil |
| POST | `/change-password` | Changer le mot de passe |

### Enseignant (`/api/teacher`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/profile` | Profil complet |
| GET | `/dashboard` | Tableau de bord (stats, sessions récentes) |

### Sessions (`/api/teacher/sessions`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste des sessions |
| POST | `/` | Créer une session |
| GET | `/{id}` | Détail d'une session |
| PUT | `/{id}` | Modifier une session (brouillon seulement) |
| DELETE | `/{id}` | Supprimer une session |
| POST | `/{id}/launch` | Lancer une session |
| POST | `/{id}/complete` | Terminer une session |

### Examens & Exercices (`/api/exams`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/exercises` | Liste des exercices |
| POST | `/exercises` | Créer un exercice |
| GET | `/exercises/{id}` | Détail d'un exercice |
| PUT | `/exercises/{id}` | Modifier un exercice |
| DELETE | `/exercises/{id}` | Supprimer un exercice |
| GET | `/exercises/{id}/variants` | Lister les variantes |
| POST | `/exercises/{id}/variants` | Ajouter une variante |
| POST | `/upload` | Uploader un fichier |

### Étudiant (`/api`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/sessions/{code}/join` | Rejoindre une session |
| GET | `/student/exam` | Récupérer l'épreuve |
| POST | `/student/submit` | Soumettre la copie |
| POST | `/student/incident` | Signaler un incident |
| GET | `/sessions/{code}/status` | Statut en direct de la session |

### Correction (`/api/grading`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/sessions/{id}/submissions` | Liste des soumissions d'une session |
| GET | `/submissions/{id}` | Détail d'une soumission + correction |
| POST | `/submissions/{id}/correct-ai` | Déclencher la correction IA |
| POST | `/corrections/{id}/review` | Révision enseignant |
| POST | `/sessions/{id}/correct-all` | Corriger toutes les copies en attente |
| GET | `/sessions/{id}/results` | Résultats complets d'une session |

### Administration (`/api/admin`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/stats` | Statistiques globales |
| GET | `/teachers` | Liste des enseignants |
| GET | `/teachers/{id}` | Détail d'un enseignant |
| GET | `/sessions` | Liste toutes les sessions |
| GET | `/incidents` | Liste des incidents de sécurité |

---

## 7. Sécurité

### Authentification
- **JWT** : tokens signés avec clé secrète configurable
- **Double token** : accès court (60 min) + refresh long (7 jours)
- **Rate limiting** : 5 tentatives de connexion → blocage 15 min
- **2FA** : authentification à deux facteurs disponible

### Anti-Triche
- **Variantes uniques** par étudiant (tirage aléatoire)
- **Hash SHA-256** : intégrité des épreuves vérifiable
- **Mode kiosque** : plein écran verrouillé
- **Détection de fraude** : sortie plein écran, changement onglet, perte focus
- **Traçabilité** : IP, user-agent, horodatage

### Stockage
- **Mots de passe** : hashés avec bcrypt
- **Données étudiants** : hashées (pas d'identité en clair dans les épreuves)
- **Fichiers** : stockés dans MinIO (S3 compatible)

### Tests
- **14 tests pytest** : authentification, services, génération, santé API
- **Base SQLite** en mémoire / fichier temporaire pour les tests
- **TypeScript** : compilation vérifiée (`tsc --noEmit`)

---

## 8. Déploiement

### Prérequis
- Docker & Docker Compose
- Node.js 22+
- Python 3.12+

### Démarrage Rapide
```bash
# 1. Lancer l'infrastructure (PostgreSQL, Redis, MinIO)
docker compose up -d postgres redis minio

# 2. Lancer le backend
cd server
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 3. Lancer le frontend
cd client
npm install
npm run dev

# 4. Ou tout avec Docker Compose
docker compose up -d
```

### Variables d'Environnement
```env
DEBUG=true
DATABASE_URL=postgresql://pean:pean_pass@localhost:5432/pean_db
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=changez-moi-en-production-svp
AI_API_KEY=votre-cle-api-ia
AI_PROVIDER=openai        # openai, anthropic, gemini
AI_MODEL=gpt-4o
```

### Accès
- API : `http://localhost:8000/api/docs` (Swagger UI)
- Frontend : `http://localhost:5173`
- MinIO Console : `http://localhost:9001`

---

## 9. Tests

```bash
cd server
pytest -v  # 14 tests — 14 passed ✓
```

Tests couverts :
- ✅ Inscription enseignant (succès, email dupliqué)
- ✅ Connexion (succès, mauvais identifiants)
- ✅ Santé de l'API (status, structure)
- ✅ Moteur de génération (combinaisons, capacité, génération, structure)
- ✅ Service étudiant (recherche session, statut)

---

## 10. Roadmap & Évolutions Possibles

✅ **Fonctionnalités existantes :**
- [x] Authentification JWT
- [x] Banque d'exercices avec variantes
- [x] Génération aléatoire d'épreuves
- [x] Mode kiosque anti-triche
- [x] Éditeur enrichi avec LaTeX
- [x] Correction IA (OpenAI, Claude, Gemini)
- [x] Tableau de bord enseignant
- [x] Administration & supervision
- [x] Gestion des incidents de sécurité

🔜 **Évolutions envisageables :**
- [ ] Mode QCM avec correction automatique
- [ ] Export PDF des épreuves
- [ ] Statistiques avancées (courbes de notes, analyse de réussite)
- [ ] Import d'étudiants par fichier CSV
- [ ] API REST pour intégration avec les systèmes universitaires (ENT)
- [ ] Notifications email
- [ ] Mode hors-ligne
- [ ] Application mobile

---

*Document généré le 12 juin 2026 — PEAN v1.0.0*
