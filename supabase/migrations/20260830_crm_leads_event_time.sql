-- Event start/end time on CRM leads (start time also sorts /jobs/tracking within the same event_date)
alter table crm_leads
  add column if not exists event_time time,
  add column if not exists event_end_time time;
