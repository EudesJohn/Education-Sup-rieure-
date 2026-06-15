# PEAN — Plateforme d'Évaluation Académique Numérique

**Génération aléatoire d'épreuves — Interface Enseignant & Étudiant**

Plateforme EdTech pour les universités et établissements d'enseignement supérieur. Générez des épreuves uniques par étudiant, gérez les sessions d'examen en temps réel, et corrigez automatiquement via l'IA.

---

## 🚀 Démarrage Rapide

### Prérequis

- Docker & Docker Compose
- Node.js 22+
- Python 3.12+

### 1. Lancer l'infrastructure (Docker)

```bash
docker compose up -d postgres redis minio
```

### 2. Lancer le backend

```bash
cd server
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

L'API est disponible sur `http://localhost:8000/api/docs`

### 3. Lancer le frontend

```bash
cd client
npm install
npm run dev
```

L'application est disponible sur `http://localhost:5173`

### 4. Lancer tout avec Docker Compose

```bash
docker compose up -d
```

---

## 🏗️ Architecture

```
PEAN/
├── server/                    # Backend FastAPI
│   ├── core/                  # Configuration, DB, Sécurité
│   ├── models/                # Modèles SQLAlchemy (8 entités)
│   ├── schemas/               # Schémas Pydantic
│   ├── services/              # Logique métier
│   │   ├── generator.py       # Moteur de génération aléatoire
│   │   ├── correction_ai.py   # Correction IA (OpenAI/Claude/Gemini)
│   │   ├── storage.py         # Stockage MinIO (S3)
│   │   └── student.py         # Gestion étudiants
│   ├── api/                   # Routeurs FastAPI
│   │   ├── auth/              # Authentification JWT
│   │   ├── teachers/          # Profil enseignant
│   │   ├── sessions/          # Sessions d'examen
│   │   ├── exams/             # Exercices & variantes
│   │   ├── students/          # Module étudiant
│   │   ├── grading/           # Correction & notation
│   │   └── admin/             # Administration
│   └── tests/                 # Tests
├── client/                    # Frontend React + TypeScript
│   └── src/
│       ├── components/        # Composants réutilisables
│       │   ├── RichEditor     # Éditeur de texte enrichi (Tiptap)
│       │   ├── KioskMode      # Mode kiosque sécurisé
│       │   └── AuthGuard      # Garde d'authentification
│       ├── pages/             # Pages de l'application
│       │   ├── auth/          # Login, Register
│       │   ├── teacher/       # Dashboard, Sessions, Exercices, Correction
│       │   ├── student/       # Identification, Composition
│       │   └── admin/         # Statistiques, Supervision
│       ├── stores/            # Zustand (auth, session)
│       ├── services/          # Axios API client
│       └── types/             # TypeScript interfaces
├── docker-compose.yml         # PostgreSQL, Redis, MinIO, API
├── Dockerfile.server           # Backend container
└── .github/workflows/         # CI/CD
```

---

## 📋 Fonctionnalités

### 👨‍🏫 Enseignant
- Inscription & authentification sécurisée (JWT)
- Banque de questions avec exercices et variantes
- Configuration des sessions (durée, notation, correction)
- Génération aléatoire d'épreuves uniques
- Suivi en temps réel des compositions
- Correction IA + révision manuelle
- Export des résultats

### 👨‍🎓 Étudiant
- Identification par code de session (sans compte)
- Interface de composition avec éditeur enrichi
- Formules mathématiques (LaTeX/KaTeX)
- Mode kiosque sécurisé (plein écran verrouillé)
- Soumission automatique à expiration
- Sauvegarde automatique toutes les 30s

### 🔧 Administration
- Statistiques globales de la plateforme
- Supervision des sessions actives
- Gestion des enseignants
- Audit des incidents de sécurité

---

## 🔌 API — Endpoints Principaux

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/auth/register` | Inscription enseignant |
| POST | `/api/auth/login` | Connexion |
| GET | `/api/teacher/dashboard` | Tableau de bord |
| POST | `/api/teacher/sessions` | Créer une session |
| POST | `/api/teacher/sessions/{id}/launch` | Lancer une session |
| GET | `/api/exams/exercises` | Liste des exercices |
| POST | `/api/exams/exercises` | Créer un exercice |
| POST | `/api/sessions/{code}/join` | Étudiant rejoint session |
| GET | `/api/student/exam` | Récupérer l'épreuve |
| POST | `/api/student/submit` | Soumettre la copie |
| POST | `/api/grading/submissions/{id}/correct-ai` | Correction IA |
| GET | `/api/grading/sessions/{id}/results` | Résultats session |
| GET | `/api/admin/stats` | Statistiques admin |

---

## 🧪 Tests

```bash
cd server
pytest -v
```

---

## 🔐 Variables d'Environnement (.env)

```env
DEBUG=true
DATABASE_URL=postgresql://pean:pean_pass@localhost:5432/pean_db
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=changez-moi-en-production-svp
AI_API_KEY=votre-cle-api-ia
AI_PROVIDER=openai        # openai, anthropic, gemini
AI_MODEL=gpt-4o
```

---

## 📄 License

Projet étudiant — PEAN v2.0
