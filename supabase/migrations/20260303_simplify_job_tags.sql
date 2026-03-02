-- ============================================================================
-- Simplify Job Tags — merge per-status tag categories to per-job-type
-- Before: tag_graphic_pending, tag_graphic_designing, tag_onsite_setup, ...
-- After:  tag_graphic, tag_onsite, ...
-- ============================================================================

-- Step 1: Consolidate tag categories (remove the status suffix)
-- e.g. tag_graphic_pending → tag_graphic
-- We need to handle job_type values that may themselves contain underscores,
-- so we match against known job types from job_settings category='job_type'
DO $$
DECLARE
  jt_value TEXT;
BEGIN
  FOR jt_value IN 
    SELECT value FROM job_settings WHERE category = 'job_type'
  LOOP
    -- Update any tag category that starts with tag_{jt_value}_ (has a status suffix)
    UPDATE job_settings 
    SET category = 'tag_' || jt_value
    WHERE category LIKE 'tag_' || jt_value || '_%'
      AND category != 'tag_' || jt_value;
  END LOOP;
END $$;

-- Step 2: Remove duplicates (same category + value, keep the one with lowest sort_order)
DELETE FROM job_settings a
USING job_settings b
WHERE a.category LIKE 'tag_%'
  AND a.category = b.category 
  AND a.value = b.value 
  AND a.id != b.id
  AND (a.sort_order > b.sort_order OR (a.sort_order = b.sort_order AND a.id > b.id));
