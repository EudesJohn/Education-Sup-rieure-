# Guide d'Utilisation — PEAN (Plateforme d'Évaluation Académique Numérique)

> **Version 1.0** — Juillet 2026

## Table des matières

1. [Introduction](#introduction)
2. [Rôles et accès](#rôles-et-accès)
3. [Guide Étudiant](#guide-étudiant)
4. [Guide Enseignant](#guide-enseignant)
5. [Guide Administrateur](#guide-administrateur)
6. [Dépannage](#dépannage)

---

## Introduction

**PEAN** est une plateforme de gestion d'examens et d'évaluations académiques destinée aux universités et établissements d'enseignement supérieur. Elle permet de :

- Créer des sessions d'examen avec des **copies uniques par étudiant** (variantes aléatoires)
- Générer automatiquement des **QCM avec variantes** via l'intelligence artificielle
- Corriger les copies de manière **assistée par IA** (Groq / Llama)
- Gérer la **hiérarchie pédagogique** : institutions → filières → années → niveaux → classes
- Exporter les résultats (CSV, Excel, PDF)

---

## Rôles et accès

| Rôle | Accès | Compte permanent ? |
|------|-------|--------------------|
| **Étudiant** | Saisir un code de session → Passer l'examen | Non (session unique) |
| **Enseignant** | Dashboard → Sessions → Exercices → Corrections | Oui (inscription + email) |
| **Administrateur** | Gestion plateforme complète | Oui (promu par un admin) |

---

# Guide Étudiant

L'étudiant **n'a pas besoin de compte**. L'accès se fait uniquement via le code de session fourni par l'enseignant.

## 1. Accéder à l'examen

1. Ouvrez le site PEAN dans votre navigateur
2. Sur la page d'accueil, cliquez sur **"Je suis un étudiant"**
3. Saisissez le **code d'accès** (8 caractères) communiqué par votre enseignant
4. Saisissez votre **nom** et votre **numéro d'étudiant (matricule)**
5. Cliquez sur **"Rejoindre l'examen"**

> ⚠️ Si l'enseignant a configuré une liste d'étudiants, seuls les matricules présents dans cette liste seront acceptés.

## 2. Passer l'examen

Une fois connecté, vous accédez à l'interface d'examen en **mode kiosk** (plein écran verrouillé).

### Types de questions possibles

| Type | Description | Saisie |
|------|-------------|--------|
| **QCM** | Question à choix multiples (A/B/C/D) | Cliquez sur la réponse choisie |
| **Question ouverte** | Rédaction libre | Zone de texte |
| **Exercice de code** | Programmation (Python, JavaScript, Java, C++, etc.) | Éditeur de code intégré |

### Raccourcis clavier en mode kiosk

- `Ctrl+Shift+K` — Quitter le mode plein écran (si autorisé)

### Soumission des réponses

- Les réponses sont **sauvegardées localement** automatiquement
- Cliquez sur **"Soumettre"** pour envoyer votre copie
- Une confirmation s'affiche : votre copie est envoyée

### Minuteur

- La durée de l'examen est affichée dans le coin supérieur droit
- Le temps restant est mis à jour chaque minute
- **Soumission automatique** : si le temps est écoulé, votre copie est soumise automatiquement

## 3. Sécurité

- Toute tentative de **sortir de l'examen** (changer d'onglet, ouvrir une nouvelle fenêtre) est détectée et signalée à l'enseignant
- Les **copies sont uniques** : chaque étudiant reçoit des variantes différentes des mêmes questions
- Un seul onglet par session d'examen est autorisé

---

# Guide Enseignant

## 1. Créer un compte

Pour vous inscrire, vous avez besoin d'un **code d'invitation** fourni par l'administrateur de votre établissement.

1. Sur la page d'accueil, cliquez sur **"Je suis un enseignant"**
2. Cliquez sur **"Créer un compte"**
3. Remplissez le formulaire :
   - **Code d'invitation** (12 caractères — obligatoire)
   - **Nom complet**
   - **Email** (valide — un email de vérification sera envoyé)
   - **Mot de passe** (8 caractères minimum)
   - **Institution** (sélectionnez ou saisissez)
   - **Discipline / Matière**
4. Cliquez sur **"S'inscrire"**
5. Vérifiez votre email en cliquant sur le lien reçu (vérifiez vos spams)

## 2. Se connecter

1. Renseignez votre **email** et **mot de passe**
2. (Optionnel) Si vous avez activé la **double authentification (2FA)**, saisissez le code à 6 chiffres de votre application d'authentification

> 🔒 Après 5 tentatives de connexion échouées, votre compte est verrouillé pendant 15 minutes.

### Double authentification (2FA)

1. Allez dans votre **profil** → **Sécurité**
2. Cliquez sur **"Configurer la 2FA"**
3. Scannez le QR code avec Google Authenticator ou Authy
4. Saisissez le code à 6 chiffres pour confirmer

## 3. Dashboard

Le tableau de bord affiche :
- **Nombre total de sessions** créées
- **Nombre total d'étudiants** évalués
- **Nombre de corrections en attente**
- **Sessions récentes** (clic pour accéder au détail)

## 4. Gestion des sessions

### Créer une session d'examen

1. Allez dans **"Mes sessions"**
2. Cliquez sur **"Nouvelle session"**
3. Remplissez les informations :
   - **Titre** de l'examen/devoir
   - **Type** : Examen | Devoir | Rattrapage | Démo
   - **Durée** en minutes
   - **Barème** : 20, 100, 10, 50, Lettres, ou Personnalisé
   - **Matière**
   - **Date de début programmée** (optionnelle)
4. Cliquez sur **"Créer"**

### Ajouter des exercices

Une fois la session créée (statut **brouillon**), vous pouvez y ajouter des exercices de deux façons :

#### Option A : Génération via IA (QCM / Questions ouvertes / Code)

1. Dans le détail de la session, cliquez sur **"Générer avec l'IA"**
2. Choisissez le mode de saisie :
   - **Texte libre** : collez le contenu de votre cours
   - **Fichier** : téléversez un PDF ou Word (le texte sera extrait automatiquement)
3. Configurez la génération :
   - **Nombre de questions**
   - **Type** : QCM uniquement | Ouvert | Code | Mixte
   - **Barème total**
4. Cliquez sur **"Générer"**
5. L'IA analyse le contenu et produit des questions avec **variantes uniques**
6. Vérifiez et ajustez les questions générées

> 💡 **Fonctionnement des variantes** : Chaque question peut avoir jusqu'à 6 variantes (formulations différentes, données modifiées, ordre des réponses mélangé). Chaque étudiant reçoit une combinaison aléatoire de variantes, garantissant des copies uniques.

#### Option B : Création manuelle

1. Dans le détail de la session, cliquez sur **"Ajouter un exercice"**
2. Remplissez :
   - **Titre** de la question
   - **Instructions** détaillées
   - **Type** : Ouvert, QCM, Numérique, Code
   - **Difficulté** : Facile | Moyen | Difficile
   - **Points**
   - **Réponse correcte** (utilisée pour la correction automatique)
3. Pour un QCM, ajoutez les choix (A/B/C/D) et indiquez la bonne réponse
4. Ajoutez des **variantes manuelles** si souhaité

#### Option C : Import d'une épreuve existante (PDF/Word)

1. Dans le détail de la session, cliquez sur **"Téléverser une épreuve"**
2. Sélectionnez un fichier PDF ou Word
3. L'IA lit le contenu et génère automatiquement des questions avec variantes

### Gérer les étudiants

Avant de lancer une session, vous devez définir la liste des participants.

#### Option 1 : Liste d'étudiants pré-définie

1. Allez dans **"Listes d'étudiants"**
2. Cliquez sur **"Nouvelle liste"**
3. Choisissez :
   - **Import CSV/XLSX** : téléchargez un fichier avec les colonnes Nom, Matricule, Email (optionnel)
   - **Import PDF** : la plateforme extrait les noms et matricules
   - **Saisie manuelle** : ajoutez les étudiants un par un
4. Vérifiez l'aperçu et confirmez la création
5. Associez la liste à une session : **Sessions → Dérouler → "Assigner une liste"**

> 📁 **Format CSV attendu** : `nom,matricule[,email][,classe]` avec ou sans en-têtes.

#### Option 2 : Saisie manuelle pendant la création

Lors de la création d'une session, vous pouvez saisir directement les noms et matricules dans l'interface.

#### Option 3 : Classe pédagogique

Si votre établissement a configuré la hiérarchie (institution → filière → niveau → classe), vous pouvez sélectionner une classe existante.

### Lancer la session

1. Vérifiez que les exercices et la liste d'étudiants sont configurés
2. Cliquez sur **"Lancer la session"**
3. Le statut passe à **"active"**
4. Les étudiants peuvent maintenant rejoindre avec le code d'accès à 8 caractères
5. Un **code secret** (PIN à 6 chiffres par étudiant) peut être généré pour sécuriser l'accès

### Générer les copies

Avant le lancement, cliquez sur **"Générer les copies"** pour :
- Créer une copie unique par étudiant (combinaison aléatoire de variantes)
- Chaque copie a un **hash SHA-256** unique garantissant l'intégrité
- Les copies sont horodatées avec une date d'expiration

### Code PIN par étudiant

Pour renforcer la sécurité :
1. Cliquez sur **"Codes d'accès"** dans le détail de la session
2. Cliquez sur **"Générer les codes PIN"**
3. Chaque étudiant reçoit un code unique à 6 chiffres
4. Exports possibles :
   - **PDF imprimable** avec tous les codes
   - Affichage individuel
5. L'étudiant devra saisir son **matricule + code PIN** pour accéder à l'examen

### Pendant l'examen (session active)

- Les soumissions arrivent en temps réel (WebSocket)
- Vous pouvez voir le statut en direct :
  - 🔵 En attente (pas encore commencé)
  - 🟡 En cours (étudiant en train de composer)
  - 🟢 Soumis (copie reçue)
  - 🔴 Incident (comportement suspect détecté)
- Les tentatives de sortie de l'examen sont signalées instantanément

### Terminer la session

1. Cliquez sur **"Terminer la session"**
2. Les étudiants encore en cours sont automatiquement soumis
3. Le statut passe à **"completed"**
4. Les corrections peuvent commencer

## 5. Correction des copies

### Processus de correction

1. Allez dans la session → onglet **"Corrections"**
2. La liste des soumissions s'affiche avec leur statut

#### Étape 1 : Correction IA (automatique)

1. Cliquez sur **"Corriger tout avec l'IA"** (ou correction individuelle)
2. L'IA analyse chaque copie et attribue :
   - Une **note** sur le barème configuré
   - Un **feedback** détaillé par question
   - Un score de confiance
3. Statut passe à **"Corrigé par IA"**

#### Étape 2 : Révision enseignant

1. Ouvrez une copie corrigée par l'IA
2. Consultez la note IA et le feedback
3. Ajustez si nécessaire (la note finale peut être modifiée)
4. Ajoutez des **annotations** :
   - Cliquez sur un passage pour l'annoter
   - Types : Commentaire, Correction, Surlignage, Remarque, Erreur, Félicitation
   - Associez éventuellement un score partiel
5. Validez la correction en cliquant sur **"Publier"**

#### Grilles d'évaluation (Rubriques)

1. Dans l'onglet **"Rubriques"**, créez une grille d'évaluation
2. Définissez des critères avec barème (ex : "Raisonnement" → 5 pts, "Résultat" → 3 pts)
3. Pendant la correction, utilisez la grille pour attribuer des points par critère

#### Correction des QCM

Pour une correction rapide des QCM uniquement (sans passer par l'IA générale) :
1. Cliquez sur **"Corriger les QCM"**
2. La comparaison automatique réponse attendue vs réponse donnée est effectuée
3. L'analyse globale des réponses par question est disponible

### Résultats

1. Allez dans l'onglet **"Résultats"** de la session
2. Tableau complet avec :
   - Nom, matricule, classe de l'étudiant
   - Note IA, Note enseignant, Note finale
   - Statut de correction
3. **Export** des résultats :
   - CSV (compatible tableur)
   - Excel (.xlsx)
   - PDF

## 6. Bibliothèque de documents pédagogiques

### Téléverser un document

1. Allez dans **"Bibliothèque"**
2. Cliquez sur **"Nouveau document"**
3. Sélectionnez un fichier (PDF, Word, PowerPoint, etc.)
4. L'IA classifie automatiquement le document :
   - **Type** : Cours | TD | TP | Examen | Correction | Référence
   - **Matière** détectée
   - **Niveau** suggéré
   - **Mots-clés** extraits
   - **Résumé** généré
5. Vous pouvez ajuster la classification si nécessaire

### Recherche dans les documents

- Utilisez la **barre de recherche** pour chercher par mot-clé
- Filtrez par : type, matière, niveau
- La recherche plein texte explore le contenu des documents

### Suggestions IA pour une session

1. Ouvrez le détail d'une session
2. Cliquez sur **"Suggestions pédagogiques"**
3. L'IA analyse vos documents et propose :
   - Exercices recommandés
   - Ressources complémentaires
   - Points à aborder

## 7. Exercices de code (Éditeur de code)

### Créer un exercice de code

1. Créez un exercice de type **"Code"**
2. Définissez le **langage** : Python, JavaScript, Java, C++, C, TypeScript, Go, Rust, etc.
3. Rédigez l'énoncé avec des exemples d'entrée/sortie
4. Ajoutez des **cas de test** :
   - Entrée → Sortie attendue
   - Description (optionnelle)
5. L'enseignant peut fournir une **solution de référence**

### Exécution et soumission par l'étudiant

- L'étudiant écrit son code dans l'éditeur intégré
- Peut **exécuter** le code pour tester (mode bac à sable)
- La **soumission** exécute les cas de test et vérifie les résultats
- L'exécution se fait via **Piston API** (sécurisé, timeout 30s)

## 8. Exports

### Exporter les résultats

1. Depuis la session → **"Résultats"**
2. Choisissez le format :
   - **CSV** : pour Excel ou Google Sheets
   - **Excel (.xlsx)** : mise en forme complète
   - **PDF** : tableau imprimable

### Exporter les codes d'accès PIN

1. Dans le détail de la session → **"Codes d'accès"**
2. Cliquez sur **"Exporter en PDF"**
3. Un document imprimable avec tous les codes PIN par étudiant est généré

---

# Guide Administrateur

L'administrateur a accès à **tous les endpoints de gestion** de la plateforme. Ce rôle est attribué par un autre administrateur.

## 1. Accéder à l'administration

1. Connectez-vous avec votre compte enseignant
2. Cliquez sur votre **avatar** → **"Mode Admin"**
3. Le menu d'administration apparaît

## 2. Tableau de bord administration

Vue d'ensemble de la plateforme :
- **Nombre d'enseignants** inscrits
- **Nombre de sessions** créées
- **Nombre d'étudiants** évalués
- **Nombre de corrections** effectuées

## 3. Gestion des enseignants

### Liste des enseignants
- Tableau complet : nom, email, institution, rôle, date d'inscription
- Filtres par institution, rôle, statut de vérification

### Promouvoir un enseignant en administrateur
1. Ouvrez le détail d'un enseignant
2. Cliquez sur **"Promouvoir administrateur"**
3. Confirmez l'action

### Rétrograder un administrateur
1. Ouvrez le détail d'un administrateur
2. Cliquez sur **"Rétrograder en enseignant"**

## 4. Hiérarchie pédagogique

La plateforme gère une hiérarchie complète qui permet de structurer les établissements.

```
🏛️ Institution (Université)
  └─ 📂 Filière (Informatique, Médecine, Droit...)
      └─ 📅 Année académique (2025-2026)
          └─ 📊 Niveau d'étude (L1, L2, L3, M1, M2)
              └─ 🏫 Classe (Groupe A, Groupe B...)
                  └─ 👨‍🎓 Étudiants
```

### Institutions
- **Créer** : Nom de l'institution
- **Modifier** : Renommer
- **Supprimer** : Supprime l'institution (vérifiez qu'elle n'est pas utilisée)

### Filières
- **Créer** : Nom + rattachement à une institution
- **Modifier** : Nom, institution associée
- **Supprimer** : Supprime la filière

### Années académiques
- **Créer** : Nom (ex: "2025-2026"), optionnellement date de début/fin
- **Marquer comme "année en cours"**
- **Modifier / Supprimer**

### Niveaux d'étude
- **Créer** : Nom (ex: "Licence 1", "Master 2", "Doctorat")
- **Modifier / Supprimer**

### Classes
- **Créer** : Nom + Filière + Année académique + Niveau d'étude
- **Gérer les étudiants** :
  - **Ajout manuel** : Nom, matricule, email (optionnel)
  - **Import CSV** : Téléchargement de fichier avec les colonnes nom, matricule
  - **Modifier / Supprimer** un étudiant
- **Affectation** : Les enseignants peuvent sélectionner une classe lors de la création d'une session

## 5. Codes d'invitation

Les codes d'invitation empêchent les inscriptions frauduleuses. **Les enseignants ne peuvent s'inscrire qu'avec un code valide.**

### Générer des codes
1. Allez dans **"Administration" → "Codes d'invitation"**
2. Cliquez sur **"Générer des codes"**
3. Indiquez le **nombre de codes** (max 100 par lot)
4. Choisissez une **date d'expiration** (optionnelle)
5. Cliquez sur **"Générer"**

### Gérer les codes
- **Tableau** : code, date de création, statut (actif/utilisé/révoqué/expiré), utilisateur associé
- **Copier** un code individuellement
- **Copier tout** le lot
- **Révoquer** un code (le rend inutilisable)
- **Supprimer** un code

### Statistiques
- Nombre total de codes générés
- Codes utilisés / disponibles
- Taux d'utilisation

## 6. Audit Logs

Toutes les actions critiques sont enregistrées dans un journal d'audit immuable.

### Consulter les logs
1. Allez dans **"Administration" → "Journal d'audit"**
2. Le tableau affiche :
   - **Date et heure** de l'action
   - **Acteur** (email de l'utilisateur)
   - **Action** (connexion, création, modification, suppression...)
   - **Ressource** concernée
   - **Adresse IP**

### Filtrer les logs
- Par **type d'action**
- Par **acteur**
- Par **ressource**
- Période (date de début / date de fin)

## 7. Gestion des matières (Subjects)

1. Allez dans **"Administration" → "Matières"**
2. **Créer** une matière (nom unique)
3. **Modifier** le nom d'une matière
4. **Supprimer** une matière (vérifiez qu'elle n'est pas utilisée)

## 8. Incidents de sécurité

Consultez les incidents remontés pendant les examens :
1. Allez dans **"Administration" → "Incidents"**
2. Détails : type d'incident, étudiant concerné, session, sévérité
3. Types d'incidents :
   - Changement d'onglet / fenêtre
   - Tentative de sortie de l'examen
   - Comportement suspect détecté

## 9. Sessions (vue globale)

Depuis l'administration, vous pouvez **voir toutes les sessions** de tous les enseignants :
- Filtrage par statut, enseignant, date
- Consultation des détails et résultats
- Actions administratives si nécessaire

---

# Dépannage

## Problèmes courants — Étudiant

| Problème | Solution |
|----------|----------|
| **Code d'accès invalide** | Vérifiez l'orthographe (8 caractères). Contactez votre enseignant. |
| **Matricule non reconnu** | Votre matricule doit correspondre exactement à celui fourni à l'enseignant. |
| **Examen non trouvé** | La session n'a pas encore été lancée ou est déjà terminée. |
| **La page reste bloquée** | Rafraîchissez la page et rejoignez à nouveau. |
| **Soumission échouée** | Vérifiez votre connexion internet. Si le problème persiste, contactez l'enseignant. |

## Problèmes courants — Enseignant

| Problème | Solution |
|----------|----------|
| **Erreur lors de l'inscription** | Vérifiez votre code d'invitation. Contactez l'administrateur si nécessaire. |
| **Email de vérification non reçu** | Vérifiez vos spams. Cliquez sur "Renvoyer" après connexion. |
| **Mot de passe oublié** | Cliquez sur "Mot de passe oublié" sur la page de connexion. |
| **Compte verrouillé** | Attendez 15 minutes (déverrouillage automatique). |
| **L'IA ne génère pas de questions** | Le contenu est peut-être trop court ou trop long (limite 4000 caractères). Essayez avec un texte plus concis. |
| **Erreur "413 Payload Too Large"** | Le contenu fourni dépasse la limite. Découpez en plusieurs parties. |
| **Les étudiants ne voient pas l'examen** | Vérifiez que la session est au statut "active". |
| **Les copies ne se génèrent pas** | Vérifiez qu'une liste d'étudiants est associée à la session. |

## Problèmes courants — Administrateur

| Problème | Solution |
|----------|----------|
| **Impossible de promouvoir un enseignant** | Vérifiez que l'enseignant a vérifié son email. |
| **Code d'invitation invalide** | Générez un nouveau code depuis l'administration. |
| **Les codes d'invitation ne s'affichent pas** | Rafraîchissez la page. |

## Support technique

En cas de problème persistant :
- Contactez l'administrateur de votre établissement
- Consultez les logs d'audit dans l'interface d'administration

---

*Document généré le 16 juillet 2026 — PEAN v1.0*
