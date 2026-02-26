-- ============================================================================
-- Finance Vehicles — รายการรถ (ย้ายจาก hardcoded → DB)
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  license_plate TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'รถตู้',
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default data
INSERT INTO finance_vehicles (license_plate, name, type, sort_order) VALUES
  ('กก 1234', 'Toyota Hiace', 'รถตู้', 1),
  ('ขข 5678', 'Toyota Hilux Revo', 'รถกระบะ', 2),
  ('คค 9012', 'Honda City', 'รถเก๋ง', 3);

-- RLS
ALTER TABLE finance_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles_select" ON finance_vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehicles_insert" ON finance_vehicles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "vehicles_update" ON finance_vehicles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "vehicles_delete" ON finance_vehicles FOR DELETE TO authenticated USING (true);
