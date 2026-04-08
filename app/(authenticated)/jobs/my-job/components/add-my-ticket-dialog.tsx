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
import { Loader2, CircleHelp, Plus, X, MessageSquare } from 'lucide-react'
import { createMyTicket } from '../actions'
import type { PersonalSetting } from '../actions'
import { MyCommentThread } from './my-comment-thread'
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
        questions?: string[]
    }
    onUpdate?: (id: string, formData: FormData) => Promise<{ success?: boolean; error?: string }>
    /** When set (admin view), new tickets are created under this user */
    targetUserId?: string
    /** Current signed-in user ID — enables comment thread when editing */
    currentUserId?: string
    /** Whether the current user is an admin */
    isAdmin?: boolean
}

const PRIORITIES = [
    { value: 'urgent', labelTh: 'ด่วนที่สุด', labelEn: 'Urgent', color: '#ef4444' },
    { value: 'high',   labelTh: 'ด่วน',        labelEn: 'High',   color: '#f59e0b' },
    { value: 'medium', labelTh: 'ปกติ',         labelEn: 'Normal', color: '#3b82f6' },
    { value: 'low',    labelTh: 'ต่ำ',           labelEn: 'Low',    color: '#71717a' },
]

export function AddMyTicketDialog({
    open, onOpenChange, settings, defaultCategory, editTicket, onUpdate, targetUserId,
    currentUserId, isAdmin = false,
}: AddMyTicketDialogProps) {
    const { locale }    = useLocale()
    const [isPending, startTransition] = useTransition()

    const categories = settings.filter(s => s.category === 'ticket_category' && s.is_active)
    const statuses   = settings.filter(s => s.category === 'status_ticket' && s.is_active)

    const [subject,        setSubject]        = useState(editTicket?.subject || '')
    const [description,    setDescription]    = useState(editTicket?.description || '')
    const [category,       setCategory]       = useState(editTicket?.category || defaultCategory || categories[0]?.value || '')
    const [status,         setStatus]         = useState(editTicket?.status || statuses[0]?.value || 'open')
    const [priority,       setPriority]       = useState(editTicket?.priority || 'medium')
    const [outcome,        setOutcome]        = useState(editTicket?.outcome || '')
    const [error,          setError]          = useState('')
    const [commentCount,   setCommentCount]   = useState(0)
    // Question Mode state
    const [isQuestionMode, setIsQuestionMode] = useState(!!(editTicket?.questions?.length))
    const [questions,      setQuestions]      = useState<string[]>(
        editTicket?.questions?.length ? editTicket.questions : ['']
    )

    const reset = () => {
        setSubject(''); setDescription(''); setCategory(defaultCategory || categories[0]?.value || '')
        setStatus(statuses[0]?.value || 'open'); setPriority('medium'); setOutcome(''); setError('')
        setIsQuestionMode(false); setQuestions([''])
    }

    const toggleQuestionMode = () => {
        setIsQuestionMode(prev => {
            if (!prev) setQuestions([''])
            return !prev
        })
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
        const validQuestions = isQuestionMode ? questions.filter(q => q.trim()) : []
        fd.set('questions', JSON.stringify(validQuestions))

        startTransition(async () => {
            let result: { success?: boolean; error?: string }
            if (editTicket && onUpdate) {
                result = await onUpdate(editTicket.id, fd)
            } else {
                result = await createMyTicket(fd, targetUserId)
            }
            if (result?.error) { setError(result.error); return }
            reset()
            onOpenChange(false)
        })
    }

    const isEdit = !!editTicket
    const showComments = isEdit && !!currentUserId

    // ── Ticket form (shared between tabs and standalone) ────────────────────
    const ticketForm = (
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

            {/* Outcome + Question Mode toggle */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <Label>{locale === 'th' ? 'ผลลัพธ์ที่ต้องการ' : 'Desired Outcome'}</Label>
                    <button
                        type="button"
                        onClick={toggleQuestionMode}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                            isQuestionMode
                                ? 'shadow-sm'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                        style={isQuestionMode ? {
                            backgroundColor: '#ec489915',
                            color: '#ec4899',
                            boxShadow: 'inset 0 0 0 1.5px #ec489930',
                        } : undefined}
                    >
                        <CircleHelp className="h-3.5 w-3.5" />
                        {locale === 'th' ? 'โหมดคำถาม' : 'Question Mode'}
                    </button>
                </div>
                {!isQuestionMode && (
                    <Input
                        value={outcome}
                        onChange={e => setOutcome(e.target.value)}
                        placeholder={locale === 'th' ? 'ผลที่คาดหวัง...' : 'Expected outcome...'}
                    />
                )}
            </div>

            {/* Question Builder */}
            {isQuestionMode && (
                <div className="space-y-2 bg-pink-50/50 dark:bg-pink-950/10 border border-pink-200 dark:border-pink-800/40 rounded-xl p-3">
                    <p className="text-xs font-semibold text-pink-500">
                        {locale === 'th'
                            ? '✏️ พิมพ์คำถามที่ต้องการ (เพิ่มได้หลายข้อ)'
                            : '✏️ Type your questions (you can add multiple)'}
                    </p>
                    {questions.map((q, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-500 text-[11px] font-bold shrink-0">
                                {idx + 1}
                            </span>
                            <input
                                type="text"
                                value={q}
                                onChange={e => {
                                    const updated = [...questions]
                                    updated[idx] = e.target.value
                                    setQuestions(updated)
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        setQuestions([...questions, ''])
                                    }
                                }}
                                placeholder={locale === 'th' ? `คำถามข้อ ${idx + 1}...` : `Question ${idx + 1}...`}
                                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-pink-200 dark:border-pink-800/40 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-pink-400/50 placeholder:text-pink-300 dark:placeholder:text-pink-700"
                                autoFocus={idx === questions.length - 1 && idx > 0}
                            />
                            {questions.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                                    className="h-6 w-6 flex items-center justify-center rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => setQuestions([...questions, ''])}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-pink-500 hover:bg-pink-100 dark:hover:bg-pink-900/30 transition-colors"
                    >
                        <Plus className="h-3 w-3" />
                        {locale === 'th' ? 'เพิ่มคำถาม' : 'Add Question'}
                    </button>
                </div>
            )}

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
    )

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v) }}>
            <DialogContent className={showComments ? 'max-w-5xl max-h-[92vh] overflow-y-auto' : 'max-w-3xl max-h-[92vh] overflow-y-auto'}>
                <DialogHeader>
                    <DialogTitle>
                        {isEdit
                            ? (locale === 'th' ? 'แก้ไข Ticket' : 'Edit Ticket')
                            : (locale === 'th' ? 'เพิ่ม Ticket ใหม่' : 'New Ticket')
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

                        <TabsContent value="details" className="mt-4 max-h-[70vh] overflow-y-auto">
                            {ticketForm}
                        </TabsContent>

                        <TabsContent value="comments" className="mt-0 p-0">
                            <MyCommentThread
                                itemId={editTicket!.id}
                                itemType="ticket"
                                currentUserId={currentUserId!}
                                isAdmin={isAdmin}
                                onCommentCountChange={setCommentCount}
                            />
                        </TabsContent>
                    </Tabs>
                ) : (
                    ticketForm
                )}
            </DialogContent>
        </Dialog>
    )
}
