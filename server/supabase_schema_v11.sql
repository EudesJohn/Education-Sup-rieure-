-- ============================================================
-- PEAN — Migration v10 → v11 (exam_mode + migration donnees)
-- ============================================================
-- Execute dans: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Ajouter la colonne exam_mode (actuellement stockee dans grading_details JSON)
ALTER TABLE exam_sessions
  ADD COLUMN IF NOT EXISTS exam_mode TEXT;

-- 2. Migrer les donnees existantes depuis grading_details (JSON) vers exam_mode
UPDATE exam_sessions
  SET exam_mode = (grading_details::json->>'_exam_mode')
  WHERE grading_details IS NOT NULL
    AND grading_details LIKE '{%'
    AND grading_details::json->>'_exam_mode' IS NOT NULL;

-- 3. Pour les sessions sans exam_mode, valeur par defaut
UPDATE exam_sessions
  SET exam_mode = 'ai_generated'
  WHERE exam_mode IS NULL;

-- 4. Rendre NOT NULL apres migration
ALTER TABLE exam_sessions
  ALTER COLUMN exam_mode SET NOT NULL;

ALTER TABLE exam_sessions
  ALTER COLUMN exam_mode SET DEFAULT 'ai_generated';

-- 5. Nettoyer les donnees migrees de grading_details (supprimer _exam_mode)
UPDATE exam_sessions
  SET grading_details = CASE
    WHEN grading_details IS NULL OR grading_details = '' THEN NULL
    ELSE (
      WITH parsed AS (
        SELECT grading_details::json AS j
        WHERE grading_details LIKE '{%'
      )
      SELECT CASE
        WHEN (SELECT j FROM parsed) IS NULL THEN grading_details
        ELSE (
          SELECT json_object_agg(key, value)::text
          FROM json_each((SELECT j FROM parsed))
          WHERE key != '_exam_mode'
        )
      END
    )
  END;

-- ============================================================
-- Verification
-- ============================================================
-- SELECT id, title, exam_mode, grading_details FROM exam_sessions LIMIT 10;

