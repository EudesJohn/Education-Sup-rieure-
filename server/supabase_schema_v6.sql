-- ============================================================
-- PEAN — Migration v6 : Architecture hiérarchique centralisée
-- Ajoute : filieres, academic_years, classes, class_students
-- Modifie : exam_sessions (class_id, academic_year_id)
-- ============================================================

-- ============================================================
-- 1. FILIERES — Branches d'étude liées à un établissement
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

-- ============================================================
-- 2. ACADEMIC_YEARS — Années académiques (ex: "2024-2025")
-- ============================================================
CREATE TABLE IF NOT EXISTS academic_years (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    start_date      DATE,
    end_date        DATE,
    is_current      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. CLASSES — Classe spécifique (filière + année)
-- ============================================================
CREATE TABLE IF NOT EXISTS classes (
    id              BIGSERIAL PRIMARY KEY,
    filiere_id      BIGINT NOT NULL REFERENCES filieres(id) ON DELETE CASCADE,
    academic_year_id BIGINT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    level           TEXT,           -- ex: "L1", "L2", "M1", "M2"
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(filiere_id, academic_year_id, name)
);

CREATE INDEX IF NOT EXISTS idx_classes_filiere ON classes(filiere_id);
CREATE INDEX IF NOT EXISTS idx_classes_year ON classes(academic_year_id);

-- ============================================================
-- 4. CLASS_STUDENTS — Étudiants gérés par l'admin
-- ============================================================
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

-- ============================================================
-- 5. MODIFICATIONS exam_sessions
-- ============================================================
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS class_id BIGINT REFERENCES classes(id);
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS academic_year_id BIGINT REFERENCES academic_years(id);

CREATE INDEX IF NOT EXISTS idx_exam_sessions_class ON exam_sessions(class_id);

-- ============================================================
-- RLS (service_role comme les autres tables)
-- ============================================================
ALTER TABLE filieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON filieres FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON academic_years FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON class_students FOR ALL USING (true) WITH CHECK (true);
