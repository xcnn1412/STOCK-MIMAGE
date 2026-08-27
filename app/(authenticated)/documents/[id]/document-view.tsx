'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowLeft, Ban, Check, CheckCircle2, Copy, Edit3,
  FileDown, History, Loader2, Send, Trash2, Undo2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  DOC_TYPES, EDITABLE_STATUSES, PARTY_LABEL, STATUS_LABEL, TRANSITIONS, isHtmlEmpty, sanitizeHtml,
  type DocAction, type DocBrandRow, type DocStatus, type DocumentItemRow,
  type DocumentLogRow, type DocumentRow,
} from '../doc-types'
import {
  deleteDraft, duplicateDocument, saveDraft, transitionDocument,
  type RefCandidate, type ReferencedByRow, type SaveDraftPayload,
} from '../actions'
import DocumentForm, { docToPayload, fmtMoney, validateDocumentClient } from '../components/document-form'

interface Props {
  doc: DocumentRow
  items: DocumentItemRow[]
  logs: DocumentLogRow[]
  brand: DocBrandRow | null
  refDocument: { id: string; doc_no: string | null; doc_type: string } | null
  referencedBy: ReferencedByRow[]
  refCandidates: RefCandidate[]
  role: string
  userId: string
}

const LOG_LABEL: Record<string, string> = {
  create: 'สร้าง',
  submit: 'ส่งขออนุมัติ',
  approve: 'อนุมัติ',
  reject: 'ตีกลับ',
  issue: 'ออกเลข',
  void: 'ยกเลิก',
  mark_sent: 'ส่งให้ลูกค้าแล้ว',
  close: 'ปิดงาน',
}

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
const fmtDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

/** ปุ่มไหนโผล่ — คุมด้วย TRANSITIONS + role/owner เท่านั้น (server ปฏิเสธซ้ำอีกชั้น) */
function allowed(action: DocAction, status: DocStatus, requiresApproval: boolean, isAdmin: boolean, isOwner: boolean) {
  const t = TRANSITIONS[action]
  if (!t.from.includes(status)) return false
  if (t.adminOnly && !isAdmin) return false
  if (!isAdmin && !isOwner && (action === 'submit' || action === 'mark_sent' || action === 'close')) return false
  if (action === 'submit' && !requiresApproval) return false
  if (action === 'issue' && requiresApproval) return false
  if (action === 'approve' && !requiresApproval) return false
  return true
}

type DialogKind = DocAction | 'delete' | null

const DIALOG_CFG: Record<Exclude<DialogKind, null>, {
  title: string
  description: string
  confirm: string
  reason?: 'required' | 'optional'
  destructive?: boolean
}> = {
  submit:    { title: 'ส่งขออนุมัติ', description: 'เอกสารจะถูกล็อกไม่ให้แก้ไขจนกว่า admin จะอนุมัติหรือตีกลับ', confirm: 'ส่งขออนุมัติ' },
  issue:     { title: 'ออกเอกสาร', description: 'ระบบจะออกเลขที่จริงทันทีและเอกสารจะแก้ไขไม่ได้อีก', confirm: 'ออกเอกสาร' },
  approve:   { title: 'อนุมัติเอกสาร', description: 'ระบบจะออกเลขที่จริงทันที', confirm: 'อนุมัติ', reason: 'optional' },
  reject:    { title: 'ตีกลับเอกสาร', description: 'เอกสารจะกลับไปเป็นร่างพร้อมแสดงเหตุผลให้ผู้สร้าง', confirm: 'ตีกลับ', reason: 'required', destructive: true },
  void:      { title: 'ยกเลิกเอกสาร (VOID)', description: 'เลขที่นี้จะถูกใช้ไปตลอดและนำกลับมาใช้ใหม่ไม่ได้', confirm: 'ยกเลิกเอกสาร', reason: 'required', destructive: true },
  mark_sent: { title: 'ส่งให้ลูกค้าแล้ว', description: 'บันทึกว่าได้ส่งเอกสารให้ลูกค้าแล้ว', confirm: 'ยืนยัน' },
  close:     { title: 'ปิดงาน', description: 'บันทึกว่างานนี้จบแล้ว', confirm: 'ปิดงาน' },
  delete:    { title: 'ลบร่าง', description: 'ร่างนี้จะถูกลบถาวร (ยังไม่มีเลขที่จริง จึงไม่กระทบการตรวจสอบ)', confirm: 'ลบร่าง', destructive: true },
}

export default function DocumentDetailView({
  doc, items, logs, brand, refDocument, referencedBy, refCandidates, role, userId,
}: Props) {
  const router = useRouter()
  const def = DOC_TYPES[doc.doc_type]
  const isAdmin = role === 'admin'
  const isOwner = doc.created_by === userId
  const canEdit = EDITABLE_STATUSES.includes(doc.status) && (isAdmin || isOwner)
  const canDelete = canEdit && !doc.doc_no
  const status = STATUS_LABEL[doc.status]
  const selfApproved = logs.some(l => l.self_approved)

  const [editing, setEditing] = useState(false)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const payloadRef = useRef<SaveDraftPayload>(docToPayload(doc, items))
  const cfg = dialog ? DIALOG_CFG[dialog] : null
  const reasonBlocked = cfg?.reason === 'required' && reason.trim() === ''

  const openDialog = (kind: Exclude<DialogKind, null>) => {
    // ตรวจฝั่ง client ก่อนเปิด dialog สำหรับ transition ที่ต้องข้อมูลครบ
    if (kind === 'submit' || kind === 'issue') {
      const found = validateDocumentClient(doc.doc_type, payloadRef.current)
      if (Object.keys(found).length > 0) {
        setErrors(found)
        setEditing(true)
        toast.error(Object.values(found)[0])
        return
      }
      setErrors({})
    }
    setReason('')
    setDialog(kind)
  }

  const runDialog = () => {
    if (!dialog) return
    const kind = dialog
    startTransition(async () => {
      if (kind === 'delete') {
        const res = await deleteDraft(doc.id)
        if (res?.error) { toast.error(res.error); return }
        toast.success('ลบร่างแล้ว')
        setDialog(null)
        router.push('/documents')
        return
      }

      // เซฟฟอร์มก่อน เพื่อไม่ให้แก้ที่ยังไม่บันทึกหาย
      if ((kind === 'submit' || kind === 'issue') && canEdit) {
        const saved = await saveDraft(doc.id, payloadRef.current)
        if (saved?.error) { toast.error(saved.error); return }
      }

      const res = await transitionDocument(doc.id, kind, reason.trim() || undefined)
      if (res?.error) { toast.error(res.error); return }
      toast.success(res?.doc_no ? `ออกเลขที่ ${res.doc_no} แล้ว` : 'บันทึกเรียบร้อย')
      setDialog(null)
      setEditing(false)
      router.refresh()
    })
  }

  const handleDuplicate = () => {
    startTransition(async () => {
      const res = await duplicateDocument(doc.id)
      if ('error' in res && res.error) { toast.error(res.error); return }
      if ('id' in res && res.id) router.push(`/documents/${res.id}`)
    })
  }

  const show = (a: DocAction) => allowed(a, doc.status, def.requiresApproval, isAdmin, isOwner)

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/documents"><ArrowLeft className="size-4" />กลับ</Link>
        </Button>
      </div>

      {/* ── หัวเอกสาร ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl font-semibold">{doc.doc_no || doc.draft_no}</span>
                {!doc.doc_no && (
                  <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">ร่าง</span>
                )}
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', status?.color)}>
                  {status?.th || doc.status}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {def.label.th} · {brand?.name_th || doc.brand_code}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-0.5">
              <div>สร้างโดย {doc.creator?.full_name || '-'} · {fmtDate(doc.created_at)}</div>
              {doc.issued_at && (
                <div>
                  อนุมัติโดย {logs.find(l => l.action === 'approve')?.changer?.full_name || '-'} · {fmtDate(doc.approved_at || doc.issued_at)}
                </div>
              )}
            </div>
          </div>

          {selfApproved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <AlertTriangle className="size-3" />
              อนุมัติด้วยตนเอง
            </span>
          )}

          {doc.status === 'rejected' && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="font-medium">เอกสารถูกตีกลับ</div>
              <div className="mt-0.5 whitespace-pre-wrap">{doc.rejected_reason || '(ไม่ได้ระบุเหตุผล)'}</div>
            </div>
          )}

          {doc.status === 'void' && (
            <div className="rounded-md border bg-muted p-3 text-sm">
              <div className="font-medium">เอกสารถูกยกเลิก</div>
              <div className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{doc.void_reason || '(ไม่ได้ระบุเหตุผล)'}</div>
            </div>
          )}

          {/* ── แถบปุ่ม ──────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {canEdit && (
              <Button variant={editing ? 'secondary' : 'outline'} size="sm" onClick={() => setEditing(e => !e)}>
                {editing ? <X className="size-4" /> : <Edit3 className="size-4" />}
                {editing ? 'ปิดโหมดแก้ไข' : 'แก้ไข'}
              </Button>
            )}
            {show('submit') && (
              <Button size="sm" onClick={() => openDialog('submit')}>
                <Send className="size-4" />ส่งขออนุมัติ
              </Button>
            )}
            {show('issue') && (
              <Button size="sm" onClick={() => openDialog('issue')}>
                <CheckCircle2 className="size-4" />ออกเอกสาร
              </Button>
            )}
            {show('approve') && (
              <Button size="sm" onClick={() => openDialog('approve')}>
                <Check className="size-4" />อนุมัติ
              </Button>
            )}
            {show('reject') && (
              <Button size="sm" variant="outline" onClick={() => openDialog('reject')}>
                <Undo2 className="size-4" />ตีกลับ
              </Button>
            )}
            {show('mark_sent') && (
              <Button size="sm" variant="outline" onClick={() => openDialog('mark_sent')}>
                <Send className="size-4" />ส่งให้ลูกค้าแล้ว
              </Button>
            )}
            {show('close') && (
              <Button size="sm" variant="outline" onClick={() => openDialog('close')}>
                <CheckCircle2 className="size-4" />ปิดงาน
              </Button>
            )}
            {show('void') && (
              <Button size="sm" variant="destructive" onClick={() => openDialog('void')}>
                <Ban className="size-4" />ยกเลิก (VOID)
              </Button>
            )}
            {canDelete && (
              <Button size="sm" variant="destructive" onClick={() => openDialog('delete')}>
                <Trash2 className="size-4" />ลบร่าง
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleDuplicate} disabled={pending}>
              <Copy className="size-4" />คัดลอกเป็นร่างใหม่
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/pdf/document/${doc.id}`} target="_blank" rel="noreferrer">
                <FileDown className="size-4" />เปิด PDF
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── เนื้อหา ─────────────────────────────────────────────────────── */}
      {editing && canEdit ? (
        <DocumentForm
          doc={doc}
          items={items}
          refCandidates={refCandidates}
          errors={errors}
          onPayloadChange={p => { payloadRef.current = p }}
          onSaved={() => router.refresh()}
        />
      ) : (
        <ReadOnlyBody doc={doc} items={items} refDocument={refDocument} />
      )}

      {/* ── เอกสารที่เกี่ยวข้อง ──────────────────────────────────────────── */}
      {(refDocument || referencedBy.length > 0) && (
        <Card>
          <CardHeader><CardTitle className="text-base">เอกสารที่เกี่ยวข้อง</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {refDocument && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">อ้างอิงถึง</span>
                <Link href={`/documents/${refDocument.id}`} className="font-mono hover:underline">
                  {refDocument.doc_no || refDocument.id.slice(0, 8)}
                </Link>
                <span className="text-muted-foreground">
                  ({DOC_TYPES[refDocument.doc_type as keyof typeof DOC_TYPES]?.label.th || refDocument.doc_type})
                </span>
              </div>
            )}
            {referencedBy.map(r => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="text-muted-foreground">ถูกอ้างอิงโดย</span>
                <Link href={`/documents/${r.id}`} className="font-mono hover:underline">
                  {r.doc_no || r.id.slice(0, 8)}
                </Link>
                <span className="text-muted-foreground">
                  ({DOC_TYPES[r.doc_type as keyof typeof DOC_TYPES]?.label.th || r.doc_type})
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px]', STATUS_LABEL[r.status as DocStatus]?.color)}>
                  {STATUS_LABEL[r.status as DocStatus]?.th || r.status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── ประวัติ ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />ประวัติ
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีประวัติ</p>
          ) : (
            <ol className="space-y-3">
              {logs.map(l => (
                <li key={l.id} className="flex gap-3 text-sm">
                  <div className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{LOG_LABEL[l.action] || l.action}</span>
                      <span className="text-muted-foreground">{l.changer?.full_name || '-'}</span>
                      <span className="text-xs text-muted-foreground">{fmtDateTime(l.created_at)}</span>
                      {l.self_approved && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          อนุมัติด้วยตนเอง
                        </span>
                      )}
                    </div>
                    {l.note && <div className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{l.note}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog ยืนยัน ───────────────────────────────────────────────── */}
      <Dialog open={dialog !== null} onOpenChange={o => { if (!o) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cfg?.title}</DialogTitle>
            <DialogDescription>{cfg?.description}</DialogDescription>
          </DialogHeader>

          {dialog === 'approve' && isOwner && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              คุณกำลังอนุมัติเอกสารของตัวเอง — จะถูกบันทึกเป็นข้อยกเว้น
            </p>
          )}

          {cfg?.reason && (
            <div className="space-y-1.5">
              <Label htmlFor="dlg-reason">
                {cfg.reason === 'required' ? 'เหตุผล' : 'ความเห็น (ไม่บังคับ)'}
                {cfg.reason === 'required' && <span className="text-destructive"> *</span>}
              </Label>
              <Textarea id="dlg-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>ยกเลิก</Button>
            <Button
              variant={cfg?.destructive ? 'destructive' : 'default'}
              onClick={runDialog}
              disabled={pending || reasonBlocked}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {cfg?.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── มุมมองอ่านอย่างเดียว ─────────────────────────────────────────────────────

function ReadOnlyBody({
  doc, items, refDocument,
}: {
  doc: DocumentRow
  items: DocumentItemRow[]
  refDocument: { id: string; doc_no: string | null; doc_type: string } | null
}) {
  const def = DOC_TYPES[doc.doc_type]
  const meta = (doc.meta || {}) as Record<string, unknown>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">ข้อมูลเอกสาร</CardTitle></CardHeader>
        <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Field label="วันที่เอกสาร" value={fmtDate(doc.doc_date)} />
          {refDocument && (
            <Field
              label="อ้างอิง"
              value={
                <Link href={`/documents/${refDocument.id}`} className="font-mono hover:underline">
                  {refDocument.doc_no || '-'}
                </Link>
              }
            />
          )}
          {doc.notes && <Field label="หมายเหตุ" value={doc.notes} wide />}
        </CardContent>
      </Card>

      {def.party !== 'none' && (
        <Card>
          <CardHeader><CardTitle className="text-base">ข้อมูล{PARTY_LABEL[def.party].th}</CardTitle></CardHeader>
          <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Field label="ชื่อ" value={doc.party_name || '-'} />
            <Field label="บริษัท/หน่วยงาน" value={doc.party_company || '-'} />
            <Field label="เลขผู้เสียภาษี" value={doc.party_tax_id || '-'} />
            <Field label="เบอร์โทร" value={doc.party_phone || '-'} />
            <Field label="อีเมล" value={doc.party_email || '-'} />
            {doc.party_id_card && <Field label="เลขบัตรประชาชน" value={doc.party_id_card} />}
            {doc.party_birth_date && <Field label="วันเกิด" value={fmtDate(doc.party_birth_date)} />}
            <Field label="ที่อยู่" value={doc.party_address || '-'} wide />
          </CardContent>
        </Card>
      )}

      {def.metaFields.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">รายละเอียด{def.label.th}</CardTitle></CardHeader>
          <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {def.metaFields.map(f => {
              const raw = meta[f.key]
              if (f.type === 'richtext') {
                const html = String(raw ?? '')
                return (
                  <Field
                    key={f.key}
                    label={f.label.th}
                    wide
                    value={isHtmlEmpty(html) ? '-' : <RichTextRead html={html} />}
                  />
                )
              }
              const text = raw == null || String(raw).trim() === '' ? '-' : String(raw)
              return (
                <Field
                  key={f.key}
                  label={f.label.th}
                  value={f.type === 'date' && text !== '-' ? fmtDate(text) : text}
                  wide={f.type === 'textarea'}
                />
              )
            })}
          </CardContent>
        </Card>
      )}

      {def.hasItems && (
        <Card>
          <CardHeader><CardTitle className="text-base">รายการ</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="w-8 py-2 text-left">#</th>
                    <th className="py-2 text-left">รายละเอียด</th>
                    <th className="w-20 py-2 text-right">จำนวน</th>
                    <th className="w-20 py-2 text-left">หน่วย</th>
                    {def.hasAmounts && <th className="w-28 py-2 text-right">ราคา/หน่วย</th>}
                    {def.hasAmounts && <th className="w-24 py-2 text-right">ส่วนลด</th>}
                    {def.hasAmounts && <th className="w-28 py-2 text-right">จำนวนเงิน</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">ยังไม่มีรายการ</td></tr>
                  )}
                  {items.map((it, i) => (
                    <tr key={it.id} className="border-b last:border-0">
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-2">{it.description || '-'}</td>
                      <td className="py-2 text-right tabular-nums">{it.quantity}</td>
                      <td className="py-2">{it.unit || '-'}</td>
                      {def.hasAmounts && <td className="py-2 text-right tabular-nums">{fmtMoney(it.unit_price)}</td>}
                      {def.hasAmounts && <td className="py-2 text-right tabular-nums">{fmtMoney(it.discount)}</td>}
                      {def.hasAmounts && <td className="py-2 text-right tabular-nums">{fmtMoney(it.amount)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {def.hasAmounts && (
              <div className="ml-auto w-full max-w-xs rounded-lg border bg-muted/30 p-3 text-sm">
                <SumRow label="ยอดรวม" value={doc.subtotal} />
                <SumRow label="ส่วนลด" value={-doc.discount_total} />
                <SumRow label="VAT 7%" value={doc.vat_amount} />
                <SumRow label="รวมทั้งสิ้น" value={doc.total} bold />
                <SumRow label={`หัก ณ ที่จ่าย ${doc.wht_rate}%`} value={-doc.wht_amount} />
                <SumRow label="ยอดสุทธิ" value={doc.net_payable} bold />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Field({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && 'sm:col-span-2')}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="whitespace-pre-wrap">{value}</div>
    </div>
  )
}

/**
 * แสดง HTML จากฟิลด์ richtext (ผลผลิตของ TipTap ที่ผ่าน sanitize ตอน saveDraft มาแล้ว)
 * ponytail: repo นี้ไม่ได้ติดตั้ง @tailwindcss/typography — จัดสไตล์ด้วย arbitrary variant
 * ไม่กี่ตัวแทน แล้ว sanitize ซ้ำตอน render กันข้อมูลเก่าที่บันทึกก่อนมียาม
 */
function RichTextRead({ html }: { html: string }) {
  return (
    <div
      className="whitespace-normal [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_h1]:mt-2 [&_h1]:mb-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-semibold"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  )
}

function SumRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between py-0.5', bold && 'mt-1 border-t pt-1.5 font-semibold')}>
      <span className={cn(!bold && 'text-muted-foreground')}>{label}</span>
      <span className="tabular-nums">{fmtMoney(value)}</span>
    </div>
  )
}
