-- สีฉาก (backdrop / set colour) note for accepted CRM leads — shown next to ซัพพลายเออร์ on /jobs/tracking
alter table crm_leads
  add column if not exists backdrop_note text;
