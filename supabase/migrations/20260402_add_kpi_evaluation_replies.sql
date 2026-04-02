-- Create kpi_evaluation_replies table for threaded discussions
-- Supports rich text (HTML), image attachments, and @mentions
CREATE TABLE IF NOT EXISTS kpi_evaluation_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID NOT NULL REFERENCES kpi_evaluations(id) ON DELETE CASCADE,
  content TEXT,                       -- HTML content from RichTextEditor
  attachments TEXT[] DEFAULT '{}',    -- uploaded image/file URLs
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by evaluation
CREATE INDEX IF NOT EXISTS idx_kpi_eval_replies_eval_id
  ON kpi_evaluation_replies(evaluation_id);

-- Enable RLS
ALTER TABLE kpi_evaluation_replies ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read all replies
CREATE POLICY "kpi_eval_replies_select" ON kpi_evaluation_replies
  FOR SELECT TO authenticated USING (true);

-- Policy: authenticated users can insert their own replies
CREATE POLICY "kpi_eval_replies_insert" ON kpi_evaluation_replies
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
