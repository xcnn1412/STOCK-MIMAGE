-- ============================================================================
-- ลบ Indexes ที่ไม่เคยถูกใช้งาน (17 indexes)
-- ช่วยลด overhead ของ INSERT/UPDATE operations
-- ============================================================================

DROP INDEX IF EXISTS idx_kpi_evaluations_evaluated_by;
DROP INDEX IF EXISTS idx_kpi_evaluations_evaluation_date;
DROP INDEX IF EXISTS idx_crm_lead_installments_lead_id;
DROP INDEX IF EXISTS idx_job_cost_events_status;
DROP INDEX IF EXISTS idx_job_cost_items_category;
DROP INDEX IF EXISTS idx_job_activities_type;
DROP INDEX IF EXISTS idx_crm_leads_event_date;
DROP INDEX IF EXISTS idx_crm_activities_type;
DROP INDEX IF EXISTS idx_ip_rules_address;
DROP INDEX IF EXISTS idx_job_settings_active;
DROP INDEX IF EXISTS idx_jobs_status;
DROP INDEX IF EXISTS idx_jobs_event_date;
DROP INDEX IF EXISTS idx_tickets_category;
DROP INDEX IF EXISTS idx_tickets_status;
DROP INDEX IF EXISTS idx_checklist_templates_type_status;
DROP INDEX IF EXISTS idx_checklist_templates_active;
DROP INDEX IF EXISTS idx_claim_logs_created_at;
