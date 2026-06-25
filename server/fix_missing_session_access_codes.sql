-- ============================================================
-- FIX : Créer la table session_access_codes manquante
-- À exécuter dans l'éditeur SQL de Supabase (Dashboard → SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS session_access_codes (
    id                  bigint generated always as identity primary key,
    session_id          bigint not null references exam_sessions(id) on delete cascade,
    teacher_id          bigint not null references teachers(id) on delete cascade,
    student_name        text not null,
    student_number      text not null,
    class_name          text,
    access_pin          text not null,
    is_used             boolean not null default false,
    used_at             timestamptz,
    generated_at        timestamptz not null default now()
);

-- Index pour performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_codes_session_student
    ON session_access_codes(session_id, student_number);
CREATE INDEX IF NOT EXISTS idx_access_codes_pin
    ON session_access_codes(access_pin);
CREATE INDEX IF NOT EXISTS idx_access_codes_session
    ON session_access_codes(session_id);

-- RLS : service_role (backend) seulement
ALTER TABLE session_access_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON session_access_codes;
CREATE POLICY "Service role full access"
    ON session_access_codes FOR ALL
    USING (true)
    WITH CHECK (true);
