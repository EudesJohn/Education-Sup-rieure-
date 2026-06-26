-- ============================================================
-- PEAN — Migration v9 → v10 (Mode génération IA vs partagé)
-- ============================================================

-- 1. Ajouter exam_mode à exam_sessions
--    "ai_generated" = chaque étudiant a une épreuve unique (variantes)
--    "shared" = tous les étudiants reçoivent le même contenu
ALTER TABLE exam_sessions
  ADD COLUMN IF NOT EXISTS exam_mode TEXT NOT NULL DEFAULT 'ai_generated';

-- ============================================================
-- Row Level Security (mêmes règles)
-- ============================================================
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access" ON exam_sessions
  FOR ALL USING (true) WITH CHECK (true);
