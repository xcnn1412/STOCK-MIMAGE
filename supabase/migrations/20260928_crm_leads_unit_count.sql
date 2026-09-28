-- จำนวนตู้ของการ์ดประเภทขาย (ใช้นับยอดตู้ในหน้า สรุปค่าคอมแอดมิน) — ว่าง = นับเป็น 1 ตู้
-- idempotent: รันซ้ำได้
alter table crm_leads add column if not exists unit_count integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_leads_unit_count_check' and conrelid = 'crm_leads'::regclass
  ) then
    alter table crm_leads
      add constraint crm_leads_unit_count_check check (unit_count is null or unit_count >= 1);
  end if;
end $$;
