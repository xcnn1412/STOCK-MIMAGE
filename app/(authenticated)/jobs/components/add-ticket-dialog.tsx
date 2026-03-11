'use client'

import { useState, useTransition } from 'react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Paperclip, X, Flag, Target, CircleHelp, Plus } from 'lucide-react'
import { createTicket, createTicketReply } from '../actions'
import type { JobSetting } from '../actions'
import { useLocale } from '@/lib/i18n/context'
import FileUploadZone from '@/components/file-upload-zone'
import RichTextEditor from '@/components/rich-text-editor'

// ============================================================================
// Add Ticket Dialog
// ============================================================================

interface AddTicketDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    settings: JobSetting[]
    defaultCategory?: string
    users?: { id: string; full_name: string | null; department?: string | null; nickname?: string | null }[]
}

const PRIORITIES = [
    { value: 'urgent', labelTh: 'ด่วนที่สุด', labelEn: 'Urgent', color: '#ef4444' },
    { value: 'high', labelTh: 'ด่วน', labelEn: 'High', color: '#f59e0b' },
    { value: 'normal', labelTh: 'ปกติ', labelEn: 'Normal', color: '#3b82f6' },
]

export function AddTicketDialog({ open, onOpenChange, settings, defaultCategory, users = [] }: AddTicketDialogProps) {
    const { locale } = useLocale()
    const [isPending, startTransition] = useTransition()

    const [subject, setSubject] = useState('')
    const [category, setCategory] = useState(defaultCategory || '')
    const [description, setDescription] = useState('')
    const [priority, setPriority] = useState('normal')
    const [desiredOutcome, setDesiredOutcome] = useState('')
    const [attachments, setAttachments] = useState<string[]>([])
    const [mentionedUsers, setMentionedUsers] = useState<string[]>([])
    const [questions, setQuestions] = useState<string[]>([''])
    const [isQuestionMode, setIsQuestionMode] = useState(false)

    const categories = settings.filter(s => s.category === 'ticket_category' && s.is_active)
    const outcomes = settings.filter(s => s.category === 'ticket_outcome' && s.is_active)

    const resetForm = () => {
        setSubject('')
        setCategory(defaultCategory || '')
        setDescription('')
        setPriority('normal')
        setDesiredOutcome('')
        setAttachments([])
        setMentionedUsers([])
        setQuestions([''])
        setIsQuestionMode(false)
    }

    const handleSubmit = () => {
        if (!subject.trim() || !category) return

        const formData = new FormData()
        formData.set('subject', subject.trim())
        formData.set('category', category)
        formData.set('description', description.trim())
        formData.set('priority', priority)
        formData.set('desired_outcome', desiredOutcome)
        formData.set('attachments', JSON.stringify(attachments))
        if (mentionedUsers.length > 0) {
            formData.set('notify_users', mentionedUsers.join(','))
        }

        startTransition(async () => {
            const result = await createTicket(formData)
            if (result.success && result.id) {
                // If question mode is active, create question reply
                if (isQuestionMode) {
                    const validQuestions = questions.filter(q => q.trim())
                    if (validQuestions.length > 0) {
                        const replyData = new FormData()
                        replyData.set('reply_type', 'question')
                        replyData.set('content', JSON.stringify(validQuestions))
                        replyData.set('attachments', '[]')
                        await createTicketReply(result.id, replyData)
                    }
                }
                resetForm()
                onOpenChange(false)
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {locale === 'th' ? '🎫 เปิด Ticket ใหม่' : '🎫 New Ticket'}
                    </DialogTitle>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {locale === 'th' ? 'กรอกข้อมูลเพื่อเปิดคำถามหรือคำร้อง' : 'Fill in details to open a question or request'}
                    </p>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Subject */}
                    <div>
                        <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                            {locale === 'th' ? 'หัวข้อ' : 'Subject'} <span className="text-red-500">*</span>
                        </label>
                        <Input
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            placeholder={locale === 'th' ? 'เช่น ขออนุมัติจัดซื้ออุปกรณ์ไลฟ์สดเพิ่มเติม' : 'e.g. Request approval for additional live equipment'}
                            className="h-10"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                            {locale === 'th' ? 'ประเภทของเรื่อง' : 'Category'} <span className="text-red-500">*</span>
                        </label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="h-10">
                                <SelectValue placeholder={locale === 'th' ? 'เลือกประเภท...' : 'Select category...'} />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map(c => (
                                    <SelectItem key={c.value} value={c.value}>
                                        <span className="flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color || '#6b7280' }} />
                                            {locale === 'th' ? c.label_th : c.label_en}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Description — Rich Text Editor with @mention */}
                    <div>
                        <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                            {locale === 'th' ? 'รายละเอียด' : 'Description'}
                        </label>
                        <RichTextEditor
                            value={description}
                            onChange={setDescription}
                            users={users}
                            placeholder={locale === 'th' ? 'อธิบายที่มาที่ไปและเหตุผล... (พิมพ์ @ เพื่อแท็ก)' : 'Explain the context and reasoning... (type @ to mention)'}
                            minHeight="80px"
                            onMentionedUsersChange={setMentionedUsers}
                        />
                    </div>

                    {/* Priority */}
                    <div>
                        <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                            {locale === 'th' ? 'ความสำคัญ' : 'Priority'}
                        </label>
                        <div className="flex gap-2">
                            {PRIORITIES.map(p => (
                                <button
                                    key={p.value}
                                    onClick={() => setPriority(p.value)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center
                                        ${priority === p.value
                                            ? 'ring-2 shadow-sm'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                        }
                                    `}
                                    style={priority === p.value ? {
                                        backgroundColor: `${p.color}12`,
                                        color: p.color,
                                        boxShadow: `0 0 0 2px ${p.color}40`,
                                    } : undefined}
                                >
                                    <Flag className="h-3.5 w-3.5" />
                                    {locale === 'th' ? p.labelTh : p.labelEn}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Desired Outcome */}
                    <div>
                        <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                            {locale === 'th' ? 'สิ่งที่ต้องการ' : 'Desired Outcome'}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {outcomes.map(o => (
                                <button
                                    key={o.value}
                                    onClick={() => {
                                        setDesiredOutcome(desiredOutcome === o.value ? '' : o.value)
                                        setIsQuestionMode(false)
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all
                                        ${desiredOutcome === o.value && !isQuestionMode
                                            ? 'shadow-sm'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                        }
                                    `}
                                    style={desiredOutcome === o.value && !isQuestionMode ? {
                                        backgroundColor: `${o.color || '#6b7280'}15`,
                                        color: o.color || '#6b7280',
                                        boxShadow: `inset 0 0 0 1.5px ${o.color || '#6b7280'}30`,
                                    } : undefined}
                                >
                                    <Target className="h-3 w-3" />
                                    {locale === 'th' ? o.label_th : o.label_en}
                                </button>
                            ))}
                            {/* Question Mode Button */}
                            <button
                                onClick={() => {
                                    setIsQuestionMode(!isQuestionMode)
                                    if (!isQuestionMode) setDesiredOutcome('')
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all
                                    ${isQuestionMode
                                        ? 'shadow-sm'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    }
                                `}
                                style={isQuestionMode ? {
                                    backgroundColor: '#ec489915',
                                    color: '#ec4899',
                                    boxShadow: 'inset 0 0 0 1.5px #ec489930',
                                } : undefined}
                            >
                                <CircleHelp className="h-3 w-3" />
                                {locale === 'th' ? 'คำถาม' : 'Question'}
                            </button>
                        </div>
                    </div>

                    {/* Question Builder — shown when question mode is active */}
                    {isQuestionMode && (
                        <div className="space-y-2 bg-pink-50/50 dark:bg-pink-950/10 border border-pink-200 dark:border-pink-800/40 rounded-xl p-3">
                            <p className="text-xs font-semibold text-pink-500">
                                {locale === 'th' ? '✏️ พิมพ์คำถามที่ต้องการถาม (เพิ่มได้หลายข้อ)' : '✏️ Type your questions (you can add multiple)'}
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
                                        autoFocus={idx === questions.length - 1}
                                    />
                                    {questions.length > 1 && (
                                        <button
                                            onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                                            className="h-6 w-6 flex items-center justify-center rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                onClick={() => setQuestions([...questions, ''])}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-pink-500 hover:bg-pink-100 dark:hover:bg-pink-900/30 transition-colors"
                            >
                                <Plus className="h-3 w-3" />
                                {locale === 'th' ? 'เพิ่มคำถาม' : 'Add Question'}
                            </button>
                        </div>
                    )}

                    {/* File Attachments */}
                    <div>
                        <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                            {locale === 'th' ? 'ไฟล์แนบ' : 'Attachments'}
                        </label>
                        <FileUploadZone
                            uploadedUrls={attachments}
                            onUrlsChange={setAttachments}
                            folder="tickets"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending || !subject.trim() || !category}
                        className="bg-violet-600 hover:bg-violet-700 text-white"
                    >
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {locale === 'th' ? 'เปิด Ticket' : 'Open Ticket'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
