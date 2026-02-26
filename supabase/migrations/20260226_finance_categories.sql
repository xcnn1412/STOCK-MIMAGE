-- Finance Categories (ตั้งค่าหมวดค่าใช้จ่าย ใช้ร่วมกันระหว่าง Costs + Finance)
CREATE TABLE IF NOT EXISTS finance_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  label_th text NOT NULL,
  icon text DEFAULT 'MoreHorizontal',
  color text DEFAULT '#6b7280',
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Seed default categories (เหมือน COST_CATEGORIES เดิม)
INSERT INTO finance_categories (value, label, label_th, icon, color, sort_order) VALUES
  ('staff', 'Staff', 'ค่าสตาฟ', 'Users', '#ef4444', 1),
  ('travel', 'Travel', 'ค่าเดินทาง', 'Car', '#f97316', 2),
  ('equipment', 'Equipment', 'อุปกรณ์ออกอีเวนต์', 'Package', '#eab308', 3),
  ('food', 'Food & Beverage', 'อาหารและเครื่องดื่ม', 'UtensilsCrossed', '#22c55e', 4),
  ('venue', 'Venue', 'ค่าสถานที่', 'Building2', '#3b82f6', 5),
  ('marketing', 'Marketing', 'การตลาด / โฆษณา', 'Megaphone', '#8b5cf6', 6),
  ('other', 'Other', 'อื่นๆ', 'MoreHorizontal', '#6b7280', 99)
ON CONFLICT (value) DO NOTHING;

-- RLS
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read categories"
  ON finance_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage categories"
  ON finance_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
