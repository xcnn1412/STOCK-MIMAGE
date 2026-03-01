'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    Archive, ArchiveRestore, Search, Calendar, MapPin, User,
    DollarSign, Package, AlertCircle, RefreshCw, MessageSquare,
    Inbox
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { unarchiveLead } from '../actions'
import { STATUS_CONFIG, getStatusConfig, type CrmLead, type CrmSetting, type LeadStatus } from '../crm-dashboard'
import { useLocale } from '@/lib/i18n/context'

interface ArchiveViewProps {
    leads: CrmLead[]
    settings: CrmSetting[]
}

export default function ArchiveView({ leads, settings }: ArchiveViewProps) {
    const { locale, t } = useLocale()
    const tc = t.crm
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [restoring, setRestoring] = useState<string | null>(null)

    const getSettingLabel = (setting: CrmSetting) => {
        return locale === 'th' ? setting.label_th : setting.label_en
    }

    const filteredLeads = useMemo(() => {
        if (!search) return leads
        const q = search.toLowerCase()
        return leads.filter(lead =>
            lead.customer_name.toLowerCase().includes(q) ||
            lead.customer_line?.toLowerCase().includes(q)
        )
    }, [leads, search])

    const handleRestore = async (id: string) => {
        setRestoring(id)
        await unarchiveLead(id)
        setRestoring(null)
        router.refresh()
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
                        <Archive className="h-6 w-6 text-zinc-400" />
                        {locale === 'th' ? 'คลังเก็บ' : 'Archive'}
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {locale === 'th'
                            ? `ลูกค้าที่ถูกเก็บเข้าคลัง ${leads.length} รายการ`
                            : `${leads.length} archived lead${leads.length !== 1 ? 's' : ''}`
                        }
                    </p>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                    type="text"
                    placeholder={tc.filters.searchCustomer}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-9"
                />
            </div>

            {/* Archived leads list */}
            {filteredLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 mb-4">
                        <Inbox className="h-8 w-8 text-zinc-400" />
                    </div>
                    <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
                        {locale === 'th' ? 'ไม่มีรายการใน Archive' : 'No archived leads'}
                    </p>
                    <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
                        {locale === 'th'
                            ? 'ลูกค้าที่ถูก Archive จะแสดงที่นี่'
                            : 'Archived leads will appear here'
                        }
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredLeads.map(lead => {
                        const statusCfg = getStatusConfig(settings, lead.status)
                        const pkgSetting = settings.find(s => s.category === 'package' && s.value === lead.package_name)
                        const sourceSetting = settings.find(s => s.category === 'lead_source' && s.value === lead.lead_source)
                        const price = lead.confirmed_price || lead.quoted_price || 0
                        const archivedDate = lead.archived_at
                            ? new Date(lead.archived_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
                                year: 'numeric', month: 'short', day: 'numeric'
                            })
                            : ''

                        return (
                            <Card key={lead.id} className="border-zinc-200/60 dark:border-zinc-800/60 hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                                        {/* Left: Info */}
                                        <Link href={`/crm/${lead.id}`} className="flex-1 min-w-0 group">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="font-semibold text-base text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                                                    {lead.customer_name}
                                                </div>
                                                <Badge className="border-0 text-[12px] shrink-0" style={{ backgroundColor: `${statusCfg.color}15`, color: statusCfg.color }}>
                                                    {tc.statuses[lead.status] || statusCfg.labelTh || statusCfg.label}
                                                </Badge>
                                                {lead.is_returning && (
                                                    <Badge className="text-[11px] px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200/60 gap-1 shrink-0">
                                                        <RefreshCw className="h-3 w-3" />
                                                        {tc.kanban.returning}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                                                {lead.event_date && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3.5 w-3.5" />
                                                        {lead.event_date}
                                                    </span>
                                                )}
                                                {lead.event_location && (
                                                    <span className="flex items-center gap-1">
                                                        <MapPin className="h-3.5 w-3.5" />
                                                        {lead.event_location}
                                                    </span>
                                                )}
                                                {sourceSetting && (
                                                    <span className="flex items-center gap-1">
                                                        <MessageSquare className="h-3.5 w-3.5" />
                                                        {getSettingLabel(sourceSetting)}
                                                    </span>
                                                )}
                                                {pkgSetting && (
                                                    <span className="flex items-center gap-1">
                                                        <Package className="h-3.5 w-3.5" />
                                                        {getSettingLabel(pkgSetting)}
                                                    </span>
                                                )}
                                                {price > 0 && (
                                                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                                        ฿{price.toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                        </Link>

                                        {/* Right: Archive info + Restore */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-right hidden sm:block">
                                                <div className="text-[12px] text-zinc-400 dark:text-zinc-500">
                                                    {locale === 'th' ? 'เก็บเมื่อ' : 'Archived'}
                                                </div>
                                                <div className="text-[13px] text-zinc-500 dark:text-zinc-400 font-medium">
                                                    {archivedDate}
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleRestore(lead.id)}
                                                disabled={restoring === lead.id}
                                                className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                            >
                                                <ArchiveRestore className="h-4 w-4" />
                                                {restoring === lead.id
                                                    ? (locale === 'th' ? 'กำลังนำออก...' : 'Restoring...')
                                                    : (locale === 'th' ? 'นำออก' : 'Restore')
                                                }
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
