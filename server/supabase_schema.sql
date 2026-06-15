-- ============================================================
-- PEAN — Schema Supabase (exécuter dans Supabase SQL Editor)
-- Remplace les 8 modèles SQLAlchemy + app_cache
-- ============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. TEACHERS
-- ============================================================
CREATE TABLE IF NOT EXISTS teachers (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    institution TEXT NOT NULL,
    discipline TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    role TEXT NOT NULL DEFAULT 'teacher',
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_2fa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    twofa_secret TEXT,
    login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teachers_email ON teachers(email);

-- ============================================================
-- 2. EXAM_SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_sessions (
    id BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT,
    duration_seconds INTEGER NOT NULL,
    student_count INTEGER NOT NULL,
    grading_system TEXT NOT NULL DEFAULT '20',
    grading_details TEXT,
    correction_mode TEXT NOT NULL DEFAULT 'ai_assisted',
    access_code TEXT UNIQUE NOT NULL,
    auto_submit BOOLEAN NOT NULL DEFAULT TRUE,
    show_results BOOLEAN NOT NULL DEFAULT FALSE,
    scheduled_start TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_teacher ON exam_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON exam_sessions(status);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_access_code ON exam_sessions(access_code);

-- ============================================================
-- 3. EXERCISES
-- ============================================================
CREATE TABLE IF NOT EXISTS exercises (
    id BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'medium',
    instructions TEXT NOT NULL,
    correct_answer TEXT,
    points INTEGER NOT NULL DEFAULT 10,
    exercise_type TEXT NOT NULL DEFAULT 'open',
    language TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exercises_teacher ON exercises(teacher_id);

-- ============================================================
-- 4. VARIANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS variants (
    id BIGSERIAL PRIMARY KEY,
    exercise_id BIGINT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    variant_order INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    data_overrides TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_variants_exercise ON variants(exercise_id);

-- ============================================================
-- 5. GENERATED_EXAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS generated_exams (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    student_id_hash TEXT NOT NULL,
    variant_combo_hash TEXT NOT NULL,
    sha256_hash TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_generated_exams_session ON generated_exams(session_id);
CREATE INDEX IF NOT EXISTS idx_generated_exams_status ON generated_exams(status);
CREATE INDEX IF NOT EXISTS idx_generated_exams_student ON generated_exams(student_id_hash);

-- ============================================================
-- 6. SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS submissions (
    id BIGSERIAL PRIMARY KEY,
    generated_exam_id BIGINT UNIQUE NOT NULL REFERENCES generated_exams(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    student_number TEXT NOT NULL,
    class_name TEXT,
    university TEXT,
    content TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    auto_submitted BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_submissions_exam ON submissions(generated_exam_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_number);

-- ============================================================
-- 7. CORRECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS corrections (
    id BIGSERIAL PRIMARY KEY,
    submission_id BIGINT UNIQUE NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    ai_score DOUBLE PRECISION,
    ai_feedback TEXT,
    ai_detailed_scores TEXT,
    ai_corrected_at TIMESTAMPTZ,
    teacher_score DOUBLE PRECISION,
    teacher_feedback TEXT,
    teacher_id BIGINT REFERENCES teachers(id),
    teacher_corrected_at TIMESTAMPTZ,
    grading_system TEXT NOT NULL DEFAULT '20',
    max_score DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    final_score DOUBLE PRECISION,
    correction_status TEXT NOT NULL DEFAULT 'pending',
    corrected_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corrections_submission ON corrections(submission_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON corrections(correction_status);

-- ============================================================
-- 8. SECURITY_INCIDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS security_incidents (
    id BIGSERIAL PRIMARY KEY,
    submission_id BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    incident_type TEXT NOT NULL,
    details TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_security_incidents_submission ON security_incidents(submission_id);
CREATE INDEX IF NOT EXISTS idx_security_incidents_type ON security_incidents(incident_type);

-- ============================================================
-- 9. APP_CACHE (remplace Redis)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_app_cache_expires ON app_cache(expires_at);

-- Nettoyage automatique du cache expiré (toutes les 30 min)
-- Nécessite l'extension pg_cron activée dans Supabase Dashboard :
-- Database → Extensions → chercher "pg_cron" → Enable
-- Décommente les lignes ci-dessous APRES avoir activé pg_cron :
-- SELECT cron.schedule(
--     'cleanup-app-cache',
--     '*/30 * * * *',
--     $$DELETE FROM app_cache WHERE expires_at IS NOT NULL AND expires_at < NOW()$$
-- );

-- ============================================================
-- Fonction RPC pour incrémentation atomique
-- ============================================================
CREATE OR REPLACE FUNCTION increment_cache(key_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_val INTEGER;
BEGIN
    INSERT INTO app_cache (key, value, expires_at)
    VALUES (key_name, '1', NOW() + INTERVAL '1 minute')
    ON CONFLICT (key) DO UPDATE SET value = (COALESCE(NULLIF(app_cache.value, ''), '0')::INTEGER + 1)::TEXT
    RETURNING COALESCE(NULLIF(value, ''), '0')::INTEGER INTO current_val;
    RETURN current_val;
END;
$$;

-- ============================================================
-- Row Level Security (désactivé pour le service_role)
-- ============================================================
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_cache ENABLE ROW LEVEL SECURITY;

-- Policies : le service_role bypass RLS, mais l'anon key doit être restreinte
-- L'API backend utilise la service_role key (full access)
-- Le frontend (client) utilise l'anon key (accès limité)
CREATE POLICY "Service role full access" ON teachers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON exam_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON exercises FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON variants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON generated_exams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON submissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON corrections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON security_incidents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON app_cache FOR ALL USING (true) WITH CHECK (true);
