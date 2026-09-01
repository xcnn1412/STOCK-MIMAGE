# 02: ไฮไลต์ ?lead= บนแท็บจัดคน / จัดรถ / จัดกระเป๋า

**What to build:** เปิด URL `/jobs/tracking?tab=<staffing|vehicle|kits>&lead=<id>` แล้วแถว/การ์ดของงานนั้นในแท็บหน้าที่ได้กรอบสีแดง + จอเลื่อนไปหาอัตโนมัติ — พฤติกรรมเดียวกับที่แท็บกราฟิก/หน้างานมีแล้ว ทดสอบได้ด้วยการพิมพ์ URL ตรงๆ

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] ทั้งสามแท็บหน้าที่รองรับ `?lead=` — งานที่ตรงได้กรอบแดง (border + ring) และ scrollIntoView ครั้งเดียวตอนเข้าหน้า
- [ ] ไม่มี `?lead=` หรือ id ไม่อยู่ในแท็บ = หน้าตาเหมือนเดิมทุกประการ
- [ ] `npx tsc --noEmit` ไม่มี error ใหม่
