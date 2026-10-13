-- บันทึกพิเศษ (special note) for accepted CRM leads — free-text cell on /jobs/tracking, same behaviour as supplier_note / backdrop_note
alter table crm_leads
  add column if not exists special_note text;
