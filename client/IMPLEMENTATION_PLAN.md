# PEAN — Plan d'Implémentation Détaillé CDC v2.2

**Version :** 1.0 — 15 Juin 2026
**Objectif :** Mise en conformité complète avec le Cahier des Charges v2.2
**Phases :** 8 phases, 6 sprints estimés

---

## Phase 0 — Infrastructure Préalable (Sprint 1)

### 0.1 Schéma Base de Données

**Nouvelle table : `student_lists`**
```sql
CREATE TABLE student_lists (
    id BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                    -- Nom de la liste (ex: "L2 Maths 2025-26")
    groupe TEXT,                           -- Groupe optionnel
    original_filename TEXT,                -- Fichier source importé
    file_type TEXT NOT NULL DEFAULT 'csv', -- pdf / xlsx / csv
    student_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- active / archived
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_student_lists_teacher ON student_lists(teacher_id);
```

**Nouvelle table : `student_list_entries`**
```sql
CREATE TABLE student_list_entries (
    id BIGSERIAL PRIMARY KEY,
    list_id BIGINT NOT NULL REFERENCES student_lists(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    student_number TEXT NOT NULL,
    email TEXT,
    class_name TEXT,
    row_index INTEGER NOT NULL,           -- Ordre dans le fichier
    UNIQUE(list_id, student_number)
);
CREATE INDEX idx_student_entries_list ON student_list_entries(list_id);
CREATE INDEX idx_student_entries_number ON student_list_entries(student_number);
```

**Nouvelle table : `audit_logs`** (pour RF-01 audit trail)
```sql
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_type TEXT NOT NULL,              -- 'teacher' / 'student' / 'admin' / 'system'
    actor_id BIGINT,
    action TEXT NOT NULL,                  -- 'login' / 'join_session' / 'submit' / 'exit_kiosk' / etc.
    resource_type TEXT NOT NULL,           -- 'session' / 'submission' / 'account' / etc.
    resource_id BIGINT,
    details TEXT,                          -- JSON libre
    ip_address TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_actor ON audit_logs(actor_type, actor_id);
```

**Modification de `exam_sessions` :**
```sql
ALTER TABLE exam_sessions ADD COLUMN student_list_id BIGINT REFERENCES student_lists(id);
ALTER TABLE exam_sessions ADD COLUMN access_code_custom BOOLEAN DEFAULT FALSE;
```

**Modification de `generated_exams` :**
```sql
ALTER TABLE generated_exams ADD COLUMN student_name TEXT;  -- Pour archivage
```

**Nouvelle table : `code_executions`** (pour historique RF-08)
```sql
CREATE TABLE code_executions (
    id BIGSERIAL PRIMARY KEY,
    submission_id BIGINT REFERENCES submissions(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    language TEXT NOT NULL,
    stdout TEXT,
    stderr TEXT,
    exit_code INTEGER,
    time_seconds REAL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_code_exec_submission ON code_executions(submission_id);
```

---

### 0.2 Mise à Jour core/db.py

Nouvelles fonctions à ajouter :
- `create_student_list(data)` / `get_student_list(id)` / `get_teacher_lists(teacher_id)` / `update_student_list`
- `create_list_entry(entries: list[dict])` / `get_list_entries(list_id)` / `get_student_by_matricule(list_id, matricule)`
- `get_session_active_list(session_id)` / `set_session_list(session_id, list_id)`
- `create_audit_log(data)` / `query_audit_logs(filters)`
- `create_code_execution(data)` / `get_submission_executions(submission_id)`

---

## Phase 1 — Import Liste Étudiants & Vérification Matricule (Sprint 1-2)

### 1.1 Backend — Service d'Import

**Nouveau fichier : `server/services/student_list_parser.py`**

```python
class StudentListParser:
    """
    Parse les fichiers d'import (PDF, XLSX, CSV) et détecte
    automatiquement les colonnes Nom, Prénom, Matricule.
    """
    SUPPORTED_FORMATS = ['pdf', 'xlsx', 'csv']
    
    def parse(self, file: UploadFile) -> ImportResult:
        # 1. Détecter le format
        # 2. Extraire le contenu structuré
        # 3. Détection heuristique des colonnes :
        #    - 'nom' / 'name' / 'names' / 'prenom' / 'prénom' / 'first_name'
        #    - 'matricule' / 'matricule' / 'id' / 'student_id' / 'number' / 'numéro'
        # 4. Retourner ImportResult avec les données parsées + scores de confiance
        pass
    
    def detect_columns(self, headers: list[str]) -> ColumnMapping:
        # Mapping heuristique : chaque colonne détectée avec score de confiance
        pass
    
    def parse_csv(self, content: str) -> list[dict]:
        # csv.DictReader avec détection du délimiteur (; ou ,)
        pass
    
    def parse_xlsx(self, content: bytes) -> list[dict]:
        # openpyxl : lire la première feuille, première ligne = headers
        pass
    
    def parse_pdf(self, content: bytes) -> list[dict]:
        # pypdf / tabula-py : extraire tableau structuré du PDF
        pass
```

**Nouveau fichier : `server/api/students/router.py`** (extension)

À AJOUTER aux endpoints existants :
```python
# Import de liste
POST /api/teacher/student-lists/upload        # Upload fichier → parse + preview
POST /api/teacher/student-lists/validate       # Valider et sauvegarder la liste
GET  /api/teacher/student-lists                # Lister les listes de l'enseignant
GET  /api/teacher/student-lists/{id}           # Détail d'une liste (entrées)
DELETE /api/teacher/student-lists/{id}         # Supprimer une liste
PUT  /api/teacher/student-lists/{id}           # Modifier une entrée individuelle

# Lien liste → session
POST /api/teacher/sessions/{id}/assign-list    # Associer une liste à une session
GET  /api/teacher/sessions/{id}/list-status    # Vérifier cohérence liste vs config
```

**Modification : `server/api/students/router.py` — `join_session`**

Remplacer la vérification actuelle par :
```python
@router.post("/sessions/{code}/join")
async def join_session(code: str, data: StudentJoin, request: Request):
    code_upper = code.upper()
    session = get_session_by_code(code_upper)
    if not session:
        raise HTTPException(404, "Session introuvable")
    
    # VÉRIFICATION MATRICULE vs LISTE OFFICIELLE (NOUVEAU)
    list_id = session.get("student_list_id")
    if list_id:
        entry = get_student_by_matricule(list_id, data.student_number)
        if not entry:
            # Journaliser la tentative frauduleuse
            create_audit_log({
                "actor_type": "student", "action": "matricule_rejected",
                "resource_type": "session", "resource_id": session["id"],
                "details": {"student_number": data.student_number, "reason": "not_in_list"},
                "ip_address": request.client.host,
            })
            # Notifier l'enseignant (WebSocket)
            await event_bus.publish(f"teacher:{session['teacher_id']}", {
                "type": "matricule_alert",
                "student_name": data.student_name,
                "student_number": data.student_number,
                "reason": "Matricule non reconnu dans la liste officielle",
            })
            raise HTTPException(403, "Matricule non reconnu. Contactez votre enseignant.")
        
        # Vérification cohérence nom/matricule
        if entry["student_name"].lower() != data.student_name.strip().lower():
            await event_bus.publish(f"teacher:{session['teacher_id']}", {
                "type": "name_mismatch_alert",
                "student_name": data.student_name,
                "expected_name": entry["student_name"],
                "student_number": data.student_number,
            })
            # Option: avertir mais laisser passer (configurable par l'enseignant)
    
    # Rate limiting (NOUVEAU)
    ip_key = f"join_attempt:{request.client.host}:{code_upper}"
    attempts = await cache.incr(ip_key, ttl=300)  # 5 min window
    if attempts > 3:
        raise HTTPException(429, "Trop de tentatives. Réessayez dans 5 minutes.")
    
    # Vérification matricule déjà utilisé
    student_hash = _hash_student(session["id"], data.student_number)
    if await cache.has_exam_lock(student_hash):
        raise HTTPException(409, "Ce matricule est déjà en cours d'utilisation.")
    
    # ... suite du flow existant (vérification session, attribution épreuve)
```

### 1.2 Frontend — Interface Import Liste

**Nouveau fichier : `client/src/pages/teacher/StudentListManager.tsx`**

Composant de gestion des listes avec :
1. **Zone de dépôt** (drag & drop) pour fichier CSV/XLSX/PDF
2. **Tableau de prévisualisation** après parsing :
   - En-têtes détectées avec sélecteur de correspondance
   - Lignes affichées (max 50 en preview)
   - Erreurs de parsing surlignées
3. **Validation et enregistrement** :
   - Détection des doublons de matricule
   - Confirmation du nombre d'entrées
4. **Gestion multi-listes** :
   - Liste des listes sauvegardées
   - Réutilisation entre sessions
   - Archivage

**Modification : `client/src/pages/teacher/TeacherSessions.tsx`**
- Ajouter dans le formulaire de création : sélection de liste importée
- Nouveau champ de configuration : "Charger une liste d'étudiants"

**Nouveau fichier : `client/src/pages/teacher/StudentListImport.tsx`**
Composant d'import étape par étape :
1. Upload fichier (drag & drop + sélecteur)
2. Review colonnes détectées
3. Preview des données
4. Validation finale

**Modification : `client/src/App.tsx`**
- Ajouter routes : `/teacher/students`, `/teacher/students/import`, `/teacher/students/lists/:id`

---

## Phase 2 — Éditeur Monaco & Sandbox Code (Sprint 2-3)

### 2.1 Frontend — Monaco Editor

**Modification : `client/src/components/CodeEditor.tsx`**

Remplacer le textarea par `@monaco-editor/react` :
```tsx
import Editor from '@monaco-editor/react';

function CodeEditor({ value, onChange, language, height = '400px' }) {
  return (
    <Editor
      height={height}
      language={language === 'c' ? 'c' : 'python'}
      theme="vs-dark"
      value={value}
      onChange={(val) => onChange(val || '')}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 4,
        renderWhitespace: 'selection',
        padding: { top: 16, bottom: 16 },
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
      }}
    />
  );
}
```

Ajouter `@monaco-editor/react` aux dépendances.

**Modification : `client/src/components/CodeEditor.tsx`** — intégration du terminal
- Ajouter un panneau redimensionnable en bas : `ExecConsole` amélioré
- Utiliser xterm.js pour un vrai terminal (optionnel, peut rester en div stylée)

**Modification : `client/src/components/CodeEditor.tsx`** — structure de l'interface
- Panneau gauche : énoncé (lecture seule) — déjà présent dans StudentExam
- Panneau droit : éditeur Monaco + terminal en bas
- Boutons Exécuter / Tester dans la barre d'outils entre éditeur et terminal

### 2.2 Backend — Activation Code Executor

**Modification : `server/services/code_executor.py`** — renforcement sécurité

Reactiver les endpoints avec l'architecture sandbox :
```python
class CodeExecutor:
    """Exécution de code dans un sandbox Docker sécurisé."""
    
    DOCKER_IMAGE_PYTHON = "pean-sandbox-python:latest"
    DOCKER_IMAGE_C = "pean-sandbox-c:latest"
    
    MAX_CPU = 0.5        # vCPU
    MAX_MEMORY = "128m"   # RAM
    MAX_TIME = 10         # secondes
    MAX_STDIN = 1024      # bytes
    
    async def execute(self, code: str, language: str, stdin: str = "") -> CodeResult:
        """Exécute le code dans un conteneur éphémère."""
        # 1. Écrire le code dans un fichier temporaire
        # 2. Lancer le conteneur Docker :
        #    - --rm (auto-destruction)
        #    - --network none (zero réseau)
        #    - --read-only (filesystem lecture seule sauf /tmp)
        #    - --cpus 0.5 --memory 128m
        #    - --security-opt seccomp=seccomp-profile.json
        #    - Timeout 10s
        # 3. Capturer stdout/stderr/exit_code
        # 4. Détruire le conteneur
        # 5. Retourner CodeResult
        pass
    
    def _prepare_dockerfile(self, language: str) -> str:
        """Génère le Dockerfile pour le langage cible."""
        dockerfiles = {
            "python": """
                FROM python:3.12-slim
                RUN adduser --disabled-password --gecos '' pean
                USER pean
                COPY script.py /tmp/script.py
                WORKDIR /tmp
                ENTRYPOINT ["python3", "script.py"]
            """,
            "c": """
                FROM gcc:13-bookworm
                RUN adduser --disabled-password --gecos '' pean
                USER pean
                COPY script.c /tmp/script.c
                WORKDIR /tmp
                RUN gcc -o /tmp/prog script.c 2>/tmp/compile_err.txt; \\
                    if [ -f /tmp/prog ]; then echo "OK"; else cat /tmp/compile_err.txt; fi
                ENTRYPOINT ["/tmp/prog"]
            """,
        }
        return dockerfiles.get(language, dockerfiles["python"])
```

**Modification : `server/api/judge/router.py`** — REACTIVER les endpoints

```python
@router.post("/run")
async def run_code(data: CodeRunRequest):
    """Exécute du code dans un sandbox sécurisé."""
    executor = CodeExecutor()
    result = await executor.execute(
        code=data.code,
        language=data.language,
        stdin=data.stdin or "",
    )
    return result

@router.post("/submit")
async def submit_code(data: CodeSubmitRequest):
    """Soumet du code avec tests (lié à une soumission existante)."""
    executor = CodeExecutor()
    results = []
    for tc in data.test_cases:
        result = await executor.execute(data.code, data.language, tc.input)
        results.append({
            "input": tc.input,
            "expected_output": tc.expected_output,
            "actual_output": result.stdout,
            "passed": result.stdout.strip() == tc.expected_output.strip(),
            "error": result.stderr if result.exit_code != 0 else None,
        })
    
    # Sauvegarder l'historique si submission_id fourni
    if data.submission_id:
        create_code_execution({
            "submission_id": data.submission_id,
            "code": data.code,
            "language": data.language,
            "stdout": "\n".join(r.get("actual_output", "") for r in results),
            "exit_code": 0,
        })
    
    passed = sum(1 for r in results if r["passed"])
    return {
        "passed": passed,
        "total": len(results),
        "results": results,
    }
```

**Nouveau fichier : `server/sandbox/seccomp-profile.json`**
Profil seccomp bloquant les appels systèmes dangereux :
```json
{
    "defaultAction": "SCMP_ACT_ALLOW",
    "architectures": ["SCMP_ARCH_X86_64"],
    "syscalls": [
        {"names": ["clone", "fork", "vfork"], "action": "SCMP_ACT_KILL"},
        {"names": ["socket", "connect", "bind", "listen", "accept"], "action": "SCMP_ACT_KILL"},
        {"names": ["ptrace", "perf_event_open", "bpf"], "action": "SCMP_ACT_KILL"},
        {"names": ["mount", "umount", "umount2"], "action": "SCMP_ACT_KILL"},
        {"names": ["reboot", "swapon", "swapoff"], "action": "SCMP_ACT_KILL"}
    ]
}
```

**Nouveau fichier : `server/sandbox/Dockerfile.sandbox-python`**
**Nouveau fichier : `server/sandbox/Dockerfile.sandbox-c`**

---

## Phase 3 — Renforcement Kiosque (Sprint 3)

### 3.1 Modification : `client/src/components/KioskMode.tsx`

```tsx
// CHANGEMENTS CRITIQUES :
// 1. SUPPRIMER le setTimeout(100ms) dans handleWindowBlur — pas de délai
// 2. AJOUTER : interception PrintScreen via API de presse-papier
// 3. AJOUTER : surveillance des dimensions de fenêtre (redimensionnement suspect)
// 4. AJOUTER : rapport incident automatique via endpoint /student/incident

const handleWindowBlur = useCallback(() => {
    if (!enabled || exitTriggered.current) return;
    // SUPPRIMÉ : setTimeout — déclencher IMMÉDIATEMENT
    triggerExit();
    // CDC: "toute perte de focus déclenche la clôture — sans exception"
}, [enabled, triggerExit]);

// NOUVEAU : Surveillance des dimensions de fenêtre
useEffect(() => {
    if (!enabled) return;
    const handleResize = () => {
        // Si la fenêtre n'est pas en plein écran, c'est une tentative de sortie
        if (!document.fullscreenElement && !exitTriggered.current) {
            triggerExit();
        }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
}, [enabled, triggerExit]);
```

### 3.2 Modification : `client/src/components/ElectronKioskAdapter.tsx`

Implémenter le verrouillage complet pour l'application Desktop :
```typescript
interface KioskConfig {
    taskbarLocked: boolean;
    altF4blocked: boolean;
    ctrlAltDelBlocked: boolean;  // Note: limité par l'OS
    taskManagerDisabled: boolean;
    printScreenBlocked: boolean;
}

// Utiliser contextBridge + ipcRenderer pour communiquer avec le main process Electron
// Dans le main process :
//   - Définir kioskMode sur la fenêtre (fullscreen, frame: false)
//   - Intercepter les raccourcis système via globalShortcut
//   - Bloquer le menu contextuel natif
//   - Désactiver le gestionnaire de tâches via les API système
```

### 3.3 Rapport Incident Automatique

**Modification : `client/src/components/KioskMode.tsx`** — reporter automatiquement les tentatives
```tsx
const handleExitAttempt = useCallback(async () => {
    if (exitTriggered.current) return;
    exitTriggered.current = true;
    
    // Reporter l'incident automatiquement
    try {
        await api.post('/student/incident', {
            session_code: sessionCode,
            student_number: studentNumber,
            incident_type: 'kiosk_exit_attempt',
            severity: 'high',
            details: 'Tentative de sortie du mode kiosque détectée',
        });
    } catch {}
    
    // Puis déclencher la soumission
    onExitAttempt();
}, [onExitAttempt, sessionCode, studentNumber]);
```

---

## Phase 4 — Gestion IA Dossiers Pédagogiques (Sprint 3-4)

### 4.1 Nouveau fichier : `server/services/document_ai.py`

```python
class DocumentAIService:
    """Service de gestion IA des dossiers pédagogiques."""
    
    async def classify_resource(self, resource: dict) -> ClassificationResult:
        """Classe automatiquement une ressource par matière/niveau/type."""
        pass
    
    async def natural_language_search(self, teacher_id: int, query: str) -> list[SearchResult]:
        """Recherche en langage naturel dans les ressources."""
        pass
    
    async def generate_session_report(self, session_id: int) -> SessionReport:
        """Génère un rapport de session complet."""
        pass
    
    async def detect_duplicates(self, teacher_id: int, exercise_id: int) -> list[DuplicateResult]:
        """Détecte les exercices similaires dans la banque."""
        pass
    
    async def pedagogical_suggestions(self, session_id: int) -> list[Suggestion]:
        """Suggère des axes d'amélioration basés sur les résultats."""
        pass
    
    async def generate_session_statistics(self, session_id: int) -> SessionStats:
        """Analyse complète : taux réussite, distribution, questions échouées."""
        pass
```

### 4.2 Nouveaux Endpoints API
```
POST /ai/resources/classify
POST /ai/resources/search?q=...
GET  /ai/sessions/{id}/report
GET  /ai/sessions/{id}/stats
GET  /ai/exercises/{id}/duplicates
GET  /ai/sessions/{id}/suggestions
```

### 4.3 Nouveau module Frontend

**Nouveau fichier : `client/src/pages/teacher/PedagogicalFolder.tsx`**
- Vue classifiée des ressources
- Barre de recherche naturelle
- Section rapports de session

**Nouveau fichier : `client/src/pages/teacher/SessionReport.tsx`**
- Rapport complet avec statistiques
- Graphiques de distribution
- Historique des incidents
- Suggestions pédagogiques

---

## Phase 5 — Correction & Annotation (Sprint 4)

### 5.1 Modification : `client/src/pages/teacher/CorrectionPage.tsx`

- Ajouter des outils d'annotation directement sur la copie étudiante :
  ```tsx
  // Surlignage : sélection de texte → popup d'annotation
  // Barré : pour les erreurs
  // Commentaires inline : cliquer sur un passage → ajouter commentaire
  
  interface Annotation {
      id: string;
      type: 'highlight' | 'strikethrough' | 'comment';
      start: number;      // offset dans le texte
      end: number;
      text?: string;      // comment text
      color?: string;     // couleur de surlignage
      author: 'teacher';
      created_at: string;
  }
  ```

- Ajouter la navigation séquentielle :
  ```tsx
  // Flèches clavier (← →) ou boutons pour passer à la copie suivante/précédente
  // Barre de progression : "Copie 3/25"
  ```

- Vue spécifique code :
  ```tsx
  // Afficher le code avec coloration syntaxique Monaco (lecture seule)
  // Afficher l'historique des exécutions (tableau des runs)
  // Timeline des executions avec résultats
  ```

- Barème par exercice :
  ```tsx
  interface PerExerciseScore {
      exercise_id: number;
      exercise_title: string;
      max_points: number;
      awarded_points: number;
      feedback?: string;
  }
  // Somme automatique → note finale
  ```

### 5.2 Modification : `client/src/App.tsx`
- Ajouter route paramétrée pour index de copie : `/teacher/sessions/:sessionId/correction/:submissionId?index=N`

---

## Phase 6 — UX Étudiant (Sprint 5)

### 6.1 Alerte Sonore 10 Minutes

**Modification : `client/src/pages/student/StudentExam.tsx`**
```tsx
// Ajouter un son d'alerte à 10 minutes de la fin
const SOUND_10MIN = '/sounds/warning-chime.mp3';

useEffect(() => {
    if (timeLeft === 600 && !alert10minPlayedRef.current) {  // 10 min = 600s
        alert10minPlayedRef.current = true;
        try {
            const audio = new Audio(SOUND_10MIN);
            audio.play().catch(() => {});  // Ignorer si le navigateur bloque
        } catch {}
    }
}, [timeLeft]);
```

### 6.2 Indicateur Sauvegarde Auto
```tsx
const [lastSaved, setLastSaved] = useState<Date | null>(null);

// Dans l'intervalle d'auto-save (30s)
setLastSaved(new Date());

// Afficher dans la barre de statut
{lastSaved && (
    <span className="text-[10px] text-muted">
        💾 Sauvegardé à {lastSaved.toLocaleTimeString()}
    </span>
)}
```

### 6.3 Améliorations Responsive
- Adapter la vue composition pour tablettes
- Panneau gauche (énoncé) repliable sur mobile
- Barre d'outils responsive

---

## Phase 7 — Infrastructure & Scaling (Sprint 5)

### 7.1 File d'Attente Async
- Ajouter `redis` + `rq` (ou `celery`) pour :
  - Génération d'épreuves en arrière-plan
  - Correction IA batch
  - Rapports de session

### 7.2 Cache Redis Dédié
- Remplacer `app_cache` Supabase par Redis (optionnel : conserver les deux)
- Migrer les fonctions : `cache.get/set/delete` → Redis

### 7.3 Optimisation Requêtes
- Éliminer les requêtes N+1 dans `list_submissions` et `get_session_results`
- Ajouter `JOIN` explicites entre generated_exams → submissions → corrections

---

## Phase 8 — Tests & Documentation (Sprint 6)

### 8.1 Correction Tests Legacy
- Supprimer ou réécrire les tests qui référencent `core.database` et `models.*`
- Migration vers Supabase test (ou mocks)

### 8.2 Nouveaux Tests
- `tests/test_student_list_parser.py` — parsing CSV/XLSX/PDF, détection colonnes
- `tests/test_matricule_verification.py` — vérification, rejet, rate limiting
- `tests/test_code_executor.py` — exécution Python/C, timeout, seccomp (déjà existant mais vide)
- `tests/test_kiosk_hardening.py` — simulations de tentatives de sortie
- `tests/test_document_ai.py` — classification, recherche, suggestions
- `tests/test_audit_logs.py` — journalisation des actions critiques

### 8.3 Tests de Pénétration
- Kiosque : tentative de sortie par tous les moyens connus
- Sandbox : tentative d'accès réseau/système depuis le code exécuté
- Matricule : tentative de falsification ou d'usurpation
- Session : injection, CSRF, replay attacks

### 8.4 Documentation
- Mettre à jour `README.md` avec les nouvelles fonctionnalités
- `GUIDE_ENSEIGNANT.md` : import liste, correction, notation
- `GUIDE_ETUDIANT.md` : identification, composition, soumission
- Documentation API : mettre à jour avec les nouveaux endpoints

---

## Calendrier Estimé

```
Sprint 1 (2 sem) ─┬─ Phase 0 : Infrastructure DB
                   ├─ Phase 1 : Import Listes (parse + preview)
                   └─ Tests : parser + DB

Sprint 2 (2 sem) ─┬─ Phase 1 : Vérification matricule + intégration join
                   ├─ Phase 2 : Monaco Editor frontend
                   └─ Tests : matricule, editor

Sprint 3 (2 sem) ─┬─ Phase 2 : Sandbox backend + activation endpoints
                   ├─ Phase 3 : Renforcement kiosque
                   └─ Tests : sandbox, kiosque

Sprint 4 (2 sem) ─┬─ Phase 4 : IA dossiers pédagogiques (back + front)
                   ├─ Phase 5 : Correction annotations
                   └─ Tests : IA, correction

Sprint 5 (2 sem) ─┬─ Phase 6 : UX étudiant (son, responsive, indicateurs)
                   ├─ Phase 7 : Infrastructure (queue, cache, perf)
                   └─ Tests : charge, performance

Sprint 6 (2 sem) ─┬─ Phase 8 : Tests legacy, pénétration, docs
                   ├─ Déploiement pilote
                   └─ Feedback → ajustements
```

**Jalon clé : Prototype validable avant le 10 Septembre 2026**

---

## Résumé des Nouveaux Fichiers à Créer

| Fichier | Phase | Type |
|---|---|---|
| `server/supabase_schema_v2.sql` | 0 | SQL |
| `server/services/student_list_parser.py` | 1 | Backend |
| `server/services/document_ai.py` | 4 | Backend |
| `server/services/audit_service.py` | 0 | Backend |
| `server/sandbox/seccomp-profile.json` | 2 | Config |
| `server/sandbox/Dockerfile.sandbox-python` | 2 | Docker |
| `server/sandbox/Dockerfile.sandbox-c` | 2 | Docker |
| `client/src/pages/teacher/StudentListManager.tsx` | 1 | Frontend |
| `client/src/pages/teacher/StudentListImport.tsx` | 1 | Frontend |
| `client/src/pages/teacher/PedagogicalFolder.tsx` | 4 | Frontend |
| `client/src/pages/teacher/SessionReport.tsx` | 4 | Frontend |
| `client/src/components/AnnotationToolbar.tsx` | 5 | Frontend |

## Résumé des Fichiers à Modifier

| Fichier | Phase | Changement |
|---|---|---|
| `server/core/db.py` | 0 | + Nouvelles fonctions CRUD |
| `server/supabase_schema.sql` | 0 | + 2 tables, ALTER TABLE |
| `server/api/students/router.py` | 1 | + Vérification matricule, rate limit |
| `server/api/sessions/router.py` | 1 | + Assigner liste à session |
| `server/api/judge/router.py` | 2 | REACTIVER endpoints |
| `server/services/code_executor.py` | 2 | Renforcement sécurité |
| `server/api/grading/router.py` | 5 | + Historique exécutions |
| `client/src/components/KioskMode.tsx` | 3 | Supprimer délai, + resize monitor |
| `client/src/components/ElectronKioskAdapter.tsx` | 3 | Implémentation complète |
| `client/src/components/CodeEditor.tsx` | 2 | Monaco remplace textarea |
| `client/src/pages/student/StudentExam.tsx` | 6 | + Son 10min, + indicateur save |
| `client/src/pages/teacher/CorrectionPage.tsx` | 5 | + Annotations, navigation, barème |
| `client/src/pages/teacher/TeacherSessions.tsx` | 1 | + Sélection liste |
| `client/src/App.tsx` | 1,5 | + Nouvelles routes |
| `client/src/services/api.ts` | 1 | + Nouveaux endpoints API |
| `client/src/types/index.ts` | 1,2 | + Nouveaux types |
