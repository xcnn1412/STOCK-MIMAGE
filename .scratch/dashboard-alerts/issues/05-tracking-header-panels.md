# 05: แผงทั้งสองบนหัว /jobs/tracking

**What to build:** แผง "งานในมือคุณ" และ "หน้าที่ยังไม่ครบ" (component เดียวกับ dashboard) แสดงเหนือแท็บพูลใน /jobs/tracking — คนที่ทำงานอยู่ในพูลเห็นคำเตือนชุดเดียวกันโดยไม่ต้องกลับ dashboard

**Blocked by:** 03, 04

**Status:** done

- [x] ใช้ component ชุดเดียวกับ dashboard (ไม่ก๊อปโค้ด) และข้อมูลจากฟังก์ชันกลางของ ticket 01 (ไม่ query ซ้ำ)
- [x] แผงว่าง = ไม่กินพื้นที่ หน้า tracking เหมือนเดิม
- [x] `npx tsc --noEmit` ไม่มี error ใหม่
