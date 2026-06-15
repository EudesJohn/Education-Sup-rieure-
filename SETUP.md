# Guide d'Installation et Démarrage — PEAN

## 📋 Prérequis

- Docker & Docker Compose
- Node.js 22+
- Python 3.12+

---

## 🚀 Développement local

### Méthode 1 : Avec Docker (recommandé)

```bash
# 1. Cloner le projet
git clone <url-du-repo>
cd PEAN

# 2. Copier la configuration
cp .env.example .env
# ⚠️ Éditer .env et CHANGER JWT_SECRET_KEY !

# 3. Lancer toute l'infrastructure + API
docker compose up -d

# 4. Lancer le frontend (hors Docker pour le HMR)
cd client
npm install
npm run dev
```

### Méthode 2 : Sans Docker (développement)

```bash
# 1. Installer PostgreSQL, Redis, MinIO manuellement (ou via Docker)
docker compose up -d postgres redis minio

# 2. Lancer le serveur API
cd server
python -m venv venv

# Windows :
venv\Scripts\activate
# Linux/Mac :
# source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd client
npm install
npm run dev
```

---

## 🏗️ Déploiement Production

### Option A : Serveur dédié (VPS) avec Docker Compose

```bash
# 1. Copier la config production
cp .env.production .env.prod
# Éditer .env.prod avec vos secrets (ouvrir chaque valeur !)

# 2. Lancer la stack complète
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 3. Vérifier
docker compose -f docker-compose.prod.yml ps
```

### Option B : Railway (PaaS — automatique)

1. Créer un compte [Railway](https://railway.app)
2. Installer la CLI : `npm i -g @railway/cli`
3. Lier le dépôt et configurer les variables d'environnement dans le dashboard
4. Déployer : `railway up`

### Option C : Déploiement CI/CD automatisé (recommandé)

1. Configurer les **GitHub Secrets** dans votre dépôt :
   - `DEPLOY_HOST` — IP du serveur
   - `DEPLOY_USER` — Utilisateur SSH
   - `DEPLOY_SSH_KEY` — Clé privée SSH
   - `JWT_SECRET_KEY` — Clé JWT (générée avec `openssl rand -hex 32`)
   - `POSTGRES_PASSWORD` — Mot de passe PostgreSQL fort
   - `MINIO_ROOT_PASSWORD` — Mot de passe MinIO
   - `AI_API_KEY` — Clé API IA (si utilisée)

2. Pousser sur `main` → le workflow `.github/workflows/deploy.yml` build, push et déploie automatiquement.

---

## 🔐 Configuration Production (.env.prod)

```env
# TOUTES les valeurs ci-dessous DOIVENT être changées
JWT_SECRET_KEY=openssl rand -hex 32 > ici
POSTGRES_PASSWORD=un_mot_de_passe_fort
REDIS_PASSWORD=un_mot_de_passe_fort
MINIO_ROOT_PASSWORD=un_mot_de_passe_fort
MINIO_SECRET_KEY=un_mot_de_passe_fort
CORS_ORIGINS=["https://votre-domaine.com"]
```

---

## 📍 Accès

| Service | URL (Dev) | URL (Prod) |
|---------|-----------|------------|
| Frontend | http://localhost:5173 | https://votre-domaine.com |
| API Docs | http://localhost:8000/api/docs | https://votre-domaine.com/api/docs |
| MinIO Console | http://localhost:9001 | (interne) |

---

## 🧪 Tests

```bash
# Backend
cd server && pytest -v

# Frontend
cd client && npx vitest run

# CI complète
# Pousser sur develop → GitHub Actions exécute ci.yml
```

---

## 🛡️ Commandes sécurité

```bash
# Audit des dépendances Python
pip install safety
safety check -r server/requirements.txt

# Audit des dépendances Node
cd client && npm audit --production

# Vérifier les secrets codés en dur
grep -r "changez-moi" --include="*.py" --include="*.yml" --include="*.yaml" .
```

---

## 📦 Commandes courantes

```bash
# Migration DB (si changement de modèle)
cd server
alembic revision --autogenerate -m "description"
alembic upgrade head

# Linter
cd server && ruff check .
cd client && npx tsc --noEmit

# Seed de test
cd server && python seed.py
```
