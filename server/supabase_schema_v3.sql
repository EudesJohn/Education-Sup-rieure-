-- ============================================================
-- Migration v3 : Dossiers Pédagogiques (RF-06)
-- CDC v2.2 — Gestion IA des Dossiers Pédagogiques
-- ============================================================

-- 1. PEDAGOGICAL_DOCUMENTS
CREATE TABLE IF NOT EXISTS pedagogical_documents (
    id BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    subject VARCHAR(255),
    academic_level VARCHAR(100),        -- L1, L2, M1, etc.
    document_type VARCHAR(50) NOT NULL DEFAULT 'other',
        -- 'course', 'td', 'tp', 'exam', 'correction', 'reference', 'other'
    file_type VARCHAR(10),              -- pdf, docx, txt, etc.
    file_url TEXT,                      -- URL dans Supabase Storage
    file_size BIGINT,                   -- Taille en octets
    original_filename VARCHAR(500),

    -- Classification IA
    ai_classification JSONB,            -- {subject, level, type, keywords, summary, confidence}
    ai_classified_at TIMESTAMPTZ,
    ai_classification_version VARCHAR(20),

    -- Métadonnées
    tags TEXT[],                        -- Tags libres
    is_favorite BOOLEAN DEFAULT false,
    source_url TEXT,                    -- URL source originale
    author VARCHAR(255),
    year VARCHAR(4),

    -- Stats
    download_count INT DEFAULT 0,
    reference_count INT DEFAULT 0,      -- Nombre d'exercices liés

    status VARCHAR(20) DEFAULT 'active', -- 'active', 'archived', 'processing'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_teacher
    ON pedagogical_documents(teacher_id);
CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_subject
    ON pedagogical_documents(subject);
CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_type
    ON pedagogical_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_tags
    ON pedagogical_documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_status
    ON pedagogical_documents(status);

-- Full-text search index
ALTER TABLE pedagogical_documents ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_pedagogical_documents_search
    ON pedagogical_documents USING GIN(search_vector);

-- Trigger function pour mettre à jour search_vector
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

-- RLS
ALTER TABLE pedagogical_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teachers_own_documents" ON pedagogical_documents;
CREATE POLICY "teachers_own_documents" ON pedagogical_documents
    USING (teacher_id = (SELECT id FROM teachers WHERE id = current_setting('app.teacher_id')::BIGINT));

-- Trigger updated_at
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


-- 2. DOCUMENT_EXERCISE_LINKS (liaison documents ↔ exercices)
CREATE TABLE IF NOT EXISTS document_exercise_links (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES pedagogical_documents(id) ON DELETE CASCADE,
    exercise_id BIGINT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    link_type VARCHAR(20) DEFAULT 'source',  -- 'source', 'inspiration', 'reference'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_exercise_links_doc
    ON document_exercise_links(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_exercise_links_exercise
    ON document_exercise_links(exercise_id);
