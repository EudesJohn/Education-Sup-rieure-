-- ============================================================
-- PEAN — Migration v8 : Multi-établissements et multi-matières
-- Ajoute des colonnes BIGINT[] pour stocker plusieurs IDs
-- ============================================================

-- ============================================================
-- 1. Ajouter institution_ids et subject_ids à teachers
-- ============================================================
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS institution_ids BIGINT[] DEFAULT '{}';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS subject_ids BIGINT[] DEFAULT '{}';

-- Index GIN pour les recherches sur les tableaux
CREATE INDEX IF NOT EXISTS idx_teachers_institution_ids ON teachers USING GIN(institution_ids);
CREATE INDEX IF NOT EXISTS idx_teachers_subject_ids ON teachers USING GIN(subject_ids);
