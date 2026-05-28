-- Drop crm_leads.event_id and its FK / index.
--
-- Background: This column was defined in 20260225_create_crm.sql as a 1:1 reference to job_cost_events
-- (FK: fk_event REFERENCES job_cost_events(id)). It was used as a "primary engagement" pointer and
-- as a back-channel link for various lookups, but the multi-event-per-lead refactor (Phase 1–3) moved
-- the canonical reverse links to:
--   • events.crm_lead_id           (1 lead → N operational events)
--   • job_cost_events.linked_lead_id (1 lead → N financial events)
--
-- All application reads/writes of crm_leads.event_id have been removed in Phase 4. This migration
-- removes the now-dead column from the schema. Run AFTER deploying the Phase-4 application code.

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS fk_event;

DROP INDEX IF EXISTS idx_crm_leads_event_id;

ALTER TABLE crm_leads
  DROP COLUMN IF EXISTS event_id;
