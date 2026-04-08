'use client'

import { useState, useTransition } from 'react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { createMyTicket } from '../actions'
import type { PersonalSetting } from '../actions'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Add / Edit My Ticket Dialog
// ============================================================================

interface AddMyTicketDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    settings: PersonalSetting[]
    defaultCategory?: string
    editTicket?: {
        id: string
        subject: string
        description: string | null
        status: string
        category: string
        priority: string
        outcome: string | null
    }
    onUpdate?: (id: string, formData: FormData) => Promise<{ success?: boolean; error?: string }>
}

const PRIORITIES = [
    { value: 'urgent', labelTh: 'ด่วนที่สุด', labelEn: 'Urgent', color: '#ef4444' },
    { value: 'high',   labelTh: 'ด่วน',        labelEn: 'High',   color: '#f59e0b' },
    { value: 'medium', labelTh: 'ปกติ',         labelEn: 'Normal', color: '#3b82f6' },
    { value: 'low',    labelTh: 'ต่ำ',           labelEn: 'Low',    color: '#71717a' },
]

export function AddMyTicketDialog({
    open, onOpenChange, settings, defaultCategory, editTicket, onUpdate,
}: AddMyTicketDialogProps) {
    const { locale }    = useLocale()
    const [isPending, startTransition] = useTransition()

    const categories = settings.filter(s => s.category === 'ticket_category' && s.is_active)
    const statuses   = settings.filter(s => s.category === 'status_ticket' && s.is_active)

    const [subject,     setSubject]     = useState(editTicket?.subject || '')
    const [description, setDescription] = useState(editTicket?.description || '')
    const [category,    setCategory]    = useState(editTicket?.category || defaultCategory || categories[0]?.value || '')
    const [status,      setStatus]      = useState(editTicket?.status || statuses[0]?.value || 'open')
    const [priority,    setPriority]    = useState(editTicket?.priority || 'medium')
    const [outcome,     setOutcome]     = useState(editTicket?.outcome || '')
    const [error,       setError]       = useState('')

    const reset = () => {
        setSubject(''); setDescription(''); setCategory(defaultCategory || categories[0]?.value || '')
        setStatus(statuses[0]?.value || 'open'); setPriority('medium'); setOutcome(''); setError('')
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!subject.trim()) { setError(locale === 'th' ? 'กรุณาใส่หัวข้อ' : 'Subject is required'); return }
        if (!category)       { setError(locale === 'th' ? 'กรุณาเลือกหมวด' : 'Category is required'); return }
        setError('')

        const fd = new FormData()
        fd.set('subject',     subject.trim())
        fd.set('description', description)
        fd.set('category',    category)
        fd.set('status',      status)
        fd.set('priority',    priority)
        fd.set('outcome',     outcome)

        startTransition(async () => {
            let result: { success?: boolean; error?: string }
            if (editTicket && onUpdate) {
                result = await onUpdate(editTicket.id, fd)
            } else {
                result = await createMyTicket(fd)
            }
            if (result?.error) { setError(result.error); return }
            reset()
            onOpenChange(false)
        })
    }

    const isEdit = !!editTicket

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v) }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit
                            ? (locale === 'th' ? 'แก้ไข Ticket' : 'Edit Ticket')
                            : (locale === 'th' ? 'เพิ่ม Ticket ใหม่' : 'New Ticket')
                        }
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Subject */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'หัวข้อ' : 'Subject'} *</Label>
                        <Input
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            placeholder={locale === 'th' ? 'หัวข้อ Ticket...' : 'Ticket subject...'}
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Category */}
                        <div className="space-y-1.5">
                            <Label>{locale === 'th' ? 'หมวดหมู่' : 'Category'} *</Label>
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger><SelectValue placeholder={locale === 'th' ? 'เลือกหมวด' : 'Select category'} /></SelectTrigger>
                                <SelectContent>
                                    {categories.map(c => (
                                        <SelectItem key={c.value} value={c.value}>
                                            <span className="flex items-center gap-2">
                                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color || '#9ca3af' }} />
                                                {locale === 'th' ? c.label_th : c.label_en}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Status */}
                        <div className="space-y-1.5">
                            <Label>{locale === 'th' ? 'สถานะ' : 'Status'}</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {statuses.map(s => (
                                        <SelectItem key={s.value} value={s.value}>
                                            <span className="flex items-center gap-2">
                                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color || '#9ca3af' }} />
                                                {locale === 'th' ? s.label_th : s.label_en}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Priority */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'ความเร่งด่วน' : 'Priority'}</Label>
                        <Select value={priority} onValueChange={setPriority}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {PRIORITIES.map(p => (
                                    <SelectItem key={p.value} value={p.value}>
                                        <span className="flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                                            {locale === 'th' ? p.labelTh : p.labelEn}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'รายละเอียด' : 'Description'}</Label>
                        <Textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder={locale === 'th' ? 'รายละเอียด...' : 'Details...'}
                            rows={3}
                        />
                    </div>

                    {/* Outcome */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'ผลลัพธ์ที่ต้องการ' : 'Desired Outcome'}</Label>
                        <Input
                            value={outcome}
                            onChange={e => setOutcome(e.target.value)}
                            placeholder={locale === 'th' ? 'ผลที่คาดหวัง...' : 'Expected outcome...'}
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }}>
                            {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </Button>
                        <Button type="submit" disabled={isPending} className="bg-violet-600 hover:bg-violet-700 text-white">
                            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {isEdit ? (locale === 'th' ? 'บันทึก' : 'Save') : (locale === 'th' ? 'เพิ่ม Ticket' : 'Add Ticket')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
