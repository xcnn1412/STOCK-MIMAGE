-- ============================================================================
-- Security Patch: Fix wide-open RLS policies
-- Add `TO authenticated` clause to restrict access to authenticated users only
-- ============================================================================

-- CRM Settings
DROP POLICY IF EXISTS "Allow all for authenticated" ON crm_settings;
CREATE POLICY "Auth only" ON crm_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CRM Leads
DROP POLICY IF EXISTS "Allow all for authenticated" ON crm_leads;
CREATE POLICY "Auth only" ON crm_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CRM Activities
DROP POLICY IF EXISTS "Allow all for authenticated" ON crm_activities;
CREATE POLICY "Auth only" ON crm_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Job Cost Events
DROP POLICY IF EXISTS "Allow all for authenticated" ON job_cost_events;
CREATE POLICY "Auth only" ON job_cost_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Job Cost Items
DROP POLICY IF EXISTS "Allow all for authenticated" ON job_cost_items;
CREATE POLICY "Auth only" ON job_cost_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
