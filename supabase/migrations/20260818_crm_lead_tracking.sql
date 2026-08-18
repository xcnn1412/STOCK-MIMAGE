-- Tracking fields for accepted CRM leads (used by /jobs/tracking)
alter table crm_leads
  add column if not exists design_status text not null default 'not_started',
  add column if not exists supplier_note text,
  add column if not exists tracking_checklist jsonb not null default '[]'::jsonb;
