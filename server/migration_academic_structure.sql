-- ============================================================
-- MIGRATION ACADÉMIQUE COMPLÈTE (v6 + v7 + v8 + v9)
-- Exécute TOUTE la structure Établissement → Filière → Classe → Année → Étudiants
-- ============================================================

-- ============================================================
-- v6 : Architecture hiérarchique centralisée
-- ============================================================

-- 1. FILIERES
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

-- 2. ANNEES SCOLAIRES
CREATE TABLE IF NOT EXISTS academic_years (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    start_date      DATE,
    end_date        DATE,
    is_current      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CLASSES (filiere + annee)
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

-- 4. ETUDIANTS (class_students)
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

-- 5. Lier exam_sessions aux classes
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS class_id BIGINT REFERENCES classes(id);
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS academic_year_id BIGINT REFERENCES academic_years(id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_class ON exam_sessions(class_id);

-- ============================================================
-- v7 : Niveaux d'étude
-- ============================================================
CREATE TABLE IF NOT EXISTS study_levels (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS study_level_id BIGINT REFERENCES study_levels(id);
CREATE INDEX IF NOT EXISTS idx_classes_study_level ON classes(study_level_id);

-- ============================================================
-- v8 : Multi-établissements pour les professeurs
-- ============================================================
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS institution_ids BIGINT[] DEFAULT '{}';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS subject_ids BIGINT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_teachers_institution_ids ON teachers USING GIN(institution_ids);
CREATE INDEX IF NOT EXISTS idx_teachers_subject_ids ON teachers USING GIN(subject_ids);

-- ============================================================
-- v9 : Types de session
-- ============================================================
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'exam';

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE filieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON filieres;
DROP POLICY IF EXISTS "Service role full access" ON academic_years;
DROP POLICY IF EXISTS "Service role full access" ON classes;
DROP POLICY IF EXISTS "Service role full access" ON class_students;
DROP POLICY IF EXISTS "Service role full access" ON study_levels;

CREATE POLICY "Service role full access" ON filieres FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON academic_years FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON class_students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON study_levels FOR ALL USING (true) WITH CHECK (true);

-- Index GIN pour les sessions
CREATE INDEX IF NOT EXISTS idx_exam_sessions_type ON exam_sessions(session_type);
