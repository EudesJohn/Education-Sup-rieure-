export const meta = {
  name: "ultra-code-review",
  description: "Review complete du code modifie - securite, correctitude, architecture, fiabilite, performance",
  phases: [
    { title: "Securite" },
    { title: "Correctitude" },
    { title: "Architecture" },
    { title: "Fiabilite" },
    { title: "Performance" },
  ],
}

function makeFindingSchema(extraProps) {
  var props = {
    title: { type: "string" },
    severity: { type: "string" },
    description: { type: "string" },
    recommendation: { type: "string" },
  }
  if (extraProps) {
    for (var k in extraProps) {
      if (extraProps.hasOwnProperty(k)) props[k] = extraProps[k]
    }
  }
  return {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: props,
          required: Object.keys(props),
        },
      },
    },
    required: ["findings"],
  }
}

var secPrompt = [
  "Review de securite des changements dans ce diff PEAN.",
  "",
  "Contexte technique :",
  "- PistonExecutor execute du code etudiant via une API publique gratuite (emkc.org)",
  "- CodeExecutor execute localement en subprocess avec setrlimit/unshare/nobody",
  "- prod sur Vercel: pas de compilateurs natifs, donc Piston pour C/C++/Java/Go/Rust/TS",
  "- PISTON_TIMEOUT=30s, CODE_EXECUTION_MAX_TIME=10s",
  "",
  "Points d'attention specifiques :",
  "1. Piston API envoie le code source brut en HTTP POST - code etudiant part sur service externe. Risques ?",
  "2. Versions epinglees de LANGUAGE_MAP (java 17.0.7, c++ 12.2.0) - fiables ? obsoletes ?",
  "3. should_use_remote() determine local vs distant - contournement possible ?",
  "4. _LANG_EXTENSIONS dans router.py - injection possible ?",
  "5. Pas de cle API Piston - rate limiting, abus, SSRF ?",
  "6. code_executor.py subprocess - fork bomb possible ?",
  "7. Environnement Piston isole ? Que peut faire un etudiant avec bash ou sqlite ?",
  "8. Attaques par version pinning - si Piston supprime version epinglee ?",
  "9. _resolve_language appelle get_settings() a chaque execution - overhead ?",
  "",
  "Pour chaque finding : titre, fichier, ligne approximative, severite (CRITICAL/HIGH/MEDIUM/LOW/INFO), description, recommandation.",
].join("\n")

var bugsPrompt = [
  "Analyse de correctitude et bugs dans le code modifie de PEAN.",
  "",
  "Examine en detail ces chemins d execution :",
  "",
  "1. PistonExecutor.execute():",
  "- signal == SIGKILL and exit_code is None: timeout detecte. Mais si SIGKILL + exit_code != None ?",
  "- compile_data.get(code, 0) != 0: erreur compile. Si compile_data existe et code == 0, ignore compile stdout ?",
  "- run.get(output): quand output est utilise vs stdout ?",
  "- Extraction timing: (data.get(compile) || {}).get(time, 0) || 0 - que si time = 0.0 ?",
  "- _resolve_language: lang.lower() - que si on passe C# ?",
  "",
  "2. PistonExecutor.execute_with_test_cases():",
  "- total_time cumule. Si test #1 prend 61s (timeout -> time_seconds = 30), total_time += 30, pas de skip.",
  "- max_test_cases = min(len(test_cases), 20) - si 0 tests, boucle ne tourne pas.",
  "- expected_output.rstrip() mais pas tc_input.rstrip() - probleme ?",
  "- actual_output = error_out quand error_out defini - stdout partiel perdu ?",
  "",
  "3. list_languages() dans router.py:",
  "- seen set deduplique. Si extensions different entre local et remote pour meme langage ?",
  "- Langages Piston-only inconnus: extension = .txt par defaut.",
  "",
  "4. Route submit_code:",
  "- verify_student_session() etait assigne a exam - maintenant non assigne. Impact ?",
  "- TestResult importe en haut - plus d import differe.",
  "",
  "5. api.ts:",
  "- VITE_API_URL = chaine vide -> fallback pris. OK.",
  "",
  "Trouve bugs, edge cases, differences local vs Piston, incoherences.",
  "Severites: BUG, EDGE_CASE, INCONSISTENCY, INFO.",
].join("\n")

var archPrompt = [
  "Analyse architecturale des changements PEAN.",
  "",
  "Projet: PEAN = Plateforme d Evaluation Academique Numerique",
  "- Backend FastAPI, Frontend React/Vite, DB Supabase",
  "- Execution de code: local (Python/JS) ou distant via Piston API",
  "- Deploiement Vercel (serverless functions)",
  "",
  "Questions :",
  "1. Duplication de logique entre CodeExecutor et PistonExecutor ?",
  "- execute() et execute_with_test_cases() quasi-identiques",
  "- Gestion des resultats (passed/total/results) dupliquee",
  "- Classe abstraite/common possible ?",
  "",
  "2. should_use_remote() - strategie de routage",
  "- Basee sur nom du langage vs REMOTE_ONLY_LANGUAGES",
  "- PISTON_ENABLED=False -> tout en local (meme C/Java)",
  "- Bon niveau de granularite ?",
  "",
  "3. Liste des langages - fusion dans router.py",
  "- seen set deduplique",
  "- Extensions des langages communs depuis LOCAL_LANG_CONFIG",
  "- Piston-only via _LANG_EXTENSIONS ou .txt par defaut",
  "- Logique dans le routeur ou dans un service ?",
  "",
  "4. TestResult import deplace du bas vers le haut - plus propre.",
  "5. PISTON_API_URL = emkc.org - si changement de fournisseur ?",
  "6. httpx.Client() synchrone dans FastAPI async - bloquant ?",
  "7. create_code_execution() try/except log warning - perte silencieuse si DB down ?",
  "",
  "Analyse: forces, faiblesses, recommandations de refactoring.",
  "Categories: DUPLICATION, COUPLING, ABSTRACTION, LAYERING, TESTABILITY",
  "Severites: PRINCIPAL, SECONDARY, STYLE",
].join("\n")

var relPrompt = [
  "Analyse de fiabilite - timeouts, erreurs reseau, degradation gracieuse.",
  "",
  "Contexte:",
  "- Piston API = service TIERS gratuit (emkc.org)",
  "- Vercel maxDuration = 300s pour serverless functions",
  "- PISTON_TIMEOUT = 30s, CODE_EXECUTION_MAX_TIME = 10s",
  "- TOTAL_TIMEOUT_SECONDS = 60 pour execute_with_test_cases via Piston",
  "",
  "Points :",
  "",
  "1. Chaine de timeouts",
  "- PistonExecutor(timeout=30) -> timeout httpx = 35s (timeout + 5)",
  "- TOTAL_TIMEOUT_SECONDS = 60 -> max ~2 appels Piston avant timeout global",
  "- Mais Piston compile_timeout=30000ms ET run_timeout=30000ms",
  "- Test C++: 30s compile + 30s run = 60s par test mais httpx timeout=35s... conflit ?",
  "",
  "2. Degradation Piston",
  "- 429 -> message sans retry",
  "- HTTP 5xx -> message",
  "- TimeoutException -> message",
  "- Exception generique -> str(e)",
  "- En submit si Piston down, l etudiant voit 0/5 sans comprendre ?",
  "",
  "3. execute_with_test_cases retourne: passed, total, results, execution_time",
  "- PAS de cle error globale contrairement a execute()",
  "- Router submit_code: result.get(results, []) - OK avec results vides",
  "",
  "4. PistonExecutor synchrone dans route async",
  "- httpx.Client() (SYNCHRONE) dans FastAPI async",
  "- Bloque l event loop pendant l appel Piston",
  "- Vercel: un seul worker, impact limite",
  "- Dev uvicorn multi-workers: bloque le serveur",
  "",
  "5. Race condition ?",
  "- PistonExecutor instancie par requete - OK",
  "- LANGUAGE_MAP module-level - improbable modification",
  "",
  "Analyse chaque point et donne des recommandations.",
  "Severites: CRITICAL/HIGH/MEDIUM/LOW/INFO",
].join("\n")

var perfPrompt = [
  "Analyse des impacts performance et contraintes Vercel.",
  "",
  "Contraintes Vercel connues:",
  "- maxDuration: 300s sur serverless functions",
  "- PISTON_TIMEOUT = 30s",
  "- Projet a eu des 502 sur upload-exam cause timeouts",
  "",
  "Analyse :",
  "",
  "1. Appels HTTP synchrones bloquants",
  "- httpx.Client() synchrone dans endpoint async FastAPI",
  "- Vercel gere 1 requete a la fois - pas de concurrence",
  "- En local dev uvicorn multi-workers: bloque event loop",
  "- Suggestion: httpx.AsyncClient",
  "",
  "2. Latence Piston par test",
  "- execute_with_test_cases = N appels HTTP individuels",
  "- 20 tests x ~1s = 20s de latence",
  "- Pas de compilation unique + runs multiples comme CodeExecutor",
  "- Piston supporte stdin inline multi-input ?",
  "",
  "3. Cache settings",
  "- get_settings() est @lru_cache() - pas d overhead",
  "- LANGUAGE_MAP lookup O(1) - OK",
  "",
  "4. Erreur 502 potentielle",
  "- Piston 35s+ peut atteindre maxDuration",
  "- TOTAL_TIMEOUT_SECONDS = 60 pour execute_with_test_cases",
  "- Pire cas: 2 tests x 35s = 70s < 300s OK",
  "- Mais 5 tests x 60s = 300s pile ?",
  "",
  "5. Taille payloads",
  "- Code source envoye a Piston sans limite de taille",
  "- Etudiant peut envoyer 10MB -> Piston rejette ou timeout ?",
  "- Aucune validation de taille cote PEAN",
  "",
  "6. Rate limiting Piston",
  "- ~5 req/s selon doc",
  "- 100 etudiants simultanes -> rate limit 429",
  "- 429 gere sans backoff/retry",
  "- Probleme en production multi-classe ?",
  "",
  "Donne recommandations concretes pour production Vercel.",
  "Severites: CRITICAL/HIGH/MEDIUM/LOW/INFO",
].join("\n")

var archSchema = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          severity: { type: "string" },
          category: { type: "string" },
          description: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["title", "severity", "category", "description", "recommendation"],
      },
    },
  },
  required: ["findings"],
}

phase("Securite")
var securityReview = await agent(secPrompt, {
  label: "sec-review",
  phase: "Securite",
  schema: makeFindingSchema(),
})

phase("Correctitude")
var correctnessReview = await agent(bugsPrompt, {
  label: "bugs-review",
  phase: "Correctitude",
  schema: makeFindingSchema(),
})

phase("Architecture")
var architectureReview = await agent(archPrompt, {
  label: "arch-review",
  phase: "Architecture",
  schema: archSchema,
})

phase("Fiabilite")
var reliabilityReview = await agent(relPrompt, {
  label: "reliability-review",
  phase: "Fiabilite",
  schema: makeFindingSchema(),
})

phase("Performance")
var performanceReview = await agent(perfPrompt, {
  label: "perf-review",
  phase: "Performance",
  schema: makeFindingSchema(),
})

var allReviews = await parallel([
  function() { return securityReview },
  function() { return correctnessReview },
  function() { return architectureReview },
  function() { return reliabilityReview },
  function() { return performanceReview },
])

var sec = allReviews[0]
var corr = allReviews[1]
var arch = allReviews[2]
var rel = allReviews[3]
var perf = allReviews[4]

return {
  security: (sec && sec.findings) || [],
  correctness: (corr && corr.findings) || [],
  architecture: (arch && arch.findings) || [],
  reliability: (rel && rel.findings) || [],
  performance: (perf && perf.findings) || [],
  summary: {
    total_findings: ((sec && sec.findings && sec.findings.length) || 0) +
      ((corr && corr.findings && corr.findings.length) || 0) +
      ((arch && arch.findings && arch.findings.length) || 0) +
      ((rel && rel.findings && rel.findings.length) || 0) +
      ((perf && perf.findings && perf.findings.length) || 0),
  },
}
