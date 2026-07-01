-- เป้าหมาย Sales Board แบบใช้ร่วมกันทั้งองค์กร (1 แถวต่อเดือน)
create table if not exists public.sales_board_targets (
  month      text primary key,            -- 'YYYY-MM'
  targets    jsonb not null default '{}',  -- { sales: number, revenue: number, ... }
  updated_at timestamptz not null default now()
);
