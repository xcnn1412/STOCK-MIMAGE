-- Add phase classifier to events (operational events table)
-- Mirror of the job_cost_events.phase column (see 20260528_add_job_cost_events_phase.sql)
-- so that phase set at event creation time can be carried into the cost entity on import.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS phase TEXT;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_phase_check;

ALTER TABLE events
  ADD CONSTRAINT events_phase_check
  CHECK (phase IS NULL OR phase IN ('setup', 'main', 'teardown', 'delivery', 'other'));

CREATE INDEX IF NOT EXISTS idx_events_crm_lead_phase
  ON events(crm_lead_id, phase)
  WHERE crm_lead_id IS NOT NULL;
