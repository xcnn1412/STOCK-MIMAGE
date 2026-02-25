'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useLocale } from '@/lib/i18n/context'
import { ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Clock, CalendarDays } from 'lucide-react'

type Lead = {
    id: string
    customer_name: string
    status: string
    installment_1: number
    installment_2: number
    installment_3: number
    installment_4: number
    installment_1_date: string | null
    installment_2_date: string | null
    installment_3_date: string | null
    installment_4_date: string | null
    installment_1_paid: boolean
    installment_2_paid: boolean
    installment_3_paid: boolean
    installment_4_paid: boolean
    installment_1_paid_date: string | null
    installment_2_paid_date: string | null
    installment_3_paid_date: string | null
    installment_4_paid_date: string | null
    deposit: number
    confirmed_price: number
    quoted_price: number
}

type PaymentEntry = {
    leadId: string
    customerName: string
    status: string
    installmentNum: number
    amount: number
    dueDate: string
    isPaid: boolean
    paidDate: string | null
}

const STATUS_COLORS: Record<string, string> = {
    lead: '#3b82f6',
    quotation_sent: '#f59e0b',
    accepted: '#10b981',
    rejected: '#ef4444',
}

const WEEKDAY_LABELS = {
    th: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

const MONTH_LABELS = {
    th: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

export default function PaymentsView({ leads }: { leads: Lead[] }) {
    const { locale } = useLocale()
    const today = new Date()
    const [currentMonth, setCurrentMonth] = useState(today.getMonth())
    const [currentYear, setCurrentYear] = useState(today.getFullYear())
    const [selectedDate, setSelectedDate] = useState<string | null>(null)

    // Extract all payment entries
    const allPayments = useMemo(() => {
        const entries: PaymentEntry[] = []
        for (const lead of leads) {
            for (let n = 1; n <= 4; n++) {
                const amount = (lead as any)[`installment_${n}`] as number
                const dueDate = (lead as any)[`installment_${n}_date`] as string | null
                const isPaid = (lead as any)[`installment_${n}_paid`] as boolean
                const paidDate = (lead as any)[`installment_${n}_paid_date`] as string | null
                if (amount && amount > 0 && dueDate) {
                    entries.push({
                        leadId: lead.id,
                        customerName: lead.customer_name,
                        status: lead.status,
                        installmentNum: n,
                        amount,
                        dueDate,
                        isPaid: isPaid || false,
                        paidDate,
                    })
                }
            }
        }
        return entries
    }, [leads])

    // Group payments by date
    const paymentsByDate = useMemo(() => {
        const map: Record<string, PaymentEntry[]> = {}
        for (const p of allPayments) {
            if (!map[p.dueDate]) map[p.dueDate] = []
            map[p.dueDate].push(p)
        }
        return map
    }, [allPayments])

    // Calendar grid
    const calendarDays = useMemo(() => {
        const firstDay = new Date(currentYear, currentMonth, 1)
        const lastDay = new Date(currentYear, currentMonth + 1, 0)
        const startDow = firstDay.getDay()
        const daysInMonth = lastDay.getDate()

        const days: (number | null)[] = []
        for (let i = 0; i < startDow; i++) days.push(null)
        for (let d = 1; d <= daysInMonth; d++) days.push(d)
        // Pad end
        while (days.length % 7 !== 0) days.push(null)

        return days
    }, [currentMonth, currentYear])

    const getDateStr = (day: number) => {
        const m = String(currentMonth + 1).padStart(2, '0')
        const d = String(day).padStart(2, '0')
        return `${currentYear}-${m}-${d}`
    }

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const prevMonth = () => {
        if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
        else setCurrentMonth(m => m - 1)
    }

    const nextMonth = () => {
        if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
        else setCurrentMonth(m => m + 1)
    }

    // Summary stats
    const monthPayments = useMemo(() => {
        const m = String(currentMonth + 1).padStart(2, '0')
        const prefix = `${currentYear}-${m}`
        return allPayments.filter(p => p.dueDate.startsWith(prefix))
    }, [allPayments, currentMonth, currentYear])

    const totalDue = monthPayments.reduce((s, p) => s + (p.isPaid ? 0 : p.amount), 0)
    const totalPaid = monthPayments.reduce((s, p) => s + (p.isPaid ? p.amount : 0), 0)
    const overdueCount = allPayments.filter(p => !p.isPaid && new Date(p.dueDate) < today).length
    const overdueTotal = allPayments.filter(p => !p.isPaid && new Date(p.dueDate) < today).reduce((s, p) => s + p.amount, 0)

    // Selected date payments
    const selectedPayments = selectedDate ? (paymentsByDate[selectedDate] || []) : []

    const weekdays = WEEKDAY_LABELS[locale] || WEEKDAY_LABELS.th
    const months = MONTH_LABELS[locale] || MONTH_LABELS.th

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-5">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-blue-600" />
                    <div className="flex items-center gap-2 mb-2">
                        <CalendarDays className="h-4 w-4 text-blue-500" />
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                            {locale === 'th' ? 'รอชำระเดือนนี้' : 'Due This Month'}
                        </span>
                    </div>
                    <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums">
                        ฿{totalDue.toLocaleString()}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{monthPayments.filter(p => !p.isPaid).length} {locale === 'th' ? 'รายการ' : 'items'}</p>
                </div>

                <div className="relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-5">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 to-emerald-600" />
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                            {locale === 'th' ? 'ชำระแล้วเดือนนี้' : 'Paid This Month'}
                        </span>
                    </div>
                    <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        ฿{totalPaid.toLocaleString()}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{monthPayments.filter(p => p.isPaid).length} {locale === 'th' ? 'รายการ' : 'items'}</p>
                </div>

                <div className="relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-5">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-red-500 to-red-600" />
                    <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                            {locale === 'th' ? 'เลยกำหนดทั้งหมด' : 'Total Overdue'}
                        </span>
                    </div>
                    <div className="text-2xl font-extrabold text-red-600 dark:text-red-400 tabular-nums">
                        ฿{overdueTotal.toLocaleString()}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{overdueCount} {locale === 'th' ? 'รายการ' : 'items'}</p>
                </div>

                <div className="relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-5">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-violet-500 to-violet-600" />
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-violet-500" />
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                            {locale === 'th' ? 'ทั้งหมดที่ยังไม่ชำระ' : 'All Unpaid'}
                        </span>
                    </div>
                    <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums">
                        ฿{allPayments.filter(p => !p.isPaid).reduce((s, p) => s + p.amount, 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{allPayments.filter(p => !p.isPaid).length} {locale === 'th' ? 'รายการ' : 'items'}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar */}
                <div className="lg:col-span-2">
                    <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 overflow-hidden">
                        {/* Calendar Header */}
                        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800">
                            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                <ChevronLeft className="h-5 w-5 text-zinc-500" />
                            </button>
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                                {months[currentMonth]} {currentYear + (locale === 'th' ? 543 : 0)}
                            </h2>
                            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                <ChevronRight className="h-5 w-5 text-zinc-500" />
                            </button>
                        </div>

                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 border-b border-zinc-100 dark:border-zinc-800">
                            {weekdays.map(d => (
                                <div key={d} className="py-2 text-center text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">
                                    {d}
                                </div>
                            ))}
                        </div>

                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7">
                            {calendarDays.map((day, i) => {
                                if (day === null) {
                                    return <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-zinc-50 dark:border-zinc-800/40 bg-zinc-25 dark:bg-zinc-900/40" />
                                }

                                const dateStr = getDateStr(day)
                                const payments = paymentsByDate[dateStr] || []
                                const isToday = dateStr === todayStr
                                const isSelected = dateStr === selectedDate
                                const hasOverdue = payments.some(p => !p.isPaid && new Date(p.dueDate) < today)
                                const hasPaid = payments.some(p => p.isPaid)
                                const hasUnpaid = payments.some(p => !p.isPaid)

                                return (
                                    <button
                                        key={day}
                                        onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                                        className={`
                      min-h-[80px] p-1.5 border-b border-r border-zinc-100 dark:border-zinc-800/40
                      text-left transition-all duration-150 relative group
                      ${isSelected ? 'bg-blue-50/80 dark:bg-blue-950/30 ring-2 ring-inset ring-blue-400/50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'}
                    `}
                                    >
                                        <span className={`
                      inline-flex items-center justify-center h-7 w-7 rounded-full text-sm font-semibold
                      ${isToday ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'text-zinc-700 dark:text-zinc-300'}
                    `}>
                                            {day}
                                        </span>

                                        {/* Payment dots */}
                                        {payments.length > 0 && (
                                            <div className="mt-1 space-y-0.5">
                                                {payments.slice(0, 3).map((p, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={`
                              flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-semibold truncate
                              ${p.isPaid
                                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                                                : hasOverdue && !p.isPaid && new Date(p.dueDate) < today
                                                                    ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                                                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                                                            }
                            `}
                                                    >
                                                        {p.isPaid ? '✓' : hasOverdue && new Date(p.dueDate) < today ? '!' : '○'} {p.customerName.split(' ')[0]}
                                                    </div>
                                                ))}
                                                {payments.length > 3 && (
                                                    <div className="text-[9px] text-zinc-400 pl-1">+{payments.length - 3}</div>
                                                )}
                                            </div>
                                        )}

                                        {/* Status indicators */}
                                        {payments.length > 0 && (
                                            <div className="absolute top-1.5 right-1.5 flex gap-0.5">
                                                {hasOverdue && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                                                {hasPaid && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                                                {hasUnpaid && !hasOverdue && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* Payment Detail Panel */}
                <div>
                    <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-4 sticky top-4">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-blue-500" />
                            {selectedDate
                                ? `${locale === 'th' ? 'รายการวันที่' : 'Payments for'} ${selectedDate}`
                                : (locale === 'th' ? 'เลือกวันที่บนปฏิทิน' : 'Select a date on the calendar')
                            }
                        </h3>

                        {!selectedDate ? (
                            <div className="text-center py-8">
                                <CalendarDays className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                                <p className="text-sm text-zinc-400 dark:text-zinc-500">
                                    {locale === 'th' ? 'คลิกที่วันที่บนปฏิทิน\nเพื่อดูรายละเอียดการชำระ' : 'Click a date on the calendar\nto see payment details'}
                                </p>
                            </div>
                        ) : selectedPayments.length === 0 ? (
                            <div className="text-center py-8">
                                <CheckCircle2 className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                                <p className="text-sm text-zinc-400 dark:text-zinc-500">
                                    {locale === 'th' ? 'ไม่มีรายการชำระในวันนี้' : 'No payments on this date'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {selectedPayments.map((p, i) => {
                                    const isOverdue = !p.isPaid && new Date(p.dueDate) < today
                                    return (
                                        <Link key={i} href={`/crm/${p.leadId}`}>
                                            <div className={`
                        p-3 rounded-lg border transition-all duration-200
                        hover:shadow-md hover:-translate-y-0.5 cursor-pointer
                        ${p.isPaid
                                                    ? 'border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20'
                                                    : isOverdue
                                                        ? 'border-red-200/60 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20'
                                                        : 'border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-800/30'
                                                }
                      `}>
                                                {/* Customer name + status */}
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                                        {p.customerName}
                                                    </span>
                                                    <span
                                                        className="h-2.5 w-2.5 rounded-full shrink-0"
                                                        style={{ backgroundColor: STATUS_COLORS[p.status] || '#9ca3af' }}
                                                    />
                                                </div>

                                                {/* Installment info */}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                                        {locale === 'th' ? `งวดที่ ${p.installmentNum}` : `Installment ${p.installmentNum}`}
                                                    </span>
                                                    <span className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                                        ฿{p.amount.toLocaleString()}
                                                    </span>
                                                </div>

                                                {/* Status badge */}
                                                <div className="mt-2">
                                                    {p.isPaid ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                                                            <CheckCircle2 className="h-3 w-3" />
                                                            {locale === 'th' ? 'ชำระแล้ว' : 'Paid'}{p.paidDate ? ` (${p.paidDate})` : ''}
                                                        </span>
                                                    ) : isOverdue ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-full animate-pulse">
                                                            <AlertCircle className="h-3 w-3" />
                                                            {locale === 'th' ? 'เลยกำหนดชำระ' : 'Overdue'}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">
                                                            <Clock className="h-3 w-3" />
                                                            {locale === 'th' ? 'รอชำระ' : 'Pending'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    )
                                })}

                                {/* Total for selected date */}
                                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                                    <span className="text-xs font-semibold text-zinc-500">
                                        {locale === 'th' ? 'รวม' : 'Total'}
                                    </span>
                                    <span className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                        ฿{selectedPayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
