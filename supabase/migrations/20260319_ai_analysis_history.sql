-- AI Analysis History
-- เก็บประวัติการวิเคราะห์ด้วย AI ในหน้า Overview

CREATE TABLE IF NOT EXISTS ai_analysis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_count INT NOT NULL,
  date_from TEXT,
  date_to TEXT,
  sections TEXT[] NOT NULL,
  custom_prompt TEXT,
  data_snapshot JSONB NOT NULL,
  ai_result TEXT NOT NULL,
  model_used TEXT
);

ALTER TABLE ai_analysis_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth only" ON ai_analysis_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_ai_history_created ON ai_analysis_history(created_at DESC);
