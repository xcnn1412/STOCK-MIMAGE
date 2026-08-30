-- Required roles per CRM lead: {"<staff_role value>": count} — drives "จัดคนครบ" on /jobs/tracking
alter table crm_leads
  add column if not exists required_roles jsonb not null default '{}'::jsonb;
