-- ============================================================================
-- Job Checklists — Migration
-- สร้างตาราง job_checklist_templates + job_checklist_items
-- ============================================================================

-- 1. Checklist Templates (configured per job_type + status in Settings)
CREATE TABLE IF NOT EXISTS job_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('graphic', 'onsite')),
  status TEXT NOT NULL,                               -- e.g. 'pending', 'designing'
  group_name_th TEXT NOT NULL,                        -- ชื่อกลุ่ม (TH) e.g. 'จุดติดตั้ง'
  group_name_en TEXT NOT NULL,                        -- ชื่อกลุ่ม (EN) e.g. 'Installation Points'
  items JSONB NOT NULL DEFAULT '[]',                  -- [{ "label_th": "...", "label_en": "..." }, ...]
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Job Checklist Items (per-job checkbox state)
CREATE TABLE IF NOT EXISTS job_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES job_checklist_templates(id) ON DELETE CASCADE,
  item_index INT NOT NULL,                            -- index within template.items[]
  is_checked BOOLEAN DEFAULT false,
  checked_by UUID REFERENCES profiles(id),
  checked_at TIMESTAMPTZ,
  UNIQUE(job_id, template_id, item_index)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_checklist_templates_type_status ON job_checklist_templates(job_type, status);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_active ON job_checklist_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_checklist_items_job ON job_checklist_items(job_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_template ON job_checklist_items(template_id);

-- 4. RLS
ALTER TABLE job_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON job_checklist_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON job_checklist_items FOR ALL USING (true) WITH CHECK (true);
