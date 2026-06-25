-- ============================================================
-- MIGRATION : session_exercises
-- Lie les exercices à une session d'examen avec ordre et barème
-- ============================================================

CREATE TABLE IF NOT EXISTS session_exercises (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    exercise_id     BIGINT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    points_override INTEGER,          -- NULL = utiliser le points de l'exercice
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Un même exercice ne peut être ajouté qu'une fois à une session
    UNIQUE(session_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_session_exercises_session
    ON session_exercises(session_id);
CREATE INDEX IF NOT EXISTS idx_session_exercises_order
    ON session_exercises(session_id, sort_order);

ALTER TABLE session_exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON session_exercises;
CREATE POLICY "Service role full access"
    ON session_exercises FOR ALL
    USING (true)
    WITH CHECK (true);
