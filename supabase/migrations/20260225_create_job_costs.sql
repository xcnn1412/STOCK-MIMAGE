-- ============================================================================
-- Job Costing Module — Migration
-- สร้างตาราง job_cost_events + job_cost_items
-- ============================================================================

-- 1. ตาราง Event ที่ import เข้ามาคิดต้นทุน (เก็บถาวร)
CREATE TABLE IF NOT EXISTS job_cost_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id UUID,                              -- อ้างอิง events.id (nullable, event อาจถูกลบแล้ว)
  event_name TEXT NOT NULL,                           -- ชื่องาน (snapshot)
  event_date DATE,                                     -- วันจัดงาน
  event_location TEXT,                                 -- สถานที่
  staff TEXT,                                          -- พนักงานดูแล
  revenue NUMERIC DEFAULT 0,                           -- ราคาขาย (เรียกเก็บลูกค้า)
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  notes TEXT,                                          -- หมายเหตุ
  imported_by UUID REFERENCES profiles(id),            -- ผู้นำเข้า
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ตารางรายการค่าใช้จ่ายแต่ละรายการ
CREATE TABLE IF NOT EXISTS job_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_event_id UUID NOT NULL REFERENCES job_cost_events(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('staff', 'travel', 'equipment', 'food', 'venue', 'marketing', 'other')),
  description TEXT,                                    -- รายละเอียด เช่น "ค่าสตาฟ 3 คน"
  amount NUMERIC NOT NULL DEFAULT 0,                   -- จำนวนเงิน (บาท)
  cost_date DATE,                                      -- วันที่เกิดค่าใช้จ่าย
  recorded_by UUID REFERENCES profiles(id),            -- ผู้บันทึก
  notes TEXT,                                          -- หมายเหตุ
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_job_cost_events_source ON job_cost_events(source_event_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_events_date ON job_cost_events(event_date);
CREATE INDEX IF NOT EXISTS idx_job_cost_events_status ON job_cost_events(status);
CREATE INDEX IF NOT EXISTS idx_job_cost_items_event ON job_cost_items(job_event_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_items_category ON job_cost_items(category);

-- 4. RLS (Row Level Security)
ALTER TABLE job_cost_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cost_items ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users (controlled at app level via session cookies)
CREATE POLICY "Allow all for authenticated" ON job_cost_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON job_cost_items FOR ALL USING (true) WITH CHECK (true);
