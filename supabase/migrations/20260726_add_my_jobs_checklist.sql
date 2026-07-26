-- Per-job personal checklist (no templates) for /jobs/my-job
ALTER TABLE my_jobs ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb;
