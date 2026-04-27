'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/i18n/context'
import {
  BookOpen, Banknote, FileText, CheckCircle2, Clock, Receipt, Wallet, RefreshCw,
  XCircle, Ban, Send, ShieldAlert, Upload, Bell, Layout, User, UserCog,
  CircleDollarSign, ListChecks, ArrowRight, ExternalLink, Edit3, Lock,
  GitBranch, ChevronDown, Building2, Hash, Sparkles, FileSpreadsheet, Percent,
  AlertCircle, X, Camera, MapPin, Home, LogIn, LogOut, History,
} from 'lucide-react'

export default function HowtoView() {
  const { locale } = useLocale()
  const isEn = locale === 'en'

  return (
    <div id="top" className="max-w-5xl mx-auto space-y-8 pb-12">

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/20 dark:via-zinc-900 dark:to-teal-950/20 p-6 md:p-8">
        <div className="relative flex items-start gap-4">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 shrink-0">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'How-to Guide' : 'คู่มือใช้งาน'}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1.5">
              {isEn
                ? 'Step-by-step guides for each feature in Office Hub.'
                : 'คู่มือการใช้งานฟีเจอร์ต่างๆ ในระบบ Office Hub แบบ step-by-step'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Module library — landing card grid ────────────────────── */}
      <ModuleLibrary modules={MODULES} isEn={isEn} />

      {/* ════════════════════════════════════════════════════════════════
          MODULE: FINANCE
          ════════════════════════════════════════════════════════════════ */}
      <section className="space-y-6">
        <ModuleHero mod={MODULES[0]} isEn={isEn} />
        <ModuleSubToc mod={MODULES[0]} isEn={isEn} />

        {/* ── What's new (Apr 2026) ───────────────────────────────── */}
        <div id="finance-whats-new" className="scroll-mt-6">
          <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-900 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-600 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  {isEn ? "What's new — April 2026" : 'อัปเดตใหม่ — เมษายน 2026'}
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  {isEn
                    ? '5 changes that affect how you submit and audit claims'
                    : 'การเปลี่ยนแปลง 5 อย่างที่กระทบการเบิก/ตรวจสอบใบเบิก'}
                </p>
              </div>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-emerald-900 dark:text-emerald-200">
              <NewItem
                icon={<Building2 className="h-3.5 w-3.5" />}
                titleTh="แหล่งเงินที่ใช้เบิก"
                titleEn="Funding source"
                descTh="เลือกได้ว่าใช้เงินบริษัท หรือเงินส่วนตัวออกก่อน (reimbursement)"
                descEn="Choose: company money or personal money (reimburse)"
                isEn={isEn}
              />
              <NewItem
                icon={<Hash className="h-3.5 w-3.5" />}
                titleTh="เลขที่ใบกำกับภาษี + แนบหลายใบ"
                titleEn="Tax invoice numbers + multi-row"
                descTh="เพิ่มเลขที่ใบกำกับ และอัพโหลดได้หลายใบในครั้งเดียว — แต่ละใบมีเลขของตัวเอง"
                descEn="Pair file + number per invoice; upload multiple at once"
                isEn={isEn}
              />
              <NewItem
                icon={<ListChecks className="h-3.5 w-3.5" />}
                titleTh="Document checklist"
                titleEn="Document checklist"
                descTh="แสดงสถานะเอกสารแต่ละใบ: ใบเสร็จ • ใบกำกับ • คืนเงิน — ตรวจครบหรือยัง"
                descEn="Status of receipts / tax invoice / refund per claim"
                isEn={isEn}
              />
              <NewItem
                icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                titleTh="หน้ารายงานตรวจสอบ (overview)"
                titleEn="Audit Report page"
                descTh="ตาราง filter วัน/สัปดาห์/เดือน/ปี + export Excel/PDF — ใช้เป็นใบปะหน้าก่อนส่งบัญชี"
                descEn="Filter day/week/month/year + Excel/PDF export — for accounting handover"
                isEn={isEn}
              />
              <NewItem
                icon={<Percent className="h-3.5 w-3.5" />}
                titleTh="หน้า WHT แยกชัด"
                titleEn="WHT page focused"
                descTh="/finance/download → สรุปหัก ณ ที่จ่ายรายบุคคลเท่านั้น (ภ.ง.ด.3 / 53)"
                descEn="/finance/download → WHT-only summary (per-person)"
                isEn={isEn}
              />
            </ul>
          </div>
        </div>

        {/* ── Flowcharts ──────────────────────────────────────────── */}
        <div id="finance-flowcharts" className="scroll-mt-6 space-y-6">
          <SectionHeader
            icon={<GitBranch className="h-4 w-4" />}
            title={isEn ? 'Step-by-step flowcharts' : 'แผนผังขั้นตอน'}
          />

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2 text-[10px] p-2.5 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <span className="font-semibold text-zinc-500 uppercase tracking-wider">{isEn ? 'Legend' : 'สัญลักษณ์'}:</span>
            <LegendDot variant="start"   label={isEn ? 'Start' : 'เริ่ม'} />
            <LegendDot variant="user"    label={isEn ? 'User' : 'User'} />
            <LegendDot variant="admin"   label={isEn ? 'Admin' : 'Admin'} />
            <LegendDot variant="decision" label={isEn ? 'Decision' : 'ทางเลือก'} />
            <LegendDot variant="success" label={isEn ? 'Terminal' : 'จบ'} />
            <LegendDot variant="error"   label={isEn ? 'Rejected' : 'ปฏิเสธ'} />
          </div>

          {/* ═════ Flowchart 1: USER — Normal flow ═════ */}
          <FlowchartBox
            title={isEn ? 'Flow A — User: Event / Other claim' : 'Flow A — User: เบิกงานอีเวนต์ / ค่าอื่นๆ'}
            subtitle={isEn ? 'How a regular employee files a normal claim' : 'พนักงานทั่วไปยื่นใบเบิกปกติ'}
            color="sky"
          >
            <FlowNode variant="start" emoji="🎬" title={isEn ? 'Need to claim expense' : 'ต้องการเบิกค่าใช้จ่าย'} />
            <FlowArrow />
            <FlowNode variant="user"  emoji="📝" title={isEn ? 'Create new claim' : 'สร้างใบเบิกใหม่'} subtitle="/finance/new" tag="status: draft" />
            <FlowArrow />
            <FlowNode variant="user"  emoji="✏️" title={isEn ? 'Fill in details' : 'กรอกข้อมูล'} subtitle={isEn ? 'type, funding source, category, amount, VAT/WHT, attach receipt, bank info' : 'ประเภท / แหล่งเงิน / หมวดหมู่ / ยอด / VAT / WHT / แนบใบเสร็จ / เลขบัญชี'} />
            <FlowArrow />
            <FlowNode variant="user"  emoji="📤" title={isEn ? 'Submit for approval' : 'กดส่งอนุมัติ'} tag="draft → pending" />
            <FlowArrow label={isEn ? 'can cancel anytime → cancelled' : 'ยกเลิกได้ตลอด → cancelled'} />
            <FlowNode variant="decision" emoji="⏳" title={isEn ? 'Admin reviews — 4 outcomes' : 'Admin ตรวจ — 4 ทางเลือก'} />

            {/* 4-way branch */}
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              <FlowLane label={isEn ? '✓ Approved' : '✓ อนุมัติ'} color="emerald">
                <FlowNode variant="success" compact emoji="✅" title={isEn ? 'approved' : 'อนุมัติแล้ว'} tag="approved" />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="💵" title={isEn ? 'Admin pays out' : 'Admin จ่ายเงิน'} tag="→ paid" />
              </FlowLane>

              <FlowLane label={isEn ? '🧾 Tax invoice' : '🧾 ขอใบกำกับ'} color="sky">
                <FlowNode variant="decision" compact emoji="🧾" title="waiting_tax_invoice" />
                <FlowArrow />
                <FlowNode variant="user" compact emoji="📤" title={isEn ? 'User uploads' : 'user อัพโหลด'} />
                <FlowArrow label="auto" />
                <FlowNode variant="success" compact emoji="✅" title="approved" />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="💵" title={isEn ? 'Pay' : 'จ่ายเงิน'} tag="→ paid" />
              </FlowLane>

              <FlowLane label={isEn ? '📅 Month-end' : '📅 สิ้นเดือน'} color="violet">
                <FlowNode variant="decision" compact emoji="📅" title="pending_month_end" />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="💵" title={isEn ? 'Batch pay at month-end' : 'จ่ายรอบสิ้นเดือน'} tag="→ paid" />
              </FlowLane>

              <FlowLane label={isEn ? '✗ Rejected' : '✗ ปฏิเสธ'} color="red">
                <FlowNode variant="error" compact emoji="❌" title={isEn ? 'With reason' : 'มีเหตุผล'} tag="rejected" />
                <FlowArrow />
                <FlowNode variant="terminal" compact emoji="🔄" title={isEn ? 'Create new claim' : 'สร้างใบใหม่'} />
              </FlowLane>
            </div>

            <FlowArrow />
            <FlowNode variant="success" emoji="🏁" title={isEn ? 'Done — claim closed' : 'จบเคส — ใบเบิกปิดแล้ว'} tag="paid (terminal)" />
          </FlowchartBox>

          {/* ═════ Flowchart 2: USER — Advance flow ═════ */}
          <FlowchartBox
            title={isEn ? 'Flow B — User: Advance payment' : 'Flow B — User: เบิกทดลองจ่าย'}
            subtitle={isEn ? 'Get money upfront, settle actual spend + refund later' : 'ขอเงินล่วงหน้า แล้วเคลียร์ค่าใช้จ่ายจริง + คืนเงินทีหลัง'}
            color="amber"
          >
            <FlowNode variant="start" emoji="💰" title={isEn ? 'Need advance money' : 'ต้องการเงินล่วงหน้า'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📝" title={isEn ? 'Create claim — type: advance' : 'สร้างใบเบิก — ประเภท: เบิกทดลองจ่าย'} subtitle="/finance/new" />
            <FlowArrow />
            <FlowNode variant="user" emoji="💵" title={isEn ? 'Enter advance amount (no receipt needed yet)' : 'ใส่ยอดที่ขอเบิก (ยังไม่ต้องแนบใบเสร็จ)'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📤" title={isEn ? 'Submit → wait for admin approval + payout' : 'ส่งอนุมัติ → รอ admin อนุมัติ + จ่ายเงิน'} tag="→ paid" />
            <FlowArrow label={isEn ? 'now you have the money' : 'ได้รับเงินแล้ว'} />
            <FlowNode variant="decision" emoji="🛒" title={isEn ? 'Go spend — collect receipts' : 'ไปใช้เงินจริง — เก็บใบเสร็จ'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📂" title={isEn ? 'Re-open claim → "Update actual spend" box' : 'เปิดใบเดิม → กล่อง "อัพเดทค่าใช้จ่ายจริง"'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="➕" title={isEn ? 'Add line items + attach receipts' : 'เพิ่มรายการ + แนบใบเสร็จ'} subtitle={isEn ? 'System auto-calculates refund amount' : 'ระบบคำนวณเงินคืนให้อัตโนมัติ'} />
            <FlowArrow />
            <FlowNode variant="decision" emoji="💭" title={isEn ? 'Refund > 0?' : 'มีเงินคืน > 0 ไหม?'} />

            {/* Branch: refund or not */}
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              <FlowLane label={isEn ? 'Yes — refund needed' : 'ใช่ — ต้องคืนเงิน'} color="cyan">
                <FlowNode variant="user" compact emoji="🏦" title={isEn ? 'Transfer refund to company' : 'โอนเงินคืนบริษัท'} />
                <FlowArrow />
                <FlowNode variant="user" compact emoji="📎" title={isEn ? 'Attach refund slip' : 'แนบสลิปการโอนคืน'} />
                <FlowArrow />
                <FlowNode variant="user" compact emoji="💾" title={isEn ? 'Click "Save update"' : 'กด "บันทึกการอัพเดท"'} />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="👀" title={isEn ? 'Admin checks refund slip' : 'Admin ตรวจสลิปโอนคืน'} />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="✅" title={isEn ? 'Admin confirms received' : 'Admin ยืนยันรับเงิน'} />
                <FlowArrow />
                <FlowNode variant="success" compact emoji="💸" title={isEn ? 'refund_confirmed (done)' : 'คืนเงินบริษัทแล้ว (จบ)'} tag="refund_confirmed" />
              </FlowLane>

              <FlowLane label={isEn ? 'No — used all' : 'ไม่ใช่ — ใช้หมดพอดี'} color="zinc">
                <FlowNode variant="user" compact emoji="💾" title={isEn ? 'Click "Save update"' : 'กด "บันทึกการอัพเดท"'} />
                <FlowArrow />
                <FlowNode variant="success" compact emoji="🏁" title={isEn ? 'Stays "paid" — done' : 'อยู่ paid ตามเดิม — จบ'} tag="paid (terminal)" />
              </FlowLane>
            </div>
          </FlowchartBox>

          {/* ═════ Flowchart 3: ADMIN ═════ */}
          <FlowchartBox
            title={isEn ? 'Flow C — Admin: Review & finalize' : 'Flow C — Admin: ตรวจและปิดเคส'}
            subtitle={isEn ? 'How admin handles every incoming claim' : 'วิธี admin จัดการใบเบิกที่เข้ามา'}
            color="purple"
          >
            <FlowNode variant="start" emoji="🔔" title={isEn ? 'New claim notification (pending)' : 'แจ้งเตือน: ใบเบิกใหม่ (pending)'} />
            <FlowArrow />
            <FlowNode variant="admin" emoji="📖" title={isEn ? 'Open claim detail' : 'เปิดดูใบเบิก'} subtitle="/finance/{id}" />
            <FlowArrow />
            <FlowNode variant="admin" emoji="🔍" title={isEn ? 'Review: receipt, amount, category, claimant' : 'ตรวจ: ใบเสร็จ / ยอด / หมวดหมู่ / ผู้เบิก'} />
            <FlowArrow />
            <FlowNode variant="decision" emoji="⚖️" title={isEn ? 'Decision — 4 options' : 'ตัดสิน — 4 ทางเลือก'} />

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              <FlowLane label={isEn ? 'A. Approve' : 'A. อนุมัติ'} color="emerald">
                <FlowNode variant="admin" compact emoji="✅" title={isEn ? 'Click "Approve"' : 'กด "อนุมัติ"'} tag="→ approved" />
              </FlowLane>

              <FlowLane label={isEn ? 'B. Request invoice' : 'B. ขอใบกำกับ'} color="sky">
                <FlowNode variant="admin" compact emoji="🧾" title={isEn ? 'Wait for tax invoice' : 'ขอใบกำกับภาษี'} tag="→ waiting_tax_invoice" />
                <FlowArrow label={isEn ? 'user uploads → auto' : 'user upload → auto'} />
                <FlowNode variant="success" compact emoji="✅" title="approved" />
              </FlowLane>

              <FlowLane label={isEn ? 'C. Month-end' : 'C. สิ้นเดือน'} color="violet">
                <FlowNode variant="admin" compact emoji="📅" title={isEn ? 'Queue for month-end' : 'เข้าคิวสิ้นเดือน'} tag="→ pending_month_end" />
              </FlowLane>

              <FlowLane label={isEn ? 'D. Reject' : 'D. ปฏิเสธ'} color="red">
                <FlowNode variant="error" compact emoji="❌" title={isEn ? 'Reject with reason' : 'ปฏิเสธ + ใส่เหตุผล'} tag="→ rejected (end)" />
              </FlowLane>
            </div>

            <FlowArrow label={isEn ? 'paths A / B / C continue below' : 'ทางเลือก A / B / C ต่อด้านล่าง'} />
            <FlowNode variant="admin" emoji="💵" title={isEn ? 'Pay out → click "Paid"' : 'จ่ายเงิน → กด "ชำระแล้ว"'} tag="→ paid" />
            <FlowArrow />
            <FlowNode variant="decision" emoji="🤔" title={isEn ? 'Claim type?' : 'ประเภทใบเบิก?'} />

            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              <FlowLane label={isEn ? 'Normal (event/other)' : 'ปกติ (event/other)'} color="emerald">
                <FlowNode variant="success" compact emoji="🏁" title={isEn ? 'Done — paid (terminal)' : 'จบ — paid (terminal)'} />
              </FlowLane>

              <FlowLane label={isEn ? 'Advance — wait for settle' : 'Advance — รอ user settle'} color="cyan">
                <FlowNode variant="admin" compact emoji="⏳" title={isEn ? 'Wait for user to settle actual spend' : 'รอ user อัพเดทค่าใช้จ่ายจริง'} />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="📋" title={isEn ? 'Review line items + refund slip' : 'ตรวจรายการ + สลิปโอนคืน'} />
                <FlowArrow />
                <FlowNode variant="decision" compact emoji="💭" title={isEn ? 'Refund?' : 'มีเงินคืน?'} />
                <FlowArrow label={isEn ? 'yes, slip verified' : 'ใช่ ตรงกับสลิป'} />
                <FlowNode variant="admin" compact emoji="✅" title={isEn ? 'Click "Confirm received"' : 'กด "ยืนยันรับเงิน"'} />
                <FlowArrow />
                <FlowNode variant="success" compact emoji="💸" title="refund_confirmed" tag="terminal" />
              </FlowLane>
            </div>
          </FlowchartBox>

          {/* Tips */}
          <div className="flex items-start gap-2.5 p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
            <span className="text-lg leading-none">💡</span>
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <p className="font-semibold mb-1">{isEn ? 'Tips' : 'เคล็ดลับ'}</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800 dark:text-amber-300">
                <li>{isEn ? 'Admin can "Override status" anytime with a reason — useful for corrections.' : 'Admin กด "Override status" เปลี่ยน status ได้ทุกช่อง (ต้องใส่เหตุผล) — ใช้แก้ไขกรณีพิเศษ'}</li>
                <li>{isEn ? 'Advance claims: save update multiple times — each save is logged.' : 'เบิกทดลองจ่าย: กดบันทึกได้หลายครั้ง — ทุกครั้งถูกบันทึกใน log'}</li>
                <li>{isEn ? 'After refund_confirmed, editing is locked — need admin override to unlock.' : 'หลัง refund_confirmed แก้ไขไม่ได้ — ต้อง admin override ก่อน'}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── 3 claim types ───────────────────────────────────────── */}
        <div id="finance-types" className="scroll-mt-6">
          <SectionHeader
            icon={<ListChecks className="h-4 w-4" />}
            title={isEn ? 'Claim types (3 kinds)' : 'ประเภทใบเบิก (3 แบบ)'}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TypeCard
              emoji="📅"
              title={isEn ? 'Event Claim' : 'เบิกงานอีเวนต์'}
              subtitle="event"
              desc={isEn ? 'Expenses linked to a client job/event.' : 'เบิกค่าใช้จ่ายที่เกิดจากงานลูกค้า (ผูกกับ job event)'}
              receipt={isEn ? 'Required' : 'ต้องแนบใบเสร็จ'}
              receiptColor="amber"
            />
            <TypeCard
              emoji="📝"
              title={isEn ? 'Other Claim' : 'เบิกค่าอื่นๆ'}
              subtitle="other"
              desc={isEn ? 'General expenses not tied to a specific job.' : 'เบิกค่าใช้จ่ายทั่วไป ไม่ผูกกับ job'}
              receipt={isEn ? 'Required' : 'ต้องแนบใบเสร็จ'}
              receiptColor="amber"
            />
            <TypeCard
              emoji="💰"
              title={isEn ? 'Advance Payment' : 'เบิกทดลองจ่าย'}
              subtitle="advance"
              desc={isEn ? 'Get money upfront, settle actual spend later.' : 'ขอเงินล่วงหน้าก่อนไปทำงาน แล้วเคลียร์ทีหลัง'}
              receipt={isEn ? 'Not required yet' : 'ไม่ต้องแนบใบเสร็จ (ยังไม่มี)'}
              receiptColor="emerald"
            />
          </div>
        </div>

        {/* ── Funding source (เงินบริษัท / เงินส่วนตัว) ──────────── */}
        <div id="finance-funding" className="scroll-mt-6">
          <SectionHeader
            icon={<Building2 className="h-4 w-4" />}
            title={isEn ? 'Funding source — who paid first?' : 'แหล่งเงินที่ใช้เบิก — ใครออกก่อน?'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border-2 border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-sky-900 dark:text-sky-200">
                    {isEn ? 'Company Money' : 'เงินบริษัท'}
                  </p>
                  <code className="text-[10px] font-mono text-sky-600">funding_source: company</code>
                </div>
              </div>
              <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
                {isEn
                  ? 'Default. The company pays the bill directly (e.g. via company card or transfer).'
                  : 'ค่า default — บริษัทจ่ายค่าใช้จ่ายตรง (บัตรบริษัท / โอนตรง)'}
              </p>
            </div>
            <div className="rounded-xl border-2 border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    {isEn ? 'Personal Money' : 'เงินส่วนตัว'}
                  </p>
                  <code className="text-[10px] font-mono text-amber-600">funding_source: personal</code>
                </div>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                {isEn
                  ? 'You paid out of pocket; the company will reimburse you after approval. Pick this when you bought something with your own money.'
                  : 'คุณออกเงินส่วนตัวก่อน — บริษัทจะโอนคืนให้หลังอนุมัติ เลือกแบบนี้เมื่อซื้อของด้วยเงินตัวเอง'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <AlertCircle className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
              {isEn
                ? 'Advance claims always default to "Company Money" (the company is sending money out — there\'s nothing personal to reimburse).'
                : 'ใบเบิก "ทดลองจ่าย" จะใช้แหล่งเงิน "บริษัท" เสมอ (บริษัทจ่ายเงินล่วงหน้าให้ — ไม่ใช่การ reimburse)'}
            </p>
          </div>
        </div>

        {/* ── Normal flow (event / other) ─────────────────────────── */}
        <div id="finance-normal" className="scroll-mt-6">
          <SectionHeader
            icon={<Send className="h-4 w-4" />}
            title={isEn ? 'Normal flow — Event / Other' : 'Flow ปกติ — งานอีเวนต์ / ค่าอื่นๆ'}
            color="emerald"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* User column */}
            <RoleCard
              role="user"
              title={isEn ? 'User (Claimant)' : 'User (ผู้เบิก)'}
              steps={isEn ? [
                { n: 1, label: 'Create claim at /finance/new', tag: 'draft' },
                { n: 2, label: 'Pick funding source: company money OR personal (reimbursement)', tag: 'funding_source' },
                { n: 3, label: 'Fill in category, amount, VAT/WHT, attach receipt, bank info', tag: null },
                { n: 4, label: 'Click "Submit for approval"', tag: 'draft → pending' },
                { n: 5, label: 'While waiting, can still cancel', tag: 'pending → cancelled' },
                { n: 6, label: 'If admin requests tax invoice → upload paired (file + number)', tag: 'waiting_tax_invoice → approved (auto)' },
                { n: 7, label: 'If rejected → see reason, create new claim (old one is locked)', tag: null },
              ] : [
                { n: 1, label: 'สร้างใบเบิกที่ /finance/new', tag: 'draft' },
                { n: 2, label: 'เลือก "แหล่งเงิน": เงินบริษัท หรือ เงินส่วนตัว (เบิกย้อนหลัง)', tag: 'funding_source' },
                { n: 3, label: 'กรอก: หัวข้อ, หมวดหมู่, ยอด, VAT/WHT, แนบใบเสร็จ, เลขบัญชี', tag: null },
                { n: 4, label: 'กด "ส่งอนุมัติ"', tag: 'draft → pending' },
                { n: 5, label: 'ระหว่างรอ — ยกเลิกได้', tag: 'pending → cancelled' },
                { n: 6, label: 'ถ้า admin ขอใบกำกับภาษี → แนบเป็นคู่ (ไฟล์ + เลขที่) ได้หลายใบ', tag: 'waiting_tax_invoice → approved (auto)' },
                { n: 7, label: 'ถ้าถูกปฏิเสธ → ดูเหตุผล + สร้างใบใหม่ (แก้ใบเก่าไม่ได้)', tag: null },
              ]}
            />

            {/* Admin column */}
            <RoleCard
              role="admin"
              title={isEn ? 'Admin' : 'Admin'}
              steps={isEn ? [
                { n: 1, label: 'Review pending claims in queue', tag: null },
                { n: 2, label: 'Approve directly', tag: 'pending → approved' },
                { n: 3, label: 'Or: request tax invoice first', tag: 'pending → waiting_tax_invoice' },
                { n: 4, label: 'Or: queue for month-end payout', tag: 'pending → pending_month_end' },
                { n: 5, label: 'Or: reject (with reason)', tag: 'pending → rejected' },
                { n: 6, label: 'After payout → mark "Paid"', tag: '→ paid (terminal)' },
                { n: 7, label: 'Override any status with reason (admin-only)', tag: 'any → any' },
              ] : [
                { n: 1, label: 'รับใบเบิกในคิว "รออนุมัติ"', tag: null },
                { n: 2, label: 'อนุมัติเลย', tag: 'pending → approved' },
                { n: 3, label: 'หรือ: ขอใบกำกับภาษีก่อน', tag: 'pending → waiting_tax_invoice' },
                { n: 4, label: 'หรือ: เข้าคิวจ่ายสิ้นเดือน', tag: 'pending → pending_month_end' },
                { n: 5, label: 'หรือ: ปฏิเสธ (ใส่เหตุผล)', tag: 'pending → rejected' },
                { n: 6, label: 'หลังจ่ายเงินออก → กด "ชำระแล้ว"', tag: '→ paid (terminal)' },
                { n: 7, label: 'Override สถานะได้ทุกช่อง (พร้อมเหตุผล)', tag: 'any → any' },
              ]}
            />
          </div>
        </div>

        {/* ── Advance flow ───────────────────────────────────────── */}
        <div id="finance-advance" className="scroll-mt-6">
          <SectionHeader
            icon={<Wallet className="h-4 w-4" />}
            title={isEn ? 'Advance flow — 2 phases' : 'Flow เบิกทดลองจ่าย — 2 ช่วง'}
            color="amber"
          />

          {/* Phase 1 */}
          <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-500 text-white text-xs font-bold">1</span>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {isEn ? 'Phase 1 — Get the advance' : 'ช่วง 1 — เบิกเงินล่วงหน้า'}
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniCard
                role="user"
                lines={isEn ? [
                  '1. Create claim, select type "Advance"',
                  '2. Enter advance amount requested',
                  '3. Submit — NO receipt needed yet',
                ] : [
                  '1. สร้างใบเบิก เลือกประเภท "เบิกทดลองจ่าย"',
                  '2. ใส่ยอดที่ขอเบิกล่วงหน้า',
                  '3. ส่งอนุมัติ — ไม่ต้องแนบใบเสร็จ',
                ]}
              />
              <MiniCard
                role="admin"
                lines={isEn ? [
                  '1. Review + approve',
                  '2. Transfer advance to user',
                  '3. Mark "Paid" (status: paid)',
                ] : [
                  '1. ตรวจ + อนุมัติ',
                  '2. โอนเงินล่วงหน้าให้ user',
                  '3. กด "ชำระแล้ว" (status: paid)',
                ]}
              />
            </div>
          </div>

          {/* Phase 2 */}
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50/40 dark:bg-cyan-950/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-cyan-600 text-white text-xs font-bold">2</span>
              <h4 className="text-sm font-bold text-cyan-900 dark:text-cyan-200">
                {isEn ? 'Phase 2 — Settle actual spend + refund' : 'ช่วง 2 — เคลียร์ค่าใช้จ่ายจริง + คืนเงิน'}
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniCard
                role="user"
                lines={isEn ? [
                  '1. Open claim → "Update actual spend" box',
                  '2. Add line items (fuel, meals, etc.) — quick-add presets available',
                  '3. Attach receipts',
                  '4. System auto-calculates refund',
                  '5. If refund > 0 → transfer back + attach refund slip',
                  '6. Click "Save update" (can save multiple times — each saves to log)',
                  `7. ${isEn ? 'After save, items are locked — click ✏️ edit to modify' : 'หลังบันทึก — ข้อมูลถูกล็อก ต้องกด ✏️ แก้ไขก่อน'}`,
                ] : [
                  '1. เปิดใบเบิกเดิม → กล่อง "อัพเดทค่าใช้จ่ายจริง"',
                  '2. เพิ่มรายการทีละรายการ (ค่าน้ำมัน, อาหาร, ฯลฯ) — มี quick-add preset',
                  '3. แนบสลิป/ใบเสร็จ',
                  '4. ระบบคำนวณเงินคืนอัตโนมัติ',
                  '5. ถ้ามีเงินคืน → โอนคืนบริษัท + แนบสลิปโอนคืน',
                  '6. กด "บันทึกการอัพเดท" (บันทึกได้หลายครั้ง — log เก็บทุกครั้ง)',
                  '7. หลังบันทึก — รายการถูกล็อก ต้องกดไอคอน ✏️ ก่อนแก้ไข',
                ]}
              />
              <MiniCard
                role="admin"
                lines={isEn ? [
                  '1. Review line items + receipts + refund slip',
                  '2. Verify refund was actually received in company account',
                  '3. If refund > 0 → click "Confirm Received"',
                  '4. Status → refund_confirmed (TERMINAL, permanently locked)',
                  '5. If no refund (used all) → stays "paid" as usual',
                ] : [
                  '1. ตรวจรายการ + ใบเสร็จ + สลิปโอนคืน',
                  '2. เช็คว่าได้รับเงินคืนในบัญชีบริษัทจริง',
                  '3. ถ้า refund > 0 → กดปุ่ม "ยืนยันรับเงิน"',
                  '4. Status → refund_confirmed (TERMINAL, ล็อกถาวร)',
                  '5. ถ้าไม่มีเงินคืน (ใช้หมด) → อยู่ paid ต่อไปตามปกติ',
                ]}
              />
            </div>
          </div>
        </div>

        {/* ── Tax invoice (paired upload) ─────────────────────────── */}
        <div id="finance-tax-invoice" className="scroll-mt-6">
          <SectionHeader
            icon={<Receipt className="h-4 w-4" />}
            title={isEn ? 'Tax invoice — paired upload' : 'ใบกำกับภาษี — แนบไฟล์คู่กับเลขที่'}
          />
          <div className="rounded-xl border-2 border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/20 p-4 space-y-3">
            <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
              {isEn
                ? 'When admin requests a tax invoice (status: waiting_tax_invoice), the upload box on the claim page lets you add multiple invoices — each row pairs one file with its own invoice number.'
                : 'เมื่อ admin ขอใบกำกับภาษี (สถานะ waiting_tax_invoice) ที่หน้าใบเบิกจะมีกล่องอัพโหลดที่เพิ่มได้หลายรายการ — แต่ละแถวคือใบกำกับ 1 ใบ พร้อมเลขที่ของตัวเอง'}
            </p>

            {/* Mock paired row */}
            <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-zinc-900 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400">
                  {isEn ? 'Invoice #1' : 'ใบกำกับ #1'}
                </span>
                <X className="h-3.5 w-3.5 text-zinc-400" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 mb-1 flex items-center gap-1">
                    <Hash className="h-2.5 w-2.5" />
                    {isEn ? 'Tax Invoice Number' : 'เลขที่ใบกำกับภาษี'}
                  </label>
                  <div className="px-2.5 py-1.5 text-xs font-mono border border-sky-200 dark:border-sky-800 rounded-md bg-zinc-50 dark:bg-zinc-800 text-zinc-400">
                    INV-2026-0001
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 mb-1 flex items-center gap-1">
                    <Upload className="h-2.5 w-2.5" />
                    {isEn ? 'Invoice File' : 'ไฟล์ใบกำกับภาษี'}
                  </label>
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-sky-50 dark:bg-sky-950/40 rounded-md border border-sky-200 dark:border-sky-800">
                    <FileText className="h-3 w-3 text-sky-500" />
                    <span className="text-[11px] text-zinc-500">invoice-1.pdf</span>
                  </div>
                </div>
              </div>
            </div>

            <ul className="space-y-1.5 text-xs text-sky-900 dark:text-sky-200">
              <li className="flex items-start gap-2">
                <span className="text-sky-500">•</span>
                <span>
                  {isEn
                    ? 'Click "+ Add another invoice" to add more rows — no limit.'
                    : 'กด "+ เพิ่มใบกำกับภาษีอีก" เพื่อเพิ่มรายการ — ไม่จำกัดจำนวน'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-500">•</span>
                <span>
                  {isEn
                    ? 'You can have only a number, only a file, or both — at least one is required per row.'
                    : 'จะมีเฉพาะเลขที่ หรือเฉพาะไฟล์ก็ได้ — แต่อย่างน้อยต้องกรอก 1 อย่างต่อแถว'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-500">•</span>
                <span>
                  {isEn
                    ? 'After save, status auto-transitions back to "approved" — admin can then mark paid.'
                    : 'หลังบันทึก status จะเปลี่ยนกลับเป็น approved อัตโนมัติ — admin กดชำระเงินได้ต่อ'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-500">•</span>
                <span>
                  {isEn
                    ? 'To edit/remove invoice numbers later: open the claim → "Tax Invoices" section → click "Edit".'
                    : 'แก้ไข/ลบเลขที่ภายหลัง: เปิดใบเบิก → ส่วน "ใบกำกับภาษี" → กดปุ่ม "แก้ไข"'}
                </span>
              </li>
            </ul>

            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isEn
                  ? 'Tax invoices are different from receipts. Use the "Receipts / Additional Documents" box (in Edit mode) for everything else — boarding passes, generic receipts, etc.'
                  : 'ใบกำกับภาษี ≠ ใบเสร็จทั่วไป — ใบเสร็จ/เอกสารอื่น ใช้กล่อง "ใบเสร็จ / เอกสารเพิ่มเติม" ในโหมดแก้ไข แทน'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Document checklist ─────────────────────────────────── */}
        <div id="finance-checklist" className="scroll-mt-6">
          <SectionHeader
            icon={<ListChecks className="h-4 w-4" />}
            title={isEn ? 'Document checklist — pre-accounting handover' : 'ตรวจเอกสารก่อนส่งสำนักงานบัญชี'}
          />
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
            {isEn
              ? 'Every claim has a checklist panel showing whether all required documents are in. Use it to spot incomplete claims before sending to accounting.'
              : 'ใบเบิกทุกใบมี panel checklist บอกว่าเอกสารครบหรือยัง — ใช้คัดกรองใบเบิกที่ยังไม่ครบก่อนส่งบัญชี'}
          </p>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Document' : 'เอกสาร'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'When required?' : 'ต้องมีเมื่อ?'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Counts as ✓ when' : 'นับ ✓ เมื่อ'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <ChecklistRow
                  emoji="📄"
                  label={isEn ? 'Receipt' : 'ใบเสร็จ'}
                  required={isEn ? 'Always (every claim)' : 'เสมอ (ทุกใบเบิก)'}
                  passes={isEn ? '≥1 receipt file uploaded (or actual_receipt for advance)' : 'แนบไฟล์ใบเสร็จอย่างน้อย 1 ไฟล์ (หรือ actual_receipt สำหรับ advance)'}
                />
                <ChecklistRow
                  emoji="🧾"
                  label={isEn ? 'Tax invoice' : 'ใบกำกับภาษี'}
                  required={isEn ? 'When status was waiting_tax_invoice OR a tax invoice was attached' : 'เมื่อสถานะเคยเป็น waiting_tax_invoice หรือเคยแนบใบกำกับ'}
                  passes={isEn ? '≥1 file uploaded OR ≥1 invoice number entered' : 'แนบไฟล์อย่างน้อย 1 ไฟล์ หรือ มีเลขที่ใบกำกับอย่างน้อย 1 รายการ'}
                />
                <ChecklistRow
                  emoji="🏦"
                  label={isEn ? 'Refund slip' : 'สลิปคืนเงิน'}
                  required={isEn ? 'Advance claims with refund > 0 only' : 'เฉพาะ advance ที่ refund > 0'}
                  passes={isEn ? '≥1 refund slip uploaded' : 'แนบสลิปการโอนคืนอย่างน้อย 1 ไฟล์'}
                />
                <ChecklistRow
                  emoji="✅"
                  label={isEn ? 'Refund confirmed' : 'ยืนยันคืนเงินแล้ว'}
                  required={isEn ? 'Advance claims with refund > 0 only' : 'เฉพาะ advance ที่ refund > 0'}
                  passes={isEn ? 'Status = refund_confirmed (admin clicked "Confirm received")' : 'สถานะ refund_confirmed (admin กด "ยืนยันรับเงิน")'}
                />
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            {isEn
              ? 'When all required boxes are ✓, the claim shows a green "READY" badge — safe to hand over to accounting. The audit report can filter to show only ready or only incomplete claims.'
              : 'เมื่อทุกช่องที่จำเป็น ✓ ใบเบิกจะแสดง badge สีเขียว "พร้อมส่งบัญชี" — รายงานตรวจสอบ filter ให้เห็นเฉพาะที่พร้อม/ที่ยังไม่ครบได้'}
          </p>
        </div>

        {/* ── Audit Report (/finance/overview) ────────────────────── */}
        <div id="finance-report" className="scroll-mt-6">
          <SectionHeader
            icon={<FileSpreadsheet className="h-4 w-4" />}
            title={isEn ? 'Audit Report — /finance/overview' : 'รายงานตรวจสอบ — /finance/overview'}
          />
          <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-3">
            <p className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
              {isEn
                ? 'A table-style audit page used as a cover sheet before sending claims to accounting. Filter by date range and status, verify document checklist per row, then export.'
                : 'หน้ารายงานตาราง ใช้เป็นใบปะหน้าตรวจเช็คก่อนส่งสำนักงานบัญชี — filter ช่วงวันที่ + สถานะ ตรวจ checklist รายแถว แล้ว export'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FeatureBlock
                titleTh="📅 ช่วงเวลา (Range)"
                titleEn="📅 Date range"
                lines={isEn
                  ? ['Today / 7 Days / Month / Year / Custom (date picker) / All']
                  : ['วันนี้ / 7 วัน / เดือนนี้ / ปีนี้ / กำหนดเอง (เลือกวัน) / ทั้งหมด']}
              />
              <FeatureBlock
                titleTh="🔍 ตัวกรอง"
                titleEn="🔍 Filters"
                lines={isEn
                  ? [
                      'Status (multi-select + "All Statuses")',
                      'Type: event / other / advance',
                      'Funding: company / personal',
                      'Document status: ready / incomplete',
                      'Category, search by claim no./name/tax invoice number',
                    ]
                  : [
                      'สถานะ (เลือกหลายอันได้ + ปุ่ม "ทุกสถานะ")',
                      'ประเภท: อีเวนต์ / อื่นๆ / ทดลองจ่าย',
                      'แหล่งเงิน: บริษัท / ส่วนตัว',
                      'เอกสาร: ครบ / ยังไม่ครบ',
                      'หมวดหมู่ + ค้นหาตามเลขที่/ชื่อ/เลขใบกำกับ',
                    ]}
              />
              <FeatureBlock
                titleTh="📊 Summary cards"
                titleEn="📊 Summary cards"
                lines={isEn
                  ? [
                      'Total claims, total amount, net paid',
                      'Ready vs incomplete count',
                      'Personal-funded count',
                    ]
                  : [
                      'จำนวนใบเบิก / ยอดรวม / จ่ายจริง',
                      'พร้อมส่งบัญชี vs ยังไม่ครบ',
                      'ที่ใช้เงินส่วนตัว',
                    ]}
              />
              <FeatureBlock
                titleTh="📥 Export"
                titleEn="📥 Export"
                lines={isEn
                  ? [
                      'Excel (.xlsx) — 18 columns including checklist',
                      'PDF — printable cover sheet with summary + table',
                    ]
                  : [
                      'Excel (.xlsx) — 18 คอลัมน์รวม checklist',
                      'PDF — ใบปะหน้าพร้อม summary + ตาราง',
                    ]}
              />
            </div>

            <div className="flex items-start gap-2 p-2.5 bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900 rounded-lg">
              <span className="text-base">💡</span>
              <p className="text-[11px] text-emerald-900 dark:text-emerald-200">
                {isEn
                  ? 'Workflow: filter by month → set "Document status: incomplete" → fix the gaps → switch to "ready" → export Excel/PDF as the cover sheet.'
                  : 'วิธีใช้: filter เดือน → ตั้ง "เอกสาร: ยังไม่ครบ" → ตามแก้ → สลับเป็น "ครบ" → export Excel/PDF เป็นใบปะหน้าส่งบัญชี'}
              </p>
            </div>
          </div>
        </div>

        {/* ── WHT 3% Summary (/finance/download) ──────────────────── */}
        <div id="finance-wht" className="scroll-mt-6">
          <SectionHeader
            icon={<Percent className="h-4 w-4" />}
            title={isEn ? 'WHT 3% Summary — /finance/download' : 'สรุปหัก ณ ที่จ่าย — /finance/download'}
          />
          <div className="rounded-xl border-2 border-purple-200 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20 p-4 space-y-3">
            <p className="text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
              {isEn
                ? 'Per-person summary of withholding tax for issuing WHT certificates and filing ภ.ง.ด.3 / 53. Pulls national_id, address, and bank info from each user\'s profile.'
                : 'สรุปหัก ณ ที่จ่าย รายบุคคล สำหรับออกหนังสือรับรองและยื่น ภ.ง.ด.3 / 53 — ดึงเลขบัตร ปชช. + ที่อยู่ + เลขบัญชีจากโปรไฟล์ผู้เบิก'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FeatureBlock
                titleTh="📋 หัวคอลัมน์"
                titleEn="📋 Columns"
                lines={isEn
                  ? [
                      'Full name + nickname',
                      'National ID + address',
                      'Bank name + account no. + holder',
                      'Count, gross, WHT 3%, net',
                    ]
                  : [
                      'ชื่อ-สกุล + ชื่อเล่น',
                      'เลขบัตรประชาชน + ที่อยู่',
                      'ธนาคาร + เลขบัญชี + ชื่อบัญชี',
                      'จำนวนรายการ / ยอดรวม / หัก 3% / จ่ายจริง',
                    ]}
              />
              <FeatureBlock
                titleTh="🎯 ใช้งานเมื่อ"
                titleEn="🎯 When to use"
                lines={isEn
                  ? [
                      'Month-end: export WHT for accounting filing',
                      'Issuing WHT certificates to staff/freelancers',
                      'Quick filter: status (paid/approved/...) + month',
                    ]
                  : [
                      'สิ้นเดือน — export ส่งสำนักงานบัญชี',
                      'ออกหนังสือรับรองหัก ณ ที่จ่ายให้พนักงาน/freelancer',
                      'Filter: สถานะ + เดือน',
                    ]}
              />
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isEn
                  ? 'Only includes claims with WHT > 0%. If the page is empty, no claim in the filter has withholding tax applied.'
                  : 'แสดงเฉพาะใบเบิกที่ตั้งค่าหัก ณ ที่จ่าย > 0% เท่านั้น — ถ้าว่าง = ไม่มีใบเบิกที่หัก ในช่วงที่เลือก'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Status reference ────────────────────────────────────── */}
        <div id="finance-status" className="scroll-mt-6">
          <SectionHeader
            icon={<Layout className="h-4 w-4" />}
            title={isEn ? 'All statuses' : 'สถานะทั้งหมด'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Status' : 'สถานะ'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Meaning' : 'ความหมาย'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold hidden sm:table-cell">{isEn ? 'Terminal?' : 'ปลายทาง?'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <StatusRow emoji="📝" color="#6b7280" label={isEn ? 'draft' : 'แบบร่าง'} code="draft" meaning={isEn ? 'Not yet submitted' : 'ยังไม่ส่ง'} />
                <StatusRow emoji="⏳" color="#f59e0b" label={isEn ? 'pending' : 'รออนุมัติ'} code="pending" meaning={isEn ? 'Awaiting admin review' : 'รอ admin ตรวจ'} />
                <StatusRow emoji="✅" color="#22c55e" label={isEn ? 'approved' : 'อนุมัติแล้ว'} code="approved" meaning={isEn ? 'Approved, awaiting payout' : 'อนุมัติแล้ว รอจ่าย'} />
                <StatusRow emoji="🧾" color="#0ea5e9" label={isEn ? 'waiting_tax_invoice' : 'รอใบกำกับภาษี'} code="waiting_tax_invoice" meaning={isEn ? 'Waiting for tax invoice upload' : 'รอ user แนบใบกำกับภาษี'} />
                <StatusRow emoji="📅" color="#8b5cf6" label={isEn ? 'pending_month_end' : 'รอจ่ายสิ้นเดือน'} code="pending_month_end" meaning={isEn ? 'Queued for month-end payout' : 'รวมจ่ายสิ้นเดือน'} />
                <StatusRow emoji="💵" color="#14b8a6" label={isEn ? 'paid' : 'ชำระเงินแล้ว'} code="paid" meaning={isEn ? 'Payout complete' : 'จ่ายเงินออกแล้ว'} terminal />
                <StatusRow emoji="💸" color="#0891b2" label={isEn ? 'refund_confirmed' : 'คืนเงินบริษัทแล้ว'} code="refund_confirmed" meaning={isEn ? 'Refund confirmed (advance only)' : 'ยืนยันรับเงินคืน (advance only)'} terminal />
                <StatusRow emoji="❌" color="#ef4444" label={isEn ? 'rejected' : 'ปฏิเสธ'} code="rejected" meaning={isEn ? 'Rejected with reason' : 'ปฏิเสธ (มีเหตุผล)'} terminal />
                <StatusRow emoji="🚫" color="#94a3b8" label={isEn ? 'cancelled' : 'ยกเลิก'} code="cancelled" meaning={isEn ? 'Cancelled by user' : 'user ยกเลิก'} terminal />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Permissions ─────────────────────────────────────────── */}
        <div id="finance-permissions" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            title={isEn ? 'Permissions' : 'สิทธิ์การใช้งาน'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Action' : 'การกระทำ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Owner' : 'เจ้าของ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Other user' : 'user อื่น'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Admin' : 'Admin'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-sm">
                <PermissionRow label={isEn ? 'Create claim' : 'สร้างใบเบิก'}      owner="yes" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Edit claim' : 'แก้ใบเบิก'}           owner="partial" other="no" admin="yes" ownerNote={isEn ? 'only draft/pending' : 'เฉพาะ draft/pending'} adminNote={isEn ? 'anytime' : 'แก้ได้ตลอด'} />
                <PermissionRow label={isEn ? 'Submit for approval' : 'ส่งอนุมัติ'}   owner="yes" other="—"   admin="—" />
                <PermissionRow label={isEn ? 'Cancel' : 'ยกเลิก'}                   owner="partial" other="no" admin="—" ownerNote={isEn ? 'only draft/pending' : 'เฉพาะ draft/pending'} />
                <PermissionRow label={isEn ? 'Approve / reject' : 'อนุมัติ/ปฏิเสธ'}  owner="no"  other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Mark as paid' : 'กดชำระเงิน'}        owner="no"  other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Override status' : 'Override status'} owner="no"  other="no" admin="yes" adminNote={isEn ? 'with reason' : 'ต้องใส่เหตุผล'} />
                <PermissionRow label={isEn ? 'Settle advance' : 'อัพเดทค่าใช้จ่ายจริง (advance)'} owner="yes" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Confirm refund received' : 'ยืนยันรับเงินคืน (advance)'} owner="no" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'View other users\' claims' : 'ดูใบเบิกคนอื่น'} owner="—" other="no" admin="yes" />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Notifications ──────────────────────────────────────── */}
        <div id="finance-notifications" className="scroll-mt-6">
          <SectionHeader
            icon={<Bell className="h-4 w-4" />}
            title={isEn ? 'Notifications the system sends' : 'การแจ้งเตือนที่ระบบส่ง'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <NotifRow emoji="✅" code="expense_approved" labelTh="ใบเบิกถูกอนุมัติ" labelEn="Claim approved" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
            <NotifRow emoji="❌" code="expense_rejected" labelTh="ใบเบิกถูกปฏิเสธ" labelEn="Claim rejected" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
            <NotifRow emoji="🧾" code="expense_waiting_tax_invoice" labelTh="ต้องแนบใบกำกับภาษี" labelEn="Tax invoice required" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
            <NotifRow emoji="📤" code="expense_tax_invoice_uploaded" labelTh="แนบใบกำกับภาษีแล้ว" labelEn="Tax invoice uploaded" toTh="Admin" toEn="Admin" isEn={isEn} />
            <NotifRow emoji="💸" code="expense_refund_confirmed" labelTh="ยืนยันรับเงินคืนแล้ว" labelEn="Refund confirmed" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
          </div>
        </div>

        {/* ── Menu shortcuts ─────────────────────────────────────── */}
        <div id="finance-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/finance"           labelEn="All claims + checklist badges" labelTh="รายการใบเบิก + checklist" />
            <MenuLink href="/finance/new"        labelEn="Create new claim"             labelTh="สร้างใบเบิกใหม่" />
            <MenuLink href="/finance/overview"   labelEn="Audit Report (cover sheet)"   labelTh="รายงานตรวจสอบ (ใบปะหน้า)" />
            <MenuLink href="/finance/payouts"    labelEn="Payout queue (admin)"         labelTh="คิวรอจ่ายเงิน (admin)" />
            <MenuLink href="/finance/archive"    labelEn="Archive (closed)"             labelTh="คลังใบเบิกปิดเคส" />
            <MenuLink href="/finance/download"   labelEn="WHT 3% per-person summary"    labelTh="สรุปหัก ณ ที่จ่ายรายบุคคล" />
            <MenuLink href="/finance/settings"   labelEn="Category settings (admin)"    labelTh="ตั้งค่าหมวดหมู่ (admin)" />
          </div>
        </div>

      </section>

      {/* ════════════════════════════════════════════════════════════════
          MODULE: CHECK-IN
          ════════════════════════════════════════════════════════════════ */}
      <section className="space-y-6">
        <ModuleHero mod={MODULES[1]} isEn={isEn} />
        <ModuleSubToc mod={MODULES[1]} isEn={isEn} />

        {/* ── Overview ─────────────────────────────────────────────── */}
        <div id="checkin-overview" className="scroll-mt-6">
          <SectionHeader
            icon={<ListChecks className="h-4 w-4" />}
            title={isEn ? 'Overview' : 'ภาพรวม'}
          />
          <div className="rounded-xl border-2 border-sky-200 dark:border-sky-900 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/20 dark:to-zinc-900 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Each day you can have up to 1 active session per type — office, on-site (event), and remote run independently. Office + event can run at the same time (you don\'t need to check out from office before checking in to an event).'
                : 'แต่ละวันสามารถมี active session ได้สูงสุด 1 รอบต่อประเภท — ออฟฟิศ / อีเวนต์ / นอกสถานที่ เป็นอิสระจากกัน เช่น เช็คอินออฟฟิศพร้อมเช็คอินอีเวนต์ได้เลย ไม่ต้อง checkout ออฟฟิศก่อน'}
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <NewItem
                icon={<Building2 className="h-3.5 w-3.5" />}
                titleTh="🏢 ออฟฟิศ"
                titleEn="🏢 Office"
                descTh="เข้า-ออกที่บริษัท สูงสุด 1 รอบ active"
                descEn="Clock in at company HQ — max 1 active"
                isEn={isEn}
              />
              <NewItem
                icon={<MapPin className="h-3.5 w-3.5" />}
                titleTh="📍 อีเวนต์"
                titleEn="📍 On-site"
                descTh="ผูกกับงาน auto-สร้างใบเบิกตอน checkout"
                descEn="Linked to event; auto-creates expense claim on checkout"
                isEn={isEn}
              />
              <NewItem
                icon={<Home className="h-3.5 w-3.5" />}
                titleTh="🏠 WFH"
                titleEn="🏠 Remote"
                descTh="ทำงานนอกสถานที่ ต้องระบุหมายเหตุ"
                descEn="Working from home/elsewhere — note required"
                isEn={isEn}
              />
            </ul>
          </div>
        </div>

        {/* ── Check-in types ───────────────────────────────────────── */}
        <div id="checkin-types" className="scroll-mt-6">
          <SectionHeader
            icon={<Layout className="h-4 w-4" />}
            title={isEn ? 'Check-in types — when to use which' : 'ประเภทเช็คอิน — ใช้เมื่อไหร่'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Type' : 'ประเภท'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'When to use' : 'ใช้เมื่อไหร่'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Required fields' : 'ข้อมูลที่ต้องมี'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold hidden sm:table-cell">{isEn ? 'On checkout' : 'ตอน checkout'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <CheckinTypeRow
                  emoji="🏢"
                  label={isEn ? 'Office' : 'ออฟฟิศ'}
                  when={isEn ? 'You are working from the company office' : 'มาทำงานที่บริษัท'}
                  required={isEn ? 'Photo only' : 'รูปถ่ายเท่านั้น'}
                  onCheckout={isEn ? 'Photo' : 'รูปถ่าย'}
                />
                <CheckinTypeRow
                  emoji="📍"
                  label={isEn ? 'On-site (event)' : 'อีเวนต์'}
                  when={isEn ? 'Working at a client event' : 'ออกไปจัดงานลูกค้า'}
                  required={isEn ? 'Photo + select event from today\'s list' : 'รูปถ่าย + เลือกอีเวนต์ของวัน'}
                  onCheckout={isEn ? 'Photo + auto-creates expense claim' : 'รูปถ่าย + สร้างใบเบิกอัตโนมัติ'}
                />
                <CheckinTypeRow
                  emoji="🏠"
                  label={isEn ? 'Remote (WFH)' : 'WFH'}
                  when={isEn ? 'Working from home or elsewhere' : 'ทำงานนอกสถานที่'}
                  required={isEn ? 'Photo + note (where/what you\'re doing)' : 'รูปถ่าย + หมายเหตุ (อยู่ที่ไหน ทำอะไร)'}
                  onCheckout={isEn ? 'Photo' : 'รูปถ่าย'}
                />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Normal flow ──────────────────────────────────────────── */}
        <div id="checkin-normal" className="scroll-mt-6">
          <SectionHeader
            icon={<Clock className="h-4 w-4" />}
            title={isEn ? 'Normal flow — single session' : 'Flow ปกติ — เช็คอินรอบเดียว'}
            color="emerald"
          />
          <FlowchartBox
            title={isEn ? 'Single check-in → check-out' : 'เช็คอิน → เลิกงาน → checkout'}
            color="sky"
          >
            <FlowNode variant="start" emoji="🚪" title={isEn ? 'Arrive at workplace' : 'มาถึงที่ทำงาน'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📝" title={isEn ? 'Pick type — office / on-site / remote' : 'เลือกประเภท — ออฟฟิศ / อีเวนต์ / WFH'} subtitle="/check-in" />
            <FlowArrow />
            <FlowNode variant="user" emoji="📷" title={isEn ? 'Take check-in photo' : 'ถ่ายรูป Check-in'} subtitle={isEn ? 'GPS auto-captured' : 'ระบบเก็บ GPS อัตโนมัติ'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="✅" title={isEn ? 'Click "Check-in"' : 'กด "เช็คอินเข้างาน"'} tag={isEn ? 'session active' : 'session active'} />
            <FlowArrow label={isEn ? 'work happens' : 'ทำงาน...'} />
            <FlowNode variant="user" emoji="📷" title={isEn ? 'When done — take check-out photo' : 'เลิกงาน — ถ่ายรูป Check-out'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="🚶" title={isEn ? 'Click "Check-out"' : 'กด "Check-out"'} tag={isEn ? 'session closed' : 'session ปิด'} />
            <FlowArrow />
            <FlowNode variant="success" emoji="🏁" title={isEn ? 'Done — appears in history' : 'จบ — ขึ้นในประวัติ'} />
          </FlowchartBox>
        </div>

        {/* ── Overlap flow (NEW feature) ──────────────────────────── */}
        <div id="checkin-overlap" className="scroll-mt-6">
          <SectionHeader
            icon={<Sparkles className="h-4 w-4" />}
            title={isEn ? 'Overlap flow — office + event at the same time (NEW)' : 'Flow คาบเกี่ยว — ออฟฟิศ + อีเวนต์พร้อมกัน (ใหม่)'}
            color="amber"
          />
          <div className="rounded-xl border-2 border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/10 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'You no longer need to check out of the office before going to an event. Office and event sessions can run concurrently — checkout each one independently when you finish.'
                : 'ไม่ต้อง checkout ออฟฟิศก่อนไปงานอีเวนต์อีกต่อไป — เช็คอินทั้งสองได้พร้อมกัน แล้ว checkout แยกตามงานที่จบจริง'}
            </p>

            {/* Example timeline */}
            <div className="rounded-lg border border-amber-200/60 dark:border-amber-900/50 bg-white dark:bg-zinc-900 p-3 space-y-2">
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                {isEn ? 'Example timeline' : 'ตัวอย่างไทม์ไลน์'}
              </p>
              <TimelineRow time="09:00" emoji="🏢" textTh="เช็คอินเข้าออฟฟิศ" textEn="Check in at office" tagTh="office active" tagEn="office active" isEn={isEn} />
              <TimelineRow time="14:00" emoji="📍" textTh="ไปงานอีเวนต์ — เช็คอินอีเวนต์ (ออฟฟิศยัง active)" textEn="Go to event — check in (office still active)" tagTh="office + event active" tagEn="office + event active" isEn={isEn} variant="highlight" />
              <TimelineRow time="18:00" emoji="🚶" textTh="งานเสร็จ — checkout จากอีเวนต์" textEn="Event done — check out" tagTh="office still active" tagEn="office still active" isEn={isEn} />
              <TimelineRow time="19:00" emoji="🏁" textTh="กลับถึงออฟฟิศ — checkout ออฟฟิศ" textEn="Back at office — check out" tagTh="all closed" tagEn="all closed" isEn={isEn} variant="success" />
            </div>

            <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span>
                  {isEn
                    ? 'You\'ll see a card per active session, with its own checkout button + photo capture.'
                    : 'จะเห็น card ต่อ session ที่ active แต่ละ card มีปุ่ม checkout + ถ่ายรูปของตัวเอง'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span>
                  {isEn
                    ? 'Cards are color-coded by type (office=blue, event=amber, remote=violet) and sorted oldest → newest.'
                    : 'การ์ดแยกสีตามประเภท (ออฟฟิศ=ฟ้า, อีเวนต์=อำพัน, WFH=ม่วง) และเรียงเก่า→ใหม่'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span>
                  {isEn
                    ? 'You can\'t have two active sessions of the same type — checkout the first one before re-opening that type.'
                    : 'ห้ามซ้ำประเภทเดียวกัน — เช่น มี office active อยู่ จะเช็คอิน office อีกรอบไม่ได้จนกว่าจะ checkout'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span>
                  {isEn
                    ? 'When all 3 types are active, the check-in form hides — checkout one before starting another type.'
                    : 'ถ้า active ครบ 3 ประเภท ฟอร์มเช็คอินจะซ่อน — ต้อง checkout อย่างน้อย 1 รอบก่อน'}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* ── Tips ─────────────────────────────────────────────────── */}
        <div id="checkin-tips" className="scroll-mt-6">
          <SectionHeader
            icon={<AlertCircle className="h-4 w-4" />}
            title={isEn ? 'Tips & gotchas' : 'เคล็ดลับและข้อควรรู้'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard
              tone="emerald"
              icon={<Camera className="h-4 w-4" />}
              titleTh="รูปถ่ายจำเป็นเสมอ"
              titleEn="Photo always required"
              descTh="ทั้งตอนเช็คอินและ checkout ระบบบังคับถ่ายรูป (เลือกกล้องหน้า/หลังได้)"
              descEn="Both check-in and check-out require a photo. You can switch between front/rear camera."
              isEn={isEn}
            />
            <TipCard
              tone="sky"
              icon={<MapPin className="h-4 w-4" />}
              titleTh="GPS เก็บอัตโนมัติ"
              titleEn="GPS captured automatically"
              descTh="ระบบขอ location เพื่อบันทึกพิกัดตอนเช็คอิน — กรุณาอนุญาตในเบราว์เซอร์"
              descEn="The browser prompts for location on load — allow it so check-ins are geo-tagged."
              isEn={isEn}
            />
            <TipCard
              tone="amber"
              icon={<RefreshCw className="h-4 w-4" />}
              titleTh="ยกเลิก checkout ภายใน 5 นาที"
              titleEn="Undo checkout within 5 minutes"
              descTh="ถ้าเผลอกด Check-out ใช้ปุ่มย้อนกลับ ↩ ภายใน 5 นาที — เกินจากนั้นต้องให้ admin แก้"
              descEn="Accidentally checked out? Use the undo arrow within 5 minutes. After that, admin override only."
              isEn={isEn}
            />
            <TipCard
              tone="violet"
              icon={<Clock className="h-4 w-4" />}
              titleTh="งานข้ามวันได้ (22:00 → 05:00)"
              titleEn="Overnight shifts supported"
              descTh="ระบบไม่ปิด session อัตโนมัติตอนเที่ยงคืน — เปิด session ค้างได้ checkout ตอนเช้าวันถัดไป"
              descEn="Sessions don't auto-close at midnight, so a 22:00 → 05:00 shift works fine."
              isEn={isEn}
            />
            <TipCard
              tone="emerald"
              icon={<Receipt className="h-4 w-4" />}
              titleTh="On-site → ใบเบิกอัตโนมัติ"
              titleEn="On-site → auto expense claim"
              descTh="ตอน checkout จากอีเวนต์ ระบบจะสร้างใบเบิกค่าตัวสตาฟตามอัตราที่ admin ตั้ง"
              descEn="When you check out from an on-site session, the system creates an expense claim using the configured staff rate."
              isEn={isEn}
            />
            <TipCard
              tone="sky"
              icon={<History className="h-4 w-4" />}
              titleTh="ดูประวัติได้ที่ /check-in/history"
              titleEn="History at /check-in/history"
              descTh="ดูรอบเช็คอินย้อนหลัง พร้อมรูปและตำแหน่ง GPS"
              descEn="Browse past sessions including photos and GPS coordinates."
              isEn={isEn}
            />
          </div>
        </div>

        {/* ── Menu shortcuts ───────────────────────────────────────── */}
        <div id="checkin-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/check-in"          labelEn="Check in / out"               labelTh="เช็คอิน / Check-out" />
            <MenuLink href="/check-in/history"  labelEn="My history (7 days)"          labelTh="ประวัติของฉัน (7 วัน)" />
            <MenuLink href="/check-in/report"   labelEn="Team report (admin)"          labelTh="รายงานทีม (admin)" />
          </div>
        </div>
      </section>

      {/* ── Footer note ────────────────────────────────────────────── */}
      <p className="text-xs text-zinc-400 text-center pt-4">
        {isEn
          ? 'More guides for other modules coming soon.'
          : 'คู่มือโมดูลอื่นกำลังจะตามมา'}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  color = 'zinc',
}: {
  icon: React.ReactNode
  title: string
  color?: 'zinc' | 'emerald' | 'amber'
}) {
  const colorMap = {
    zinc:    'text-zinc-500',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber:   'text-amber-600 dark:text-amber-400',
  } as const
  return (
    <h3 className={`flex items-center gap-2 text-sm font-semibold mb-3 ${colorMap[color]}`}>
      {icon}
      {title}
    </h3>
  )
}

function TypeCard({
  emoji, title, subtitle, desc, receipt, receiptColor,
}: {
  emoji: string; title: string; subtitle: string; desc: string; receipt: string; receiptColor: 'amber' | 'emerald'
}) {
  const colorMap = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900',
  }
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{emoji}</span>
        <div>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</p>
          <code className="text-[10px] text-zinc-400 font-mono">{subtitle}</code>
        </div>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3 leading-relaxed">{desc}</p>
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md border ${colorMap[receiptColor]}`}>
        <Receipt className="h-3 w-3" />
        {receipt}
      </span>
    </div>
  )
}

function RoleCard({
  role, title, steps,
}: {
  role: 'user' | 'admin'
  title: string
  steps: { n: number; label: string; tag: string | null }[]
}) {
  const isAdmin = role === 'admin'
  const accent = isAdmin
    ? 'border-purple-200 bg-purple-50/40 dark:border-purple-900 dark:bg-purple-950/10'
    : 'border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/10'
  const iconColor = isAdmin ? 'text-purple-600 dark:text-purple-400' : 'text-sky-600 dark:text-sky-400'
  const badgeColor = isAdmin ? 'bg-purple-600' : 'bg-sky-600'
  const Icon = isAdmin ? UserCog : User

  return (
    <div className={`rounded-xl border ${accent} p-4`}>
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-700/60">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{title}</h4>
      </div>
      <ol className="space-y-2.5">
        {steps.map(s => (
          <li key={s.n} className="flex items-start gap-2.5 text-xs">
            <span className={`flex items-center justify-center h-5 w-5 rounded-full ${badgeColor} text-white font-bold text-[10px] shrink-0 mt-0.5`}>
              {s.n}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{s.label}</p>
              {s.tag && (
                <code className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded">
                  {s.tag}
                </code>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function MiniCard({ role, lines }: { role: 'user' | 'admin'; lines: string[] }) {
  const isAdmin = role === 'admin'
  const Icon = isAdmin ? UserCog : User
  const iconColor = isAdmin ? 'text-purple-500' : 'text-sky-500'
  return (
    <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          {isAdmin ? 'Admin' : 'User'}
        </p>
      </div>
      <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

function StatusRow({
  emoji, color, label, code, meaning, terminal = false,
}: { emoji: string; color: string; label: string; code: string; meaning: string; terminal?: boolean }) {
  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
      <td className="px-3 py-2 align-top">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-base">{emoji}</span>
          <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full text-white" style={{ backgroundColor: color }}>
            {label}
          </span>
        </span>
        <code className="block mt-1 text-[10px] font-mono text-zinc-400">{code}</code>
      </td>
      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 align-top">{meaning}</td>
      <td className="px-3 py-2 align-top hidden sm:table-cell">
        {terminal && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
            <Lock className="h-2.5 w-2.5" />
            Terminal
          </span>
        )}
      </td>
    </tr>
  )
}

function PermissionRow({
  label, owner, other, admin, ownerNote, adminNote,
}: {
  label: string
  owner: 'yes' | 'no' | 'partial' | '—'
  other: 'yes' | 'no' | '—'
  admin: 'yes' | 'no' | '—'
  ownerNote?: string
  adminNote?: string
}) {
  const badge = (v: string) => {
    if (v === 'yes') return <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 text-[11px]">✓</span>
    if (v === 'no') return <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400 text-[11px]">✗</span>
    if (v === 'partial') return <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 text-[11px]">△</span>
    return <span className="text-zinc-300 text-xs">—</span>
  }
  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{label}</td>
      <td className="px-3 py-2 text-center">
        {badge(owner)}
        {ownerNote && <p className="text-[10px] text-zinc-400 mt-0.5">{ownerNote}</p>}
      </td>
      <td className="px-3 py-2 text-center">{badge(other)}</td>
      <td className="px-3 py-2 text-center">
        {badge(admin)}
        {adminNote && <p className="text-[10px] text-zinc-400 mt-0.5">{adminNote}</p>}
      </td>
    </tr>
  )
}

function NotifRow({
  emoji, code, labelTh, labelEn, toTh, toEn, isEn,
}: { emoji: string; code: string; labelTh: string; labelEn: string; toTh: string; toEn: string; isEn: boolean }) {
  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <span className="text-lg leading-none mt-0.5">{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{isEn ? labelEn : labelTh}</p>
        <code className="text-[10px] font-mono text-zinc-400">{code}</code>
        <p className="text-[10px] text-zinc-500 mt-0.5">
          <ArrowRight className="inline h-2.5 w-2.5" /> {isEn ? toEn : toTh}
        </p>
      </div>
    </div>
  )
}

function NewItem({
  icon, titleTh, titleEn, descTh, descEn, isEn,
}: {
  icon: React.ReactNode
  titleTh: string
  titleEn: string
  descTh: string
  descEn: string
  isEn: boolean
}) {
  return (
    <li className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/70 dark:bg-zinc-900/70 border border-emerald-200/60 dark:border-emerald-900/40">
      <span className="flex items-center justify-center h-6 w-6 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
          {isEn ? titleEn : titleTh}
        </p>
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-snug mt-0.5">
          {isEn ? descEn : descTh}
        </p>
      </div>
    </li>
  )
}

function ChecklistRow({
  emoji, label, required, passes,
}: { emoji: string; label: string; required: string; passes: string }) {
  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
      <td className="px-3 py-2.5 align-top">
        <span className="inline-flex items-center gap-2 text-zinc-800 dark:text-zinc-200 font-medium">
          <span className="text-base">{emoji}</span>
          {label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{required}</td>
      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{passes}</td>
    </tr>
  )
}

function FeatureBlock({
  titleTh, titleEn, lines,
}: { titleTh: string; titleEn: string; lines: string[] }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  return (
    <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-2">
        {isEn ? titleEn : titleTh}
      </p>
      <ul className="space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="text-zinc-300 mt-0.5">•</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CheckinTypeRow({
  emoji, label, when, required, onCheckout,
}: { emoji: string; label: string; when: string; required: string; onCheckout: string }) {
  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
      <td className="px-3 py-2.5 align-top">
        <span className="inline-flex items-center gap-2 text-zinc-800 dark:text-zinc-200 font-medium">
          <span className="text-base">{emoji}</span>
          {label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{when}</td>
      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{required}</td>
      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top hidden sm:table-cell">{onCheckout}</td>
    </tr>
  )
}

function TimelineRow({
  time, emoji, textTh, textEn, tagTh, tagEn, isEn, variant,
}: {
  time: string
  emoji: string
  textTh: string
  textEn: string
  tagTh: string
  tagEn: string
  isEn: boolean
  variant?: 'highlight' | 'success'
}) {
  const tagCls = variant === 'highlight'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800'
    : variant === 'success'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
  return (
    <div className="flex items-center gap-2.5 text-xs">
      <span className="font-mono text-[11px] font-bold text-zinc-500 w-12 shrink-0 tabular-nums">{time}</span>
      <span className="text-base shrink-0">{emoji}</span>
      <span className="flex-1 min-w-0 text-zinc-700 dark:text-zinc-300">{isEn ? textEn : textTh}</span>
      <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-semibold border ${tagCls}`}>
        {isEn ? tagEn : tagTh}
      </span>
    </div>
  )
}

function TipCard({
  tone, icon, titleTh, titleEn, descTh, descEn, isEn,
}: {
  tone: 'emerald' | 'sky' | 'amber' | 'violet'
  icon: React.ReactNode
  titleTh: string
  titleEn: string
  descTh: string
  descEn: string
  isEn: boolean
}) {
  const toneMap = {
    emerald: 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400',
    sky:     'border-sky-200 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-950/20 text-sky-700 dark:text-sky-400',
    amber:   'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400',
    violet:  'border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 text-violet-700 dark:text-violet-400',
  }
  return (
    <div className={`rounded-lg border p-3 ${toneMap[tone]}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="shrink-0">{icon}</span>
        <p className="text-xs font-bold">
          {isEn ? titleEn : titleTh}
        </p>
      </div>
      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
        {isEn ? descEn : descTh}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Module library — config-driven so adding a new module = 1 entry
// ─────────────────────────────────────────────────────────────────────

type ModuleAccent = 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'zinc'

interface ModuleSubItem { id: string; titleTh: string; titleEn: string }
interface ModuleSubGroup {
  titleTh: string
  titleEn: string
  items: ModuleSubItem[]
}
interface ModuleConfig {
  id: string                    // anchor id used both by ModuleLibrary card and module section
  accent: ModuleAccent
  Icon: typeof BookOpen
  titleTh: string
  titleEn: string
  descTh: string
  descEn: string
  /** Sub-section groups for the in-module navigation */
  groups: ModuleSubGroup[]
  /** Optional badge ("New", "Beta", "Coming soon") */
  badge?: { th: string; en: string; tone: 'new' | 'soon' }
  /** When set, the card is shown but not clickable (placeholder for future modules) */
  comingSoon?: boolean
}

const MODULES: ModuleConfig[] = [
  {
    id: 'mod-finance',
    accent: 'emerald',
    Icon: Banknote,
    titleTh: 'Finance — ใบเบิกเงิน',
    titleEn: 'Finance — Expense Claims',
    descTh: 'ระบบเบิกค่าใช้จ่าย ใบกำกับภาษี และรายงานตรวจสอบก่อนส่งบัญชี',
    descEn: 'Expense claims, tax invoices, and pre-accounting audit reports.',
    groups: [
      {
        titleTh: 'อัปเดตล่าสุด',
        titleEn: 'Highlights',
        items: [
          { id: 'finance-whats-new', titleTh: 'อัปเดตล่าสุด', titleEn: "What's new" },
        ],
      },
      {
        titleTh: 'ฟลูว์งาน',
        titleEn: 'Workflow',
        items: [
          { id: 'finance-flowcharts', titleTh: 'แผนผังขั้นตอน', titleEn: 'Flowcharts' },
          { id: 'finance-types',      titleTh: 'ประเภทใบเบิก',  titleEn: 'Claim types' },
          { id: 'finance-funding',    titleTh: 'แหล่งเงินที่ใช้เบิก', titleEn: 'Funding source' },
          { id: 'finance-normal',     titleTh: 'Flow ปกติ',     titleEn: 'Normal flow' },
          { id: 'finance-advance',    titleTh: 'Flow เบิกทดลองจ่าย', titleEn: 'Advance flow' },
        ],
      },
      {
        titleTh: 'เอกสาร',
        titleEn: 'Documents',
        items: [
          { id: 'finance-tax-invoice', titleTh: 'ใบกำกับภาษี',           titleEn: 'Tax invoice' },
          { id: 'finance-checklist',   titleTh: 'ตรวจเอกสารก่อนส่งบัญชี', titleEn: 'Document checklist' },
        ],
      },
      {
        titleTh: 'รายงาน',
        titleEn: 'Reports',
        items: [
          { id: 'finance-report', titleTh: 'รายงานตรวจสอบ',  titleEn: 'Audit report' },
          { id: 'finance-wht',    titleTh: 'สรุปหัก ณ ที่จ่าย', titleEn: 'WHT 3% summary' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'finance-status',        titleTh: 'สถานะทั้งหมด', titleEn: 'All statuses' },
          { id: 'finance-permissions',   titleTh: 'สิทธิ์การใช้งาน', titleEn: 'Permissions' },
          { id: 'finance-notifications', titleTh: 'การแจ้งเตือน',   titleEn: 'Notifications' },
          { id: 'finance-menu',          titleTh: 'เมนูทั้งหมด',     titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
  {
    id: 'mod-checkin',
    accent: 'sky',
    Icon: LogIn,
    titleTh: 'Check-in — ลงเวลาทำงาน',
    titleEn: 'Check-in — Time Tracking',
    descTh: 'ลงเวลาเข้า-ออก สำหรับออฟฟิศ งานอีเวนต์ และทำงานนอกสถานที่',
    descEn: 'Daily clock in/out for office, on-site events, and remote work.',
    badge: { th: 'ฟีเจอร์ใหม่', en: 'NEW', tone: 'new' },
    groups: [
      {
        titleTh: 'เริ่มต้น',
        titleEn: 'Get started',
        items: [
          { id: 'checkin-overview', titleTh: 'ภาพรวม',         titleEn: 'Overview' },
          { id: 'checkin-types',    titleTh: 'ประเภทเช็คอิน',  titleEn: 'Check-in types' },
        ],
      },
      {
        titleTh: 'ฟลูว์งาน',
        titleEn: 'Workflow',
        items: [
          { id: 'checkin-normal',  titleTh: 'Flow ปกติ',                  titleEn: 'Normal flow' },
          { id: 'checkin-overlap', titleTh: 'Flow คาบเกี่ยว (ใหม่)',      titleEn: 'Overlap flow (new)' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'checkin-tips', titleTh: 'เคล็ดลับและข้อควรรู้', titleEn: 'Tips & gotchas' },
          { id: 'checkin-menu', titleTh: 'เมนูทั้งหมด',          titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
]

// Tailwind class maps for accent colors — kept here so the per-accent classes
// are picked up by Tailwind's JIT scanner via static literal strings.
const accentClasses: Record<ModuleAccent, {
  cardBorder: string
  cardBg: string
  cardHover: string
  iconBox: string
  iconText: string
  titleText: string
  pillBg: string
  heroBg: string
  heroBorder: string
  groupTitle: string
  badgeNew: string
}> = {
  emerald: {
    cardBorder: 'border-emerald-200 dark:border-emerald-900/50',
    cardBg:     'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-500/10',
    iconBox:    'bg-emerald-100 dark:bg-emerald-900/40',
    iconText:   'text-emerald-600 dark:text-emerald-400',
    titleText:  'text-emerald-900 dark:text-emerald-200',
    pillBg:     'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50',
    heroBg:     'bg-gradient-to-r from-emerald-500/10 via-emerald-50 to-white dark:from-emerald-900/30 dark:via-emerald-950/20 dark:to-zinc-900',
    heroBorder: 'border-emerald-200 dark:border-emerald-900/50',
    groupTitle: 'text-emerald-700 dark:text-emerald-400',
    badgeNew:   'bg-emerald-500 text-white',
  },
  sky: {
    cardBorder: 'border-sky-200 dark:border-sky-900/50',
    cardBg:     'bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-sky-300 hover:shadow-md hover:shadow-sky-500/10',
    iconBox:    'bg-sky-100 dark:bg-sky-900/40',
    iconText:   'text-sky-600 dark:text-sky-400',
    titleText:  'text-sky-900 dark:text-sky-200',
    pillBg:     'text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 hover:bg-sky-100 dark:hover:bg-sky-950/50',
    heroBg:     'bg-gradient-to-r from-sky-500/10 via-sky-50 to-white dark:from-sky-900/30 dark:via-sky-950/20 dark:to-zinc-900',
    heroBorder: 'border-sky-200 dark:border-sky-900/50',
    groupTitle: 'text-sky-700 dark:text-sky-400',
    badgeNew:   'bg-sky-500 text-white',
  },
  violet: {
    cardBorder: 'border-violet-200 dark:border-violet-900/50',
    cardBg:     'bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-violet-300 hover:shadow-md hover:shadow-violet-500/10',
    iconBox:    'bg-violet-100 dark:bg-violet-900/40',
    iconText:   'text-violet-600 dark:text-violet-400',
    titleText:  'text-violet-900 dark:text-violet-200',
    pillBg:     'text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50',
    heroBg:     'bg-gradient-to-r from-violet-500/10 via-violet-50 to-white dark:from-violet-900/30 dark:via-violet-950/20 dark:to-zinc-900',
    heroBorder: 'border-violet-200 dark:border-violet-900/50',
    groupTitle: 'text-violet-700 dark:text-violet-400',
    badgeNew:   'bg-violet-500 text-white',
  },
  amber: {
    cardBorder: 'border-amber-200 dark:border-amber-900/50',
    cardBg:     'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-amber-300 hover:shadow-md hover:shadow-amber-500/10',
    iconBox:    'bg-amber-100 dark:bg-amber-900/40',
    iconText:   'text-amber-600 dark:text-amber-400',
    titleText:  'text-amber-900 dark:text-amber-200',
    pillBg:     'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50',
    heroBg:     'bg-gradient-to-r from-amber-500/10 via-amber-50 to-white dark:from-amber-900/30 dark:via-amber-950/20 dark:to-zinc-900',
    heroBorder: 'border-amber-200 dark:border-amber-900/50',
    groupTitle: 'text-amber-700 dark:text-amber-400',
    badgeNew:   'bg-amber-500 text-white',
  },
  rose: {
    cardBorder: 'border-rose-200 dark:border-rose-900/50',
    cardBg:     'bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-rose-300 hover:shadow-md hover:shadow-rose-500/10',
    iconBox:    'bg-rose-100 dark:bg-rose-900/40',
    iconText:   'text-rose-600 dark:text-rose-400',
    titleText:  'text-rose-900 dark:text-rose-200',
    pillBg:     'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50',
    heroBg:     'bg-gradient-to-r from-rose-500/10 via-rose-50 to-white dark:from-rose-900/30 dark:via-rose-950/20 dark:to-zinc-900',
    heroBorder: 'border-rose-200 dark:border-rose-900/50',
    groupTitle: 'text-rose-700 dark:text-rose-400',
    badgeNew:   'bg-rose-500 text-white',
  },
  zinc: {
    cardBorder: 'border-zinc-200 dark:border-zinc-800',
    cardBg:     'bg-zinc-50/50 dark:bg-zinc-900',
    cardHover:  'hover:border-zinc-300',
    iconBox:    'bg-zinc-100 dark:bg-zinc-800',
    iconText:   'text-zinc-500 dark:text-zinc-400',
    titleText:  'text-zinc-700 dark:text-zinc-300',
    pillBg:     'text-zinc-700 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800',
    heroBg:     'bg-zinc-50 dark:bg-zinc-900',
    heroBorder: 'border-zinc-200 dark:border-zinc-800',
    groupTitle: 'text-zinc-700 dark:text-zinc-400',
    badgeNew:   'bg-zinc-500 text-white',
  },
}

// ─── Module library — landing card grid ──────────────────────────────

function ModuleLibrary({ modules, isEn }: { modules: ModuleConfig[]; isEn: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        {isEn ? 'Modules in this guide' : 'หมวดในคู่มือ'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {modules.map(mod => (
          <ModuleCard key={mod.id} mod={mod} isEn={isEn} />
        ))}
      </div>
    </div>
  )
}

function ModuleCard({ mod, isEn }: { mod: ModuleConfig; isEn: boolean }) {
  const a = accentClasses[mod.accent]
  const Icon = mod.Icon
  const itemCount = mod.groups.reduce((sum, g) => sum + g.items.length, 0)
  const isComing = mod.comingSoon

  const inner = (
    <>
      <div className="flex items-start gap-3">
        <div className={`flex items-center justify-center h-10 w-10 rounded-xl shrink-0 ${a.iconBox}`}>
          <Icon className={`h-5 w-5 ${a.iconText}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-bold ${a.titleText}`}>
              {isEn ? mod.titleEn : mod.titleTh}
            </p>
            {mod.badge && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                mod.badge.tone === 'new' ? a.badgeNew : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
              }`}>
                {isEn ? mod.badge.en : mod.badge.th}
              </span>
            )}
            {isComing && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                {isEn ? 'COMING SOON' : 'เร็วๆ นี้'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
            {isEn ? mod.descEn : mod.descTh}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
          {itemCount} {isEn ? 'topics' : 'หัวข้อ'}
        </span>
        {!isComing && (
          <span className={`flex items-center gap-1 text-[10px] font-semibold ${a.iconText}`}>
            {isEn ? 'Read guide' : 'อ่านคู่มือ'}
            <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </>
  )

  if (isComing) {
    return (
      <div className={`rounded-xl border ${a.cardBorder} ${a.cardBg} p-4 opacity-60 cursor-not-allowed`}>
        {inner}
      </div>
    )
  }
  return (
    <a
      href={`#${mod.id}`}
      className={`block rounded-xl border ${a.cardBorder} ${a.cardBg} ${a.cardHover} p-4 transition-all group`}
    >
      {inner}
    </a>
  )
}

// ─── Module hero — colored top of each module section ────────────────

function ModuleHero({ mod, isEn }: { mod: ModuleConfig; isEn: boolean }) {
  const a = accentClasses[mod.accent]
  const Icon = mod.Icon
  return (
    <div id={mod.id} className={`scroll-mt-6 rounded-2xl border ${a.heroBorder} ${a.heroBg} p-5 md:p-6`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center h-12 w-12 rounded-xl shrink-0 ${a.iconBox}`}>
            <Icon className={`h-6 w-6 ${a.iconText}`} />
          </div>
          <div>
            <h2 className={`text-xl md:text-2xl font-bold ${a.titleText}`}>
              {isEn ? mod.titleEn : mod.titleTh}
            </h2>
            <p className="text-xs md:text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
              {isEn ? mod.descEn : mod.descTh}
            </p>
          </div>
        </div>
        <a
          href="#top"
          className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 px-2 py-1 rounded-md hover:bg-white/40 dark:hover:bg-zinc-800/40 transition-colors shrink-0"
          title={isEn ? 'Back to top' : 'กลับขึ้นบน'}
        >
          ↑ {isEn ? 'Top' : 'บน'}
        </a>
      </div>
    </div>
  )
}

// ─── In-module sub-TOC, grouped by category ──────────────────────────

function ModuleSubToc({ mod, isEn }: { mod: ModuleConfig; isEn: boolean }) {
  const a = accentClasses[mod.accent]
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
        {isEn ? 'Jump to' : 'ไปยัง'}
      </p>
      <div className="space-y-2.5">
        {mod.groups.map((g, gi) => (
          <div key={gi}>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${a.groupTitle}`}>
              {isEn ? g.titleEn : g.titleTh}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {g.items.map(it => (
                <li key={it.id}>
                  <a
                    href={`#${it.id}`}
                    className={`inline-flex items-center px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${a.pillBg}`}
                  >
                    {isEn ? it.titleEn : it.titleTh}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function MenuLink({ href, labelTh, labelEn }: { href: string; labelTh: string; labelEn: string }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-emerald-300 dark:hover:border-emerald-800 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 transition-colors group"
    >
      <div className="min-w-0">
        <code className="text-[10px] font-mono text-zinc-400">{href}</code>
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
          {isEn ? labelEn : labelTh}
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-500 shrink-0 transition-colors" />
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Flowchart primitives
// ─────────────────────────────────────────────────────────────────────

type FlowVariant = 'start' | 'user' | 'admin' | 'decision' | 'success' | 'error' | 'terminal'

const flowVariantStyles: Record<FlowVariant, string> = {
  start:    'bg-emerald-100 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200',
  user:     'bg-sky-50 dark:bg-sky-950/20 border-sky-300 dark:border-sky-800 text-sky-900 dark:text-sky-200',
  admin:    'bg-purple-50 dark:bg-purple-950/20 border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200',
  decision: 'bg-amber-50 dark:bg-amber-950/20 border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200 border-dashed',
  success:  'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200',
  error:    'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-800 text-red-900 dark:text-red-300',
  terminal: 'bg-zinc-100 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300',
}

function FlowchartBox({
  title, subtitle, color, children,
}: {
  title: string
  subtitle?: string
  color: 'sky' | 'amber' | 'purple'
  children: React.ReactNode
}) {
  const headerMap = {
    sky:    'bg-sky-600 text-white',
    amber:  'bg-amber-500 text-white',
    purple: 'bg-purple-600 text-white',
  }
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className={`px-4 py-2.5 ${headerMap[color]}`}>
        <p className="text-sm font-bold">{title}</p>
        {subtitle && <p className="text-[11px] opacity-90 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4 md:p-6 flex flex-col items-center">
        {children}
      </div>
    </div>
  )
}

function FlowNode({
  variant, emoji, title, subtitle, tag, compact = false,
}: {
  variant: FlowVariant
  emoji?: string
  title: string
  subtitle?: string
  tag?: string
  compact?: boolean
}) {
  return (
    <div
      className={`
        ${compact ? 'w-full max-w-55' : 'min-w-60 max-w-90'}
        px-3 py-2.5 rounded-lg border-2 shadow-sm
        flex items-start gap-2
        ${flowVariantStyles[variant]}
      `}
    >
      {emoji && <span className="text-base leading-none mt-0.5 shrink-0">{emoji}</span>}
      <div className="min-w-0 flex-1">
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} font-semibold leading-snug`}>{title}</p>
        {subtitle && (
          <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} opacity-75 mt-0.5 leading-snug`}>{subtitle}</p>
        )}
        {tag && (
          <code className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-mono bg-white/60 dark:bg-black/30 rounded">
            {tag}
          </code>
        )}
      </div>
    </div>
  )
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center my-1.5">
      <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600" />
      <ChevronDown className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 -mt-0.5" />
      {label && (
        <span className="mt-0.5 text-[10px] italic text-zinc-500 dark:text-zinc-400 text-center max-w-60">
          {label}
        </span>
      )}
    </div>
  )
}

function FlowLane({
  label, color, children,
}: {
  label: string
  color: 'emerald' | 'sky' | 'violet' | 'red' | 'cyan' | 'zinc'
  children: React.ReactNode
}) {
  const colorMap = {
    emerald: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/10',
    sky:     'border-sky-300 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/10',
    violet:  'border-violet-300 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/10',
    red:     'border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/10',
    cyan:    'border-cyan-300 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/10',
    zinc:    'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40',
  }
  const pillMap = {
    emerald: 'bg-emerald-600',
    sky:     'bg-sky-600',
    violet:  'bg-violet-600',
    red:     'bg-red-600',
    cyan:    'bg-cyan-600',
    zinc:    'bg-zinc-600',
  }
  return (
    <div className={`relative rounded-lg border-2 border-dashed ${colorMap[color]} p-3 pt-5 flex flex-col items-center`}>
      <span className={`absolute -top-2.5 left-3 px-2 py-0.5 text-[10px] font-semibold text-white rounded-full ${pillMap[color]}`}>
        {label}
      </span>
      {children}
    </div>
  )
}

function LegendDot({ variant, label }: { variant: FlowVariant; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${flowVariantStyles[variant]}`} />
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
    </span>
  )
}
