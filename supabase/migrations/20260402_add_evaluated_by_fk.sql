-- Add Foreign Key: kpi_evaluations.evaluated_by → profiles.id
-- This enables Supabase join to resolve evaluator name
-- NOTE: This FK already existed in the database. This migration is kept as documentation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kpi_evaluations_evaluated_by_fkey'
  ) THEN
    ALTER TABLE kpi_evaluations
    ADD CONSTRAINT kpi_evaluations_evaluated_by_fkey
    FOREIGN KEY (evaluated_by) REFERENCES profiles(id);
  END IF;
END $$;
