'use client'

import { useState, useTransition } from 'react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, MessageSquare } from 'lucide-react'
import { createMyJob } from '../actions'
import type { PersonalSetting } from '../actions'
import { getMyJobStatuses } from './my-job-kanban-board'
import { MyCommentThread } from './my-comment-thread'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Add / Edit My Job Dialog
// ============================================================================

interface AddMyJobDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    settings: PersonalSetting[]
    jobTypes: PersonalSetting[]   // category === 'job_type'
    defaultJobType?: string
    /** Pass to turn into an edit dialog — will call updateMyJob instead */
    editJob?: {
        id: string
        title: string
        description: string | null
        job_type: string
        status: string
        priority: string
        due_date: string | null
        notes: string | null
        tags: string[]
    }
    onUpdate?: (id: string, formData: FormData) => Promise<{ success?: boolean; error?: string }>
    /** When set (admin view), new jobs are created under this user */
    targetUserId?: string
    /** Current signed-in user's ID — enables comment thread when editing */
    currentUserId?: string
    /** Whether the current user is an admin */
    isAdmin?: boolean
}

const PRIORITIES = [
    { value: 'low',    labelTh: 'ต่ำ',       labelEn: 'Low',    color: '#71717a' },
    { value: 'medium', labelTh: 'ปานกลาง',   labelEn: 'Medium', color: '#3b82f6' },
    { value: 'high',   labelTh: 'สูง',        labelEn: 'High',   color: '#f59e0b' },
    { value: 'urgent', labelTh: 'เร่งด่วน',  labelEn: 'Urgent', color: '#ef4444' },
]

export function AddMyJobDialog({
    open,
    onOpenChange,
    settings,
    jobTypes,
    defaultJobType,
    editJob,
    currentUserId,
    isAdmin = false,
    onUpdate,
    targetUserId,
}: AddMyJobDialogProps) {
    const [commentCount, setCommentCount] = useState(0)
    const { locale } = useLocale()
    const [isPending, startTransition] = useTransition()

    const initialType = editJob?.job_type || defaultJobType || jobTypes[0]?.value || 'personal'

    const [jobType,     setJobType]     = useState(initialType)
    const [title,       setTitle]       = useState(editJob?.title || '')
    const [description, setDescription] = useState(editJob?.description || '')
    const [priority,    setPriority]    = useState(editJob?.priority || 'medium')
    const [status,      setStatus]      = useState(editJob?.status || '')
    const [dueDate,     setDueDate]     = useState(editJob?.due_date || '')
    const [notes,       setNotes]       = useState(editJob?.notes || '')
    const [tagsInput,   setTagsInput]   = useState((editJob?.tags || []).join(', '))
    const [error,       setError]       = useState('')

    const statuses = getMyJobStatuses(settings, jobType)

    const reset = () => {
        setJobType(defaultJobType || jobTypes[0]?.value || 'personal')
        setTitle(''); setDescription(''); setPriority('medium'); setStatus('')
        setDueDate(''); setNotes(''); setTagsInput(''); setError('')
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) { setError(locale === 'th' ? 'กรุณาใส่ชื่องาน' : 'Title is required'); return }
        setError('')

        const fd = new FormData()
        fd.set('job_type',    jobType)
        fd.set('title',       title.trim())
        fd.set('description', description)
        fd.set('priority',    priority)
        fd.set('status',      status || statuses[0] || 'todo')
        fd.set('due_date',    dueDate)
        fd.set('notes',       notes)
        fd.set('tags',        tagsInput)

        startTransition(async () => {
            let result: { success?: boolean; error?: string }
            if (editJob && onUpdate) {
                result = await onUpdate(editJob.id, fd)
            } else {
                result = await createMyJob(fd, targetUserId)
            }
            if (result?.error) { setError(result.error); return }
            reset()
            onOpenChange(false)
        })
    }

    const isEdit = !!editJob
    const showComments = isEdit && !!currentUserId

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v) }}>
            <DialogContent className={showComments ? 'max-w-5xl max-h-[92vh] overflow-y-auto' : 'max-w-3xl max-h-[92vh] overflow-y-auto'}>
                <DialogHeader>
                    <DialogTitle>
                        {isEdit
                            ? (locale === 'th' ? 'แก้ไขงาน' : 'Edit Job')
                            : (locale === 'th' ? 'เพิ่มงานใหม่' : 'Add New Job')
                        }
                    </DialogTitle>
                </DialogHeader>

                {showComments ? (
                    <Tabs defaultValue="details" className="w-full">
                        <TabsList className="w-full">
                            <TabsTrigger value="details" className="flex-1">
                                {locale === 'th' ? 'รายละเอียด' : 'Details'}
                            </TabsTrigger>
                            <TabsTrigger value="comments" className="flex-1 gap-1.5">
                                <MessageSquare className="h-3.5 w-3.5" />
                                {locale === 'th' ? 'ความคิดเห็น' : 'Comments'}
                                {commentCount > 0 && (
                                    <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-violet-500 text-white text-[10px] font-bold">
                                        {commentCount}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="mt-4">
                            <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Job Type */}
                    {jobTypes.length > 1 && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>{locale === 'th' ? 'ประเภทงาน' : 'Job Type'}</Label>
                                <Select value={jobType} onValueChange={setJobType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {jobTypes.map(jt => (
                                            <SelectItem key={jt.value} value={jt.value}>
                                                <span className="flex items-center gap-2">
                                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: jt.color || '#9ca3af' }} />
                                                    {locale === 'th' ? jt.label_th : jt.label_en}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label>{locale === 'th' ? 'สถานะ' : 'Status'}</Label>
                                <Select value={status || statuses[0] || ''} onValueChange={setStatus}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {statuses.map(s => {
                                            const cfg = settings.find(st => st.category === `status_${jobType}` && st.value === s)
                                            return (
                                                <SelectItem key={s} value={s}>
                                                    <span className="flex items-center gap-2">
                                                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg?.color || '#9ca3af' }} />
                                                        {locale === 'th' ? (cfg?.label_th || s) : (cfg?.label_en || s)}
                                                    </span>
                                                </SelectItem>
                                            )
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {/* Title */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'ชื่องาน' : 'Title'} *</Label>
                        <Input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder={locale === 'th' ? 'ชื่องาน...' : 'Job title...'}
                            autoFocus
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'รายละเอียด' : 'Description'}</Label>
                        <Textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder={locale === 'th' ? 'รายละเอียดเพิ่มเติม...' : 'Details...'}
                            rows={3}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Priority */}
                        <div className="space-y-1.5">
                            <Label>{locale === 'th' ? 'ความสำคัญ' : 'Priority'}</Label>
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

                        {/* Due date */}
                        <div className="space-y-1.5">
                            <Label>{locale === 'th' ? 'กำหนดส่ง' : 'Due Date'}</Label>
                            <Input
                                type="date"
                                value={dueDate}
                                onChange={e => setDueDate(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'แท็ก (คั่นด้วย ,)' : 'Tags (comma-separated)'}</Label>
                        <Input
                            value={tagsInput}
                            onChange={e => setTagsInput(e.target.value)}
                            placeholder={locale === 'th' ? 'เช่น ด่วน, สำคัญ' : 'e.g. urgent, important'}
                        />
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'หมายเหตุ' : 'Notes'}</Label>
                        <Textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder={locale === 'th' ? 'บันทึกเพิ่มเติม...' : 'Additional notes...'}
                            rows={2}
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
                            {isEdit ? (locale === 'th' ? 'บันทึก' : 'Save') : (locale === 'th' ? 'เพิ่มงาน' : 'Add Job')}
                        </Button>
                    </DialogFooter>
                </form>

                        </TabsContent>

                        <TabsContent value="comments" className="mt-0 p-0">
                            <MyCommentThread
                                itemId={editJob!.id}
                                itemType="job"
                                currentUserId={currentUserId!}
                                isAdmin={isAdmin}
                                onCommentCountChange={setCommentCount}
                            />
                        </TabsContent>
                    </Tabs>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Job Type */}
                    {jobTypes.length > 1 && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>{locale === 'th' ? 'ประเภทงาน' : 'Job Type'}</Label>
                                <Select value={jobType} onValueChange={setJobType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {jobTypes.map(jt => (
                                            <SelectItem key={jt.value} value={jt.value}>
                                                <span className="flex items-center gap-2">
                                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: jt.color || '#9ca3af' }} />
                                                    {locale === 'th' ? jt.label_th : jt.label_en}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>{locale === 'th' ? 'สถานะ' : 'Status'}</Label>
                                <Select value={status || statuses[0] || ''} onValueChange={setStatus}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {statuses.map(s => {
                                            const cfg = settings.find(st => st.category === `status_${jobType}` && st.value === s)
                                            return (
                                                <SelectItem key={s} value={s}>
                                                    <span className="flex items-center gap-2">
                                                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg?.color || '#9ca3af' }} />
                                                        {locale === 'th' ? (cfg?.label_th || s) : (cfg?.label_en || s)}
                                                    </span>
                                                </SelectItem>
                                            )
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'ชื่องาน' : 'Title'} *</Label>
                        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={locale === 'th' ? 'ชื่องาน...' : 'Job title...'} autoFocus />
                    </div>
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'รายละเอียด' : 'Description'}</Label>
                        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={locale === 'th' ? 'รายละเอียดเพิ่มเติม...' : 'Details...'} rows={3} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label>{locale === 'th' ? 'ความสำคัญ' : 'Priority'}</Label>
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
                        <div className="space-y-1.5">
                            <Label>{locale === 'th' ? 'กำหนดส่ง' : 'Due Date'}</Label>
                            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'แท็ก (คั่นด้วย ,)' : 'Tags (comma-separated)'}</Label>
                        <Input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder={locale === 'th' ? 'เช่น ด่วน, สำคัญ' : 'e.g. urgent, important'} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>{locale === 'th' ? 'หมายเหตุ' : 'Notes'}</Label>
                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={locale === 'th' ? 'บันทึกเพิ่มเติม...' : 'Additional notes...'} rows={2} />
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
                            {isEdit ? (locale === 'th' ? 'บันทึก' : 'Save') : (locale === 'th' ? 'เพิ่มงาน' : 'Add Job')}
                        </Button>
                    </DialogFooter>
                </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
