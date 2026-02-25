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

    const getSettingLabel = (cat: string, val: string) => {
        const s = settings.find(s => s.category === cat && s.value === val)
        return s ? (locale === 'th' ? s.label_th : s.label_en) : val
    }

    const filteredLeads = useMemo(() => {
        if (filterStatus === 'all') return leads
        return leads.filter(l => l.status === filterStatus)
    }, [leads, filterStatus])

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
        // BOM for Thai encoding
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
        // Export as TSV with .xls extension (universally openable)
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
            <div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{tc.title}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{tc.subtitle}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Filters + Options */}
                <div className="space-y-6">
                    {/* Status Filter */}
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-blue-50 dark:bg-blue-950/40">
                                    <Filter className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                </div>
                                {tc.filterStatus}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {['all', 'lead', 'quotation_sent', 'accepted', 'rejected'].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setFilterStatus(s)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${filterStatus === s
                                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                        }`}
                                >
                                    {s === 'all' ? tc.allStatuses : statusLabels[s] || s}
                                    <span className="float-right text-zinc-400">
                                        {s === 'all' ? leads.length : leads.filter(l => l.status === s).length}
                                    </span>
                                </button>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Data Selection */}
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-violet-50 dark:bg-violet-950/40">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                                </div>
                                {tc.includeFields}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <ToggleRow icon={Users} label={tc.customerInfo} checked={includeCustomer} onChange={setIncludeCustomer} color="text-blue-500" />
                            <ToggleRow icon={Calendar} label={tc.eventInfo} checked={includeEvent} onChange={setIncludeEvent} color="text-violet-500" />
                            <ToggleRow icon={DollarSign} label={tc.financialInfo} checked={includeFinancial} onChange={setIncludeFinancial} color="text-emerald-500" />
                            <ToggleRow icon={FileSpreadsheet} label={tc.installmentInfo} checked={includeInstallment} onChange={setIncludeInstallment} color="text-amber-500" />
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Preview + Download */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Summary */}
                    <Card className="shadow-sm">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
                                    <FileSpreadsheet className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{tc.totalRecords}</p>
                                    <p className="text-xs text-zinc-500">{filteredLeads.length} {tc.records}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={downloadCsv} size="sm" variant="outline" className="text-xs gap-1.5">
                                    <Download className="h-3.5 w-3.5" />
                                    {tc.downloadCsv}
                                </Button>
                                <Button onClick={downloadExcel} size="sm" className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                                    <FileSpreadsheet className="h-3.5 w-3.5" />
                                    {tc.downloadExcel}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {exported && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                            <CheckCircle2 className="h-4 w-4" />
                            {tc.exported}
                        </div>
                    )}

                    {/* Preview Table */}
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-orange-50 dark:bg-orange-950/40">
                                    <FileSpreadsheet className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                                </div>
                                {tc.preview}
                                <Badge variant="outline" className="text-[10px] ml-auto">{filteredLeads.length} {tc.records}</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-white dark:bg-zinc-900 z-10">
                                        <tr className="border-b border-zinc-200 dark:border-zinc-700">
                                            <th className="text-left py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.name}</th>
                                            <th className="text-left py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.status}</th>
                                            {includeCustomer && (
                                                <>
                                                    <th className="text-left py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.phone}</th>
                                                    <th className="text-left py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.lineId}</th>
                                                    <th className="text-left py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.source}</th>
                                                </>
                                            )}
                                            {includeEvent && (
                                                <>
                                                    <th className="text-left py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.eventDate}</th>
                                                    <th className="text-left py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.endDate}</th>
                                                    <th className="text-left py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.location}</th>
                                                </>
                                            )}
                                            {includeFinancial && (
                                                <>
                                                    <th className="text-left py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.package}</th>
                                                    <th className="text-right py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.quotedPrice}</th>
                                                    <th className="text-right py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.confirmedPrice}</th>
                                                    <th className="text-right py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">{tc.deposit}</th>
                                                </>
                                            )}
                                            {includeInstallment && [1, 2, 3, 4].map(n => (
                                                <th key={n} className="text-right py-2 pr-3 font-semibold text-zinc-500 whitespace-nowrap">
                                                    {locale === 'th' ? `งวด ${n}` : `Inst. ${n}`}
                                                </th>
                                            ))}
                                            <th className="text-right py-2 font-semibold text-zinc-500 whitespace-nowrap">{tc.createdAt}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLeads.slice(0, 20).map(l => (
                                            <tr key={l.id} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                                                <td className="py-1.5 pr-3 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{l.customer_name}</td>
                                                <td className="py-1.5 pr-3 whitespace-nowrap">
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                        {statusLabels[l.status] || l.status}
                                                    </Badge>
                                                </td>
                                                {includeCustomer && (
                                                    <>
                                                        <td className="py-1.5 pr-3 text-zinc-500 whitespace-nowrap">{l.customer_phone || '—'}</td>
                                                        <td className="py-1.5 pr-3 text-zinc-500 whitespace-nowrap">{l.customer_line || '—'}</td>
                                                        <td className="py-1.5 pr-3 text-zinc-500 whitespace-nowrap">{l.lead_source ? getSettingLabel('source', l.lead_source) : '—'}</td>
                                                    </>
                                                )}
                                                {includeEvent && (
                                                    <>
                                                        <td className="py-1.5 pr-3 text-zinc-500 whitespace-nowrap">{l.event_date || '—'}</td>
                                                        <td className="py-1.5 pr-3 text-zinc-500 whitespace-nowrap">{l.event_end_date || '—'}</td>
                                                        <td className="py-1.5 pr-3 text-zinc-500 whitespace-nowrap">{l.event_location || '—'}</td>
                                                    </>
                                                )}
                                                {includeFinancial && (
                                                    <>
                                                        <td className="py-1.5 pr-3 text-zinc-500 whitespace-nowrap">{l.package_name ? getSettingLabel('package', l.package_name) : '—'}</td>
                                                        <td className="py-1.5 pr-3 text-right text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{l.quoted_price ? `฿${l.quoted_price.toLocaleString()}` : '—'}</td>
                                                        <td className="py-1.5 pr-3 text-right text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{l.confirmed_price ? `฿${l.confirmed_price.toLocaleString()}` : '—'}</td>
                                                        <td className="py-1.5 pr-3 text-right text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{l.deposit ? `฿${l.deposit.toLocaleString()}` : '—'}</td>
                                                    </>
                                                )}
                                                {includeInstallment && [1, 2, 3, 4].map(n => {
                                                    const amt = (l as any)[`installment_${n}`] as number
                                                    const isPaid = (l as any)[`installment_${n}_paid`] as boolean
                                                    return (
                                                        <td key={n} className="py-1.5 pr-3 text-right whitespace-nowrap">
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
                                                <td className="py-1.5 text-right text-zinc-500 whitespace-nowrap">{l.created_at.slice(0, 10)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredLeads.length > 20 && (
                                    <p className="text-center text-[10px] text-zinc-400 py-2">
                                        {locale === 'th' ? `...แสดง 20 จาก ${filteredLeads.length} รายการ` : `...showing 20 of ${filteredLeads.length} records`}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
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
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <Label className="text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">{label}</Label>
            </div>
            <Switch checked={checked} onCheckedChange={onChange} />
        </div>
    )
}
