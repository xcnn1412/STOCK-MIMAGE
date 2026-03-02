'use client'

import { useState, useTransition } from 'react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createJob } from '../actions'
import type { JobSetting, JobType } from '../actions'
import { getStatusesFromSettings, getStatusConfig } from '../jobs-dashboard'
import { useLocale } from '@/lib/i18n/context'

interface SystemUser {
    id: string
    full_name: string | null
    department: string | null
}

interface AddJobDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    settings: JobSetting[]
    users: SystemUser[]
    defaultJobType: JobType
}

export function AddJobDialog({ open, onOpenChange, settings, users, defaultJobType }: AddJobDialogProps) {
    const { locale } = useLocale()
    const [isPending, startTransition] = useTransition()

    const [jobType, setJobType] = useState<JobType>(defaultJobType)
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [priority, setPriority] = useState('medium')
    const [status, setStatus] = useState('')
    const [eventDate, setEventDate] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [customerName, setCustomerName] = useState('')
    const [eventLocation, setEventLocation] = useState('')
    const [notes, setNotes] = useState('')

    const statuses = getStatusesFromSettings(settings, jobType)
    const defaultStatus = statuses[0] || 'pending'

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) return

        const formData = new FormData()
        formData.set('job_type', jobType)
        formData.set('title', title)
        formData.set('description', description)
        formData.set('priority', priority)
        formData.set('status', status || defaultStatus)
        formData.set('event_date', eventDate)
        formData.set('due_date', dueDate)
        formData.set('customer_name', customerName)
        formData.set('event_location', eventLocation)
        formData.set('notes', notes)

        startTransition(async () => {
            const result = await createJob(formData)
            if (result.success) {
                resetForm()
                onOpenChange(false)
            }
        })
    }

    const resetForm = () => {
        setTitle('')
        setDescription('')
        setPriority('medium')
        setStatus('')
        setEventDate('')
        setDueDate('')
        setCustomerName('')
        setEventLocation('')
        setNotes('')
    }

    const priorityOptions = [
        { value: 'low', label: locale === 'th' ? 'ต่ำ' : 'Low' },
        { value: 'medium', label: locale === 'th' ? 'ปานกลาง' : 'Medium' },
        { value: 'high', label: locale === 'th' ? 'สูง' : 'High' },
        { value: 'urgent', label: locale === 'th' ? 'เร่งด่วน' : 'Urgent' },
    ]

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{locale === 'th' ? 'เพิ่มงานใหม่' : 'Add New Job'}</DialogTitle>
                    <DialogDescription>
                        {locale === 'th' ? 'กรอกรายละเอียดงาน' : 'Enter job details'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Job Type */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'ประเภทงาน' : 'Job Type'}</Label>
                        <Select value={jobType} onValueChange={(v: string) => { setJobType(v as JobType); setStatus('') }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="graphic">{locale === 'th' ? 'กราฟฟิก' : 'Graphic'}</SelectItem>
                                <SelectItem value="onsite">{locale === 'th' ? 'ออกหน้างาน' : 'On-site'}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Title */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'ชื่องาน' : 'Title'} *</Label>
                        <Input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder={locale === 'th' ? 'ชื่องาน...' : 'Job title...'}
                            required
                        />
                    </div>

                    {/* Customer Name */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'ชื่อลูกค้า' : 'Customer Name'}</Label>
                        <Input
                            value={customerName}
                            onChange={e => setCustomerName(e.target.value)}
                            placeholder={locale === 'th' ? 'ชื่อลูกค้า...' : 'Customer name...'}
                        />
                    </div>

                    {/* Status + Priority */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>{locale === 'th' ? 'สถานะ' : 'Status'}</Label>
                            <Select value={status || defaultStatus} onValueChange={setStatus}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {statuses.map(s => {
                                        const cfg = getStatusConfig(settings, jobType, s)
                                        return (
                                            <SelectItem key={s} value={s}>
                                                <span className="flex items-center gap-2">
                                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                                                    {locale === 'th' ? cfg.labelTh : cfg.label}
                                                </span>
                                            </SelectItem>
                                        )
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{locale === 'th' ? 'ลำดับความสำคัญ' : 'Priority'}</Label>
                            <Select value={priority} onValueChange={setPriority}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {priorityOptions.map(p => (
                                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>{locale === 'th' ? 'วันงาน' : 'Event Date'}</Label>
                            <Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{locale === 'th' ? 'กำหนดส่ง' : 'Due Date'}</Label>
                            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                        </div>
                    </div>

                    {/* Location */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'สถานที่' : 'Location'}</Label>
                        <Input
                            value={eventLocation}
                            onChange={e => setEventLocation(e.target.value)}
                            placeholder={locale === 'th' ? 'สถานที่จัดงาน...' : 'Event location...'}
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'รายละเอียด' : 'Description'}</Label>
                        <Textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder={locale === 'th' ? 'รายละเอียดเพิ่มเติม...' : 'Additional details...'}
                            rows={3}
                        />
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'หมายเหตุ' : 'Notes'}</Label>
                        <Textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder={locale === 'th' ? 'หมายเหตุ...' : 'Notes...'}
                            rows={2}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </Button>
                        <Button type="submit" disabled={isPending || !title.trim()} className="bg-violet-600 hover:bg-violet-700 text-white">
                            {isPending
                                ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                : (locale === 'th' ? 'สร้างงาน' : 'Create Job')
                            }
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
