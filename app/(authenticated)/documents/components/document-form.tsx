'use client'

import { useEffect, useRef, useState, useTransition, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import DocRichTextEditor from './doc-rich-text-editor'
import { cn } from '@/lib/utils'
import {
  DOC_TYPES, PARTY_LABEL, SC_LOCKED_META_KEYS, SC_LOCKED_PARTY_KEYS,
  calcDocumentTotals, groupMetaFields, isHtmlEmpty, isMetaEmpty,
  type DocBrandRow, type DocTypeCode, type DocumentItemRow, type DocumentRow,
  type MetaField, type MetaTableRow, type VatMode,
} from '../doc-types'
import { pdpaText } from '../hr-texts'
import {
  saveDraft, searchParties,
  type RefCandidate, type SaveDraftPayload,
} from '../actions'

// ── state shapes ─────────────────────────────────────────────────────────────
// ponytail: เก็บตัวเลขเป็น string ในฟอร์ม (ให้ช่องว่างได้) แล้วแปลงตอนสร้าง payload

export interface FormItem {
  description: string
  quantity: string
  unit: string
  unit_price: string
  discount: string
}

const emptyItem = (): FormItem => ({ description: '', quantity: '1', unit: '', unit_price: '0', discount: '0' })

const num = (v: string | number | null | undefined) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** แปลงเอกสาร + รายการจาก DB เป็น payload ที่ saveDraft รับได้ (ใช้ตอนยังไม่เข้าโหมดแก้ไข) */
export function docToPayload(doc: DocumentRow, items: DocumentItemRow[]): SaveDraftPayload {
  return {
    party_name: doc.party_name,
    party_company: doc.party_company,
    party_tax_id: doc.party_tax_id,
    party_address: doc.party_address,
    party_phone: doc.party_phone,
    party_email: doc.party_email,
    party_id_card: doc.party_id_card,
    party_birth_date: doc.party_birth_date,
    doc_date: doc.doc_date,
    meta: (doc.meta || {}) as Record<string, unknown>,
    vat_mode: doc.vat_mode,
    wht_rate: doc.wht_rate,
    notes: doc.notes,
    ref_document_id: doc.ref_document_id,
    items: items.map(it => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unit_price: it.unit_price,
      discount: it.discount,
    })),
  }
}

/**
 * ตรวจความครบถ้วนฝั่ง client — สะท้อน validateForIssue() ใน actions.ts
 * คืน map ของ field key → ข้อความ (ว่าง = ผ่าน)
 */
export function validateDocumentClient(
  docType: DocTypeCode,
  payload: SaveDraftPayload
): Record<string, string> {
  const def = DOC_TYPES[docType]
  const errors: Record<string, string> = {}
  if (!def) return errors

  if (def.party !== 'none' && !payload.party_name?.trim()) {
    errors.party_name = `กรุณากรอกชื่อ${PARTY_LABEL[def.party].th}`
  }
  if (def.hasItems && !(payload.items || []).length) {
    errors.items = 'ต้องมีรายการอย่างน้อย 1 รายการ'
  }
  if (def.refRequired && !payload.ref_document_id) {
    errors.ref_document_id = 'ต้องอ้างอิงเอกสารต้นทาง'
  }
  const meta = (payload.meta || {}) as Record<string, unknown>
  for (const f of def.metaFields) {
    if (!f.required) continue
    if (isMetaEmpty(f, meta[f.key])) {
      errors[`meta.${f.key}`] =
        f.type === 'checkbox' ? 'กรุณาติ๊กยืนยันช่องนี้' : `กรุณากรอก "${f.label.th}"`
    }
  }
  return errors
}

// ── ค่าเริ่มต้น / layout ของ metaField ──────────────────────────────────────

const WIDTH_CLASS: Record<NonNullable<MetaField['width']>, string> = {
  half: 'sm:col-span-3',
  third: 'sm:col-span-2',
  full: 'sm:col-span-6',
}

const emptyRow = (f: MetaField): MetaTableRow =>
  Object.fromEntries((f.columns || []).map(c => [c.key, '']))

function initTable(f: MetaField, raw: unknown): MetaTableRow[] {
  const firstKey = f.columns?.[0]?.key || 'col0'
  const rows = Array.isArray(raw) ? (raw as MetaTableRow[]).map(r => ({ ...emptyRow(f), ...(r || {}) })) : []
  if (f.fixedRows?.length) {
    return f.fixedRows.map((lbl, i) => ({ ...emptyRow(f), ...(rows[i] || {}), [firstKey]: lbl }))
  }
  return rows.length ? rows : [emptyRow(f)]
}

function initMetaValue(f: MetaField, raw: unknown): unknown {
  if (f.type === 'checkbox') return raw === true
  if (f.type === 'multiselect') return Array.isArray(raw) ? raw.map(String) : []
  if (f.type === 'table') return initTable(f, raw)
  return raw == null ? '' : String(raw)
}

// ── component ────────────────────────────────────────────────────────────────

interface Props {
  doc: DocumentRow
  items: DocumentItemRow[]
  refCandidates: RefCandidate[]
  /** ใช้แทนชื่อ/ที่อยู่บริษัทในข้อความคงที่ (นโยบาย PDPA ของแบบฟอร์ม HR) */
  brand?: DocBrandRow | null
  /** เรียกทุกครั้งที่ฟอร์มเปลี่ยน — parent เก็บไว้ใน ref เพื่อ save ก่อน transition */
  onPayloadChange?: (payload: SaveDraftPayload) => void
  /** เรียกหลังบันทึกร่างสำเร็จ */
  onSaved?: () => void
  /** ข้อความ error รายฟิลด์จาก validateDocumentClient() ของ parent */
  errors?: Record<string, string>
  /** บทบาทผู้ใช้ — SC ล็อกช่องที่ระบบเติมให้สำหรับคนที่ไม่ใช่ admin */
  role?: string
}

const WHT_OPTIONS = [0, 1, 2, 3, 5]
const VAT_OPTIONS: { value: VatMode; label: string }[] = [
  { value: 'none', label: 'ไม่มี VAT' },
  { value: 'exclusive', label: 'แยกนอก 7%' },
  { value: 'inclusive', label: 'รวมใน 7%' },
]

export default function DocumentForm({ doc, items: initialItems, refCandidates, brand, onPayloadChange, onSaved, errors, role }: Props) {
  const def = DOC_TYPES[doc.doc_type]
  const partyLabel = PARTY_LABEL[def.party].th
  const isPerson = def.party === 'applicant' || def.party === 'employee'

  // SC: ตำแหน่ง/แผนก/วันเริ่มงาน/เงินเดือน + ข้อมูลผู้ถูกรับรอง มาจากฐานข้อมูล ไม่ใช่จากช่องกรอก
  // ล็อกไว้ให้ตรงกับยามฝั่ง server (actions.ts::saveDraft) — admin แก้ได้
  const scLocked = doc.doc_type === 'SC' && role !== 'admin'
  const lockedParty = (k: string) => scLocked && (SC_LOCKED_PARTY_KEYS as readonly string[]).includes(k)
  const lockedMeta = (k: string) => scLocked && (SC_LOCKED_META_KEYS as readonly string[]).includes(k)

  const [docDate, setDocDate] = useState(doc.doc_date || '')
  const [notes, setNotes] = useState(doc.notes || '')
  const [party, setParty] = useState({
    party_name: doc.party_name || '',
    party_company: doc.party_company || '',
    party_tax_id: doc.party_tax_id || '',
    party_address: doc.party_address || '',
    party_phone: doc.party_phone || '',
    party_email: doc.party_email || '',
    party_id_card: doc.party_id_card || '',
    party_birth_date: doc.party_birth_date || '',
  })
  const [meta, setMeta] = useState<Record<string, unknown>>(() => {
    const src = (doc.meta || {}) as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const f of def.metaFields) {
      out[f.key] = initMetaValue(f, src[f.key])
      if (f.otherKey) out[f.otherKey] = src[f.otherKey] == null ? '' : String(src[f.otherKey])
    }
    return out
  })
  const [refId, setRefId] = useState(doc.ref_document_id || '')
  const [vatMode, setVatMode] = useState<VatMode>(doc.vat_mode || 'none')
  const [whtRate, setWhtRate] = useState<number>(Number(doc.wht_rate || 0))
  const [items, setItems] = useState<FormItem[]>(() =>
    initialItems.length
      ? initialItems.map(it => ({
          description: it.description || '',
          quantity: String(it.quantity ?? 0),
          unit: it.unit || '',
          unit_price: String(it.unit_price ?? 0),
          discount: String(it.discount ?? 0),
        }))
      : def.hasItems
        ? [emptyItem()]
        : []
  )
  const [saving, startSaving] = useTransition()

  // ── payload ที่คำนวณจาก state ปัจจุบัน ─────────────────────────────────────
  const buildPayload = (): SaveDraftPayload => {
    const metaOut: Record<string, unknown> = {}
    for (const f of def.metaFields) {
      const raw = meta[f.key]
      metaOut[f.key] = f.type === 'number'
        ? (raw === '' || raw == null ? null : num(raw as string))
        : (raw ?? '')
      if (f.otherKey) metaOut[f.otherKey] = meta[f.otherKey] ?? ''
    }
    return {
      ...party,
      party_birth_date: party.party_birth_date || null,
      doc_date: docDate || null,
      meta: metaOut,
      vat_mode: def.hasAmounts ? vatMode : 'none',
      wht_rate: def.hasAmounts ? whtRate : 0,
      notes,
      ref_document_id: refId || null,
      items: def.hasItems
        ? items.map(it => ({
            description: it.description,
            quantity: num(it.quantity),
            unit: it.unit,
            unit_price: def.hasAmounts ? num(it.unit_price) : 0,
            discount: def.hasAmounts ? num(it.discount) : 0,
          }))
        : [],
    }
  }

  const payload = buildPayload()

  useEffect(() => {
    onPayloadChange?.(payload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docDate, notes, party, meta, refId, vatMode, whtRate, items])

  const totals = calcDocumentTotals(
    items.map(it => ({ quantity: num(it.quantity), unit_price: num(it.unit_price), discount: num(it.discount) })),
    vatMode,
    whtRate
  )

  const handleSave = () => {
    startSaving(async () => {
      const res = await saveDraft(doc.id, buildPayload())
      if (res?.error) toast.error(res.error)
      else {
        toast.success('บันทึกร่างแล้ว')
        onSaved?.()
      }
    })
  }

  // ── party autocomplete ───────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<Array<Record<string, string | null>>>([])
  const [showSug, setShowSug] = useState(false)
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onPartyNameChange = (value: string) => {
    setParty(p => ({ ...p, party_name: value }))
    if (sugTimer.current) clearTimeout(sugTimer.current)
    if (value.trim().length < 2) {
      setSuggestions([])
      setShowSug(false)
      return
    }
    sugTimer.current = setTimeout(async () => {
      const rows = await searchParties(value)
      setSuggestions(rows)
      setShowSug(rows.length > 0)
    }, 300)
  }

  const applySuggestion = (s: Record<string, string | null>) => {
    setParty(p => ({
      ...p,
      party_name: s.party_name || p.party_name,
      party_company: s.party_company || '',
      party_tax_id: s.party_tax_id || '',
      party_address: s.party_address || '',
      party_phone: s.party_phone || '',
      party_email: s.party_email || '',
    }))
    setShowSug(false)
  }

  const err = (key: string) => errors?.[key]

  // ── items helpers ────────────────────────────────────────────────────────
  const setItem = (i: number, patch: Partial<FormItem>) =>
    setItems(list => list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const moveItem = (i: number, dir: -1 | 1) =>
    setItems(list => {
      const j = i + dir
      if (j < 0 || j >= list.length) return list
      const copy = [...list]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  return (
    <div className="space-y-4">
      {/* ── ข้อมูลเอกสาร ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="text-base">ข้อมูลเอกสาร</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            {/* ponytail: ThaiDatePicker เดิมเป็น uncontrolled + hidden input — ไม่เข้ากับฟอร์มนี้ ใช้ input[type=date] */}
            <Label htmlFor="doc_date">วันที่เอกสาร</Label>
            <Input id="doc_date" type="date" value={docDate} onChange={e => setDocDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">หมายเหตุ</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* ── คู่สัญญา ────────────────────────────────────────────────────── */}
      {def.party !== 'none' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ข้อมูล{partyLabel}</CardTitle>
            {scLocked && (
              <p className="text-xs text-muted-foreground">
                ข้อมูลชุดนี้ระบบเติมจากโปรไฟล์และตั้งค่าเงินเดือนของคุณ แก้ที่นี่ไม่ได้ — หากไม่ถูกต้องให้ติดต่อ admin
              </p>
            )}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="relative space-y-1.5">
              <Label htmlFor="party_name">ชื่อ{partyLabel} <span className="text-destructive">*</span></Label>
              <Input
                id="party_name"
                autoComplete="off"
                value={party.party_name}
                disabled={lockedParty('party_name')}
                onChange={e => onPartyNameChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowSug(false), 150)}
                className={cn(err('party_name') && 'border-destructive')}
              />
              {showSug && suggestions.length > 0 && (
                // ponytail: dropdown ธรรมดา — ไม่ต้องใช้ Popover/Command ให้ focus กระโดด
                <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
                  {suggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => applySuggestion(s)}
                        className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <div className="font-medium">{s.party_name}</div>
                        {(s.party_company || s.party_tax_id) && (
                          <div className="text-xs text-muted-foreground">
                            {[s.party_company, s.party_tax_id].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {err('party_name') && <p className="text-xs text-destructive">{err('party_name')}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="party_company">บริษัท/หน่วยงาน</Label>
              <Input id="party_company" value={party.party_company} onChange={e => setParty(p => ({ ...p, party_company: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="party_tax_id">เลขผู้เสียภาษี</Label>
              <Input id="party_tax_id" value={party.party_tax_id} onChange={e => setParty(p => ({ ...p, party_tax_id: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="party_phone">เบอร์โทร</Label>
              <Input id="party_phone" value={party.party_phone} disabled={lockedParty('party_phone')} onChange={e => setParty(p => ({ ...p, party_phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="party_address">ที่อยู่</Label>
              <Textarea id="party_address" rows={2} value={party.party_address} disabled={lockedParty('party_address')} onChange={e => setParty(p => ({ ...p, party_address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="party_email">อีเมล</Label>
              <Input id="party_email" type="email" value={party.party_email} disabled={lockedParty('party_email')} onChange={e => setParty(p => ({ ...p, party_email: e.target.value }))} />
            </div>
            {isPerson && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="party_id_card">เลขบัตรประชาชน</Label>
                  <Input id="party_id_card" value={party.party_id_card} disabled={lockedParty('party_id_card')} onChange={e => setParty(p => ({ ...p, party_id_card: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="party_birth_date">วันเกิด</Label>
                  <Input id="party_birth_date" type="date" value={party.party_birth_date} disabled={lockedParty('party_birth_date')} onChange={e => setParty(p => ({ ...p, party_birth_date: e.target.value }))} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── ฟิลด์เฉพาะประเภท ────────────────────────────────────────────── */}
      {def.metaFields.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">รายละเอียด{def.label.th}</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {groupMetaFields(def.metaFields).map((g, gi) => (
              <div key={gi} className="space-y-3">
                {g.section && (
                  <div className="rounded-md bg-muted px-3 py-2 text-sm font-semibold">{g.section}</div>
                )}
                {g.section?.includes('(PDPA)') && (
                  <PdpaNotice kind={doc.doc_type === 'IA' ? 'IA' : 'JA'} brand={brand} />
                )}
                <div className="grid grid-cols-6 gap-x-4 gap-y-4">
                  {g.fields.map(f => {
                    if (f.showWhen && String(meta[f.showWhen.key] ?? '') !== f.showWhen.value) return null
                    return (
                      <MetaFieldInput
                        key={f.key}
                        field={f}
                        meta={meta}
                        setMeta={setMeta}
                        error={err(`meta.${f.key}`)}
                        disabled={lockedMeta(f.key)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── เอกสารอ้างอิง ───────────────────────────────────────────────── */}
      {def.refTypes.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">เอกสารอ้างอิง</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            <Label>
              อ้างอิง {def.refTypes.map(t => DOC_TYPES[t].label.th).join(' / ')}
              {def.refRequired && <span className="text-destructive"> *</span>}
            </Label>
            <Select value={refId || 'none'} onValueChange={v => setRefId(v === 'none' ? '' : v)}>
              <SelectTrigger className={cn('w-full', err('ref_document_id') && 'border-destructive')}>
                <SelectValue placeholder="เลือกเอกสาร" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่อ้างอิง —</SelectItem>
                {refCandidates.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.doc_no} · {c.party_name || '-'} · ฿{fmtMoney(c.total)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {refCandidates.length === 0 && (
              <p className="text-xs text-muted-foreground">ยังไม่มีเอกสารที่ออกเลขแล้วให้อ้างอิงในแบรนด์นี้</p>
            )}
            {err('ref_document_id') && <p className="text-xs text-destructive">{err('ref_document_id')}</p>}
          </CardContent>
        </Card>
      )}

      {/* ── รายการ ──────────────────────────────────────────────────────── */}
      {def.hasItems && (
        <Card>
          <CardHeader><CardTitle className="text-base">รายการ</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {err('items') && <p className="text-xs text-destructive">{err('items')}</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="w-8 py-2 text-left">#</th>
                    <th className="py-2 text-left">รายละเอียด</th>
                    <th className="w-24 py-2 text-right">จำนวน</th>
                    <th className="w-24 py-2 text-left">หน่วย</th>
                    {def.hasAmounts && <th className="w-28 py-2 text-right">ราคา/หน่วย</th>}
                    {def.hasAmounts && <th className="w-24 py-2 text-right">ส่วนลด</th>}
                    {def.hasAmounts && <th className="w-28 py-2 text-right">จำนวนเงิน</th>}
                    <th className="w-24 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 pr-2">
                        <Input value={it.description} onChange={e => setItem(i, { description: e.target.value })} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input type="number" className="text-right" value={it.quantity} onChange={e => setItem(i, { quantity: e.target.value })} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input value={it.unit} onChange={e => setItem(i, { unit: e.target.value })} />
                      </td>
                      {def.hasAmounts && (
                        <td className="py-1.5 pr-2">
                          <Input type="number" className="text-right" value={it.unit_price} onChange={e => setItem(i, { unit_price: e.target.value })} />
                        </td>
                      )}
                      {def.hasAmounts && (
                        <td className="py-1.5 pr-2">
                          <Input type="number" className="text-right" value={it.discount} onChange={e => setItem(i, { discount: e.target.value })} />
                        </td>
                      )}
                      {def.hasAmounts && (
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {fmtMoney(num(it.quantity) * num(it.unit_price) - num(it.discount))}
                        </td>
                      )}
                      <td className="py-1.5">
                        <div className="flex justify-end gap-0.5">
                          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => moveItem(i, -1)} disabled={i === 0}>
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}>
                            <ArrowDown className="size-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => setItems(l => l.filter((_, idx) => idx !== i))}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={() => setItems(l => [...l, emptyItem()])}>
              <Plus className="size-4" />
              เพิ่มรายการ
            </Button>

            {def.hasAmounts && (
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>ภาษีมูลค่าเพิ่ม</Label>
                    <Select value={vatMode} onValueChange={v => setVatMode(v as VatMode)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VAT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>หัก ณ ที่จ่าย</Label>
                    <Select value={String(whtRate)} onValueChange={v => setWhtRate(Number(v))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WHT_OPTIONS.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <Row label="ยอดรวม" value={totals.subtotal} />
                  <Row label="ส่วนลด" value={-totals.discount_total} />
                  <Row label="VAT 7%" value={totals.vat_amount} />
                  <Row label="รวมทั้งสิ้น" value={totals.total} bold />
                  <Row label={`หัก ณ ที่จ่าย ${whtRate}%`} value={-totals.wht_amount} />
                  <Row label="ยอดสุทธิที่ต้องชำระ" value={totals.net_payable} bold />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          บันทึกร่าง
        </Button>
      </div>
    </div>
  )
}

// ── metaField หนึ่งช่อง ─────────────────────────────────────────────────────

type SetMeta = Dispatch<SetStateAction<Record<string, unknown>>>

function MetaFieldInput({
  field: f, meta, setMeta, error, disabled,
}: {
  field: MetaField
  meta: Record<string, unknown>
  setMeta: SetMeta
  error?: string
  /** ช่องที่ระบบเติมให้เอง (SC) — แสดงค่าแต่แก้ไม่ได้ */
  disabled?: boolean
}) {
  const set = (v: unknown) => setMeta(m => ({ ...m, [f.key]: v }))
  const wrap = cn('col-span-6 space-y-1.5', WIDTH_CLASS[f.width ?? 'half'])
  const str = (meta[f.key] ?? '') as string

  // checkbox: label เป็นข้อความคำยินยอม ไม่ใช่หัวช่อง
  if (f.type === 'checkbox') {
    return (
      <div className={wrap}>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            id={`meta_${f.key}`}
            className={cn('mt-0.5', error && 'border-destructive')}
            checked={meta[f.key] === true}
            disabled={disabled}
            onCheckedChange={v => set(v === true)}
          />
          <span>{f.label.th}{f.required && <span className="text-destructive"> *</span>}</span>
        </label>
        {f.hint && <p className="pl-6 text-xs text-muted-foreground">{f.hint}</p>}
        {error && <p className="pl-6 text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  const label = (
    <Label htmlFor={f.type === 'richtext' || f.type === 'table' ? undefined : `meta_${f.key}`}>
      {f.label.th}{f.required && <span className="text-destructive"> *</span>}
    </Label>
  )

  if (f.type === 'multiselect') {
    const selected = (Array.isArray(meta[f.key]) ? meta[f.key] : []) as string[]
    const toggle = (o: string, on: boolean) =>
      set(on ? [...selected, o] : selected.filter(x => x !== o))
    return (
      <div className={wrap}>
        {label}
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
          {(f.options || []).map(o => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <Checkbox checked={selected.includes(o)} onCheckedChange={v => toggle(o, v === true)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
        {f.otherKey && selected.includes('อื่นๆ') && (
          <Input
            className="mt-2"
            placeholder="อื่นๆ ระบุ"
            value={(meta[f.otherKey] ?? '') as string}
            onChange={e => setMeta(m => ({ ...m, [f.otherKey!]: e.target.value }))}
          />
        )}
        {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  if (f.type === 'table') {
    const cols = f.columns || []
    const rows = (Array.isArray(meta[f.key]) ? meta[f.key] : []) as MetaTableRow[]
    const fixed = !!f.fixedRows?.length
    const maxRows = f.maxRows ?? 5
    const setCell = (i: number, key: string, v: string) =>
      set(rows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)))
    return (
      <div className={cn(wrap, 'space-y-2')}>
        {label}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                {cols.map(c => <th key={c.key} className="py-2 text-left font-normal">{c.label}</th>)}
                {!fixed && <th className="w-10 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  {cols.map((c, ci) => (
                    <td key={c.key} className="py-1.5 pr-2">
                      {fixed && ci === 0 ? (
                        <span className="text-sm font-medium">{r[c.key]}</span>
                      ) : (
                        <Input
                          type={c.type === 'number' ? 'number' : 'text'}
                          value={r[c.key] ?? ''}
                          onChange={e => setCell(i, c.key, e.target.value)}
                        />
                      )}
                    </td>
                  ))}
                  {!fixed && (
                    <td className="py-1.5">
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="size-7 text-destructive"
                        onClick={() => set(rows.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!fixed && rows.length < maxRows && (
          <Button type="button" variant="outline" size="sm" onClick={() => set([...rows, emptyRow(f)])}>
            <Plus className="size-4" />
            เพิ่มแถว
          </Button>
        )}
        {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className={wrap}>
      {label}
      {f.type === 'select' ? (
        <Select value={str || undefined} onValueChange={set} disabled={disabled}>
          <SelectTrigger id={`meta_${f.key}`} className={cn('w-full', error && 'border-destructive')}>
            <SelectValue placeholder="เลือก" />
          </SelectTrigger>
          <SelectContent>
            {(f.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : f.type === 'richtext' ? (
        // ponytail: ตัวเดียวกับที่หน้าตั้งค่าแม่แบบใช้ — ไม่ sync value กลับหลัง mount
        // แต่ที่นี่ไม่ต้อง เพราะมีแค่ editor ตัวเองที่แก้ meta[f.key]
        <DocRichTextEditor
          value={str}
          onChange={html => set(isHtmlEmpty(html) ? '' : html)}
          minHeight="160px"
          placeholder={`พิมพ์${f.label.th}...`}
          className={cn(error && 'border-destructive')}
        />
      ) : f.type === 'textarea' ? (
        <Textarea
          id={`meta_${f.key}`} rows={3} value={str}
          disabled={disabled}
          onChange={e => set(e.target.value)}
          className={cn(error && 'border-destructive')}
        />
      ) : (
        <Input
          id={`meta_${f.key}`}
          type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
          value={str}
          disabled={disabled}
          onChange={e => set(e.target.value)}
          className={cn(error && 'border-destructive')}
        />
      )}
      {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/** นโยบาย PDPA แบบย่อ (พับไว้) — ข้อความชุดเดียวกับที่พิมพ์ลง PDF */
function PdpaNotice({ kind, brand }: { kind: 'JA' | 'IA'; brand?: DocBrandRow | null }) {
  const t = pdpaText(kind, brand?.name_th || '—', brand?.address || '')
  return (
    <details className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">
        อ่านนโยบายความเป็นส่วนตัว (PDPA)
      </summary>
      <div className="mt-2 space-y-2 leading-relaxed">
        <p>{t.intro}</p>
        {t.sections.map(sec => (
          <div key={sec.title}>
            <p className="font-semibold text-foreground">{sec.title}</p>
            {sec.body && <p>{sec.body}</p>}
            {sec.items && (
              <ol className="list-inside list-decimal">
                {sec.items.map(it => <li key={it}>{it}</li>)}
              </ol>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between py-0.5', bold && 'font-semibold border-t mt-1 pt-1.5')}>
      <span className={cn(!bold && 'text-muted-foreground')}>{label}</span>
      <span className="tabular-nums">{fmtMoney(value)}</span>
    </div>
  )
}
