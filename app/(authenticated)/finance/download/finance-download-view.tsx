'use client'

import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Filter, Percent } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { ExpenseClaim } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'
import { parseAddress, formatAddress } from '@/lib/thai-address'

function calcTax(amount: number, vatMode: string, whtRatePercent: number) {
  let baseAmount = amount
  let totalWithVat = amount
  if (vatMode === 'included') {
    baseAmount = amount / 1.07
    totalWithVat = amount
  } else if (vatMode === 'excluded') {
    totalWithVat = amount + amount * 0.07
  }
  const whtAmount = baseAmount * (whtRatePercent / 100)
  const netPayable = totalWithVat - whtAmount
  return { whtAmount, netPayable }
}

const fmtDec = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Props {
  claims: ExpenseClaim[]
  categories: FinanceCategory[]
  profileMap?: Record<string, { nickname: string | null; national_id: string | null; address: string | null }>
}

export default function FinanceDownloadView({ claims, profileMap = {} }: Props) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const [statusFilter, setStatusFilter] = useState<string>('paid')
  const [monthFilter, setMonthFilter] = useState<string>('all')

  const months = useMemo(() => {
    const set = new Set<string>()
    claims.forEach(c => {
      const d = new Date(c.expense_date || c.created_at)
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    })
    return Array.from(set).sort().reverse()
  }, [claims])

  // Filter claims by status + month, then keep only those with a WHT rate
  const filtered = useMemo(() => {
    let result = claims.filter(c => (c.withholding_tax_rate || 0) > 0)
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

  // Group by submitter for WHT summary (one row per person)
  const whtSummary = useMemo(() => {
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
    filtered.forEach(c => {
      const key = c.submitted_by || 'unknown'
      const name = c.submitter?.full_name || 'ไม่ระบุ'
      const amt = c.amount || 0
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
      if (!p.bankName && c.bank_name) p.bankName = c.bank_name
      if (!p.bankAccount && c.bank_account_number) p.bankAccount = c.bank_account_number
      if (!p.accountHolder && c.account_holder_name) p.accountHolder = c.account_holder_name
    })
    return Array.from(map.values()).sort((a, b) => b.totalWht - a.totalWht)
  }, [filtered, profileMap])

  const totalWhtAll = whtSummary.reduce((s, p) => s + p.totalWht, 0)
  const totalGrossAll = whtSummary.reduce((s, p) => s + p.totalGross, 0)
  const totalNetAll = whtSummary.reduce((s, p) => s + p.totalNet, 0)
  const totalCountAll = whtSummary.reduce((s, p) => s + p.count, 0)

  // ========== XLSX Export ==========
  const downloadXLSX = async () => {
    const XLSX = (await import('xlsx')).default || await import('xlsx')
    const wb = XLSX.utils.book_new()

    const rows: Record<string, any>[] = whtSummary.map(p => ({
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
    rows.push({
      'ชื่อ-สกุล': '— รวมทั้งหมด —',
      'ชื่อเล่น': '',
      'เลขบัตรประชาชน': '',
      'ที่อยู่': '',
      'ธนาคาร': '',
      'เลขบัญชี': '',
      'ชื่อบัญชี': '',
      'จำนวนรายการ': totalCountAll,
      'ยอดรวม (ก่อนหัก)': Math.round(totalGrossAll * 100) / 100,
      'หัก ณ ที่จ่าย 3%': Math.round(totalWhtAll * 100) / 100,
      'จ่ายจริง (สุทธิ)': Math.round(totalNetAll * 100) / 100,
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 20 }, { wch: 15 }, { wch: 25 },
      { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'สรุปหัก ณ ที่จ่าย')
    XLSX.writeFile(wb, `wht-summary-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ========== PDF Export ==========
  const downloadPDF = () => {
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>สรุปหัก ณ ที่จ่าย 3%</title>
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
    html += `<tr class="total-row"><td colspan="7">รวมทั้งหมด</td><td class="num">${totalCountAll}</td><td class="num">${fmtDec(totalGrossAll)}</td><td class="num">${fmtDec(totalWhtAll)}</td><td class="num">${fmtDec(totalNetAll)}</td></tr>`
    html += `</table></body></html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
      setTimeout(() => win.print(), 300)
    }
  }

  const selectCls = 'px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 shrink-0">
          <Percent className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {isEn ? 'Withholding Tax 3% Summary' : 'สรุปหัก ณ ที่จ่าย 3%'}
          </h2>
          <p className="text-xs text-zinc-400">
            {isEn
              ? 'Group by person — for issuing WHT certificates and tax filing'
              : 'สรุปรายบุคคล — สำหรับออกหนังสือรับรองและยื่น ภ.ง.ด.3 / 53'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <Filter className="h-4 w-4 text-zinc-400 hidden sm:block" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="all">{isEn ? 'All Status' : 'ทุกสถานะ'}</option>
          <option value="paid">{isEn ? 'Paid' : 'ชำระแล้ว'}</option>
          <option value="approved">{isEn ? 'Approved' : 'อนุมัติแล้ว'}</option>
          <option value="pending_month_end">{isEn ? 'Pending Month-end' : 'รอจ่ายสิ้นเดือน'}</option>
          <option value="awaiting_payment">{isEn ? 'Awaiting Payment (legacy)' : 'รอชำระเงิน (เก่า)'}</option>
        </select>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="all">{isEn ? 'All Months' : 'ทุกเดือน'}</option>
          {months.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className="text-xs text-zinc-400 ml-auto">
          {whtSummary.length} {isEn ? 'people' : 'คน'} • {totalCountAll} {isEn ? 'records' : 'รายการ'}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-950/20 p-3">
          <p className="text-[10px] uppercase tracking-wider text-purple-500 font-semibold">{isEn ? 'Total WHT' : 'หัก ณ ที่จ่ายรวม'}</p>
          <p className="text-xl font-bold text-purple-700 dark:text-purple-300 mt-1">฿{fmtDec(totalWhtAll)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-zinc-900">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">{isEn ? 'Gross Total' : 'ยอดรวมก่อนหัก'}</p>
          <p className="text-xl font-bold text-zinc-700 dark:text-zinc-200 mt-1">฿{fmtDec(totalGrossAll)}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-3">
          <p className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold">{isEn ? 'Net Paid' : 'จ่ายจริงสุทธิ'}</p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">฿{fmtDec(totalNetAll)}</p>
        </div>
      </div>

      {/* Download buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={downloadXLSX}
          disabled={whtSummary.length === 0}
          className="flex items-center justify-center gap-2 p-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="h-5 w-5" />
          <span>{isEn ? 'Download .xlsx' : 'ดาวน์โหลด .xlsx'}</span>
          <span className="text-emerald-200 text-xs">({whtSummary.length} {isEn ? 'people' : 'คน'})</span>
        </button>
        <button
          onClick={downloadPDF}
          disabled={whtSummary.length === 0}
          className="flex items-center justify-center gap-2 p-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileText className="h-5 w-5" />
          <span>{isEn ? 'Print / Save PDF' : 'พิมพ์ / บันทึก PDF'}</span>
        </button>
      </div>

      {/* Preview */}
      {whtSummary.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-400 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <Download className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">
            {isEn ? 'No claims with withholding tax in the current filter' : 'ไม่มีใบเบิกที่มีหัก ณ ที่จ่ายในช่วงที่เลือก'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-4 py-3 bg-purple-50 dark:bg-purple-950/20 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-bold text-purple-700 dark:text-purple-300">
              {isEn ? 'WHT 3% Summary Preview' : 'ตัวอย่างสรุปหัก ณ ที่จ่าย 3%'}
            </h3>
            <p className="text-[10px] text-purple-500 mt-0.5">
              {whtSummary.length} {isEn ? 'people' : 'คน'} • {isEn ? 'Total WHT' : 'รวมหัก'} ฿{fmtDec(totalWhtAll)}
            </p>
          </div>

          {/* Desktop */}
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
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm bg-purple-50/50 dark:bg-purple-950/10 font-bold">
                <div className="col-span-7 text-zinc-600">{isEn ? 'Grand Total' : 'รวมทั้งหมด'}</div>
                <div className="col-span-1 text-right text-zinc-600">{totalCountAll}</div>
                <div className="col-span-1 text-right font-mono text-zinc-600">฿{totalGrossAll.toLocaleString()}</div>
                <div className="col-span-1 text-right font-mono text-purple-600">฿{fmtDec(totalWhtAll)}</div>
                <div className="col-span-2 text-right font-mono text-emerald-600">฿{fmtDec(totalNetAll)}</div>
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
    </div>
  )
}
