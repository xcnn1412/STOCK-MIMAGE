'use client'

// ============================================================================
// ส่งกลับให้แก้ — แอดมินพิมพ์สิ่งที่ต้องแก้ แล้วใบกลับเป็นแบบร่างให้ผู้เบิกแก้และยื่นใหม่ (sendBackClaim)
// ผู้เรียกถือ open / busy และเรียก server action เอง · ช่องเหตุผลล้างทุกครั้งที่เปิดใหม่ (ฟอร์มอยู่ใน DialogContent ซึ่งถูกถอดออกตอนปิด)
// ใช้ทั้งในคิวใบเบิกและหน้าใบเบิก
// ============================================================================

import { useState } from 'react'
import { Loader2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface SendBackDialogProps {
  open: boolean
  claim: { claim_number: string; title: string } | null
  busy: boolean
  isEn: boolean
  onCancel(): void
  onConfirm(reason: string): void
}

export function SendBackDialog({ open, claim, busy, isEn, onCancel, onConfirm }: SendBackDialogProps) {
  return (
    <Dialog open={open && !!claim} onOpenChange={next => { if (!next && !busy) onCancel() }}>
      <DialogContent className="max-w-md">
        {claim && (
          <SendBackForm key={claim.claim_number} claim={claim} busy={busy} isEn={isEn} onCancel={onCancel} onConfirm={onConfirm} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SendBackForm({ claim, busy, isEn, onCancel, onConfirm }: Omit<SendBackDialogProps, 'open' | 'claim'> & { claim: { claim_number: string; title: string } }) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()

  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault()
        if (trimmed && !busy) onConfirm(trimmed)
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Undo2 className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span>{isEn ? 'Send back for changes' : 'ส่งกลับให้แก้'}</span>
        </DialogTitle>
        <DialogDescription>
          <span className="font-mono">{claim.claim_number}</span> · {claim.title}
          <br />
          {isEn
            ? 'The claim goes back to draft. The submitter is notified with your note, fixes it and submits again.'
            : 'ใบจะกลับเป็นแบบร่าง ผู้เบิกได้รับแจ้งพร้อมข้อความนี้ แล้วแก้ไขและยื่นใหม่ได้'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="send-back-reason">{isEn ? 'What needs fixing' : 'สิ่งที่ต้องแก้'}</Label>
        <Textarea
          id="send-back-reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={isEn ? 'e.g. The receipt is unreadable — please attach a clearer photo' : 'เช่น ใบเสร็จอ่านไม่ออก — ขอรูปที่ชัดกว่านี้'}
          rows={3}
          maxLength={500}
          required
          disabled={busy}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={busy}>
          {isEn ? 'Cancel' : 'ยกเลิก'}
        </Button>
        <Button type="submit" size="lg" disabled={!trimmed || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}
          {isEn ? 'Send back' : 'ส่งกลับให้แก้'}
        </Button>
      </DialogFooter>
    </form>
  )
}
