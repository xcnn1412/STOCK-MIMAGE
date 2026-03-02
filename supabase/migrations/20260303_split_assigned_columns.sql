-- Split the single assigned_to column into separate assigned_graphics and assigned_staff columns
-- This fixes the bug where changing one dropdown also changes the other

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_graphics TEXT[] DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_staff TEXT[] DEFAULT '{}';

-- Migrate existing data based on job type
UPDATE jobs SET assigned_graphics = assigned_to WHERE job_type = 'graphic' AND array_length(assigned_to, 1) > 0;
UPDATE jobs SET assigned_staff = assigned_to WHERE job_type = 'onsite' AND array_length(assigned_to, 1) > 0;
