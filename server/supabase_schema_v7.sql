-- ============================================================
-- PEAN — Migration v7 : Niveaux d'étude (study_levels)
-- Ajoute : study_levels, study_level_id dans classes
-- ============================================================

-- ============================================================
-- 1. STUDY_LEVELS — Niveaux d'étude (Licence 1, Master 1, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS study_levels (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE study_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON study_levels;
CREATE POLICY "Service role full access" ON study_levels FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Ajouter study_level_id dans classes
-- ============================================================
ALTER TABLE classes ADD COLUMN IF NOT EXISTS study_level_id BIGINT REFERENCES study_levels(id);

CREATE INDEX IF NOT EXISTS idx_classes_study_level ON classes(study_level_id);
