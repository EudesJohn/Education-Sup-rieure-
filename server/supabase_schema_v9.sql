-- ============================================================
-- PEAN — Migration v8 → v9 (Types de session)
-- ============================================================

-- 1. Ajouter session_type à exam_sessions
ALTER TABLE exam_sessions
  ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'exam';

CREATE INDEX IF NOT EXISTS idx_exam_sessions_type ON exam_sessions(session_type);

-- ============================================================
-- Row Level Security (mêmes règles)
-- ============================================================
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access" ON exam_sessions
  FOR ALL USING (true) WITH CHECK (true);
