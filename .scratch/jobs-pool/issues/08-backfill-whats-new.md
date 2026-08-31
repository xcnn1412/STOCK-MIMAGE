# 08: Backfill งานเก่า + มีอะไรใหม่ + wrap-up

**What to build:** script ครั้งเดียว (scripts/) สร้างใบงานให้งาน accepted เดิมที่ยังไม่จบจริง (อีเวนต์ยังไม่ completed และวันงานยังไม่ผ่าน) ข้ามงานที่มีใบงานแล้ว — รันซ้ำได้ไม่สร้างซ้ำ พร้อมเติม UpdateEntry บนสุดของหน้า "มีอะไรใหม่" (ภาษาไทยมุมมองผู้ใช้ ตามกติกา CLAUDE.md) และอัปเดตสถานะใน docs/Project-workflow.md

**Blocked by:** 01, 04 (เกณฑ์ "จบจริง" ต้องนิ่งก่อน backfill)

**Status:** ready-for-agent

- [ ] script รันด้วย tsx ได้ รายงานจำนวนงานที่สร้าง/ข้าม — รันรอบสองสร้าง 0 ใบ
- [ ] งาน accepted ที่อีเวนต์ completed แล้วหรือวันงานผ่านแล้ว ไม่ถูกสร้างใบงาน
- [ ] UPDATES ใน whats-new มี entry ใหม่บนสุด date = วันที่ ship, tag ถูกต้อง, ไม่มีศัพท์เทคนิค
- [ ] docs/Project-workflow.md ถูกติ๊ก + ลงวันที่
- [ ] `npx tsc --noEmit` ผ่าน
