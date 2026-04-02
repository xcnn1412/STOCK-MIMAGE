'use client'

import { useState, useTransition, useRef } from 'react'
import { Quote, MessageCircle, Send, ClipboardCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import RichTextEditor, { type RichTextEditorRef } from '@/components/rich-text-editor'
import FileUploadZone from '@/components/file-upload-zone'
import ImageLightbox from '@/components/image-lightbox'
import { prepareContentForRender, htmlToPlainText } from '@/lib/rich-text-utils'
import { createEvaluationReply } from '../actions'
import type { KpiEvaluationReply, Profile, KpiEvaluation, KpiAssignment } from '@/types/database.types'
import { useLocale } from '@/lib/i18n/context'

type EvalWithRelations = KpiEvaluation & {
  kpi_assignments: (KpiAssignment & {
    profiles: Pick<Profile, 'id' | 'full_name' | 'department'> | null
  }) | (KpiAssignment & {
    profiles: Pick<Profile, 'id' | 'full_name' | 'department'> | null
  })[] | null
  evaluator?: Pick<Profile, 'id' | 'full_name'> | null
}

interface CustomEmoji {
  shortcode: string
  image_url: string
}

interface FeedbackTimelineProps {
  evaluations: EvalWithRelations[]
  replies: KpiEvaluationReply[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'department'>[]
  customEmojis: CustomEmoji[]
  currentUserId: string
  isAdmin: boolean
}

const getEmoji = (pct: number) =>
  pct >= 120 ? '🔥🎉' : pct >= 100 ? '😍' : pct >= 90 ? '😊' : pct >= 70 ? '🙂' : pct >= 50 ? '😰' : pct >= 30 ? '😱' : '💀'

// --- Helpers ---
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp']
function isImageUrl(url: string) {
  const ext = (url.split('.').pop() || '').toLowerCase().split('?')[0]
  return IMAGE_EXTENSIONS.includes(ext)
}

function AttachmentGrid({ attachments, onImageClick }: { attachments: string[], onImageClick: (images: string[], index: number) => void }) {
  if (!attachments || attachments.length === 0) return null
  const images = attachments.filter(isImageUrl)
  
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {images.map((url, i) => (
        <button
          key={url}
          onClick={() => onImageClick(images, i)}
          className="relative h-16 w-16 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 hover:ring-2 hover:ring-violet-400 transition-all cursor-pointer"
        >
          <img src={url} alt="" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  )
}

export default function FeedbackTimeline({ evaluations, replies, profiles, customEmojis, currentUserId, isAdmin }: FeedbackTimelineProps) {
  const { t, locale } = useLocale()
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [replyAttachments, setReplyAttachments] = useState<string[]>([])
  const [mentionedUsers, setMentionedUsers] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const editorRef = useRef<RichTextEditorRef>(null)
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [expandedEvals, setExpandedEvals] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpandedEvals(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Filter only evaluations that have comments OR have replies
  const evaluationsWithDiscussions = evaluations.filter(ev => 
    (ev.comment && ev.comment.trim()) || 
    replies.some(r => r.evaluation_id === ev.id)
  ).sort((a, b) => (b.evaluation_date || '').localeCompare(a.evaluation_date || ''))

  if (evaluationsWithDiscussions.length === 0) return null

  const getUserName = (userId: string | null) => {
    if (!userId) return locale === 'th' ? 'ไม่ทราบ' : 'Unknown'
    const user = profiles.find(u => u.id === userId)
    return user?.full_name || userId.slice(0, 8)
  }

  const handleSendReply = (evaluationId: string) => {
    if (!replyContent.trim() && replyAttachments.length === 0) return
    
    const formData = new FormData()
    formData.set('content', replyContent.trim())
    formData.set('attachments', JSON.stringify(replyAttachments))
    if (mentionedUsers.length > 0) {
      formData.set('notify_users', mentionedUsers.join(','))
    }

    startTransition(async () => {
      await createEvaluationReply(evaluationId, formData)
      setReplyContent('')
      setReplyAttachments([])
      setMentionedUsers([])
      setActiveReplyId(null)
      editorRef.current?.clearContent()
    })
  }

  return (
    <Card className="mt-6">
      {lightboxImages && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages(null)}
        />
      )}
      
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Quote className="h-4 w-4 text-violet-500" />
          {locale === 'th' ? 'ความคิดเห็นและการโต้ตอบ' : 'Feedback & Discussions'}
          <Badge variant="secondary" className="text-[10px] ml-1">{evaluationsWithDiscussions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {evaluationsWithDiscussions.map((ev) => {
            const assignment = Array.isArray(ev.kpi_assignments) ? ev.kpi_assignments[0] : ev.kpi_assignments
            const evaluatorName = ev.evaluator?.full_name || 'ผู้ประเมิน'
            const templates = assignment?.kpi_templates
            const template = Array.isArray(templates) ? templates[0] : templates
            const kpiName = template?.name || assignment?.custom_name || 'KPI'
            const initial = evaluatorName[0] || 'ผ'
            const isSelf = ev.evaluated_by === assignment?.profiles?.id
            const achPct = ev.achievement_pct ?? 0
            
            const evReplies = replies.filter(r => r.evaluation_id === ev.id)
            const canReply = isAdmin || currentUserId === assignment?.assigned_to || currentUserId === ev.evaluated_by

            return (
              <div key={ev.id} className="flex gap-3 group border-b border-zinc-100 dark:border-zinc-800/50 pb-6 last:border-0 last:pb-0">
                {/* Avatar for the main evaluation comment */}
                <div className={`
                  h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5
                  ${isSelf
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 ring-2 ring-indigo-200 dark:ring-indigo-800'
                    : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 ring-2 ring-violet-200 dark:ring-violet-800'
                  }
                `}>
                  {initial}
                </div>
                
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Evaluation Header */}
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold text-foreground">
                      {evaluatorName}
                    </span>
                    {isSelf && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-indigo-300 text-indigo-600 dark:border-indigo-700 dark:text-indigo-400">
                        {locale === 'th' ? 'ประเมินตัวเอง' : 'Self Eval'}
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {ev.evaluation_date}
                    </span>
                  </div>
                  
                  {/* Evaluation Comment Bubble */}
                  {ev.comment && ev.comment.trim() && (
                    <div className={`
                      relative rounded-2xl rounded-tl-sm px-4 py-3
                      ${isSelf
                        ? 'bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30'
                        : 'bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/30'
                      }
                    `}>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {ev.comment}
                      </p>
                    </div>
                  )}
                  
                  {/* KPI Context Footer */}
                  <div className="flex items-center flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <ClipboardCheck className="h-2.5 w-2.5" />
                      {kpiName}
                    </Badge>
                    {ev.period_label && (
                      <Badge variant="secondary" className="text-[10px]">
                        {ev.period_label}
                      </Badge>
                    )}
                    <Badge
                      variant={achPct >= 100 ? 'default' : 'secondary'}
                      className={`text-[10px] ${achPct >= 100 ? 'bg-green-600' : achPct >= 70 ? 'bg-orange-500 text-white border-0' : ''}`}
                    >
                      {getEmoji(achPct)} {achPct}%
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      → {assignment?.profiles?.full_name || '-'}
                    </span>
                  </div>
                  
                  {/* Replies Thread */}
                  {evReplies.length > 0 && (() => {
                    const isExpanded = expandedEvals.has(ev.id)
                    const visibleReplies = isExpanded ? evReplies : evReplies.slice(-2)
                    
                    return (
                      <div className="mt-4 pl-4 space-y-3 border-l-2 border-zinc-100 dark:border-zinc-800">
                        {!isExpanded && evReplies.length > 2 && (
                          <button 
                            onClick={() => toggleExpand(ev.id)}
                            className="flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-md text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
                          >
                            <MessageCircle className="h-3 w-3" />
                            {locale === 'th' 
                              ? `ดูการโต้ตอบก่อนหน้าอีก ${evReplies.length - 2} รายการ`
                              : `View ${evReplies.length - 2} previous replies`
                            }
                          </button>
                        )}
                        
                        {isExpanded && evReplies.length > 2 && (
                          <button 
                            onClick={() => toggleExpand(ev.id)}
                            className="flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-md text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors bg-zinc-50 dark:bg-zinc-800/50"
                          >
                            {locale === 'th' ? `ซ่อนการโต้ตอบ` : `Hide previous replies`}
                          </button>
                        )}

                        {visibleReplies.map(reply => {
                        const rName = getUserName(reply.created_by)
                        const rInitial = rName[0] || '?'
                        const isMyReply = reply.created_by === currentUserId
                        
                        return (
                          <div key={reply.id} className="flex gap-2">
                            <div className="h-6 w-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-500 shrink-0">
                              {rInitial}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                  {rName}
                                </span>
                                <span className="text-[10px] text-zinc-400">
                                  {new Date(reply.created_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', {
                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                  })}
                                </span>
                              </div>
                              <div className={`
                                inline-block px-3 py-2 rounded-2xl rounded-tl-sm text-sm
                                ${isMyReply 
                                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100' 
                                  : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm'}
                              `}>
                                {reply.content && (
                                  <div 
                                    className="rte-content text-sm"
                                    dangerouslySetInnerHTML={{ __html: prepareContentForRender(reply.content) }}
                                  />
                                )}
                                <AttachmentGrid 
                                  attachments={reply.attachments} 
                                  onImageClick={(imgs, idx) => { setLightboxImages(imgs); setLightboxIndex(idx) }} 
                                />
                              </div>
                            </div>
                          </div>
                        )
                        })}
                      </div>
                    )
                  })()}

                  {/* Reply Button & Composer */}
                  {canReply && (
                    <div className="pt-2">
                      {activeReplyId === ev.id ? (
                        <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800">
                          <div className="relative">
                            <RichTextEditor
                              ref={editorRef}
                              value={replyContent}
                              onChange={setReplyContent}
                              users={profiles as any}
                              placeholder={locale === 'th' ? 'พิมพ์ตอบกลับ... (พิมพ์ @ เพื่อแท็ก)' : 'Type your reply... (type @ to mention)'}
                              minHeight="80px"
                              compact
                              onMentionedUsersChange={setMentionedUsers}
                              customEmojis={customEmojis as any}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault()
                                  handleSendReply(ev.id)
                                }
                              }}
                            />
                            <div className="absolute bottom-2 right-2 flex gap-1 z-10">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setActiveReplyId(null)}
                                className="h-8 w-8 text-zinc-400 hover:text-red-500"
                              >
                                ✕
                              </Button>
                              <Button
                                onClick={() => handleSendReply(ev.id)}
                                disabled={isPending || (!htmlToPlainText(replyContent).trim() && replyAttachments.length === 0)}
                                size="icon"
                                className="bg-violet-600 hover:bg-violet-700 text-white h-8 w-8 rounded-lg shadow-md"
                              >
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2">
                            <FileUploadZone
                              uploadedUrls={replyAttachments}
                              onUrlsChange={setReplyAttachments}
                              folder={`kpi_evaluations/${ev.id}`}
                              compact
                            />
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setActiveReplyId(ev.id)
                            setReplyContent('')
                            setReplyAttachments([])
                          }}
                          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-violet-600 dark:text-zinc-400 dark:hover:text-violet-400 transition-colors"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {locale === 'th' ? 'ตอบกลับ' : 'Reply'}
                        </button>
                      )}
                    </div>
                  )}
                  
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
