-- ============================================================
-- PEAN — Script de Migration Consolidé (v2.0 → v9.0)
-- Exécuter ce script dans le SQL Editor de votre Dashboard Supabase
-- ============================================================

-- ============================================================
-- MIGRATION V2 : Student Lists, Audit Logs, Code Executions
-- ============================================================

CREATE TABLE IF NOT EXISTS student_lists (
    id BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    groupe TEXT,
    original_filename TEXT,
    file_type TEXT NOT NULL DEFAULT 'csv',
    student_count INTEGER NOT NULL DEFAULT 0,
    column_mapping TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_lists_teacher ON student_lists(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_lists_status ON student_lists(status);

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
    test_results TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_code_exec_submission ON code_executions(submission_id);
CREATE INDEX IF NOT EXISTS idx_code_exec_session ON code_executions(session_id);

-- Modifications aux tables existantes (v2)
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS student_list_id BIGINT REFERENCES student_lists(id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_list ON exam_sessions(student_list_id);

ALTER TABLE generated_exams ADD COLUMN IF NOT EXISTS student_name TEXT;
ALTER TABLE generated_exams ADD COLUMN IF NOT EXISTS student_number TEXT;

-- RLS (v2)
ALTER TABLE student_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_list_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access student_lists" ON student_lists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access student_list_entries" ON student_list_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access audit_logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access code_executions" ON code_executions FOR ALL USING (true) WITH CHECK (true);


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


-- ============================================================
-- MIGRATION V3 : Dossiers Pédagogiques (RF-06)
-- ============================================================

CREATE TABLE IF NOT EXISTS pedagogical_documents (
    id BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    subject VARCHAR(255),
    academic_level VARCHAR(100),
    document_type VARCHAR(50) NOT NULL DEFAULT 'other',
    file_type VARCHAR(10),
    file_url TEXT,
    file_size BIGINT,
    original_filename VARCHAR(500),
    ai_classification JSONB,
    ai_classified_at TIMESTAMPTZ,
    ai_classification_version VARCHAR(20),
    tags TEXT[],
    is_favorite BOOLEAN DEFAULT false,
    source_url TEXT,
    author VARCHAR(255),
    year VARCHAR(4),
    download_count INT DEFAULT 0,
    reference_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_teacher ON pedagogical_documents(teacher_id);
CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_subject ON pedagogical_documents(subject);
CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_type ON pedagogical_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_tags ON pedagogical_documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_status ON pedagogical_documents(status);

ALTER TABLE pedagogical_documents ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_search ON pedagogical_documents USING GIN(search_vector);

CREATE OR REPLACE FUNCTION pedagogical_documents_search_update()
RETURNS trigger AS $$
BEGIN
    NEW.search_vector := to_tsvector('french',
        COALESCE(NEW.title, '') || ' ' ||
        COALESCE(NEW.description, '') || ' ' ||
        COALESCE(NEW.subject, '') || ' ' ||
        COALESCE(array_to_string(NEW.tags, ' '), '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedagogical_documents_search ON pedagogical_documents;
CREATE TRIGGER trg_pedagogical_documents_search
    BEFORE INSERT OR UPDATE ON pedagogical_documents
    FOR EACH ROW
    EXECUTE FUNCTION pedagogical_documents_search_update();

ALTER TABLE pedagogical_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access pedagogical_documents" ON pedagogical_documents FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_pedagogical_documents_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedagogical_documents_updated_at ON pedagogical_documents;
CREATE TRIGGER trg_pedagogical_documents_updated_at
    BEFORE UPDATE ON pedagogical_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_pedagogical_documents_updated_at();

CREATE TABLE IF NOT EXISTS document_exercise_links (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES pedagogical_documents(id) ON DELETE CASCADE,
    exercise_id BIGINT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    link_type VARCHAR(20) DEFAULT 'source',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_exercise_links_doc ON document_exercise_links(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_exercise_links_exercise ON document_exercise_links(exercise_id);
ALTER TABLE document_exercise_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access document_exercise_links" ON document_exercise_links FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- MIGRATION V4 : Annotations de correction (RF-10)
-- ============================================================

CREATE TABLE IF NOT EXISTS correction_annotations (
    id              bigint generated always as identity primary key,
    correction_id   bigint not null references corrections(id) on delete cascade,
    submission_id   bigint not null references submissions(id) on delete cascade,
    teacher_id      bigint not null references teachers(id) on delete cascade,
    exercise_id     bigint references exercises(id) on delete set null,
    annotation_type text not null default 'comment' check (annotation_type in ('comment', 'correction', 'highlight', 'remark', 'error', 'praise')),
    selection_start integer,
    selection_end   integer,
    selected_text   text,
    content         text not null,
    score           numeric(5,2),
    max_score       numeric(5,2),
    is_resolved     boolean not null default false,
    resolved_at     timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_correction_annotations_submission on correction_annotations(submission_id);
CREATE INDEX IF NOT EXISTS idx_correction_annotations_correction on correction_annotations(correction_id);
CREATE INDEX IF NOT EXISTS idx_correction_annotations_teacher on correction_annotations(teacher_id);

CREATE TABLE IF NOT EXISTS correction_rubrics (
    id              bigint generated always as identity primary key,
    session_id      bigint not null references exam_sessions(id) on delete cascade,
    teacher_id      bigint not null references teachers(id) on delete cascade,
    title           text not null,
    description     text,
    criteria        jsonb not null default '[]'::jsonb,
    max_score       numeric(5,2),
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_correction_rubrics_session on correction_rubrics(session_id);

ALTER TABLE corrections ADD COLUMN IF NOT EXISTS annotation_count integer not null default 0;
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS rubric_id bigint references correction_rubrics(id) on delete set null;
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS rubric_scores jsonb default '{}'::jsonb;

CREATE OR REPLACE FUNCTION update_correction_annotations_updated_at()
RETURNS trigger AS $$
BEGIN
    new.updated_at = now();
    return new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_correction_annotations_updated_at on correction_annotations;
CREATE TRIGGER trg_correction_annotations_updated_at
    BEFORE UPDATE ON correction_annotations
    FOR EACH ROW EXECUTE FUNCTION update_correction_annotations_updated_at();

CREATE OR REPLACE FUNCTION update_correction_annotation_count()
RETURNS trigger AS $$
BEGIN
    if tg_op = 'INSERT' then
        update corrections
        set annotation_count = (
            select count(*) from correction_annotations where correction_id = new.correction_id
        )
        where id = new.correction_id;
        return new;
    elsif tg_op = 'DELETE' then
        update corrections
        set annotation_count = (
            select count(*) from correction_annotations where correction_id = old.correction_id
        )
        where id = old.correction_id;
        return old;
    end if;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_correction_annotations_count on correction_annotations;
CREATE TRIGGER trg_correction_annotations_count
    AFTER INSERT OR DELETE ON correction_annotations
    FOR EACH ROW EXECUTE FUNCTION update_correction_annotation_count();

ALTER TABLE correction_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_rubrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access correction_annotations" ON correction_annotations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access correction_rubrics" ON correction_rubrics FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- MIGRATION V5 : Codes d'accès étudiants par session
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_codes_session_student ON session_access_codes(session_id, student_number);
CREATE INDEX IF NOT EXISTS idx_access_codes_pin ON session_access_codes(access_pin);
CREATE INDEX IF NOT EXISTS idx_access_codes_session ON session_access_codes(session_id);

ALTER TABLE session_access_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access session_access_codes" ON session_access_codes FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- MIGRATION V6 : Architecture hiérarchique centralisée
-- ============================================================

CREATE TABLE IF NOT EXISTS filieres (
    id              BIGSERIAL PRIMARY KEY,
    institution_id  BIGINT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    code            TEXT,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(institution_id, name)
);

CREATE INDEX IF NOT EXISTS idx_filieres_institution ON filieres(institution_id);

CREATE TABLE IF NOT EXISTS academic_years (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    start_date      DATE,
    end_date        DATE,
    is_current      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes (
    id              BIGSERIAL PRIMARY KEY,
    filiere_id      BIGINT NOT NULL REFERENCES filieres(id) ON DELETE CASCADE,
    academic_year_id BIGINT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    level           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(filiere_id, academic_year_id, name)
);

CREATE INDEX IF NOT EXISTS idx_classes_filiere ON classes(filiere_id);
CREATE INDEX IF NOT EXISTS idx_classes_year ON classes(academic_year_id);

CREATE TABLE IF NOT EXISTS class_students (
    id              BIGSERIAL PRIMARY KEY,
    class_id        BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_name    TEXT NOT NULL,
    student_number  TEXT NOT NULL,
    email           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(class_id, student_number)
);

CREATE INDEX IF NOT EXISTS idx_class_students_class ON class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_number ON class_students(student_number);

-- Modifications exam_sessions (v6)
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS class_id BIGINT REFERENCES classes(id);
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS academic_year_id BIGINT REFERENCES academic_years(id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_class ON exam_sessions(class_id);

-- RLS (v6)
ALTER TABLE filieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access filieres" ON filieres FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access academic_years" ON academic_years FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access classes" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access class_students" ON class_students FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- MIGRATION V7 : Niveaux d'étude (study_levels)
-- ============================================================

CREATE TABLE IF NOT EXISTS study_levels (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE study_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access study_levels" ON study_levels FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE classes ADD COLUMN IF NOT EXISTS study_level_id BIGINT REFERENCES study_levels(id);
CREATE INDEX IF NOT EXISTS idx_classes_study_level ON classes(study_level_id);


-- ============================================================
-- MIGRATION V8 : Multi-établissements et multi-matières
-- ============================================================

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS institution_ids BIGINT[] DEFAULT '{}';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS subject_ids BIGINT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_teachers_institution_ids ON teachers USING GIN(institution_ids);
CREATE INDEX IF NOT EXISTS idx_teachers_subject_ids ON teachers USING GIN(subject_ids);


-- ============================================================
-- MIGRATION V9 : Types de session
-- ============================================================

ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'exam';
CREATE INDEX IF NOT EXISTS idx_exam_sessions_type ON exam_sessions(session_type);
