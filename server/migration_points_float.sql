-- ============================================================
-- MIGRATION : points -> NUMERIC (float) pour accepter les decimales
-- Les colonnes INTEGER ne permettent pas 6.67, 13.33 etc.
-- ============================================================

-- 1. exercises.points
ALTER TABLE exercises
    ALTER COLUMN points TYPE NUMERIC(6,2);

-- 2. session_exercises.points_override
ALTER TABLE session_exercises
    ALTER COLUMN points_override TYPE NUMERIC(6,2);

-- ============================================================
-- La colonne points dans le JSON de generated_exams.content
-- est deja stockee en JSON (texte). Aucun changement necessaire.
-- ============================================================
