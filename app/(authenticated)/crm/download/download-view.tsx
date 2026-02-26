'use client'

import { useState, useMemo } from 'react'
import { useLocale } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
    Download, FileSpreadsheet, Filter, CheckCircle2, Users, Calendar, DollarSign
} from 'lucide-react'

type Lead = {
    id: string
    created_at: string
    status: string
    customer_name: string
    customer_line: string | null
    customer_phone: string | null
    customer_type: string | null
    lead_source: string | null
    event_date: string | null
    event_end_date: string | null
    event_location: string | null
    event_details: string | null
    package_name: string | null
    quoted_price: number
    confirmed_price: number
    deposit: number
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
    quotation_ref: string | null
    notes: string | null
    tags: string[]
}

type Setting = {
    id: string
    category: string
    value: string
    label_th: string
    label_en: string
}

const STATUS_LABELS = {
    th: { lead: 'ลูกค้าใหม่', quotation_sent: 'ส่งใบเสนอราคา', accepted: 'ตอบรับ', rejected: 'ปฏิเสธ' } as Record<string, string>,
    en: { lead: 'Lead', quotation_sent: 'Quotation Sent', accepted: 'Accepted', rejected: 'Rejected' } as Record<string, string>,
}

const t = {
    th: {
        title: 'ดาวน์โหลดข้อมูล CRM',
        subtitle: 'เลือกรูปแบบและข้อมูลที่ต้องการส่งออก',
        filterStatus: 'กรองตามสถานะ',
        allStatuses: 'ทุกสถานะ',
        includeFields: 'เลือกข้อมูลที่ต้องการ',
        customerInfo: 'ข้อมูลลูกค้า',
        eventInfo: 'ข้อมูลอีเวนต์',
        financialInfo: 'ข้อมูลการเงิน',
        installmentInfo: 'ข้อมูลงวดเงิน',
        preview: 'ตัวอย่างข้อมูล',
        downloadCsv: 'ดาวน์โหลด CSV',
        downloadExcel: 'ดาวน์โหลด Excel',
        totalRecords: 'จำนวนรายการ',
        records: 'รายการ',
        name: 'ชื่อลูกค้า',
        status: 'สถานะ',
        phone: 'โทรศัพท์',
        lineId: 'LINE ID',
        source: 'ช่องทาง',
        type: 'ประเภท',
        eventDate: 'วันจัดงาน',
        endDate: 'วันสิ้นสุด',
        location: 'สถานที่',
        details: 'รายละเอียด',
        package: 'แพ็คเกจ',
        quotedPrice: 'ราคาเสนอ',
        confirmedPrice: 'ราคายืนยัน',
        deposit: 'มัดจำ',
        quotationRef: 'เลขใบเสนอราคา',
        notes: 'หมายเหตุ',
        createdAt: 'วันที่สร้าง',
        downloading: 'กำลังดาวน์โหลด...',
        exported: 'ส่งออกเรียบร้อย!',
    },
    en: {
        title: 'Download CRM Data',
        subtitle: 'Choose format and data to export',
        filterStatus: 'Filter by Status',
        allStatuses: 'All Statuses',
        includeFields: 'Select Data to Include',
        customerInfo: 'Customer Info',
        eventInfo: 'Event Info',
        financialInfo: 'Financial Info',
        installmentInfo: 'Installment Info',
        preview: 'Data Preview',
        downloadCsv: 'Download CSV',
        downloadExcel: 'Download Excel',
        totalRecords: 'Total Records',
        records: 'records',
        name: 'Customer Name',
        status: 'Status',
        phone: 'Phone',
        lineId: 'LINE ID',
        source: 'Source',
        type: 'Type',
        eventDate: 'Event Date',
        endDate: 'End Date',
        location: 'Location',
        details: 'Details',
        package: 'Package',
        quotedPrice: 'Quoted Price',
        confirmedPrice: 'Confirmed Price',
        deposit: 'Deposit',
        quotationRef: 'Quotation Ref',
        notes: 'Notes',
        createdAt: 'Created At',
        downloading: 'Downloading...',
        exported: 'Exported successfully!',
    },
}

export default function DownloadView({ leads, settings }: { leads: Lead[]; settings: Setting[] }) {
    const { locale } = useLocale()
    const tc = t[locale] || t.th
    const statusLabels = STATUS_LABELS[locale] || STATUS_LABELS.th

    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [includeCustomer, setIncludeCustomer] = useState(true)
    const [includeEvent, setIncludeEvent] = useState(true)
    const [includeFinancial, setIncludeFinancial] = useState(true)
    const [includeInstallment, setIncludeInstallment] = useState(true)
    const [exported, setExported] = useState(false)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(50)

    const getSettingLabel = (cat: string, val: string) => {
        const s = settings.find(s => s.category === cat && s.value === val)
        return s ? (locale === 'th' ? s.label_th : s.label_en) : val
    }

    const filteredLeads = useMemo(() => {
        if (filterStatus === 'all') return leads
        return leads.filter(l => l.status === filterStatus)
    }, [leads, filterStatus])

    // Reset page when filter changes
    const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize))
    const currentPage = Math.min(page, totalPages)
    const pagedLeads = filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    const buildCsvData = () => {
        const headers: string[] = [tc.name, tc.status, tc.createdAt]
        if (includeCustomer) headers.push(tc.phone, tc.lineId, tc.type, tc.source)
        if (includeEvent) headers.push(tc.eventDate, tc.endDate, tc.location, tc.details)
        if (includeFinancial) headers.push(tc.package, tc.quotedPrice, tc.confirmedPrice, tc.deposit, tc.quotationRef, tc.notes)
        if (includeInstallment) {
            for (let n = 1; n <= 4; n++) {
                headers.push(
                    `${locale === 'th' ? 'งวด' : 'Installment'} ${n}`,
                    `${locale === 'th' ? 'วันนัดชำระ' : 'Due Date'} ${n}`,
                    `${locale === 'th' ? 'ชำระแล้ว' : 'Paid'} ${n}`,
                    `${locale === 'th' ? 'วันที่ชำระ' : 'Paid Date'} ${n}`,
                )
            }
        }

        const rows: string[][] = filteredLeads.map(l => {
            const row: string[] = [
                l.customer_name,
                statusLabels[l.status] || l.status,
                l.created_at.slice(0, 10),
            ]
            if (includeCustomer) {
                row.push(
                    l.customer_phone || '',
                    l.customer_line || '',
                    l.customer_type ? getSettingLabel('customer_type', l.customer_type) : '',
                    l.lead_source ? getSettingLabel('source', l.lead_source) : '',
                )
            }
            if (includeEvent) {
                row.push(
                    l.event_date || '',
                    l.event_end_date || '',
                    l.event_location || '',
                    l.event_details || '',
                )
            }
            if (includeFinancial) {
                row.push(
                    l.package_name ? getSettingLabel('package', l.package_name) : '',
                    l.quoted_price?.toString() || '0',
                    l.confirmed_price?.toString() || '0',
                    l.deposit?.toString() || '0',
                    l.quotation_ref || '',
                    l.notes || '',
                )
            }
            if (includeInstallment) {
                for (let n = 1; n <= 4; n++) {
                    row.push(
                        ((l as any)[`installment_${n}`] || 0).toString(),
                        (l as any)[`installment_${n}_date`] || '',
                        (l as any)[`installment_${n}_paid`] ? (locale === 'th' ? 'ใช่' : 'Yes') : (locale === 'th' ? 'ไม่' : 'No'),
                        (l as any)[`installment_${n}_paid_date`] || '',
                    )
                }
            }
            return row
        })

        return { headers, rows }
    }

    const downloadCsv = () => {
        const { headers, rows } = buildCsvData()
        const bom = '\uFEFF'
        const csvContent = bom + [
            headers.map(h => `"${h}"`).join(','),
            ...rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')),
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `crm-export-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        setExported(true)
        setTimeout(() => setExported(false), 3000)
    }

    const downloadExcel = () => {
        const { headers, rows } = buildCsvData()
        const bom = '\uFEFF'
        const tsvContent = bom + [
            headers.join('\t'),
            ...rows.map(r => r.map(c => (c || '').replace(/\t/g, ' ')).join('\t')),
        ].join('\n')

        const blob = new Blob([tsvContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `crm-export-${new Date().toISOString().slice(0, 10)}.xls`
        a.click()
        URL.revokeObjectURL(url)
        setExported(true)
        setTimeout(() => setExported(false), 3000)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                    <Download className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">{tc.title}</h2>
                    <p className="text-[14px] text-zinc-500 mt-0.5">{tc.subtitle}</p>
                </div>
            </div>

            {/* Top Row: 3 cards side by side */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Card 1: Status Filter */}
                <Card className="shadow-sm border-zinc-200/80 dark:border-zinc-800/80">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/40">
                                <Filter className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            {tc.filterStatus}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                        {['all', 'lead', 'quotation_sent', 'accepted', 'rejected'].map(s => (
                            <button
                                key={s}
                                onClick={() => { setFilterStatus(s); setPage(1) }}
                                className={`w-full text-left px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all ${filterStatus === s
                                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-sm ring-1 ring-blue-200/60 dark:ring-blue-800/60'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                    }`}
                            >
                                {s === 'all' ? tc.allStatuses : statusLabels[s] || s}
                                <span className="float-right tabular-nums text-zinc-400 font-semibold">
                                    {s === 'all' ? leads.length : leads.filter(l => l.status === s).length}
                                </span>
                            </button>
                        ))}
                    </CardContent>
                </Card>

                {/* Card 2: Summary + Download */}
                <Card className="shadow-sm border-zinc-200/80 dark:border-zinc-800/80">
                    <CardContent className="p-5 flex flex-col justify-between h-full">
                        <div className="flex items-center gap-4 mb-5">
                            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                                <FileSpreadsheet className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">{tc.totalRecords}</p>
                                <p className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                    {filteredLeads.length} <span className="text-[14px] font-medium text-zinc-400">{tc.records}</span>
                                </p>
                            </div>
                        </div>
                        <div className="space-y-2.5">
                            <Button onClick={downloadCsv} variant="outline" className="text-[13px] gap-2 h-10 w-full">
                                <Download className="h-4 w-4" />
                                {tc.downloadCsv}
                            </Button>
                            <Button onClick={downloadExcel} className="text-[13px] gap-2 h-10 w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                                <FileSpreadsheet className="h-4 w-4" />
                                {tc.downloadExcel}
                            </Button>
                        </div>
                        {exported && (
                            <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl text-[13px] text-emerald-700 dark:text-emerald-300 font-medium">
                                <CheckCircle2 className="h-4 w-4" />
                                {tc.exported}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Card 3: Data Selection */}
                <Card className="shadow-sm border-zinc-200/80 dark:border-zinc-800/80">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-violet-50 dark:bg-violet-950/40">
                                <CheckCircle2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                            </div>
                            {tc.includeFields}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <ToggleRow icon={Users} label={tc.customerInfo} checked={includeCustomer} onChange={setIncludeCustomer} color="text-blue-500" />
                        <ToggleRow icon={Calendar} label={tc.eventInfo} checked={includeEvent} onChange={setIncludeEvent} color="text-violet-500" />
                        <ToggleRow icon={DollarSign} label={tc.financialInfo} checked={includeFinancial} onChange={setIncludeFinancial} color="text-emerald-500" />
                        <ToggleRow icon={FileSpreadsheet} label={tc.installmentInfo} checked={includeInstallment} onChange={setIncludeInstallment} color="text-amber-500" />
                    </CardContent>
                </Card>
            </div>

            {/* Full-width data table */}
            <div
                className="relative"
                style={{
                    width: '100vw',
                    marginLeft: 'calc(-50vw + 50%)',
                    paddingLeft: '1rem',
                    paddingRight: '1rem',
                }}
            >
                <Card className="shadow-sm border-zinc-200/80 dark:border-zinc-800/80">
                    {/* Table Header with pagination controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2.5">
                            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-orange-50 dark:bg-orange-950/40">
                                <FileSpreadsheet className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            </div>
                            <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                                {locale === 'th' ? 'ข้อมูลที่จะดาวน์โหลด' : 'Data to Download'}
                            </span>
                            <Badge variant="outline" className="text-[12px] px-2.5 py-0.5">{filteredLeads.length} {tc.records}</Badge>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Records per page selector */}
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] text-zinc-500">{locale === 'th' ? 'แสดง' : 'Show'}</span>
                                <select
                                    value={pageSize}
                                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                                    className="h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                                >
                                    {[50, 100, 200, 500].map(n => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                                <span className="text-[13px] text-zinc-500">{locale === 'th' ? 'รายการ/หน้า' : 'per page'}</span>
                            </div>
                            {/* Page navigation */}
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage <= 1}
                                    className="h-8 w-8 p-0"
                                >
                                    <span className="sr-only">Previous</span>
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </Button>
                                <span className="text-[13px] text-zinc-600 dark:text-zinc-400 px-2 tabular-nums font-medium">
                                    {currentPage} / {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage >= totalPages}
                                    className="h-8 w-8 p-0"
                                >
                                    <span className="sr-only">Next</span>
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Data Table */}
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-zinc-50/80 dark:bg-zinc-800/50 z-10">
                                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                                        <th className="text-left py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.name}</th>
                                        <th className="text-left py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.status}</th>
                                        {includeCustomer && (
                                            <>
                                                <th className="text-left py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.phone}</th>
                                                <th className="text-left py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.lineId}</th>
                                                <th className="text-left py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.source}</th>
                                            </>
                                        )}
                                        {includeEvent && (
                                            <>
                                                <th className="text-left py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.eventDate}</th>
                                                <th className="text-left py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.endDate}</th>
                                                <th className="text-left py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.location}</th>
                                            </>
                                        )}
                                        {includeFinancial && (
                                            <>
                                                <th className="text-left py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.package}</th>
                                                <th className="text-right py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.quotedPrice}</th>
                                                <th className="text-right py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.confirmedPrice}</th>
                                                <th className="text-right py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.deposit}</th>
                                            </>
                                        )}
                                        {includeInstallment && [1, 2, 3, 4].map(n => (
                                            <th key={n} className="text-right py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">
                                                {locale === 'th' ? `งวด ${n}` : `Inst. ${n}`}
                                            </th>
                                        ))}
                                        <th className="text-right py-3 px-4 font-semibold text-zinc-500 whitespace-nowrap">{tc.createdAt}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedLeads.map((l, idx) => (
                                        <tr key={l.id} className={`border-b border-zinc-100/80 dark:border-zinc-800/40 hover:bg-blue-50/40 dark:hover:bg-zinc-800/30 transition-colors ${idx % 2 === 0 ? 'bg-zinc-50/30 dark:bg-zinc-900/30' : ''}`}>
                                            <td className="py-2.5 px-4 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{l.customer_name}</td>
                                            <td className="py-2.5 px-4 whitespace-nowrap">
                                                <Badge variant="outline" className="text-[12px] px-2 py-0.5">
                                                    {statusLabels[l.status] || l.status}
                                                </Badge>
                                            </td>
                                            {includeCustomer && (
                                                <>
                                                    <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">{l.customer_phone || '—'}</td>
                                                    <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">{l.customer_line || '—'}</td>
                                                    <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">{l.lead_source ? getSettingLabel('source', l.lead_source) : '—'}</td>
                                                </>
                                            )}
                                            {includeEvent && (
                                                <>
                                                    <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">{l.event_date || '—'}</td>
                                                    <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">{l.event_end_date || '—'}</td>
                                                    <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">{l.event_location || '—'}</td>
                                                </>
                                            )}
                                            {includeFinancial && (
                                                <>
                                                    <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">{l.package_name ? getSettingLabel('package', l.package_name) : '—'}</td>
                                                    <td className="py-2.5 px-4 text-right text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{l.quoted_price ? `฿${l.quoted_price.toLocaleString()}` : '—'}</td>
                                                    <td className="py-2.5 px-4 text-right text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{l.confirmed_price ? `฿${l.confirmed_price.toLocaleString()}` : '—'}</td>
                                                    <td className="py-2.5 px-4 text-right text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{l.deposit ? `฿${l.deposit.toLocaleString()}` : '—'}</td>
                                                </>
                                            )}
                                            {includeInstallment && [1, 2, 3, 4].map(n => {
                                                const amt = (l as any)[`installment_${n}`] as number
                                                const isPaid = (l as any)[`installment_${n}_paid`] as boolean
                                                return (
                                                    <td key={n} className="py-2.5 px-4 text-right whitespace-nowrap">
                                                        {amt ? (
                                                            <span className={isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-300'}>
                                                                {isPaid ? '✓ ' : ''}฿{amt.toLocaleString()}
                                                            </span>
                                                        ) : (
                                                            <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                                        )}
                                                    </td>
                                                )
                                            })}
                                            <td className="py-2.5 px-4 text-right text-zinc-500 whitespace-nowrap">{l.created_at.slice(0, 10)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Bottom pagination */}
                        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20">
                            <span className="text-[13px] text-zinc-500">
                                {locale === 'th'
                                    ? `แสดง ${((currentPage - 1) * pageSize) + 1}–${Math.min(currentPage * pageSize, filteredLeads.length)} จาก ${filteredLeads.length} รายการ`
                                    : `Showing ${((currentPage - 1) * pageSize) + 1}–${Math.min(currentPage * pageSize, filteredLeads.length)} of ${filteredLeads.length} records`
                                }
                            </span>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(1)}
                                    disabled={currentPage <= 1}
                                    className="h-8 px-2 text-[12px]"
                                >
                                    {locale === 'th' ? 'หน้าแรก' : 'First'}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage <= 1}
                                    className="h-8 w-8 p-0"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </Button>
                                <span className="text-[13px] text-zinc-600 dark:text-zinc-400 px-3 tabular-nums font-medium">
                                    {locale === 'th' ? `หน้า ${currentPage} / ${totalPages}` : `Page ${currentPage} / ${totalPages}`}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage >= totalPages}
                                    className="h-8 w-8 p-0"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(totalPages)}
                                    disabled={currentPage >= totalPages}
                                    className="h-8 px-2 text-[12px]"
                                >
                                    {locale === 'th' ? 'หน้าสุดท้าย' : 'Last'}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function ToggleRow({
    icon: Icon,
    label,
    checked,
    onChange,
    color,
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    checked: boolean
    onChange: (v: boolean) => void
    color: string
}) {
    return (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-800/30 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors">
            <div className="flex items-center gap-2.5">
                <Icon className={`h-4 w-4 ${color}`} />
                <Label className="text-[14px] font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">{label}</Label>
            </div>
            <Switch checked={checked} onCheckedChange={onChange} />
        </div>
    )
}