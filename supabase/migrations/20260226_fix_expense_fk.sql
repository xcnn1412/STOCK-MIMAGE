-- Fix: expense_claims.job_event_id should reference events table, not job_cost_events
-- เพราะ dropdown ดึงจาก events หลัก

-- Drop old FK constraint
ALTER TABLE expense_claims DROP CONSTRAINT IF EXISTS expense_claims_job_event_id_fkey;

-- Add new FK to events table
ALTER TABLE expense_claims
  ADD CONSTRAINT expense_claims_job_event_id_fkey
  FOREIGN KEY (job_event_id) REFERENCES events(id) ON DELETE SET NULL;
