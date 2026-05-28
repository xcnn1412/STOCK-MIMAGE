-- Add phase classifier to job_cost_events
-- A single CRM lead can link to multiple job_cost_events representing different phases:
--   setup    = jobs to prepare the engagement (e.g. setup day, pre-production)
--   main     = the main event day (default)
--   teardown = tear-down / break-down day
--   delivery = extra item delivery or pickup
--   other    = anything else
ALTER TABLE job_cost_events
  ADD COLUMN IF NOT EXISTS phase TEXT;

ALTER TABLE job_cost_events
  DROP CONSTRAINT IF EXISTS job_cost_events_phase_check;

ALTER TABLE job_cost_events
  ADD CONSTRAINT job_cost_events_phase_check
  CHECK (phase IS NULL OR phase IN ('setup', 'main', 'teardown', 'delivery', 'other'));

CREATE INDEX IF NOT EXISTS idx_job_cost_events_linked_lead_phase
  ON job_cost_events(linked_lead_id, phase)
  WHERE linked_lead_id IS NOT NULL;
