# PEAN — Analyse d'Écart CDC v2.2 / Implémentation Actuelle

**Date :** 15 Juin 2026
**Version CDC :** 2.2 (09 Juin 2026)
**Projet :** Plateforme d'Évaluation Académique Numérique

---

## Résumé Exécutif

Le projet PEAN dispose d'une base solide avec **~70% des fonctionnalités de base implémentées**. La colonne vertébrale est en place : authentification JWT/2FA, cycle de vie des sessions, moteur de génération aléatoire d'épreuves avec hash SHA-256, éditeur de texte riche (Tiptap), correction IA via Groq, et interfaces enseignant/étudiant fonctionnelles.

La **nouveauté majeure du CDC v2.2** — l'**Import de Liste Étudiants et Vérification par Matricule** (RF-02) — est **totalement absente**. C'est le mécanisme de sécurité fondamental qui différencie cette version. Actuellement, le `student_number` est librement saisi par l'étudiant sans aucune vérification contre une liste officielle.

**Note de couverture par module :**

| Module CDC | Statut | Couverture |
|---|---|---|
| RF-01 Authentification | ✅ Implémenté | 95% |
| RF-02 Import & Vérification Matricule | ❌ Absent | 0% |
| RF-03 Banque d'Exercices | ✅ Implémenté | 85% |
| RF-04 Configuration Sessions | ✅ Implémenté | 90% |
| RF-05 Moteur Génération IA | ✅ Implémenté | 80% |
| RF-06 Gestion IA Dossiers Pédagogiques | ❌ Absent | 0% |
| RF-07 Éditeur Texte (Word) | ✅ Implémenté | 85% |
| RF-08 Éditeur Code (Monaco) | ⚠️ Partiel | 15% |
| RF-09 Mode Kiosque | ⚠️ Partiel | 60% |
| RF-10 Correction & Notation | ✅ Implémenté | 75% |
| RF-11 Scalabilité | ⚠️ Partiel | 40% |

**Coût estimé pour conformité complète :** 4-6 sprints de 2 semaines (2-3 mois en parallèle partiel)

---

## Analyse Détaillée des Écarts

### RF-01 — Authentification & Sécurité des Comptes Enseignants
**Statut : ✅ 95% implanté**

| Exigence CDC | Statut | Détails |
|---|---|---|
| Inscription obligatoire (formulaire + vérification email) | ✅ | Complété |
| Authentification sécurisée email/mot de passe | ✅ | JWT + bcrypt |
| Option 2FA | ✅ | TOTP avec QR code |
| Gestion sessions JWT avec expiration | ✅ | Access + Refresh tokens |
| Réinitialisation mot de passe par lien sécurisé | ✅ | Token 30min |
| Gestion rôles : Admin > Enseignant > Étudiant | ✅ | RoleChecker |
| Journalisation connexions/actions critiques | ⚠️ Partiel | Audit log présent mais pas de table `audit_logs` dédiée en base |

**À compléter :**
- Table `audit_logs` en base avec horodatage de toutes les actions critiques
- Interface admin de consultation des logs d'audit

---

### RF-02 — Import et Vérification de la Liste des Étudiants
**Statut : ❌ 0% implanté — CŒUR DU CDC v2.2**

| Exigence CDC | Statut | Écart |
|---|---|---|
| Import liste étudiants (PDF, Excel, CSV) avant toute session | ❌ | Aucun endpoint d'import |
| Détection automatique colonnes Nom, Prénom, Matricule | ❌ | Aucun parseur multi-format |
| Visualisation et correction manuelle liste importée | ❌ | Aucune UI de preview |
| Mise à jour liste avant/pendant session | ❌ | Pas de gestion de listes |
| Vérification instantanée matricule vs liste officielle | ❌ | `student_number` libre saisi |
| Refus catégorique si matricule absent | ❌ | Aucune vérification liste |
| Refus si matricule déjà utilisé | ⚠️ | Vérification session existe mais pas contre liste |
| Vérification cohérence nom/matricule | ❌ | Pas de correspondance nom-matricule |
| Signalement temps réel tentatives non autorisées | ❌ | Pas de notification liste |
| Blocage après 3 tentatives infructueuses (IP) | ❌ | Rate limiter existe pour auth mais pas pour join |
| Gestion multi-groupes | ❌ | Pas de concept de liste par groupe |
| Alerte capacité (import ≠ config) | ❌ | Pas de comparaison |

**Nouveaux composants nécessaires :**

- **Backend :**
  - Nouvelle table `student_lists` + `student_list_entries`
  - Service d'import : parse PDF (pypdf/tabula), Excel (openpyxl), CSV (csv)
  - Endpoints : upload, preview, validate, CRUD listes
  - Modification de `join_session` : vérifier matricule vs liste active
  - Cache Redis : index des matricules pour vérification < 1ms
  - Rate limiter sur endpoint join

- **Frontend (enseignant) :**
  - Page "Gestion des Étudiants" avec upload zone (drag & drop)
  - Preview tableau avec colonnes détectées
  - Correction manuelle avant validation
  - Gestion multi-groupes (créer, sélectionner, réutiliser)

- **Frontend (étudiant) :**
  - Modification formulaire join : vérification matricule → message explicite si refus
  - Affichage avertissement si nom ≠ matricule

---

### RF-03 — Gestion des Épreuves & Banque de Questions
**Statut : ✅ 85% implanté**

| Exigence CDC | Statut | Détails |
|---|---|---|
| Upload fichiers (PDF, DOCX, images) | ✅ | Supabase Storage |
| Éditeur en ligne avancé pour exercices | ✅ | RichEditor dans ExerciseBank |
| Support symboles mathématiques | ✅ | LaTeX via éditeur |
| Organisation par notion, niveau, matière | ✅ | Difficulté, subject, exercise_type |
| Paramétrage nombre de variantes | ✅ | Variants CRUD |
| Bibliothèque de questions réutilisable | ✅ | Par teacher, listable |

**À compléter :**
- Organisation par notion (tagging notion) — partiel via subject
- Interface de recherche/filtre plus avancée pour la banque

---

### RF-04 — Configuration et Lancement de Sessions
**Statut : ✅ 90% implanté**

| Exigence CDC | Statut |
|---|---|
| Interface configuration complète | ✅ |
| Matière détermine interface composition | ✅ (texte vs code) |
| Génération N épreuves = N étudiants | ✅ |
| Code de session unique | ✅ (auto-généré) |
| Programmation à l'avance ou immédiat | ✅ (scheduled_start) |
| Tableau de bord suivi temps réel | ✅ (session status) |

**À compléter :**
- Code d'accès session personnalisable (actuellement auto-généré)
- Alerte si nombre matricules importés ≠ student_count

---

### RF-05 — Moteur de Génération Aléatoire Assisté par IA
**Statut : ✅ 80% implanté**

| Exigence CDC | Statut |
|---|---|
| N épreuves uniques depuis M variantes | ✅ |
| Assistance IA pour variantes | ⚠️ Partiel — pas d'IA intégrée dans la génération de variantes |
| Variabilité données numériques | ⚠️ `data_overrides` existe mais pas utilisé par l'IA |
| Attribution aléatoire unique par étudiant | ✅ |
| QCM choix mélangés | ❌ Pas de mélange aléatoire des options QCM |
| Traçabilité étudiant ↔ épreuve ↔ variantes | ✅ (SHA-256) |

**À compléter :**
- IA pour suggérer des variantes supplémentaires (Groq → génération de variantes équivalentes)
- Mélange aléatoire des options QCM
- Utilisation réelle des `data_overrides` pour variabilité numérique

---

### RF-06 — Gestion IA des Dossiers Pédagogiques
**Statut : ❌ 0% implanté**

| Exigence CDC | Statut |
|---|---|
| Organisation et classification automatique des ressources | ❌ |
| Recherche intelligente en langage naturel | ❌ |
| Statistiques automatiques après session (taux réussite, distribution) | ⚠️ Stats basiques présentes dans résultats |
| Suggestions pédagogiques basées sur résultats | ❌ |
| Archivage structuré et sécurisé copies/résultats | ⚠️ Archivé en base mais pas d'interface de consultation historique |
| Détection de doublons | ❌ |
| Rapport de session (incidents sécurité inclus) | ❌ |

**Nouveaux composants nécessaires :**

- **Backend :**
  - Nouveau service `services/document_ai.py` : classification des ressources par matière/motif
  - Endpoint de recherche naturelle : `POST /ai/documents/search`
  - Générateur de rapports de session : `GET /ai/sessions/{id}/report`
  - Détection de doublons dans la banque d'exercices
  - Suggestions pédagogiques : `GET /ai/sessions/{id}/suggestions`

- **Frontend :**
  - Interface de "Dossier Pédagogique" avec vue classifiée automatiquement
  - Barre de recherche en langage naturel
  - Section "Statistiques et Suggestions" dans SessionDetail
  - Rapport de session téléchargeable

---

### RF-07 — Interface de Composition Étudiant (Niveau Microsoft Word)
**Statut : ✅ 85% implanté**

| Exigence CDC | Statut |
|---|---|
| Éditeur texte complet (gras, italique, souligné, barré) | ✅ |
| Polices et tailles | ✅ |
| Alignement, interlignes | ✅ |
| Titres et styles prédéfinis | ✅ |
| Listes à puces et numérotées | ✅ |
| Tableaux (fusion, division, bordures) | ✅ |
| Insertion images | ✅ |
| Éditeur mathématique LaTeX temps réel | ✅ |
| Annuler/Refaire | ✅ |
| Rechercher et remplacer | ⚠️ Recherche uniquement, pas de remplacer |
| Compteur de mots temps réel | ✅ |
| Sauvegarde automatique 30s | ✅ (localStorage) |
| Minuteur visible + alertes | ⚠️ Pas d'alerte SONORE 10min (CDC 7.4.4) |

**À compléter :**
- Alerte sonore + visuelle renforcée 10 minutes avant expiration
- Fonction "Remplacer" dans la recherche
- Barre d'outils adaptée au thème sombre (actuellement thème clair dans la toolbar)

---

### RF-08 — Interface de Composition Informatique/Programmation
**Statut : ⚠️ 15% implanté**

| Exigence CDC | Statut |
|---|---|
| Activation UNIQUEMENT pour matières 'Informatique — Programmation' | ✅ |
| Éditeur Monaco (VS Code engine) | ❌ Textearea simple avec numéros de ligne |
| Coloration syntaxique Python et C | ⚠️ Basique (textarea stylée) |
| Terminal d'exécution isolé/sandboxé | ❌ Endpoints DISABLED (503) |
| Exécution Python 3 avec libs standard | ❌ Désactivé |
| Exécution C via GCC isolé | ❌ Désactivé |
| Sortie stdout/stderr temps réel | ❌ |
| Historique exécutions visible par enseignant | ❌ |
| Disposition : énoncé (gauche) + éditeur (droite) + terminal (bas) | ⚠️ Structure présente mais pas Monaco |
| Thème sombre par défaut | ✅ |

**Nouveaux composants nécessaires :**

- **Frontend :**
  - `@monaco-editor/react` : remplacer CodeEditor actuel
  - Configuration Monaco : langages python+c, thème sombre, minimap, auto-complétion
  - Terminal intégré en bas (xterm.js ou simulation)

- **Backend :**
  - Activer et sécuriser `services/code_executor.py`
  - Architecture de sécurité complète :
    - Docker éphémère par exécution
    - Zero réseau (HTTP/TCP/UDP bloqué)
    - Filesystem restreint (/tmp uniquement)
    - Ressources limitées (0.5 vCPU, 128 Mo RAM, 10s max)
    - Seccomp blocking (fork, exec, network)
    - Isolation totale entre étudiants
  - Endpoint GET `/judge/languages` → retourner langages disponibles
  - Endpoint POST `/judge/run` → exécution avec timeout
  - Stocker historique des exécutions dans la table `submissions` ou nouvelle table `code_executions`
  - Endpoint GET `/grading/submissions/{id}/executions` → historique pour l'enseignant

---

### RF-09 — Sécurité de la Composition (Mode Kiosque)
**Statut : ⚠️ 60% implanté**

| Exigence CDC | Statut |
|---|---|
| Plein écran obligatoire et non bypassable | ✅ |
| Alt+Tab, Cmd+Tab, touche Windows | ⚠️ Intercepté mais peut ne pas fonctionner sur tous les navigateurs |
| Ctrl+Alt+Del | ❌ Non interceptable en navigateur |
| Impression d'écran | ⚠️ Keydown intercepté mais PrintScreen peut contourner |
| F-keys | ⚠️ Escape intercepté, F11 intercepté |
| Désactivation copier-coller externe | ✅ (contextmenu, copy, cut) |
| Desktop (Electron) verrouillage barre des tâches | ⚠️ Adapter existe mais non implémenté |
| Perte de focus → CLÔTURE IMMÉDIATE (sans avertissement) | ❌ Appelle `onExitAttempt` mais CDC dit : IMMÉDIAT sans exception |
| Alerte enseignant + journalisation à chaque tentative | ⚠️ `report_incident` existe mais pas lié au kiosque |
| Terminal ne déclenche pas de clôture | ✅ |

**Critique :** Le CDC est explicite : *"Toute tentative de quitter l'interface de composition entraîne instantanément et irrévocablement la soumission définitive de la copie dans son état courant. Aucun avertissement, aucune seconde chance."* L'implémentation actuelle appelle `onExitAttempt` qui déclenche `handleAutoSubmit` — c'est correct fonctionnellement, mais il faut vérifier qu'il n'y a pas de délai ou de confirmation.

**À compléter :**
- Vérification : supprimer tout délai (`setTimeout` 100ms dans handleWindowBlur) qui pourrait être une faille
- Desktop Electron : verrouillage complet via `ElectronKioskAdapter`
- Alerte enseignant automatique à chaque tentative de sortie
- Journalisation horodatée de chaque incident kiosque

---

### RF-10 — Correction Manuelle & Notation par l'Enseignant
**Statut : ✅ 75% implanté**

| Exigence CDC | Statut |
|---|---|
| Correction EXCLUSIVEMENT par l'enseignant | ✅ |
| Vue côte-à-côte (copie / épreuve de référence) | ✅ |
| Outils d'annotation (commentaires inline, surlignage, corrections textuelles) | ⚠️ Commentaires texte seulement |
| Saisie note finale selon système configuré | ✅ |
| Commentaire global pédagogique | ✅ |
| Navigation entre copies (précédent/suivant) | ❌ Pas d'interface de navigation séquentielle |
| Correction de code (vue syntaxe + historique exécutions) | ❌ Vue texte seulement |
| Validation et publication groupée/individuelle | ⚠️ Publication non implémentée côté frontend |
| Barème points par exercice (Ex1/8 + Ex2/12) | ❌ Note globale seulement |

**À compléter :**
- Outils d'annotation inline (surlignage, barré) sur la copie étudiante
- Navigation type "copie précédente / suivante" avec raccourcis clavier
- Vue spécifique code avec coloration syntaxique + historique des exécutions
- Publication groupée des notes (visible par les étudiants)
- Barème détaillé par exercice

---

### RF-11 — Scalabilité & Performance
**Statut : ⚠️ 40% implanté**

| Exigence CDC | Statut |
|---|---|
| Nombre illimité enseignants/sessions | ⚠️ Architecture Supabase scalable mais pas de sharding |
| Auto-scaling horizontal | ❌ Monolithe FastAPI, pas de K8s |
| Message queue pour génération épreuves | ❌ Traitement synchrone |
| Sandboxes Docker dynamiques | ❌ Code executor désactivé |
| PostgreSQL réplication + sharding | ⚠️ Supabase gère la réplication |
| Redis pour cache sessions actives | ⚠️ Remplacé par table `app_cache` (plus lent) |

**À compléter :**
- File d'attente asynchrone (Redis Queue / Celery) pour génération d'épreuves
- Cache Redis dédié (remplacer `app_cache` Supabase)
- Tests de charge (10 000 utilisateurs simultanés)
- Optimisation des requêtes N+1 dans la liste des soumissions

---

## Plan d'Implémentation par Priorité

### Priorité Critique (CDC v2.2 blocker)
1. **RF-02 : Import de liste et vérification matricule** — 2 sprints
2. **RF-08 : Éditeur Monaco + sandbox** — 2 sprints

### Priorité Haute
3. **RF-09 : Renforcement kiosque (clôture immédiate, Electron)** — 1 sprint
4. **RF-10 : Outils d'annotation correction** — 1 sprint

### Priorité Moyenne
5. **RF-06 : Gestion IA dossiers** — 2 sprints
6. **Alertes sonores + UX student** — 1 sprint

### Priorité Faible
7. **RF-11 : Scalabilité (queue, cache, sharding)** — 1 sprint
8. **Tests, docs, déploiement** — 1 sprint

---

## Matrice des Dépendances

```
RF-02 (Import Listes)       ← RF-01 (Auth) — compte enseignant existant
RF-04 (Sessions)            ← RF-02 — utilise la liste importée
RF-05 (Génération)          ← RF-03 + RF-04 — exercices + session
RF-07 (Éditeur Texte)       ← RF-04 — session configurée
RF-08 (Éditeur Code)        ← RF-04 — session configurée
RF-09 (Kiosque)             ← RF-07/RF-08 — wrapper de composition
RF-10 (Correction)          ← RF-04 + RF-07/RF-08 — copies soumises
RF-06 (Dossiers IA)         ← RF-03 + RF-04 + RF-10 — besoin du contenu
```

---

## Métriques de Suivi

| Métrique | Objectif |
|---|---|
| % exigences RF couvertes | 100% d'ici sprint 6 |
| Tests unitaires | > 80% coverage |
| Tests de pénétration | 0 fail critique |
| Temps génération 100 épreuves | < 10s |
| Temps réponse API (95%) | < 200ms |
| Utilisateurs simultanés | 10 000+ |
