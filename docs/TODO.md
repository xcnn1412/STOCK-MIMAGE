# TODO

## ตั้ง Cron ดึงผลโพสต์อัตโนมัติ (Content Planner) — ยังไม่ได้ทำ

ระบบพร้อมแล้ว (endpoint `/api/cron/fetch-metrics` อยู่ในโค้ดแล้ว) เหลือตั้งเวลา 2 ขั้น:

### 1) ตั้ง secret ใน Railway
- เพิ่ม env `CRON_SECRET` = สตริงสุ่มยาวๆ แล้ว redeploy
- (ถ้ายังไม่ตั้ง endpoint จะปิดตาย ปลอดภัย ไม่มีใครยิงได้)

### 2) สั่งเวลาใน Supabase (Dashboard → SQL Editor)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- รายวัน ตี 5 เวลาไทย (22:00 UTC) — เลือกรอบเดียว:
select cron.schedule('content-metrics', '0 22 * * *', $$
  select net.http_get('https://<โดเมนแอป>/api/cron/fetch-metrics?secret=<CRON_SECRET>')
$$);

-- รายสัปดาห์ (จันทร์ ตี 5):  '0 22 * * 1'
-- รายเดือน (วันที่ 1 ตี 5):  '0 22 1 * *'
-- เปลี่ยนรอบ: select cron.unschedule('content-metrics'); แล้ว schedule ใหม่
```

### ทดสอบ
- เปิด `https://<โดเมนแอป>/api/cron/fetch-metrics?secret=<CRON_SECRET>` ในเบราว์เซอร์ → ได้ JSON `{ scanned, updated, failed }`
- ผลรอบล่าสุดเก็บใน `app_settings` key `metrics_cron_last_run`

### เงื่อนไขที่ cron ดึง
- โพสต์สถานะ "โพสต์แล้ว" + มีลิงก์โพสต์ + โพสต์มาไม่เกิน 90 วัน (สูงสุด 50 โพสต์/รอบ)
- FB/IG ต้องใส่ Meta Token ที่ ตั้งค่า > คอนเทนต์ (Meta API) ก่อน / TikTok ดึงได้เลย
