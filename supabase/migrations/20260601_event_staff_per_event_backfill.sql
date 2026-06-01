-- Per-event staff: make event_staff the single source of truth for ALL events.
--
-- Background: Until now, staff for CRM-linked events was stored in crm_lead_staff,
-- keyed by lead_id. Because 1 lead → N events (multi-event-per-lead refactor), every
-- event sharing a lead read & wrote the SAME staff rows — so assigning staff on one
-- sub-event silently overwrote its siblings, and every sub-event's edit form showed
-- the same lead-level staff. (Reported bug: "set staff per event, save, but it keeps
-- pulling from CRM".)
--
-- Fix: event_staff (keyed by event_id) becomes the canonical store for EVERY event,
-- CRM-linked or standalone. The application code (events/actions.ts, the event edit
-- page, crm/actions.ts, jobs/actions.ts) is updated to read/write event_staff only.
-- check-in already resolves roles from event_staff by event_id, so wage calculation
-- is unaffected.
--
-- This migration backfills existing lead-level assignments DOWN to each linked event
-- so nothing is lost: every operational event inherits a copy of its lead's staff,
-- which admins can then edit independently per event.
--
-- crm_lead_staff is intentionally NOT dropped here — it is kept as-is for rollback
-- safety and can be retired in a later migration once the new flow is verified.

INSERT INTO event_staff (event_id, user_id, role, note)
SELECT e.id, s.user_id, s.role, s.note
FROM crm_lead_staff s
JOIN events e ON e.crm_lead_id = s.lead_id
ON CONFLICT (event_id, user_id, role) DO NOTHING;
