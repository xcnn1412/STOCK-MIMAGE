'use client'

// ตรวจนับชั้น — ติ๊กของที่เห็นจริงบนชั้น แล้วบันทึก (ระบบคิดรายการ "ควรเจอ" ใหม่ฝั่ง server อีกครั้ง)

import { useState } from 'react'
import { Loader2, CheckCircle2, ClipboardCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { auditKey, type AuditSkip, type AuditTarget } from '../shelf-logic'
import { submitShelfAudit } from '../actions'

export default function AuditPanel({
  shelfId,
  expected,
  skipped,
  onClose,
  onSaved,
}: {
  shelfId: string
  expected: AuditTarget[]
  skipped: AuditSkip[]
  onClose: () => void
  onSaved: () => void
}) {
  const [found, setFound] = useState<Set<string>>(() => new Set())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const toggle = (key: string) =>
    setFound(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const missingCount = expected.length - expected.filter(t => found.has(auditKey(t))).length

  const save = async () => {
    if (missingCount > 0 && !confirm(`ยังไม่ได้ติ๊ก ${missingCount} รายการ — บันทึกว่า "ไม่เจอ"?`)) return
    setSaving(true)
    const res = await submitShelfAudit(shelfId, [...found], note)
    setSaving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    if (res.missing) toast.warning(`บันทึกแล้ว — ไม่เจอ ${res.missing} รายการ`)
    else toast.success('บันทึกแล้ว — ของครบ ✓')
    onSaved()
  }

  return (
    <Card className="p-4 space-y-4 border-violet-300 dark:border-violet-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> ตรวจนับชั้น</h2>
          <p className="text-xs text-muted-foreground mt-0.5">ติ๊กของที่เห็นอยู่บนชั้นจริง ({expected.length - missingCount}/{expected.length})</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} title="ยกเลิก"><X className="h-4 w-4" /></Button>
      </div>

      {expected.length === 0 ? (
        <p className="text-sm text-muted-foreground">ไม่มีของที่ต้องอยู่บนชั้นตอนนี้</p>
      ) : (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFound(new Set(expected.map(auditKey)))}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" /> เจอครบทุกชิ้น
          </Button>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border">
            {expected.map(t => {
              const key = auditKey(t)
              const on = found.has(key)
              return (
                <li key={key}>
                  <label className={cn('flex items-center gap-3 px-3 py-3 cursor-pointer', on && 'bg-emerald-50 dark:bg-emerald-950/30')}>
                    <Checkbox checked={on} onCheckedChange={() => toggle(key)} className="h-5 w-5" />
                    <span className="flex-1 text-sm">{t.kind === 'kit' ? '👜 ' : ''}{t.name}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {skipped.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="font-medium">ไม่ต้องนับ</div>
          {skipped.map(t => (
            <div key={auditKey(t)}>· {t.name} — {t.reason}</div>
          ))}
        </div>
      )}

      <Textarea placeholder="หมายเหตุ (ไม่บังคับ)" value={note} onChange={e => setNote(e.target.value)} rows={2} />

      <Button className="w-full" size="lg" onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        บันทึกผลตรวจนับ
      </Button>
    </Card>
  )
}
