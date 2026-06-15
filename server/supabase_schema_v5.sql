-- Migration v5 : Codes d'accès étudiants par session
-- Chaque étudiant reçoit un code PIN unique de 6 chiffres

CREATE TABLE IF NOT EXISTS session_access_codes (
    id                  bigint generated always as identity primary key,
    session_id          bigint not null references exam_sessions(id) on delete cascade,
    teacher_id          bigint not null references teachers(id) on delete cascade,
    student_name        text not null,
    student_number      text not null,
    class_name          text,
    access_pin          text not null,          -- code PIN à 6 chiffres
    is_used             boolean not null default false,
    used_at             timestamptz,
    generated_at        timestamptz not null default now()
);

-- Un étudiant ne peut avoir qu'un seul PIN actif par session
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_codes_session_student
    ON session_access_codes(session_id, student_number);

CREATE INDEX IF NOT EXISTS idx_access_codes_pin
    ON session_access_codes(access_pin);

CREATE INDEX IF NOT EXISTS idx_access_codes_session
    ON session_access_codes(session_id);

-- RLS
ALTER TABLE session_access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access codes accessibles par le teacher"
    ON session_access_codes FOR ALL
    USING (teacher_id = auth.uid()::bigint)
    WITH CHECK (teacher_id = auth.uid()::bigint);
