-- ============================================================
-- PEAN — Migration v2.0 → v2.2 (CDC)
-- Ajoute : student_lists, student_list_entries, audit_logs,
--          code_executions + modifications aux tables existantes
-- ============================================================

-- ============================================================
-- 1. STUDENT_LISTS — Listes officielles importées par l'enseignant
-- ============================================================
CREATE TABLE IF NOT EXISTS student_lists (
    id BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    groupe TEXT,
    original_filename TEXT,
    file_type TEXT NOT NULL DEFAULT 'csv',
    student_count INTEGER NOT NULL DEFAULT 0,
    column_mapping TEXT,  -- JSON: {"nom": "Nom", "prenom": "Prénom", "matricule": "Matricule", ...}
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_lists_teacher ON student_lists(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_lists_status ON student_lists(status);

-- ============================================================
-- 2. STUDENT_LIST_ENTRIES — Lignes individuelles de chaque liste
-- ============================================================
CREATE TABLE IF NOT EXISTS student_list_entries (
    id BIGSERIAL PRIMARY KEY,
    list_id BIGINT NOT NULL REFERENCES student_lists(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    student_number TEXT NOT NULL,
    email TEXT,
    class_name TEXT,
    row_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(list_id, student_number)
);
CREATE INDEX IF NOT EXISTS idx_student_entries_list ON student_list_entries(list_id);
CREATE INDEX IF NOT EXISTS idx_student_entries_number ON student_list_entries(student_number);

-- ============================================================
-- 3. AUDIT_LOGS — Journalisation de toutes les actions critiques
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_type TEXT NOT NULL,
    actor_id BIGINT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id BIGINT,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);

-- ============================================================
-- 4. CODE_EXECUTIONS — Historique des exécutions (RF-08)
-- ============================================================
CREATE TABLE IF NOT EXISTS code_executions (
    id BIGSERIAL PRIMARY KEY,
    submission_id BIGINT REFERENCES submissions(id) ON DELETE CASCADE,
    session_id BIGINT REFERENCES exam_sessions(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    language TEXT NOT NULL,
    stdin TEXT,
    stdout TEXT,
    stderr TEXT,
    exit_code INTEGER,
    time_seconds REAL,
    test_results TEXT,   -- JSON: résultats des tests
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_code_exec_submission ON code_executions(submission_id);
CREATE INDEX IF NOT EXISTS idx_code_exec_session ON code_executions(session_id);

-- ============================================================
-- 5. MODIFICATIONS AUX TABLES EXISTANTES
-- ============================================================

-- Ajouter student_list_id à exam_sessions
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS student_list_id BIGINT REFERENCES student_lists(id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_list ON exam_sessions(student_list_id);

-- Ajouter student_name à generated_exams (pour archivage lisible)
ALTER TABLE generated_exams ADD COLUMN IF NOT EXISTS student_name TEXT;

-- Ajouter student_number à generated_exams (pour archivage lisible)
ALTER TABLE generated_exams ADD COLUMN IF NOT EXISTS student_number TEXT;

-- ============================================================
-- Row Level Security (mêmes règles que v1)
-- ============================================================
ALTER TABLE student_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_list_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON student_lists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON student_list_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON code_executions FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Fonction RPC : incrémentation atomique pour rate limiting
-- ============================================================
CREATE OR REPLACE FUNCTION increment_counter(counter_key TEXT, expiry_seconds INTEGER DEFAULT 300)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_val INTEGER;
BEGIN
    INSERT INTO app_cache (key, value, expires_at)
    VALUES (counter_key, '1', NOW() + (expiry_seconds || ' seconds')::INTERVAL)
    ON CONFLICT (key) DO UPDATE SET
        value = (COALESCE(NULLIF(app_cache.value, ''), '0')::INTEGER + 1)::TEXT,
        expires_at = NOW() + (expiry_seconds || ' seconds')::INTERVAL
    RETURNING COALESCE(NULLIF(value, ''), '0')::INTEGER INTO current_val;
    RETURN current_val;
END;
$$;
