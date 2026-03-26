-- ============================================================================
-- Staff Junction Tables — CRM + Events
-- เพิ่มตาราง crm_lead_staff + event_staff + staff_role settings
-- ============================================================================

-- 1. CRM Lead Staff (junction table)
CREATE TABLE IF NOT EXISTS crm_lead_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lead_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_crm_lead_staff_lead ON crm_lead_staff(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_lead_staff_user ON crm_lead_staff(user_id);

-- 2. Event Staff (junction table)
CREATE TABLE IF NOT EXISTS event_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_event_staff_event ON event_staff(event_id);
CREATE INDEX IF NOT EXISTS idx_event_staff_user ON event_staff(user_id);

-- 3. RLS
ALTER TABLE crm_lead_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth only" ON crm_lead_staff FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth only" ON event_staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Seed staff_role options into crm_settings
INSERT INTO crm_settings (category, value, label_th, label_en, sort_order, color) VALUES
  ('staff_role', 'sale', 'ฝ่ายขาย', 'Sale', 1, '#3b82f6'),
  ('staff_role', 'graphic', 'กราฟิก', 'Graphic', 2, '#8b5cf6'),
  ('staff_role', 'photographer', 'ช่างกล้อง', 'Photographer', 3, '#f59e0b'),
  ('staff_role', 'screen_operator', 'ดูแลจอ', 'Screen Operator', 4, '#10b981'),
  ('staff_role', 'lighting', 'ช่างไลท์', 'Lighting', 5, '#ef4444'),
  ('staff_role', 'general', 'พนักงานทั่วไป', 'General Staff', 6, '#6b7280');

-- 5. Migrate existing CRM data → crm_lead_staff
-- assigned_sales → role='sale'
INSERT INTO crm_lead_staff (lead_id, user_id, role)
SELECT id, unnest(assigned_sales)::uuid, 'sale'
FROM crm_leads
WHERE assigned_sales IS NOT NULL AND array_length(assigned_sales, 1) > 0
ON CONFLICT DO NOTHING;

-- assigned_graphics → role='graphic'
INSERT INTO crm_lead_staff (lead_id, user_id, role)
SELECT id, unnest(assigned_graphics)::uuid, 'graphic'
FROM crm_leads
WHERE assigned_graphics IS NOT NULL AND array_length(assigned_graphics, 1) > 0
ON CONFLICT DO NOTHING;

-- assigned_staff → role='general'
INSERT INTO crm_lead_staff (lead_id, user_id, role)
SELECT id, unnest(assigned_staff)::uuid, 'general'
FROM crm_leads
WHERE assigned_staff IS NOT NULL AND array_length(assigned_staff, 1) > 0
ON CONFLICT DO NOTHING;
