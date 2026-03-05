'use client'

import { useState, useMemo } from 'react'
import { Download, FileSpreadsheet, FileText, Filter, CheckCircle2 } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { getCategoryLabel } from '../../costs/types'
import type { ExpenseClaim } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'
import { parseAddress, formatAddress } from '@/lib/thai-address'

function calcTax(amount: number, vatMode: string, whtRatePercent: number) {
  let baseAmount = amount
  let vatAmount = 0
  let totalWithVat = amount
  if (vatMode === 'included') {
    baseAmount = amount / 1.07
    vatAmount = amount - baseAmount
    totalWithVat = amount
  } else if (vatMode === 'excluded') {
    vatAmount = amount * 0.07
    totalWithVat = amount + vatAmount
  }
  const whtAmount = baseAmount * (whtRatePercent / 100)
  const netPayable = totalWithVat - whtAmount
  return { baseAmount, vatAmount, totalWithVat, whtAmount, netPayable }
}

const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type ExportType = 'all_claims' | 'wht_summary'

export default function FinanceDownloadView({ claims, categories, profileMap = {} }: {
  claims: ExpenseClaim[]
  categories: FinanceCategory[]
  profileMap?: Record<string, { nickname: string | null; national_id: string | null; address: string | null }>
}) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const [exportType, setExportType] = useState<ExportType>('all_claims')
  const [statusFilter, setStatusFilter] = useState<string>('paid')
  const [monthFilter, setMonthFilter] = useState<string>('all')

  // Generate available months
  const months = useMemo(() => {
    const set = new Set<string>()
    claims.forEach(c => {
      const d = new Date(c.expense_date || c.created_at)
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    })
    return Array.from(set).sort().reverse()
  }, [claims])

  // Filter claims
  const filtered = useMemo(() => {
    let result = claims
    if (statusFilter !== 'all') result = result.filter(c => c.status === statusFilter)
    if (monthFilter !== 'all') {
      result = result.filter(c => {
        const d = new Date(c.expense_date || c.created_at)
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return m === monthFilter
      })
    }
    return result
  }, [claims, statusFilter, monthFilter])

  // WHT Summary — group by person
  const whtSummary = useMemo(() => {
    const whtClaims = filtered.filter(c => (c.withholding_tax_rate || 0) > 0)
    const map = new Map<string, {
      name: string
      nickname: string
      nationalId: string
      address: string
      bankName: string
      bankAccount: string
      accountHolder: string
      totalGross: number
      totalWht: number
      totalNet: number
      count: number
    }>()
    whtClaims.forEach(c => {
      const key = c.submitted_by || 'unknown'
      const name = c.submitter?.full_name || 'ไม่ระบุ'
      const amt = c.total_amount || c.amount || 0
      const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
      if (!map.has(key)) {
        const profile = profileMap[key]
        map.set(key, {
          name,
          nickname: profile?.nickname || '',
          nationalId: profile?.national_id || '',
          address: formatAddress(parseAddress(profile?.address || null)),
          bankName: c.bank_name || '',
          bankAccount: c.bank_account_number || '',
          accountHolder: c.account_holder_name || '',
          totalGross: 0, totalWht: 0, totalNet: 0, count: 0,
        })
      }
      const p = map.get(key)!
      p.totalGross += amt
      p.totalWht += tax.whtAmount
      p.totalNet += tax.netPayable
      p.count += 1
      // Use latest bank info if not set yet
      if (!p.bankName && c.bank_name) p.bankName = c.bank_name
      if (!p.bankAccount && c.bank_account_number) p.bankAccount = c.bank_account_number
      if (!p.accountHolder && c.account_holder_name) p.accountHolder = c.account_holder_name
    })
    return Array.from(map.values()).sort((a, b) => b.totalWht - a.totalWht)
  }, [filtered])

  const totalWhtAll = whtSummary.reduce((s, p) => s + p.totalWht, 0)

  // ========== XLSX Export ==========
  const downloadXLSX = async () => {
    const XLSX = (await import('xlsx')).default || await import('xlsx')
    const wb = XLSX.utils.book_new()

    if (exportType === 'all_claims') {
      // Sheet 1: All claims
      const rows = filtered.map(c => {
        const amt = c.total_amount || c.amount || 0
        const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
        const profile = c.submitted_by ? profileMap[c.submitted_by] : null
        const paidAtFormatted = c.paid_at ? new Date(c.paid_at).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
        return {
          'เลขที่': c.claim_number,
          'ชื่อ-สกุล': c.submitter?.full_name || '',
          'ชื่อเล่น': profile?.nickname || '',
          'เลขบัตรประชาชน': profile?.national_id || '',
          'ที่อยู่': formatAddress(parseAddress(profile?.address || null)),
          'หัวข้อ': c.title,
          'หมวด': getCategoryLabel(c.category, 'th', categories),
          'อีเวนต์': (c.job_event as any)?.event_name || '',
          'วันที่ค่าใช้จ่าย': c.expense_date || '',
          'ยอดเงิน': amt,
          'VAT': c.vat_mode || 'none',
          'หัก ณ ที่จ่าย (%)': c.withholding_tax_rate || 0,
          'ยอดหัก': Math.round(tax.whtAmount * 100) / 100,
          'จ่ายจริง': Math.round(tax.netPayable * 100) / 100,
          'สถานะ': c.status,
          'ธนาคาร': c.bank_name || '',
          'เลขบัญชี': c.bank_account_number || '',
          'ชื่อบัญชี': c.account_holder_name || '',
          'วันเวลาที่ชำระ': paidAtFormatted,
          'รายละเอียด': c.notes || '',
        }
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [
        { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 40 },
        { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
        { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
        { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 30 },
      ]
      XLSX.utils.book_append_sheet(wb, ws, 'ใบเบิกทั้งหมด')
    } else {
      // WHT Summary
      const rows = whtSummary.map(p => ({
        'ชื่อ-สกุล': p.name,
        'ชื่อเล่น': p.nickname,
        'เลขบัตรประชาชน': p.nationalId,
        'ที่อยู่': p.address,
        'ธนาคาร': p.bankName,
        'เลขบัญชี': p.bankAccount,
        'ชื่อบัญชี': p.accountHolder,
        'จำนวนรายการ': p.count,
        'ยอดรวม (ก่อนหัก)': Math.round(p.totalGross * 100) / 100,
        'หัก ณ ที่จ่าย 3%': Math.round(p.totalWht * 100) / 100,
        'จ่ายจริง (สุทธิ)': Math.round(p.totalNet * 100) / 100,
      }))
      // Add total row
      rows.push({
        'ชื่อ-สกุล': '— รวมทั้งหมด —',
        'ชื่อเล่น': '',
        'เลขบัตรประชาชน': '',
        'ที่อยู่': '',
        'ธนาคาร': '',
        'เลขบัญชี': '',
        'ชื่อบัญชี': '',
        'จำนวนรายการ': whtSummary.reduce((s, p) => s + p.count, 0),
        'ยอดรวม (ก่อนหัก)': Math.round(whtSummary.reduce((s, p) => s + p.totalGross, 0) * 100) / 100,
        'หัก ณ ที่จ่าย 3%': Math.round(totalWhtAll * 100) / 100,
        'จ่ายจริง (สุทธิ)': Math.round(whtSummary.reduce((s, p) => s + p.totalNet, 0) * 100) / 100,
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [
        { wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 20 }, { wch: 15 }, { wch: 25 },
        { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      ]
      XLSX.utils.book_append_sheet(wb, ws, 'สรุปหัก ณ ที่จ่าย')
    }

    const filename = exportType === 'all_claims'
      ? `finance-claims-${new Date().toISOString().slice(0, 10)}.xlsx`
      : `wht-summary-${new Date().toISOString().slice(0, 10)}.xlsx`

    XLSX.writeFile(wb, filename)
  }

  // ========== PDF Export (CSV-based printable) ==========
  const downloadPDF = () => {
    // Create a printable HTML page
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${exportType === 'wht_summary' ? 'สรุปหัก ณ ที่จ่าย' : 'รายงานใบเบิก'}</title>
    <style>
      body { font-family: 'Sarabun', 'Tahoma', sans-serif; font-size: 11px; padding: 20px; }
      h1 { font-size: 16px; margin-bottom: 4px; }
      h2 { font-size: 12px; color: #666; margin-bottom: 16px; font-weight: normal; }
      table { border-collapse: collapse; width: 100%; margin-top: 12px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
      th { background: #f5f5f5; font-weight: bold; font-size: 10px; }
      td { font-size: 10px; }
      .num { text-align: right; font-family: monospace; }
      .total-row { background: #f0fdf4; font-weight: bold; }
      @media print { body { padding: 0; } }
    </style></head><body>`

    if (exportType === 'wht_summary') {
      html += `<h1>สรุปหัก ณ ที่จ่าย 3%</h1>`
      html += `<h2>วันที่ออกรายงาน: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })} | ${whtSummary.length} คน | รวมหัก ฿${fmtDec(totalWhtAll)}</h2>`
      html += `<table>
        <tr><th>#</th><th>ชื่อ-สกุล</th><th>ชื่อเล่น</th><th>เลขบัตรประชาชน</th><th>ที่อยู่</th><th>ธนาคาร</th><th>เลขบัญชี</th><th class="num">จำนวน</th><th class="num">ยอดรวม</th><th class="num">หัก 3%</th><th class="num">จ่ายจริง</th></tr>`
      whtSummary.forEach((p, i) => {
        html += `<tr>
          <td>${i + 1}</td><td>${p.name}</td><td>${p.nickname}</td><td>${p.nationalId}</td><td style="font-size:9px">${p.address}</td><td>${p.bankName}</td><td>${p.bankAccount}</td>
          <td class="num">${p.count}</td><td class="num">${fmtDec(p.totalGross)}</td><td class="num">${fmtDec(p.totalWht)}</td><td class="num">${fmtDec(p.totalNet)}</td>
        </tr>`
      })
      const totalGross = whtSummary.reduce((s, p) => s + p.totalGross, 0)
      const totalNet = whtSummary.reduce((s, p) => s + p.totalNet, 0)
      html += `<tr class="total-row"><td colspan="7">รวมทั้งหมด</td><td class="num">${whtSummary.reduce((s, p) => s + p.count, 0)}</td><td class="num">${fmtDec(totalGross)}</td><td class="num">${fmtDec(totalWhtAll)}</td><td class="num">${fmtDec(totalNet)}</td></tr>`
      html += `</table>`
    } else {
      html += `<h1>รายงานใบเบิกค่าใช้จ่าย</h1>`
      html += `<h2>วันที่: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })} | ${filtered.length} รายการ</h2>`
      html += `<table>
        <tr><th>เลขที่</th><th>ชื่อ-สกุล</th><th>ชื่อเล่น</th><th>หัวข้อ</th><th>หมวด</th><th class="num">ยอดเงิน</th><th class="num">หัก</th><th class="num">จ่ายจริง</th><th>สถานะ</th><th>วันชำระ</th></tr>`
      filtered.forEach(c => {
        const amt = c.total_amount || c.amount || 0
        const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
        const profile = c.submitted_by ? profileMap[c.submitted_by] : null
        const paidAt = c.paid_at ? new Date(c.paid_at).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
        html += `<tr>
          <td>${c.claim_number}</td><td>${c.submitter?.full_name || ''}</td><td>${profile?.nickname || ''}</td><td>${c.title}</td>
          <td>${getCategoryLabel(c.category, 'th', categories)}</td>
          <td class="num">${fmtDec(amt)}</td><td class="num">${fmtDec(tax.whtAmount)}</td><td class="num">${fmtDec(tax.netPayable)}</td>
          <td>${c.status}</td><td>${paidAt}</td>
        </tr>`
      })
      html += `</table>`
    }

    html += `</body></html>`

    // Open in new window for print/save as PDF
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
      setTimeout(() => win.print(), 300)
    }
  }

  const selectCls = 'px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
  const exportTypeCls = (v: ExportType) =>
    `flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
      exportType === v
        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
    }`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 shrink-0">
          <Download className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {isEn ? 'Export & Download' : 'ดาวน์โหลดรายงาน'}
          </h2>
          <p className="text-xs text-zinc-400">
            {isEn ? 'Export data for accounting office' : 'ส่งออกข้อมูลสำหรับสำนักงานบัญชี'}
          </p>
        </div>
      </div>

      {/* Export Type Selection */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className={exportTypeCls('all_claims')} onClick={() => setExportType('all_claims')}>
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'All Claims Report' : 'รายงานใบเบิกทั้งหมด'}
            </span>
            {exportType === 'all_claims' && <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />}
          </div>
          <p className="text-xs text-zinc-400">
            {isEn ? 'Complete claim data with all details' : 'ข้อมูลใบเบิกครบทุกรายละเอียด'}
          </p>
        </div>
        <div className={exportTypeCls('wht_summary')} onClick={() => setExportType('wht_summary')}>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-5 w-5 text-purple-600" />
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'WHT 3% Summary' : 'สรุปหัก ณ ที่จ่าย 3%'}
            </span>
            {exportType === 'wht_summary' && <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />}
          </div>
          <p className="text-xs text-zinc-400">
            {isEn ? 'Summary grouped by person for accounting' : 'สรุปรายบุคคลสำหรับออกเอกสารหัก ณ ที่จ่าย'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <Filter className="h-4 w-4 text-zinc-400 hidden sm:block" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="all">{isEn ? 'All Status' : 'ทุกสถานะ'}</option>
          <option value="paid">{isEn ? 'Paid' : 'ชำระแล้ว'}</option>
          <option value="awaiting_payment">{isEn ? 'Awaiting Payment' : 'รอชำระเงิน'}</option>
          <option value="pending">{isEn ? 'Pending' : 'รออนุมัติ'}</option>
        </select>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="all">{isEn ? 'All Months' : 'ทุกเดือน'}</option>
          {months.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className="text-xs text-zinc-400 ml-auto">{filtered.length} {isEn ? 'records' : 'รายการ'}</span>
      </div>

      {/* Download Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={downloadXLSX}
          disabled={filtered.length === 0}
          className="flex items-center justify-center gap-2 p-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="h-5 w-5" />
          <span>{isEn ? 'Download .xlsx' : 'ดาวน์โหลด .xlsx'}</span>
          <span className="text-emerald-200 text-xs">({filtered.length} {isEn ? 'rows' : 'แถว'})</span>
        </button>
        <button
          onClick={downloadPDF}
          disabled={filtered.length === 0}
          className="flex items-center justify-center gap-2 p-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileText className="h-5 w-5" />
          <span>{isEn ? 'Print / Save PDF' : 'พิมพ์ / บันทึก PDF'}</span>
        </button>
      </div>

      {/* Preview Table */}
      {exportType === 'wht_summary' && whtSummary.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-4 py-3 bg-purple-50 dark:bg-purple-950/20 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-bold text-purple-700 dark:text-purple-300">
              {isEn ? 'WHT 3% Summary Preview' : 'ตัวอย่างสรุปหัก ณ ที่จ่าย 3%'}
            </h3>
            <p className="text-[10px] text-purple-500 mt-0.5">{whtSummary.length} {isEn ? 'people' : 'คน'} • {isEn ? 'Total WHT' : 'รวมหัก'} ฿{fmtDec(totalWhtAll)}</p>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold bg-zinc-50 dark:bg-zinc-800/30">
              <div className="col-span-3">{isEn ? 'Name' : 'ชื่อ-สกุล'}</div>
              <div className="col-span-2">{isEn ? 'Bank' : 'ธนาคาร'}</div>
              <div className="col-span-2">{isEn ? 'Account' : 'เลขบัญชี'}</div>
              <div className="col-span-1 text-right">{isEn ? 'Count' : 'จำนวน'}</div>
              <div className="col-span-1 text-right">{isEn ? 'Gross' : 'ยอดรวม'}</div>
              <div className="col-span-1 text-right">{isEn ? 'WHT 3%' : 'หัก 3%'}</div>
              <div className="col-span-2 text-right">{isEn ? 'Net' : 'จ่ายจริง'}</div>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {whtSummary.map((p, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm">
                  <div className="col-span-3 font-medium text-zinc-900 dark:text-zinc-100 truncate">{p.name}</div>
                  <div className="col-span-2 text-xs text-zinc-500 truncate">{p.bankName || '—'}</div>
                  <div className="col-span-2 text-xs font-mono text-zinc-500">{p.bankAccount || '—'}</div>
                  <div className="col-span-1 text-right text-zinc-600">{p.count}</div>
                  <div className="col-span-1 text-right font-mono text-zinc-600">฿{p.totalGross.toLocaleString()}</div>
                  <div className="col-span-1 text-right font-mono text-purple-600 font-bold">฿{fmtDec(p.totalWht)}</div>
                  <div className="col-span-2 text-right font-mono font-bold text-emerald-600">฿{fmtDec(p.totalNet)}</div>
                </div>
              ))}
              {/* Total */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm bg-purple-50/50 dark:bg-purple-950/10 font-bold">
                <div className="col-span-7 text-zinc-600">{isEn ? 'Grand Total' : 'รวมทั้งหมด'}</div>
                <div className="col-span-1 text-right text-zinc-600">{whtSummary.reduce((s, p) => s + p.count, 0)}</div>
                <div className="col-span-1 text-right font-mono text-zinc-600">฿{whtSummary.reduce((s, p) => s + p.totalGross, 0).toLocaleString()}</div>
                <div className="col-span-1 text-right font-mono text-purple-600">฿{fmtDec(totalWhtAll)}</div>
                <div className="col-span-2 text-right font-mono text-emerald-600">฿{fmtDec(whtSummary.reduce((s, p) => s + p.totalNet, 0))}</div>
              </div>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
            {whtSummary.map((p, i) => (
              <div key={i} className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{p.name}</span>
                  <span className="text-xs font-mono font-bold text-purple-600">WHT ฿{fmtDec(p.totalWht)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{p.bankName || 'ไม่มีข้อมูลธนาคาร'}</span>
                  <span>{isEn ? 'Net' : 'จ่ายจริง'} ฿{fmtDec(p.totalNet)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Claims Preview */}
      {exportType === 'all_claims' && filtered.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-950/20 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {isEn ? 'Claims Preview' : 'ตัวอย่างข้อมูลใบเบิก'}
            </h3>
            <p className="text-[10px] text-emerald-500 mt-0.5">
              {isEn ? `Showing first ${Math.min(filtered.length, 10)} of ${filtered.length}` : `แสดง ${Math.min(filtered.length, 10)} จาก ${filtered.length} รายการ`}
            </p>
          </div>

          {/* Desktop */}
          <div className="hidden md:block divide-y divide-zinc-100 dark:divide-zinc-800">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold bg-zinc-50 dark:bg-zinc-800/30">
              <div className="col-span-2">{isEn ? 'Claim No.' : 'เลขที่'}</div>
              <div className="col-span-2">{isEn ? 'Name' : 'ผู้เบิก'}</div>
              <div className="col-span-3">{isEn ? 'Title' : 'หัวข้อ'}</div>
              <div className="col-span-1 text-right">{isEn ? 'Amount' : 'ยอด'}</div>
              <div className="col-span-1 text-right">{isEn ? 'WHT' : 'หัก'}</div>
              <div className="col-span-2 text-right">{isEn ? 'Net' : 'จ่ายจริง'}</div>
              <div className="col-span-1">{isEn ? 'Status' : 'สถานะ'}</div>
            </div>
            {filtered.slice(0, 10).map(c => {
              const amt = c.total_amount || c.amount || 0
              const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
              return (
                <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-2 items-center text-sm">
                  <div className="col-span-2 text-xs font-mono text-zinc-500">{c.claim_number}</div>
                  <div className="col-span-2 truncate text-zinc-700 dark:text-zinc-300">{c.submitter?.full_name || '—'}</div>
                  <div className="col-span-3 truncate text-zinc-900 dark:text-zinc-100">{c.title}</div>
                  <div className="col-span-1 text-right font-mono text-zinc-600">{amt.toLocaleString()}</div>
                  <div className="col-span-1 text-right font-mono text-purple-500 text-xs">{tax.whtAmount > 0 ? fmtDec(tax.whtAmount) : '—'}</div>
                  <div className="col-span-2 text-right font-mono font-bold text-emerald-600">฿{fmtDec(tax.netPayable)}</div>
                  <div className="col-span-1 text-[10px] font-medium text-zinc-500">{c.status}</div>
                </div>
              )
            })}
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.slice(0, 10).map(c => {
              const amt = c.total_amount || c.amount || 0
              const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
              return (
                <div key={c.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono text-zinc-400">{c.claim_number}</p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.title}</p>
                      <p className="text-xs text-zinc-500">{c.submitter?.full_name || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-emerald-600">฿{fmtDec(tax.netPayable)}</p>
                      <p className="text-[10px] text-zinc-400">{c.status}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
