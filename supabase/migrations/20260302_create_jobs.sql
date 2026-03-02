-- ============================================================================
-- Jobs Module — Migration
-- สร้างตาราง job_settings + jobs + job_activities
-- ============================================================================

-- 1. ตาราง Job Settings (Dropdown Options — แยกจาก CRM)
CREATE TABLE IF NOT EXISTS job_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,                          -- 'graphic_status', 'onsite_status', 'tag', 'tag_graphic_STATUS', 'tag_onsite_STATUS'
  value TEXT NOT NULL,                             -- key value
  label_th TEXT NOT NULL,                          -- ชื่อแสดงผล (TH)
  label_en TEXT NOT NULL,                          -- ชื่อแสดงผล (EN)
  color TEXT,                                      -- สี badge (optional)
  sort_order INT DEFAULT 0,                        -- ลำดับการแสดง
  is_active BOOLEAN DEFAULT true,                  -- เปิด/ปิดใช้งาน
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ตาราง Jobs (งาน)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,  -- Lead ต้นทาง
  job_type TEXT NOT NULL CHECK (job_type IN ('graphic', 'onsite')),
  status TEXT NOT NULL DEFAULT 'pending',           -- dynamic จาก job_settings
  title TEXT NOT NULL,                              -- ชื่องาน
  description TEXT,                                 -- รายละเอียดเพิ่มเติม
  assigned_to TEXT[] DEFAULT '{}',                  -- ผู้รับผิดชอบ (UUID array)
  tags TEXT[] DEFAULT '{}',                         -- แท็ก
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date DATE,                                    -- วันกำหนดส่ง
  event_date DATE,                                  -- วันงาน (copy จาก CRM)
  event_location TEXT,                              -- สถานที่
  customer_name TEXT,                               -- ชื่อลูกค้า (copy จาก CRM)
  notes TEXT,                                       -- หมายเหตุ
  created_by UUID REFERENCES profiles(id),          -- ผู้สร้าง
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ                           -- nullable, for archiving
);

-- 3. ตาราง Job Activities (ประวัติการติดตาม)
CREATE TABLE IF NOT EXISTS job_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'call', 'line', 'email', 'meeting', 'note', 'status_change'
  )),
  description TEXT,
  old_status TEXT,
  new_status TEXT
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_job_settings_category ON job_settings(category);
CREATE INDEX IF NOT EXISTS idx_job_settings_active ON job_settings(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_crm_lead ON jobs(crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_event_date ON jobs(event_date);
CREATE INDEX IF NOT EXISTS idx_job_activities_job ON job_activities(job_id);
CREATE INDEX IF NOT EXISTS idx_job_activities_type ON job_activities(activity_type);

-- 5. RLS (Row Level Security)
ALTER TABLE job_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON job_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON job_activities FOR ALL USING (true) WITH CHECK (true);

-- 6. Seed Data — Default Statuses
-- Graphic Pipeline
INSERT INTO job_settings (category, value, label_th, label_en, color, sort_order) VALUES
  ('graphic_status', 'pending', 'รอออกแบบ', 'Pending', '#3b82f6', 1),
  ('graphic_status', 'designing', 'กำลังออกแบบ', 'Designing', '#f59e0b', 2),
  ('graphic_status', 'review', 'รอตรวจ', 'Review', '#8b5cf6', 3),
  ('graphic_status', 'revision', 'แก้ไข', 'Revision', '#ef4444', 4),
  ('graphic_status', 'approved', 'อนุมัติ', 'Approved', '#10b981', 5),
  ('graphic_status', 'done', 'เสร็จสิ้น', 'Done', '#6b7280', 6);

-- Onsite Pipeline
INSERT INTO job_settings (category, value, label_th, label_en, color, sort_order) VALUES
  ('onsite_status', 'preparing', 'เตรียมงาน', 'Preparing', '#3b82f6', 1),
  ('onsite_status', 'loading', 'ขนของ', 'Loading', '#f59e0b', 2),
  ('onsite_status', 'onsite', 'ออกหน้างาน', 'On-site', '#8b5cf6', 3),
  ('onsite_status', 'teardown', 'เก็บงาน', 'Teardown', '#ef4444', 4),
  ('onsite_status', 'done', 'เสร็จสิ้น', 'Done', '#10b981', 5);
