-- ============================================================
-- PEAN — Migration v11 -> v12 (codes d'invitation enseignants)
-- ============================================================
-- Execute dans: Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Table des codes d'invitation
CREATE TABLE IF NOT EXISTS invitation_codes (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    created_by BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    used_by BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON invitation_codes(code);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_created_by ON invitation_codes(created_by);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_used_by ON invitation_codes(used_by);

-- 2. Ajouter la colonne invitation_code_id aux enseignants (optionnel, tracabilite)
ALTER TABLE teachers
    ADD COLUMN IF NOT EXISTS invitation_code_id BIGINT REFERENCES invitation_codes(id) ON DELETE SET NULL;

-- ============================================================
-- Verification
-- ============================================================
-- SELECT * FROM invitation_codes LIMIT 10;
