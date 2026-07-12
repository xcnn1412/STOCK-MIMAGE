alter table crm_leads add column if not exists work_type text check (work_type in ('sale','event','gp'));
