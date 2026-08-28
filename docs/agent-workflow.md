## Agent Workflow (Plan → Execute → Verify Loop) — Single-Prompt Mode

Pattern: **user สั่ง prompt เดียว → ระบบวิ่งจนจบเอง ไม่ถามกลับกลางทาง**
**Fable5 (main session) วางแผน+ตรวจเอง → dispatch Opus 4.8 ลงมือ → ไม่ผ่านวนใหม่ (สูงสุด 5 รอบ) → รายงานผลครั้งเดียวตอนจบ**

> Executor dispatch ผ่าน Agent tool ด้วย `model: "opus"` (เลือก tier ได้เท่านั้น เวอร์ชันจริงตาม session resolve)
> Planner + Critic = Fable5 ใน main session **ไม่ dispatch agent แยก** — ประหยัด 2 dispatch/รอบ และ context แผน+เกณฑ์อยู่ครบใน session อยู่แล้ว

### ขั้นตอนเมื่อรับ prompt (ทำตามลำดับ ห้ามข้าม)

```
0. Gate — งานเล็ก (แก้ไฟล์เดียว / config / คำถาม) → ทำเองทันที ไม่เข้า loop
   งานใหญ่ (หลายไฟล์ / feature / มี acceptance ชัดเจน) → เข้า loop

1. PLAN (Fable5, ครั้งเดียว)
   - อ่าน docs/ + โค้ดที่เกี่ยว → สร้างแผน + acceptance criteria (lock)
   - ตัดสินใจแทน user ทุกจุดที่คลุมเครือ → บันทึกเป็น assumptions ไว้รายงานตอนจบ
   - ห้ามถาม user ระหว่าง loop เด็ดขาด (ถามได้กรณีเดียว: ทำลายข้อมูล/เสียเงิน/irreversible)

2. EXECUTE (Opus 4.8 ผ่าน Agent tool)
   - รอบแรก: ส่งแผนเต็ม + criteria + path ไฟล์ที่เกี่ยว (ให้ agent อ่านไฟล์เอง ไม่ paste โค้ดยาว)
   - รอบ 2+: ส่งเฉพาะ {failures} + ไฟล์ที่ตก — ห้ามส่งแผนเต็มซ้ำ
   - สั่งใน prompt ของ executor เสมอ: "แก้เฉพาะจุดที่ระบุ ห้ามรื้อส่วนอื่น ตอบกลับเป็นรายการไฟล์ที่แก้+สรุปสั้น"

3. VERIFY (Fable5 ใน main session)
   - รันของจริงก่อนตัดสิน: build / typecheck / test / lint ตามที่ criteria ระบุ
   - เทียบกับ criteria ที่ lock เท่านั้น ห้ามเพิ่มเกณฑ์ใหม่ ข้าม passed_ids เดิม
   - ผลเป็น JSON ภายใน: {pass, score, passed_ids, failures:[{loc, ac_id, issue}]}

4. EXIT เมื่อเข้าเงื่อนไขใดเงื่อนไขหนึ่ง:
   pass=true | score ≥ threshold | score นิ่ง 2 รอบ | ครบ 5 รอบ

5. WRAP-UP (ครั้งเดียวตอนจบ)
   - อัปเดตสถานะใน docs/Project-workflow.md
   - commit + push (ถ้า user ตั้ง flow ไว้แล้ว)
   - รายงาน user ครั้งเดียว: ผลลัพธ์ / criteria ผ่าน-ตก / assumptions ที่ตัดสินใจแทน / สิ่งที่เหลือ
```

### กติกา acceptance criteria (หัวใจของการจบใน loop เดียว)

- **วัดได้ด้วยคำสั่ง** ให้มากที่สุด: ❌ "โค้ดสะอาด" ✅ "`pnpm build` ผ่าน", ✅ "`pnpm exec tsc --noEmit` ไม่มี error", ✅ "endpoint X ตอบ 200"
- เกณฑ์ไหน verify ด้วยคำสั่งได้ → Fable5 รันเองตอน VERIFY ไม่ต้องเชื่อรายงานของ executor
- 3–7 ข้อพอ เกณฑ์เยอะเกิน = วนไม่จบ, `pass_threshold` default 0.85
- lock ตั้งแต่รอบแรก ห้ามเปลี่ยน/เพิ่มระหว่างทาง

### หลักการประหยัด token (50–70% ในงานวนหลายรอบ)

| หลักการ | ทำอะไร |
|---|---|
| ส่ง delta ไม่ส่ง context เต็ม | รอบ 2+ ส่ง executor เฉพาะ failures ไม่ใช่งานทั้งชิ้น |
| ให้ agent อ่านไฟล์เอง | ส่ง path ไม่ paste เนื้อไฟล์ — agent มี Read/Grep ของตัวเอง |
| Verify ด้วยคำสั่งจริง | build/test ตัดสินแทนการอ่านโค้ดทีละบรรทัด |
| Critic ตอบ JSON สั้น | ห้ามเรียงความ |
| Lock passed_ids | ส่วนที่ผ่านแล้วไม่ตรวจซ้ำ ไม่ให้ executor แตะ |
| Early exit | หยุดทันทีที่เข้าเงื่อนไขข้อ 4 |

### กฎทอง

1. **Prompt เดียวต้องจบ** — ตัดสินใจแทน user แล้วบันทึก assumption, ไม่ถามกลางทาง
2. เกณฑ์ต้อง**วัดได้ด้วยคำสั่ง** และ lock ตั้งแต่แรก
3. Executor แก้**เฉพาะจุดที่ตก** ห้าม regenerate ทั้งชิ้น
4. Verify ด้วย**การรันจริง** ไม่ใช่การอ่านรายงาน
5. รายงาน user **ครั้งเดียวตอนจบ**: ผล + assumptions + สิ่งที่เหลือ
