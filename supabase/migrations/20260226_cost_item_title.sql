-- เพิ่มคอลัมน์ title ให้ job_cost_items (หัวข้อการเบิก)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_cost_items' AND column_name = 'title'
  ) THEN
    ALTER TABLE job_cost_items ADD COLUMN title TEXT;
  END IF;
END $$;
