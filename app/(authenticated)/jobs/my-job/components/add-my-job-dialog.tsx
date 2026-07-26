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
import { Loader2, MessageSquare, ListChecks, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { createMyJob, updateMyJobChecklist } from '../actions'
import type { ChecklistItem, PersonalSetting } from '../actions'
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
        checklist?: ChecklistItem[]
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

    // ---- Checklist (edit mode only) ----
    const [checklist,      setChecklist]      = useState<ChecklistItem[]>(editJob?.checklist || [])
    const [checklistInput, setChecklistInput] = useState('')

    // sync local checklist when the dialog opens or the job changes
    // (adjust-state-during-render pattern — ไม่ใช้ useEffect)
    const checklistKey = `${editJob?.id ?? ''}:${open}`
    const [lastChecklistKey, setLastChecklistKey] = useState(checklistKey)
    if (lastChecklistKey !== checklistKey) {
        setLastChecklistKey(checklistKey)
        setChecklist(editJob?.checklist || [])
        setChecklistInput('')
    }

    const persistChecklist = (next: ChecklistItem[]) => {
        setChecklist(next)
        if (!editJob) return
        startTransition(async () => {
            const res = await updateMyJobChecklist(editJob.id, next, targetUserId)
            if (res?.error) {
                toast.error(res.error)
            }
        })
    }

    const addChecklistItem = () => {
        const text = checklistInput.trim()
        if (!text) return
        persistChecklist([...checklist, { id: crypto.randomUUID(), text, done: false }])
        setChecklistInput('')
    }

    const toggleChecklistItem = (id: string) =>
        persistChecklist(checklist.map(it => (it.id === id ? { ...it, done: !it.done } : it)))

    const deleteChecklistItem = (id: string) =>
        persistChecklist(checklist.filter(it => it.id !== id))

    const doneCount = checklist.filter(it => it.done).length

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
                            <TabsTrigger value="checklist" className="flex-1 gap-1.5">
                                <ListChecks className="h-3.5 w-3.5" />
                                {locale === 'th' ? 'เช็กลิสต์' : 'Checklist'}
                                {checklist.length > 0 && (
                                    <span className="inline-flex items-center justify-center h-4 px-1.5 rounded-full bg-violet-500 text-white text-[10px] font-bold">
                                        {doneCount}/{checklist.length}
                                    </span>
                                )}
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

                        <TabsContent value="checklist" className="mt-4">
                            <div className="space-y-3">
                                {/* Progress */}
                                <div className="space-y-1.5">
                                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                        {locale === 'th' ? 'เสร็จแล้ว' : 'Done'} {doneCount}/{checklist.length}
                                    </p>
                                    <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-violet-500 transition-all duration-300"
                                            style={{ width: `${checklist.length ? (doneCount / checklist.length) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Items */}
                                {checklist.length === 0 ? (
                                    <p className="text-sm text-zinc-400 py-6 text-center">
                                        {locale === 'th' ? 'ยังไม่มีรายการย่อย — เพิ่มด้านล่างได้เลย' : 'No items yet — add one below'}
                                    </p>
                                ) : (
                                    <ul className="space-y-1">
                                        {checklist.map(item => (
                                            <li
                                                key={item.id}
                                                className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={item.done}
                                                    onChange={() => toggleChecklistItem(item.id)}
                                                    className="h-4 w-4 shrink-0 cursor-pointer accent-violet-600"
                                                />
                                                <span
                                                    className={`flex-1 min-w-0 text-sm break-words ${
                                                        item.done
                                                            ? 'line-through text-zinc-400 dark:text-zinc-500'
                                                            : 'text-zinc-800 dark:text-zinc-200'
                                                    }`}
                                                >
                                                    {item.text}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteChecklistItem(item.id)}
                                                    title={locale === 'th' ? 'ลบ' : 'Delete'}
                                                    className="p-1 rounded shrink-0 text-zinc-300 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {/* Add row */}
                                <div className="flex items-center gap-2 pt-1">
                                    <Input
                                        value={checklistInput}
                                        onChange={e => setChecklistInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() }
                                        }}
                                        placeholder={locale === 'th' ? 'เพิ่มรายการย่อย...' : 'Add an item...'}
                                    />
                                    <Button
                                        type="button"
                                        onClick={addChecklistItem}
                                        disabled={!checklistInput.trim()}
                                        className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                                    >
                                        <Plus className="h-4 w-4" />
                                        {locale === 'th' ? 'เพิ่ม' : 'Add'}
                                    </Button>
                                </div>
                            </div>
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
