-- ============================================================================
-- เพิ่ม Index สำหรับ FK ที่ยังไม่มี covering index (25 คู่)
-- ============================================================================

-- activity_logs (4,936 rows — สำคัญสูงสุด)
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_target_user_id ON activity_logs(target_user_id);

-- login_logs (346 rows)
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);

-- kit_contents (303 rows)
CREATE INDEX IF NOT EXISTS idx_kit_contents_item_id ON kit_contents(item_id);

-- crm_activities (247 rows)
CREATE INDEX IF NOT EXISTS idx_crm_activities_created_by ON crm_activities(created_by);

-- job_checklist_items (150 rows)
CREATE INDEX IF NOT EXISTS idx_job_checklist_items_checked_by ON job_checklist_items(checked_by);

-- crm_leads
CREATE INDEX IF NOT EXISTS idx_crm_leads_created_by ON crm_leads(created_by);
CREATE INDEX IF NOT EXISTS idx_crm_leads_event_id ON crm_leads(event_id);

-- expense_claims
CREATE INDEX IF NOT EXISTS idx_expense_claims_approved_by ON expense_claims(approved_by);

-- expense_claim_logs
CREATE INDEX IF NOT EXISTS idx_expense_claim_logs_changed_by ON expense_claim_logs(changed_by);

-- finance_category_items
CREATE INDEX IF NOT EXISTS idx_finance_category_items_category_id ON finance_category_items(category_id);

-- event_logs
CREATE INDEX IF NOT EXISTS idx_event_logs_event_id ON event_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_item_id ON event_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_kit_id ON event_logs(kit_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_user_id ON event_logs(user_id);

-- ip_rules
CREATE INDEX IF NOT EXISTS idx_ip_rules_created_by ON ip_rules(created_by);

-- job_activities
CREATE INDEX IF NOT EXISTS idx_job_activities_created_by ON job_activities(created_by);

-- job_cost_events
CREATE INDEX IF NOT EXISTS idx_job_cost_events_imported_by ON job_cost_events(imported_by);

-- job_cost_items
CREATE INDEX IF NOT EXISTS idx_job_cost_items_recorded_by ON job_cost_items(recorded_by);

-- jobs
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON jobs(created_by);

-- kit_template_contents
CREATE INDEX IF NOT EXISTS idx_kit_template_contents_template_id ON kit_template_contents(template_id);

-- kits
CREATE INDEX IF NOT EXISTS idx_kits_event_id ON kits(event_id);

-- kpi_assignments
CREATE INDEX IF NOT EXISTS idx_kpi_assignments_created_by ON kpi_assignments(created_by);

-- kpi_templates
CREATE INDEX IF NOT EXISTS idx_kpi_templates_created_by ON kpi_templates(created_by);

-- ticket_replies
CREATE INDEX IF NOT EXISTS idx_ticket_replies_created_by ON ticket_replies(created_by);
