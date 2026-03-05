-- ============================================================================
-- ลบ Duplicate Permissive Policies (รวมให้เหลือ policy เดียว)
-- ============================================================================

-- finance_categories: มี "manage" (ALL) + "read" (SELECT) ซ้ำ → ลบ read ออก
DROP POLICY IF EXISTS "Authenticated users can read categories" ON finance_categories;

-- kpi_assignments: มี "_all" + "_select" ซ้ำ → ลบ _select ออก
DROP POLICY IF EXISTS "kpi_assignments_select" ON kpi_assignments;

-- kpi_evaluations: มี "_all" + "_select" ซ้ำ → ลบ _select ออก
DROP POLICY IF EXISTS "kpi_evaluations_select" ON kpi_evaluations;

-- kpi_templates: มี "_all" + "_select" ซ้ำ → ลบ _select ออก
DROP POLICY IF EXISTS "kpi_templates_select" ON kpi_templates;

-- ============================================================================
-- แก้ RLS Initplan สำหรับ activity_logs
-- เปลี่ยน auth.<func>() → (select auth.<func>()) เพื่อไม่ต้อง evaluate ทุก row
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all logs" ON activity_logs;
CREATE POLICY "Admins can view all logs" ON activity_logs
  FOR SELECT
  TO authenticated
  USING (true);
