-- ============================================================================
-- Enable RLS สำหรับ 5 ตารางที่ยังไม่ได้เปิด
-- ============================================================================

-- 1. login_logs (346 rows — ประวัติ login)
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "login_logs_select" ON login_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "login_logs_insert" ON login_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 2. crm_lead_installments (23 rows — ข้อมูลการเงิน)
ALTER TABLE crm_lead_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "installments_select" ON crm_lead_installments FOR SELECT TO authenticated USING (true);
CREATE POLICY "installments_insert" ON crm_lead_installments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "installments_update" ON crm_lead_installments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "installments_delete" ON crm_lead_installments FOR DELETE TO authenticated USING (true);

-- 3. kit_templates (1 row)
ALTER TABLE kit_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kit_templates_select" ON kit_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "kit_templates_insert" ON kit_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kit_templates_update" ON kit_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "kit_templates_delete" ON kit_templates FOR DELETE TO authenticated USING (true);

-- 4. kit_template_contents (14 rows)
ALTER TABLE kit_template_contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kit_template_contents_select" ON kit_template_contents FOR SELECT TO authenticated USING (true);
CREATE POLICY "kit_template_contents_insert" ON kit_template_contents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kit_template_contents_update" ON kit_template_contents FOR UPDATE TO authenticated USING (true);
CREATE POLICY "kit_template_contents_delete" ON kit_template_contents FOR DELETE TO authenticated USING (true);

-- 5. ip_rules (0 rows)
ALTER TABLE ip_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ip_rules_select" ON ip_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "ip_rules_insert" ON ip_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ip_rules_update" ON ip_rules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ip_rules_delete" ON ip_rules FOR DELETE TO authenticated USING (true);
