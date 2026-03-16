-- Per-staff work settings (nullable = use global default)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS standard_hours numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS late_hour integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS late_minute integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ot_threshold numeric DEFAULT NULL;

COMMENT ON COLUMN profiles.standard_hours IS 'Standard working hours per day (null = use global default)';
COMMENT ON COLUMN profiles.late_hour IS 'Hour threshold for late check-in (null = use global default)';
COMMENT ON COLUMN profiles.late_minute IS 'Minute threshold for late check-in (null = use global default)';
COMMENT ON COLUMN profiles.ot_threshold IS 'OT threshold hours per day (null = use global default)';
