-- ============================================================================
-- CRM Module — Migration
-- สร้างตาราง crm_leads + crm_activities + crm_settings
-- ============================================================================

-- 1. ตาราง CRM Settings (Dropdown Options — Variable)
CREATE TABLE IF NOT EXISTS crm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,                          -- 'package', 'customer_type', 'lead_source'
  value TEXT NOT NULL,                             -- key value เช่น 'premium', 'corporate'
  label_th TEXT NOT NULL,                          -- ชื่อแสดงผล (TH)
  label_en TEXT NOT NULL,                          -- ชื่อแสดงผล (EN)
  color TEXT,                                      -- สี badge (optional)
  price NUMERIC,                                   -- ราคา (optional, สำหรับ package)
  description TEXT,                                -- คำอธิบาย (optional)
  sort_order INT DEFAULT 0,                        -- ลำดับการแสดง
  is_active BOOLEAN DEFAULT true,                  -- เปิด/ปิดใช้งาน
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ตาราง CRM Leads (ข้อมูลลูกค้า)
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id),         -- ผู้ที่กรอก
  status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN (
    'lead', 'booking', 'following_up', 'accepted', 'rejected', 'debt_collection', 'cancelled'
  )),
  is_returning BOOLEAN DEFAULT false,              -- ลูกค้าเก่า (true) / ลูกค้าใหม่ (false)
  -- ข้อมูลลูกค้า
  customer_name TEXT NOT NULL,                     -- ชื่อลูกค้า
  customer_line TEXT,                              -- ชื่อไลน์
  customer_phone TEXT,                             -- เบอร์โทร
  customer_type TEXT,                              -- ประเภทลูกค้า (จาก crm_settings)
  lead_source TEXT,                                -- ช่องทาง (จาก crm_settings)
  -- ข้อมูลงาน
  event_date DATE,                                 -- วันที่อีเวนต์
  event_end_date DATE,                             -- วันสิ้นสุดงาน
  event_location TEXT,                             -- สถานที่จัดงาน
  event_details TEXT,                              -- รายละเอียดงาน
  -- ข้อมูลการเงิน
  package_name TEXT,                               -- แพ็คเกจ (จาก crm_settings)
  quoted_price NUMERIC DEFAULT 0,                  -- ราคาเสนอ
  confirmed_price NUMERIC DEFAULT 0,               -- ยอดยืนยัน
  deposit NUMERIC DEFAULT 0,                       -- มัดจำ
  quotation_ref TEXT,                              -- เลขอ้างอิงใบเสนอราคา
  -- อื่นๆ
  notes TEXT,                                      -- หมายเหตุ
  assigned_to TEXT,                                -- ผู้ดูแล
  event_id UUID,                                   -- เชื่อมไปอีเวนต์ (เมื่อเปิดแล้ว)
  CONSTRAINT fk_event FOREIGN KEY (event_id) REFERENCES job_cost_events(id) ON DELETE SET NULL
);

-- 3. ตาราง CRM Activities (บันทึกการติดตาม)
CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id),         -- ผู้บันทึก
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'call', 'line', 'email', 'meeting', 'note', 'status_change'
  )),
  description TEXT,                                -- รายละเอียด
  old_status TEXT,                                 -- สถานะเดิม (สำหรับ status_change)
  new_status TEXT                                  -- สถานะใหม่ (สำหรับ status_change)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_crm_settings_category ON crm_settings(category);
CREATE INDEX IF NOT EXISTS idx_crm_settings_active ON crm_settings(is_active);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_created_at ON crm_leads(created_at);
CREATE INDEX IF NOT EXISTS idx_crm_leads_event_date ON crm_leads(event_date);
CREATE INDEX IF NOT EXISTS idx_crm_leads_assigned_to ON crm_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON crm_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_activities(activity_type);

-- 5. RLS (Row Level Security)
ALTER TABLE crm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON crm_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON crm_leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON crm_activities FOR ALL USING (true) WITH CHECK (true);

-- 6. Seed Data — Default Settings
-- Packages
INSERT INTO crm_settings (category, value, label_th, label_en, price, sort_order) VALUES
  ('package', 'basic', 'Basic Package', 'Basic Package', 8000, 1),
  ('package', 'standard', 'Standard Package', 'Standard Package', 15000, 2),
  ('package', 'premium', 'Premium Package', 'Premium Package', 25000, 3),
  ('package', 'premium_video', 'Premium Booth + Video', 'Premium Booth + Video', 35000, 4),
  ('package', '360_booth', '360 Booth + Print', '360 Booth + Print', 35000, 5),
  ('package', 'custom', 'กำหนดเอง', 'Custom', NULL, 99);

-- Customer Types
INSERT INTO crm_settings (category, value, label_th, label_en, sort_order) VALUES
  ('customer_type', 'individual', 'บุคคลทั่วไป', 'Individual', 1),
  ('customer_type', 'corporate', 'บริษัท/องค์กร', 'Corporate', 2),
  ('customer_type', 'wedding', 'งานแต่งงาน', 'Wedding', 3),
  ('customer_type', 'school', 'โรงเรียน/มหาวิทยาลัย', 'School', 4),
  ('customer_type', 'government', 'หน่วยงานราชการ', 'Government', 5),
  ('customer_type', 'other', 'อื่นๆ', 'Other', 99);

-- Lead Sources
INSERT INTO crm_settings (category, value, label_th, label_en, sort_order) VALUES
  ('lead_source', 'line', 'LINE', 'LINE', 1),
  ('lead_source', 'facebook', 'Facebook', 'Facebook', 2),
  ('lead_source', 'instagram', 'Instagram', 'Instagram', 3),
  ('lead_source', 'website', 'เว็บไซต์', 'Website', 4),
  ('lead_source', 'referral', 'แนะนำ/บอกต่อ', 'Referral', 5),
  ('lead_source', 'phone', 'โทรศัพท์', 'Phone', 6),
  ('lead_source', 'walk_in', 'Walk-in', 'Walk-in', 7),
  ('lead_source', 'other', 'อื่นๆ', 'Other', 99);
