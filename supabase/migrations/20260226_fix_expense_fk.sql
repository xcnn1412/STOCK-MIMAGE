-- Fix: expense_claims.job_event_id should reference job_cost_events
-- เพราะ dropdown ดึงจาก job_cost_events (ไม่ใช่ events หลัก)

-- Step 1: NULL out job_event_id ที่ชี้ไป events แต่ไม่มีใน job_cost_events
UPDATE expense_claims
SET job_event_id = NULL
WHERE job_event_id IS NOT NULL
  AND job_event_id NOT IN (SELECT id FROM job_cost_events);

-- Step 2: Drop wrong FK
ALTER TABLE expense_claims DROP CONSTRAINT IF EXISTS expense_claims_job_event_id_fkey;

-- Step 3: Add correct FK to job_cost_events
ALTER TABLE expense_claims
  ADD CONSTRAINT expense_claims_job_event_id_fkey
  FOREIGN KEY (job_event_id) REFERENCES job_cost_events(id) ON DELETE SET NULL;
