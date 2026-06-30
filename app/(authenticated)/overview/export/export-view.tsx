'use client'

// ============================================================================
// ส่งออกข้อมูลรวมทุกโมดูล (CRM · Finance · ต้นทุน · สรุป) เพื่อป้อน Generative AI
// วิเคราะห์ภาพรวมธุรกิจ — XLSX หลาย sheet (เหมาะ AI) หรือ CSV (sectioned)
// กรองช่วงวันที่ + เลือกชุดข้อมูลได้ · ใช้ compute ร่วม buildHealth/buildArStatus
// ============================================================================

import { useMemo, useState } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { ArrowLeft, FileSpreadsheet, FileText, Sparkles, Check } from 'lucide-react'
import {
  type PLLead, type PLClaim, type PLInstallment, type PLJobEvent, type PLCostItem,
  buildHealth, buildArStatus, calcTax, claimEffective, isRevLead, leadDate, leadAmount, claimDate, num,
} from '../pl/pl-lib'

const STATUS_TH: Record<string, string> = {
  paid: 'จ่ายแล้ว', refund_confirmed: 'คืนเงินแล้ว', approved: 'อนุมัติแล้ว', waiting_tax_invoice: 'รอใบกำกับภาษี',
  pending_month_end: 'รอจ่ายสิ้นเดือน', pending: 'รอจ่าย', submitted: 'ส่งแล้ว', draft: 'ร่าง', rejected: 'ปฏิเสธ', cancelled: 'ยกเลิก',
}
type Sheet = { name: string; rows: Record<string, unknown>[] }
const r2 = (n: number) => Math.round(n * 100) / 100

const GROUPS = [
  { key: 'analysis', label: 'สรุป + กำไรต่อดีล (สำหรับ AI)', hint: 'README · สรุปภาพรวม · รายเดือน · ดีล P&L' },
  { key: 'crm', label: 'CRM (ลูกค้า/ดีล/งวดชำระ)', hint: 'leads + installments' },
  { key: 'finance', label: 'การเงิน (ใบเบิก)', hint: 'expense_claims + ภาษี' },
  { key: 'costs', label: 'ต้นทุน (cost items)', hint: 'job_cost_items' },
] as const

export default function ExportView({ leads, claims, jobEvents, costItems, installments, profiles }: {
  leads: any[]; claims: any[]; jobEvents: any[]; costItems: any[]; installments: any[]; profiles: any[]
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [groups, setGroups] = useState<Set<string>>(new Set(['analysis', 'crm', 'finance', 'costs']))
  const [done, setDone] = useState('')

  const inRange = (d: string | null) => !!d && (!from || d.slice(0, 10) >= from) && (!to || d.slice(0, 10) <= to)
  const salesName = useMemo(() => { const m = new Map<string, string>(); profiles.forEach(p => m.set(p.id, p.nickname || p.full_name || '')); return m }, [profiles])
  const nameOf = (id: string) => salesName.get(id) || id?.slice(0, 6) || ''

  const toggle = (k: string) => setGroups(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  // ── สร้าง sheet ตามที่เลือก ──
  function buildSheets(): Sheet[] {
    const h = buildHealth(leads as PLLead[], claims as PLClaim[], installments as PLInstallment[], jobEvents as PLJobEvent[], costItems as PLCostItem[], inRange)
    const ar = buildArStatus((leads as PLLead[]).filter(l => inRange(leadDate(l))), installments as PLInstallment[], new Date().toISOString().slice(0, 10), salesName)
    const periodLabel = `${from || 'เริ่มต้น'} ถึง ${to || 'ปัจจุบัน'}`
    const sheets: Sheet[] = []

    // README — บริบทให้ AI
    sheets.push({
      name: '_อ่านก่อน', rows: [
        { หัวข้อ: 'ไฟล์นี้คือ', รายละเอียด: 'ข้อมูลธุรกิจอีเวนต์รวมทุกโมดูล (CRM, การเงิน, ต้นทุน) สำหรับวิเคราะห์ด้วย AI' },
        { หัวข้อ: 'ช่วงข้อมูล', รายละเอียด: periodLabel },
        { หัวข้อ: 'สกุลเงิน/ฐาน', รายละเอียด: 'บาท (THB) · ตัวเลข "ฐาน" = ก่อน VAT, "สุทธิ" = หลัง VAT+หัก ณ ที่จ่าย' },
        { หัวข้อ: 'รายรับ', รายละเอียด: 'นับจากดีล CRM สถานะ Success(ชำระครบ) + accepted(มัดจำ)' },
        { หัวข้อ: 'ต้นทุน', รายละเอียด: 'จากใบเบิกจริง (expense_claims) — direct=ผูกดีล, overhead=office/ลอย' },
        { หัวข้อ: 'sheet ในไฟล์', รายละเอียด: 'สรุปภาพรวม, รายเดือน, ดีล_กำไรขาดทุน, CRM_Leads, งวดชำระ, ใบเบิก, ต้นทุน' },
        { หัวข้อ: 'Prompt แนะนำ', รายละเอียด: 'วิเคราะห์สุขภาพการเงินธุรกิจจากไฟล์นี้: สรุปกำไร-ขาดทุน, แนวโน้มรายเดือน, ลูกหนี้คงค้าง/กระแสเงินสด, ดีลที่ขาดทุนหรือต้นทุนเกินประเมิน, ความเสี่ยง และข้อเสนอแนะเชิงปฏิบัติ' },
      ],
    })

    if (groups.has('analysis')) {
      sheets.push({
        name: 'สรุปภาพรวม', rows: [
          { รายการ: 'รายรับ (ฐานก่อน VAT)', ค่า: r2(h.revBase) },
          { รายการ: 'รายรับรวม VAT (ออกบิล)', ค่า: r2(h.bookedGross) },
          { รายการ: 'VAT', ค่า: r2(h.revVat) }, { รายการ: 'หัก ณ ที่จ่าย (WHT)', ค่า: r2(h.revWht) },
          { รายการ: 'ต้นทุนตรง (direct)', ค่า: r2(h.directCost) }, { รายการ: 'ค่าใช้จ่าย overhead', ค่า: r2(h.overhead) },
          { รายการ: 'ต้นทุนรวม', ค่า: r2(h.totalCost) },
          { รายการ: 'กำไรขั้นต้น', ค่า: r2(h.grossProfit) }, { รายการ: 'กำไรขั้นต้น %', ค่า: r2(h.grossMargin) },
          { รายการ: 'กำไรดำเนินงาน', ค่า: r2(h.operatingProfit) }, { รายการ: 'กำไรดำเนินงาน %', ค่า: r2(h.opMargin) },
          { รายการ: 'เงินสดเก็บได้จริง', ค่า: r2(h.cashCollected) }, { รายการ: 'ยอดที่ต้องเก็บ (สุทธิ)', ค่า: r2(h.collectible) },
          { รายการ: 'ลูกหนี้คงค้าง (AR)', ค่า: r2(h.ar) }, { รายการ: 'อัตราเก็บเงิน %', ค่า: r2(h.cashRate * 100) },
          { รายการ: 'AR ยังไม่แบ่งงวด', ค่า: r2(ar.buckets.unscheduled) }, { รายการ: 'AR เลยกำหนด 60+ วัน', ค่า: r2(ar.buckets.d60plus) },
          { รายการ: 'จำนวนดีล', ค่า: h.dealCount }, { รายการ: 'ดีลที่มีต้นทุน', ค่า: h.dealsWithCost },
          { รายการ: 'ความครอบคลุมต้นทุน %', ค่า: r2(h.revWithCostPct * 100) }, { รายการ: 'overhead ratio %', ค่า: r2(h.overheadRatio * 100) },
        ],
      })

      // รายเดือน
      const m = new Map<string, { rev: number; exp: number; deals: number }>()
      const M = (k: string) => { let v = m.get(k); if (!v) { v = { rev: 0, exp: 0, deals: 0 }; m.set(k, v) } return v }
      for (const l of leads as PLLead[]) { if (!isRevLead(l)) continue; const d = leadDate(l); if (!d || !inRange(d)) continue; const a = leadAmount(l); if (a <= 0) continue; const v = M(d.slice(0, 7)); v.rev += calcTax(a, l.vat_mode || 'none', num(l.wht_rate)).baseAmount; v.deals++ }
      for (const c of claims as PLClaim[]) { if (c.status === 'rejected' || c.status === 'cancelled') continue; const d = claimDate(c); if (!d || !inRange(d)) continue; const a = claimEffective(c); if (a <= 0) continue; M(d.slice(0, 7)).exp += calcTax(a, c.vat_mode || 'none', num(c.withholding_tax_rate)).baseAmount }
      sheets.push({
        name: 'รายเดือน', rows: Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
          .map(([เดือน, v]) => ({ เดือน, รายรับ_ฐาน: r2(v.rev), รายจ่าย_ฐาน: r2(v.exp), กำไร: r2(v.rev - v.exp), จำนวนดีล: v.deals })),
      })

      // ดีล P&L
      sheets.push({
        name: 'ดีล_กำไรขาดทุน', rows: h.deals.map(d => ({
          ลูกค้า: d.name, สถานะ: d.status === 'success' ? 'เสร็จสิ้น' : 'เครดิต',
          รายรับ_ฐาน: r2(d.revenueBase), รายรับ_รวมVAT: r2(d.gross), ยอดต้องเก็บ_สุทธิ: r2(d.receivable),
          เก็บแล้ว: r2(d.paid), คงค้าง: r2(d.outstanding), ต้นทุนจริง: r2(d.cost),
          กำไร: d.hasCost ? r2(d.profit) : '', margin_pct: d.hasCost ? r2(d.margin) : '',
          ต้นทุนประเมิน: d.hasPlan ? r2(d.planned) : '', ส่วนต่าง: d.hasPlan && d.hasCost ? r2(d.variance) : '',
        })),
      })
    }

    if (groups.has('crm')) {
      sheets.push({
        name: 'CRM_Leads', rows: (leads as any[]).filter(l => inRange(leadDate(l as PLLead))).map(l => ({
          ลูกค้า: l.customer_name, สถานะ: l.status, ประเภทลูกค้า: l.customer_type, ลูกค้าเก่า: l.is_returning ? 'ใช่' : '',
          ช่องทาง: l.lead_source, แพ็คเกจ: l.package_name,
          ราคาเสนอ: num(l.quoted_price), ราคายืนยัน: num(l.confirmed_price), มัดจำ: num(l.deposit),
          vat_mode: l.vat_mode, wht_rate: num(l.wht_rate),
          วันงาน: l.event_date, สถานที่: l.event_location, เซล: (l.assigned_sales || []).map((s: string) => nameOf(s)).join(' / '),
          เบอร์: l.customer_phone, line: l.customer_line, สร้างเมื่อ: (l.created_at || '').slice(0, 10),
        })),
      })
      const leadIn = new Set((leads as any[]).filter(l => inRange(leadDate(l as PLLead))).map(l => l.id))
      sheets.push({
        name: 'งวดชำระ', rows: (installments as any[]).filter(i => leadIn.has(i.lead_id)).map(i => ({
          lead_id: i.lead_id, งวดที่: i.installment_number, ยอด: num(i.amount),
          ครบกำหนด: i.due_date, จ่ายแล้ว: i.is_paid ? 'ใช่' : '', วันที่จ่าย: i.paid_date,
        })),
      })
    }

    if (groups.has('finance')) {
      sheets.push({
        name: 'ใบเบิก', rows: (claims as any[]).filter(c => inRange(claimDate(c as PLClaim)) && c.status !== 'cancelled' && c.status !== 'rejected').map(c => {
          const amt = claimEffective(c as PLClaim)
          const t = calcTax(amt, c.vat_mode || 'none', num(c.withholding_tax_rate))
          return {
            เลขใบเบิก: c.claim_number, ประเภท: c.claim_type, หมวด: c.category, เรื่อง: c.title,
            สถานะ: STATUS_TH[c.status] || c.status, ยอด: r2(amt), ฐานก่อนVAT: r2(t.baseAmount), VAT: r2(t.vatAmount), WHT: r2(t.whtAmount), สุทธิ: r2(t.netPayable),
            แหล่งเงิน: c.funding_source, ผูกอีเวนต์: c.job_event_id || '', วันที่: (c.expense_date || c.created_at || '').slice(0, 10), จ่ายเมื่อ: (c.paid_at || '').slice(0, 10),
          }
        }),
      })
    }

    if (groups.has('costs')) {
      const evName = new Map((jobEvents as any[]).map(e => [e.id, e.event_name]))
      sheets.push({
        name: 'ต้นทุน', rows: (costItems as any[]).filter(it => inRange(it.cost_date || it.created_at)).map(it => ({
          อีเวนต์: evName.get(it.job_event_id) || it.job_event_id, หมวด: it.category, รายการ: it.description,
          ยอด: num(it.amount), ราคาต่อหน่วย: num(it.unit_price), จำนวน: num(it.quantity),
          vat_mode: it.vat_mode, wht_rate: num(it.withholding_tax_rate), อ้างอิงใบเบิก: it.notes, วันที่: (it.cost_date || it.created_at || '').slice(0, 10),
        })),
      })
    }

    return sheets
  }

  function stamp() { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') }

  function exportXlsx() {
    const sheets = buildSheets()
    const wb = XLSX.utils.book_new()
    for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ '': 'ไม่มีข้อมูล' }]), s.name.slice(0, 31))
    XLSX.writeFile(wb, `business-ai-export-${stamp()}.xlsx`)
    setDone('ดาวน์โหลด .xlsx แล้ว')
  }

  function exportCsv() {
    const sheets = buildSheets()
    const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    let out = ''
    for (const s of sheets) {
      out += `=== ${s.name} ===\n`
      if (s.rows.length) {
        const headers = Object.keys(s.rows[0])
        out += headers.join(',') + '\n'
        out += s.rows.map(row => headers.map(hd => cell(row[hd])).join(',')).join('\n') + '\n'
      }
      out += '\n'
    }
    const blob = new Blob(['﻿' + out], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `business-ai-export-${stamp()}.csv`; a.click(); URL.revokeObjectURL(a.href)
    setDone('ดาวน์โหลด .csv แล้ว')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      <div className="flex items-center gap-3">
        <Link href="/overview" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"><ArrowLeft className="h-4 w-4" /> กลับ</Link>
        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" /> ส่งออกข้อมูลเพื่อวิเคราะห์ด้วย AI</h1>
          <p className="text-xs text-zinc-400">รวม CRM · การเงิน · ต้นทุน เป็นไฟล์เดียว พร้อมป้อน Generative AI</p>
        </div>
      </div>

      {/* ตัวกรอง */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">ตั้งแต่วันที่</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">ถึงวันที่</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm" />
          </div>
          {(from || to) && <button onClick={() => { setFrom(''); setTo('') }} className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">ล้าง (ทั้งหมด)</button>}
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">ชุดข้อมูลที่จะส่งออก</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {GROUPS.map(g => {
              const on = groups.has(g.key)
              return (
                <button key={g.key} onClick={() => toggle(g.key)}
                  className={`text-left rounded-xl border p-3 transition-colors ${on ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-4 w-4 rounded flex items-center justify-center ${on ? 'bg-emerald-500 text-white' : 'border border-zinc-300 dark:border-zinc-600'}`}>{on && <Check className="h-3 w-3" />}</span>
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{g.label}</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1 ml-6">{g.hint}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button onClick={exportXlsx} disabled={groups.size === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90 disabled:opacity-40">
            <FileSpreadsheet className="h-4 w-4" /> ดาวน์โหลด .xlsx (แนะนำสำหรับ AI)
          </button>
          <button onClick={exportCsv} disabled={groups.size === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40">
            <FileText className="h-4 w-4" /> .csv
          </button>
          {done && <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> {done}</span>}
        </div>
      </div>

      <div className="text-[11px] text-zinc-400 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 p-4">
        <b>วิธีใช้กับ AI:</b> ดาวน์โหลด .xlsx แล้วอัปโหลดเข้า Claude/ChatGPT พร้อม prompt เช่น<br />
        <span className="font-mono text-zinc-600 dark:text-zinc-300">"วิเคราะห์สุขภาพการเงินธุรกิจจากไฟล์นี้: กำไร-ขาดทุน, แนวโน้มรายเดือน, ลูกหนี้คงค้าง, ดีลขาดทุน/ต้นทุนเกินประเมิน, ความเสี่ยง และข้อเสนอแนะ"</span><br />
        ไฟล์มี sheet <b>_อ่านก่อน</b> อธิบายบริบทให้ AI อยู่แล้ว
      </div>
    </div>
  )
}
