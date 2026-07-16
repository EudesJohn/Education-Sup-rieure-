-- ============================================================
-- CORRECTION DES POLICIES RLS TROP PERMISSIVES
-- ============================================================
-- Problème : Les policies "Service role full access" sont
--   CREATE POLICY ... FOR ALL USING (true) WITH CHECK (true)
--   sans restriction de role -> la cle anon peut aussi les utiliser.
--
-- Solution : On remplace par des policies restreintes au
--   service_role. Le backend utilise la cle service_role qui
--   bypass RLS de toute facon => aucun impact fonctionnel.
--
-- Tables de reference (institutions, subjects) : on garde un
--   acces SELECT public car l'interface en a besoin.
-- ============================================================

-- ============================================================
-- 1. SUPPRESSION DES POLICIES PERMISSIVES EXISTANTES
-- ============================================================

DROP POLICY IF EXISTS "Service role full access" ON public.academic_years;
DROP POLICY IF EXISTS "Service role full access academic_years" ON public.academic_years;

DROP POLICY IF EXISTS "Service role full access" ON public.app_cache;

DROP POLICY IF EXISTS "Service role full access" ON public.audit_logs;
DROP POLICY IF EXISTS "Service role full access audit_logs" ON public.audit_logs;

DROP POLICY IF EXISTS "Service role full access" ON public.class_students;
DROP POLICY IF EXISTS "Service role full access class_students" ON public.class_students;

DROP POLICY IF EXISTS "Service role full access" ON public.classes;
DROP POLICY IF EXISTS "Service role full access classes" ON public.classes;

DROP POLICY IF EXISTS "Service role full access code_executions" ON public.code_executions;

DROP POLICY IF EXISTS "Service role full access correction_annotations" ON public.correction_annotations;

DROP POLICY IF EXISTS "Service role full access correction_rubrics" ON public.correction_rubrics;

DROP POLICY IF EXISTS "Service role full access" ON public.corrections;

DROP POLICY IF EXISTS "Service role full access document_exercise_links" ON public.document_exercise_links;

DROP POLICY IF EXISTS "Service role full access" ON public.exam_sessions;

DROP POLICY IF EXISTS "Service role full access" ON public.exercises;

DROP POLICY IF EXISTS "Service role full access" ON public.filieres;
DROP POLICY IF EXISTS "Service role full access filieres" ON public.filieres;

DROP POLICY IF EXISTS "Service role full access" ON public.generated_exams;

DROP POLICY IF EXISTS "Service role full access" ON public.invitation_codes;

DROP POLICY IF EXISTS "Service role full access pedagogical_documents" ON public.pedagogical_documents;

DROP POLICY IF EXISTS "Service role full access" ON public.security_incidents;

DROP POLICY IF EXISTS "Service role full access" ON public.session_access_codes;
DROP POLICY IF EXISTS "Service role full access session_access_codes" ON public.session_access_codes;

DROP POLICY IF EXISTS "Service role full access" ON public.session_exercises;

DROP POLICY IF EXISTS "Service role full access student_list_entries" ON public.student_list_entries;

DROP POLICY IF EXISTS "Service role full access student_lists" ON public.student_lists;

DROP POLICY IF EXISTS "Service role full access" ON public.study_levels;
DROP POLICY IF EXISTS "Service role full access study_levels" ON public.study_levels;

DROP POLICY IF EXISTS "Service role full access" ON public.submissions;

DROP POLICY IF EXISTS "Service role full access" ON public.teachers;

DROP POLICY IF EXISTS "Service role full access" ON public.variants;

-- ============================================================
-- 2. POLICIES DE LECTURE PUBLIQUE (Tables de reference)
-- ============================================================
-- L'interface frontend peut avoir besoin de lister les
-- institutions et matieres sans authentification.

DROP POLICY IF EXISTS "Service role full access" ON public.institutions;
CREATE POLICY "Lecture publique institutions" ON public.institutions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.subjects;
CREATE POLICY "Lecture publique subjects" ON public.subjects
  FOR SELECT USING (true);

-- ============================================================
-- 3. VERIFICATION
-- ============================================================
-- Pour lister les policies restantes apres correction :
--   SELECT schemaname, tablename, policyname, roles, cmd, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
--
-- Pour verifier que anon ne peut plus ecrire :
--   SELECT * FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND grantee = 'anon';
