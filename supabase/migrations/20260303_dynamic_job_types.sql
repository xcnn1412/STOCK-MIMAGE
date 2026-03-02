-- ============================================================================
-- Dynamic Job Types — Migration
-- Drop hardcoded CHECK constraint, seed job_type settings, rename categories
-- ============================================================================

-- 1. Drop the hardcoded CHECK constraint on jobs.job_type
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;

-- 2. Seed default job types into job_settings
INSERT INTO job_settings (category, value, label_th, label_en, color, sort_order) VALUES
  ('job_type', 'graphic', 'กราฟฟิก', 'Graphic', '#8b5cf6', 1),
  ('job_type', 'onsite', 'ออกหน้างาน', 'On-site', '#10b981', 2)
ON CONFLICT DO NOTHING;

-- 3. Rename status categories: graphic_status → status_graphic, onsite_status → status_onsite
UPDATE job_settings SET category = 'status_graphic' WHERE category = 'graphic_status';
UPDATE job_settings SET category = 'status_onsite' WHERE category = 'onsite_status';
