# PEAN — Plateforme d'Évaluation Académique Numérique

**Génération aléatoire d'épreuves — Interface Enseignant & Étudiant**

Plateforme EdTech pour les universités et établissements d'enseignement supérieur. Générez des épreuves uniques par étudiant, gérez les sessions d'examen en temps réel, et corrigez automatiquement via l'IA.

---

## 🚀 Démarrage Rapide

### Prérequis

- Docker & Docker Compose
- Node.js 22+
- Python 3.12+

### 1. Configurer Supabase

1. Créez un projet sur [Supabase](https://supabase.com)
2. Exécutez le script `server/supabase_schema.sql` dans **SQL Editor**
3. Ajoutez vos clés dans `.env` (voir `.env.example`)

### 2. Lancer le backend

```bash
cd server
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
cp .env.example .env    # Configurer vos clés
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

### 4. Backend (déploiement Vercel)

Le backend se déploie automatiquement sur Vercel via GitHub Actions (push sur `master` avec modification dans `server/`).

---

## 🏗️ Architecture

```
PEAN/
├── server/                    # Backend FastAPI (déploiement Vercel)
│   ├── core/                  # Configuration, DB (Supabase), Sécurité
│   ├── schemas/               # Schémas Pydantic
│   ├── services/              # Logique métier
│   │   ├── qcm_generator.py   # Génération IA via Groq
│   │   └── correction_ai.py   # Correction IA
│   ├── api/                   # Routeurs FastAPI
│   │   ├── auth/              # Authentification JWT
│   │   ├── sessions/          # Sessions d'examen
│   │   ├── exams/             # Exercices & variantes
│   │   ├── students/          # Module étudiant
│   │   ├── grading/           # Correction & notation
│   │   └── admin/             # Administration
│   ├── api/access_codes.py    # Codes PIN étudiants
│   ├── api/students_manager.py # Gestion pédagogique
│   └── fix_security_lints.sql # Correctifs sécurité Supabase
├── client/                    # Frontend React + TypeScript (Vercel)
│   └── src/
│       ├── components/        # Composants réutilisables
│       ├── pages/             # Pages de l'application
│       │   ├── auth/          # Login, Register
│       │   ├── teacher/       # Dashboard, Sessions, Correction
│       │   ├── student/       # Composition (mode kiosque)
│       │   └── admin/         # Supervision, stats, audit
│       ├── stores/            # Zustand (auth, session)
│       ├── services/          # API client
│       └── types/             # TypeScript interfaces
├── GUIDE_UTILISATION.md       # Guide utilisateur
└── .github/workflows/         # CI/CD (déploiement automatique)
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

## 🔌 API — Documentation

L'API expose des endpoints regroupés par module (auth, sessions, examens, correction, administration). La documentation interactive est disponible sur `/api/docs` une fois le serveur lancé.

**Modules :**
- **Authentification** — Inscription (avec code d'invitation), connexion, 2FA, réinitialisation mot de passe
- **Sessions** — Création, exercices, génération IA, lancement, suivi en temps réel
- **Examens** — Exercices, variantes, upload fichiers
- **Étudiants** — Rejoindre session, soumettre copie, signaler incidents
- **Correction** — Correction IA, révision enseignant, grilles d'évaluation, export résultats
- **Administration** — Statistiques, gestion enseignants, hiérarchie pédagogique, codes d'invitation, audit logs

---

## 🧪 Tests

```bash
cd server
pytest -v
```

---

## 🔐 Variables d'Environnement (.env)

```env
# Obligatoire
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre-cle-anon
SUPABASE_SERVICE_KEY=votre-cle-service-role
JWT_SECRET_KEY=<clé forte, min 32 caractères>
GROQ_API_KEY=votre-cle-groq

# Optionnel
DEBUG=false
```

---

## 📄 License

Projet étudiant — PEAN v2.0
