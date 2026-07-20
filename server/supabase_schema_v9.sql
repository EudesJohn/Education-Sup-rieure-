-- ============================================================
-- PEAN — Migration v9 : Hiérarchie des rôles à 3 niveaux
-- super_admin > admin > cd > teacher
-- ============================================================

-- ============================================================
-- 1. Ajouter institution_id aux enseignants
-- ============================================================
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS institution_id BIGINT REFERENCES institutions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_teachers_institution_id ON teachers(institution_id);

-- ============================================================
-- 2. Migrer les anciens admins → super_admin
-- ============================================================
UPDATE teachers SET role = 'super_admin' WHERE role = 'admin';

-- ============================================================
-- 3. Ajouter la colonne department pour les CD
-- ============================================================
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS department VARCHAR(255) DEFAULT '';
