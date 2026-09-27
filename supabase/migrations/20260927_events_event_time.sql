-- เวลาเปิด / เวลาปิด ของอีเวนต์ (optional opening & closing time-of-day, separate from the event_date day)
alter table events
  add column if not exists event_time time,
  add column if not exists event_end_time time;
