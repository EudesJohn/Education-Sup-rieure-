-- ============================================================
-- CORRECTION DES LINTS SUPABASE (sans casser le fonctionnement)
-- ============================================================
-- Ce script corrige les avertissements de securité sans impact
-- sur le backend : le backend utilise la clé service_role,
-- pas anon/authenticated.
-- ============================================================

-- ============================================================
-- 1. Fix search_path mutable sur les fonctions PL/pgSQL
--    Securise contre les attaques de type "search_path hijack"
-- ============================================================
ALTER FUNCTION public.increment_cache(key_name text) SET search_path = public;
ALTER FUNCTION public.increment_counter(counter_key text, expiry_seconds integer) SET search_path = public;
ALTER FUNCTION public.pedagogical_documents_search_update() SET search_path = public;
ALTER FUNCTION public.update_pedagogical_documents_updated_at() SET search_path = public;
ALTER FUNCTION public.update_correction_annotations_updated_at() SET search_path = public;
ALTER FUNCTION public.update_correction_annotation_count() SET search_path = public;

-- ============================================================
-- 2. Retirer EXECUTE a anon/authenticated sur les fonctions
--    SECURITY DEFINER (le backend utilise service_role,
--    donc ces fonctions restent accessibles au site)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.increment_cache FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_counter FROM anon, authenticated;

-- ============================================================
-- 3. Leaked Password Protection : a activer dans le dashboard
--    Aller dans : Authentication > Settings >
--    "Enable leaked password protection"
--    Ce n'est pas une commande SQL.
-- ============================================================
-- Rien a faire ici, c'est dans l'interface Supabase.

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Pour verifier que les fonctions sont securisees :
--   SELECT proname, proconfig FROM pg_proc WHERE proname IN ('increment_cache', 'increment_counter');
--   SELECT * FROM information_schema.routine_privileges
--   WHERE specific_schema = 'public'
--     AND routine_name IN ('increment_cache', 'increment_counter')
--     AND grantee IN ('anon', 'authenticated');
