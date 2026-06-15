# ✅ Checklist de Mise en Production — PEAN

## 🔴 Sécurité (obligatoire avant mise en ligne)

- [ ] **JWT_SECRET_KEY** — Générée avec `openssl rand -hex 32` et définie dans les variables d'environnement
- [ ] **Endpoints admin** — Vérifier que `/api/admin/*` nécessite un token (corrigé ✅)
- [ ] **Code executor** — Désactivé en production. Remplacer par Judge0 ou conteneurisation Docker
- [ ] **Soumissions étudiantes** — Token de session vérifié (corrigé ✅)
- [ ] **HTTPS** — Certificat SSL/TLS configuré (Let's Encrypt avec Certbot ou reverse proxy)
- [ ] **Mots de passe forts** — PostgreSQL, Redis, MinIO ont des mots de passe uniques
- [ ] **CORS** — Limité au domaine du frontend uniquement
- [ ] **.env.prod** — Jamais commité dans le dépôt (`.env.prod*` dans .gitignore ✅)

## 🟢 Infrastructure

- [ ] **Nom de domaine** — Acheté et DNS pointant vers le serveur
- [ ] **Reverse proxy** — nginx / Caddy / Traefik avec HTTPS
- [ ] **Base de données** — PostgreSQL managé ou sauvegardes automatisées
- [ ] **Redis** — Redis managé ou avec mot de passe (`requirepass`)
- [ ] **Stockage** — MinIO managé ou Cloudflare R2 / AWS S3
- [ ] **Sauvegardes** — Backup quotidien de la base de données et des fichiers

## 🟡 CI/CD

- [ ] **GitHub Secrets** configurés :
  - `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`
  - `JWT_SECRET_KEY`, `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`
  - `AI_API_KEY` (si IA utilisée)
- [ ] **Workflow CI** — Tests + linting + audit de sécurité
- [ ] **Workflow CD** — Build + push images + déploiement automatique
- [ ] **npm audit / safety** — Intégré dans la CI (✅)

## 🟠 Monitoring

- [ ] **Healthcheck API** — `/api/health` (existant ✅)
- [ ] **Logs centralisés** — (optionnel : Loki + Grafana, ou Datadog)
- [ ] **Sentry / APM** — Pour les erreurs applicatives
- [ ] **Alertes** — Notification si le service est down

## 📋 Administration

- [ ] **Compte admin** — Créé avec `role=admin` dans la base de données
- [ ] **Mentions légales** — Page "Mentions légales" pour la conformité
- [ ] **Politique de confidentialité** — Conformité RGPD / Loi informatique et libertés
- [ ] **CGU** — Conditions Générales d'Utilisation

## 🧪 Tests finaux

- [ ] `docker compose -f docker-compose.prod.yml up -d` fonctionne
- [ ] Connexion enseignant + création de session
- [ ] Rejoindre une session avec le code étudiant
- [ ] Soumettre une copie
- [ ] L'API répond en HTTPS
- [ ] Les endpoints admin sont protégés
- [ ] Les endpoints judge retournent 503 (désactivés)
