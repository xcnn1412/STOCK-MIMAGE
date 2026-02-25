-- ============================================================================
-- CRM Tags — เพิ่มคอลัมน์ tags (text array) ให้ crm_leads
-- ============================================================================

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
