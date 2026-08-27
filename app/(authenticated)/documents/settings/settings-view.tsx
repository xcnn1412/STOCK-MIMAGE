'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, Pencil, Plus, RotateCcw, Save, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import DocRichTextEditor from '@/components/doc-rich-text-editor'
import { compressImage } from '@/lib/utils'
import { DOC_TYPES, DOC_TYPE_CODES, type DocBrandRow, type DocTypeCode, type VatMode } from '../doc-types'
import {
  activateTemplateVersion, saveBrand, saveTemplateVersion, setBrandActive, uploadBrandLogo, upsertCounter,
  type BrandInput, type CounterRow, type TemplateRow,
} from './actions'

interface Props {
  brands: DocBrandRow[]
  counters: CounterRow[]
  lockedCodes: string[]
  templates: TemplateRow[]
}

const EMPTY_BRAND: BrandInput = {
  code: '',
  original_code: null,
  name_th: '',
  name_en: '',
  address: '',
  tax_id: '',
  branch: 'สำนักงานใหญ่',
  phone: '',
  email: '',
  website: '',
  vat_registered: false,
  default_vat_mode: 'none',
  default_wht_rate: 0,
  is_active: true,
  sort_order: 0,
}

const VAT_MODE_LABEL: Record<VatMode, string> = {
  none: 'ไม่มี VAT',
  exclusive: 'แยกนอก 7%',
  inclusive: 'รวมใน 7%',
}

const WHT_RATES = [0, 1, 2, 3, 5]

function typeLabel(code: string) {
  if (code === '*') return 'เลขร่าง'
  return DOC_TYPES[code as DocTypeCode]?.label.th || code
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── แม่แบบ ───────────────────────────────────────────────────────────────────

interface TemplateFields {
  title: string
  terms: string
  footer: string
  signer_label_1: string
  signer_label_2: string
  payment_info: string
}

// ponytail: คัดลอกจาก components/pdf/document-pdf.tsx — import ตรงไม่ได้เพราะไฟล์นั้น
// ดึง @react-pdf/renderer เข้ามาทั้งก้อนใน client bundle
const SIGNER_1_DEFAULT: Partial<Record<DocTypeCode, string>> = {
  QT: 'ผู้เสนอราคา', JA: 'ผู้สมัคร', IA: 'ผู้สมัคร', RS: 'ผู้ยื่น',
}

/** ค่าที่ PDF ใช้อยู่แล้วเมื่อไม่มีแม่แบบ — เอามาโชว์ในฟอร์มให้เห็นว่าจะได้อะไร */
function defaultTemplateFields(type: DocTypeCode): TemplateFields {
  const def = DOC_TYPES[type]
  return {
    title: `${def.label.th} / ${def.label.en}`,
    terms: '',
    footer: '',
    signer_label_1: SIGNER_1_DEFAULT[type] || 'ผู้ออกเอกสาร',
    signer_label_2: 'ผู้อนุมัติ',
    payment_info: '',
  }
}

function templateFieldsFrom(row: TemplateRow, type: DocTypeCode): TemplateFields {
  const d = defaultTemplateFields(type)
  return {
    title: row.title || d.title,
    terms: row.terms || '',
    footer: row.footer || '',
    signer_label_1: row.signer_label_1 || d.signer_label_1,
    signer_label_2: row.signer_label_2 || d.signer_label_2,
    payment_info: row.payment_info || '',
  }
}

/** ข้อมูลการชำระเงินขึ้นเฉพาะ QT/IV (spec §48 และ document-pdf.tsx ก็เช็คแบบเดียวกัน) */
const PAYMENT_INFO_TYPES: DocTypeCode[] = ['QT', 'IV']

export default function SettingsView({ brands, counters, lockedCodes, templates }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [banner, setBanner] = useState<string | null>(null)

  // ── แบรนด์ ────────────────────────────────────────────────────────────────
  const [brandOpen, setBrandOpen] = useState(false)
  const [brandForm, setBrandForm] = useState<BrandInput>(EMPTY_BRAND)
  const [brandLogo, setBrandLogo] = useState<string | null>(null)
  const [brandError, setBrandError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isNewBrand = !brandForm.original_code
  const codeLocked = !isNewBrand && lockedCodes.includes(brandForm.original_code || '')

  function openNewBrand() {
    setBrandForm({ ...EMPTY_BRAND, sort_order: brands.length + 1 })
    setBrandLogo(null)
    setBrandError(null)
    setBrandOpen(true)
  }

  function openEditBrand(b: DocBrandRow) {
    setBrandForm({
      code: b.code,
      original_code: b.code,
      name_th: b.name_th,
      name_en: b.name_en || '',
      address: b.address || '',
      tax_id: b.tax_id || '',
      branch: b.branch || 'สำนักงานใหญ่',
      phone: b.phone || '',
      email: b.email || '',
      website: b.website || '',
      vat_registered: b.vat_registered,
      default_vat_mode: b.default_vat_mode,
      default_wht_rate: Number(b.default_wht_rate) || 0,
      is_active: b.is_active,
      sort_order: Number(b.sort_order) || 0,
    })
    setBrandLogo(b.logo_url)
    setBrandError(null)
    setBrandOpen(true)
  }

  function submitBrand() {
    if (!/^[A-Z]{3}$/.test(brandForm.code)) {
      setBrandError('รหัสแบรนด์ต้องเป็นตัวพิมพ์ใหญ่ A–Z 3 ตัว')
      return
    }
    if (!brandForm.name_th.trim()) {
      setBrandError('กรุณากรอกชื่อ (ไทย)')
      return
    }
    const tax = (brandForm.tax_id || '').replace(/\D/g, '')
    if (brandForm.tax_id && tax.length !== 13) {
      setBrandError('เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก')
      return
    }
    setBrandError(null)
    startTransition(async () => {
      const res = await saveBrand(brandForm)
      if (res.error) { setBrandError(res.error); return }
      setBrandOpen(false)
      router.refresh()
    })
  }

  async function onPickLogo(file: File | undefined) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setBrandError('รองรับเฉพาะ PNG / JPG / WebP')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setBrandError('ไฟล์ต้องไม่เกิน 2MB')
      return
    }
    if (!/^[A-Z]{3}$/.test(brandForm.code)) {
      setBrandError('กรอกรหัสแบรนด์ก่อนอัปโหลดโลโก้')
      return
    }
    setBrandError(null)
    setUploading(true)
    try {
      // ponytail: compressImage คุมด้านยาวสุด 1600px ตายตัวและแปลงเป็น JPEG เสมอ
      // → ข้าม PNG ไว้ (รักษาพื้นหลังโปร่งใสของโลโก้) ส่วนไฟล์อื่นบีบด้วย maxSizeMB ต่ำๆ
      // เพื่อบังคับให้ย่อจริง; ไม่แก้ lib/utils เพราะอยู่นอกขอบเขต ticket
      const compressed = file.type === 'image/png' ? file : await compressImage(file, 0.2)
      const fd = new FormData()
      fd.append('file', compressed, compressed.name)
      const res = await uploadBrandLogo(brandForm.code, fd)
      if (res.error) setBrandError(res.error)
      else {
        setBrandLogo(res.url || null)
        router.refresh()
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function toggleActive(code: string, active: boolean) {
    startTransition(async () => {
      const res = await setBrandActive(code, active)
      if (res.error) setBanner(res.error)
      else router.refresh()
    })
  }

  // ── ตัวนับ ────────────────────────────────────────────────────────────────
  const [filterBrand, setFilterBrand] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [counterOpen, setCounterOpen] = useState(false)
  const [counterNew, setCounterNew] = useState(false)
  const [counterForm, setCounterForm] = useState({ brand_code: '', doc_type: '', period: '', last_number: 0 })
  const [counterBefore, setCounterBefore] = useState(0)
  const [counterError, setCounterError] = useState<string | null>(null)

  const visibleCounters = useMemo(
    () => counters.filter(c =>
      (filterBrand === 'all' || c.brand_code === filterBrand) &&
      (filterType === 'all' || c.doc_type === filterType)),
    [counters, filterBrand, filterType],
  )

  function openEditCounter(c: CounterRow) {
    setCounterNew(false)
    setCounterForm({ brand_code: c.brand_code, doc_type: c.doc_type, period: c.period, last_number: c.last_number })
    setCounterBefore(c.last_number)
    setCounterError(null)
    setCounterOpen(true)
  }

  function openNewCounter() {
    setCounterNew(true)
    setCounterForm({ brand_code: brands[0]?.code || '', doc_type: 'QT', period: '', last_number: 0 })
    setCounterBefore(0)
    setCounterError(null)
    setCounterOpen(true)
  }

  function submitCounter() {
    setCounterError(null)
    startTransition(async () => {
      const res = await upsertCounter(counterForm)
      if (res.error) { setCounterError(res.error); return }
      setCounterOpen(false)
      router.refresh()
    })
  }

  const counterTypeDef = DOC_TYPES[counterForm.doc_type as DocTypeCode]
  // ── แม่แบบ ────────────────────────────────────────────────────────────────
  const [tplBrand, setTplBrand] = useState(brands[0]?.code || '')
  const [tplType, setTplType] = useState<DocTypeCode>('QT')

  const tplVersions = useMemo(
    () => templates.filter(t => t.brand_code === tplBrand && t.doc_type === tplType),
    [templates, tplBrand, tplType],
  )
  const tplActive = tplVersions.find(t => t.is_active) || null

  function submitTemplate(fields: TemplateFields) {
    if (!tplBrand) return
    startTransition(async () => {
      const res = await saveTemplateVersion({ brand_code: tplBrand, doc_type: tplType, ...fields })
      if (res.error) { toast.error(res.error); return }
      toast.success(`บันทึกเป็นเวอร์ชัน ${res.version} และใช้งานแล้ว`)
      router.refresh()
    })
  }

  function activateVersion(id: string, version: number) {
    startTransition(async () => {
      const res = await activateTemplateVersion(id)
      if (res.error) { toast.error(res.error); return }
      toast.success(`กลับไปใช้เวอร์ชัน ${version} แล้ว`)
      router.refresh()
    })
  }

  const periodHint = counterTypeDef?.counter === 'yearly'
    ? 'งวดรายปี — ตัวเลข 2 หลัก (เช่น 26)'
    : 'งวดรายเดือน — ตัวเลข 4 หลัก (เช่น 2608)'

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">ตั้งค่าเอกสาร</h1>
        <p className="text-sm text-muted-foreground">แบรนด์ · ตัวนับเลขที่เอกสาร · แม่แบบ</p>
      </div>

      {banner && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {banner}
        </div>
      )}

      <Tabs defaultValue="brands">
        <TabsList>
          <TabsTrigger value="brands">แบรนด์</TabsTrigger>
          <TabsTrigger value="counters">ตัวนับ</TabsTrigger>
          <TabsTrigger value="templates">แม่แบบ</TabsTrigger>
        </TabsList>

        {/* ── แบรนด์ ───────────────────────────────────────────────────────── */}
        <TabsContent value="brands" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={openNewBrand}>
              <Plus className="size-4" />
              เพิ่มแบรนด์
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">โลโก้</TableHead>
                    <TableHead>รหัส</TableHead>
                    <TableHead>ชื่อ (ไทย)</TableHead>
                    <TableHead>ชื่อ (อังกฤษ)</TableHead>
                    <TableHead>เลขผู้เสียภาษี</TableHead>
                    <TableHead>VAT</TableHead>
                    <TableHead>เปิดใช้งาน</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        ยังไม่มีแบรนด์
                      </TableCell>
                    </TableRow>
                  )}
                  {brands.map(b => (
                    <TableRow key={b.code}>
                      <TableCell>
                        {b.logo_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={b.logo_url} alt={b.code} className="h-8 w-8 rounded object-contain" />
                          : <div className="h-8 w-8 rounded bg-muted" />}
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {b.code}
                        {lockedCodes.includes(b.code) && (
                          <span className="ml-1 text-xs text-muted-foreground">ล็อก</span>
                        )}
                      </TableCell>
                      <TableCell>{b.name_th}</TableCell>
                      <TableCell className="text-muted-foreground">{b.name_en || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{b.tax_id || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={b.vat_registered ? 'default' : 'outline'}>
                          {b.vat_registered ? 'จด VAT' : 'ไม่จด VAT'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={b.is_active}
                          disabled={isPending}
                          onCheckedChange={v => toggleActive(b.code, v)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEditBrand(b)}>
                          <Pencil className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">แบรนด์ลบไม่ได้ — ปิดใช้งานแทนเพื่อไม่ให้เลือกตอนสร้างเอกสาร</p>
        </TabsContent>

        {/* ── ตัวนับ ───────────────────────────────────────────────────────── */}
        <TabsContent value="counters" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            รูปแบบเลข <code className="font-mono">BRAND-TYPE-YYMM-NNNN</code> · ใบกำกับภาษี/ใบเสร็จ/ใบลดหนี้ (TX/RC/CN)
            นับต่อเนื่องทั้งปี (งวด = YY) ประเภทอื่นรีเซ็ตรายเดือน (งวด = YYMM) · เลขร่างใช้ตัวนับ <code className="font-mono">*/*/draft</code>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterBrand} onValueChange={setFilterBrand}>
              <SelectTrigger className="w-44"><SelectValue placeholder="แบรนด์" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกแบรนด์</SelectItem>
                {brands.map(b => <SelectItem key={b.code} value={b.code}>{b.code} — {b.name_th}</SelectItem>)}
                <SelectItem value="*">* (เลขร่าง)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-56"><SelectValue placeholder="ประเภท" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกประเภท</SelectItem>
                {DOC_TYPE_CODES.map(t => <SelectItem key={t} value={t}>{t} — {DOC_TYPES[t].label.th}</SelectItem>)}
                <SelectItem value="*">เลขร่าง</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <Button onClick={openNewCounter}>
                <Plus className="size-4" />
                เพิ่มชุดตัวนับ
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>แบรนด์</TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead>งวด</TableHead>
                    <TableHead className="text-right">เลขล่าสุด</TableHead>
                    <TableHead>แก้ไขล่าสุด</TableHead>
                    <TableHead>โดย</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleCounters.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        ยังไม่มีชุดตัวนับ
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleCounters.map(c => (
                    <TableRow key={`${c.brand_code}-${c.doc_type}-${c.period}`}>
                      <TableCell className="font-mono">{c.brand_code}</TableCell>
                      <TableCell>{typeLabel(c.doc_type)}</TableCell>
                      <TableCell className="font-mono">{c.period}</TableCell>
                      <TableCell className="text-right font-mono">{c.last_number}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDateTime(c.updated_at)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{c.updater?.full_name || '-'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEditCounter(c)}>
                          <Pencil className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── แม่แบบ ───────────────────────────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            แม่แบบแยกตาม <strong>แบรนด์ × ประเภท</strong> · บันทึกทุกครั้ง = เวอร์ชันใหม่ที่ใช้งานทันที (ไม่มีการลบ)
            · <strong>เอกสารที่ออกเลขแล้วจะยังใช้เวอร์ชันเดิมที่ผูกไว้</strong> ไม่เปลี่ยนตาม
          </p>

          {brands.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                ยังไม่มีแบรนด์ — เพิ่มแบรนด์ในแท็บ &ldquo;แบรนด์&rdquo; ก่อน
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              {/* ซ้าย: เลือกชุด + ประวัติเวอร์ชัน */}
              <div className="space-y-3">
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="space-y-1.5">
                      <Label>แบรนด์</Label>
                      <Select value={tplBrand} onValueChange={setTplBrand}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="แบรนด์" /></SelectTrigger>
                        <SelectContent>
                          {brands.map(b => (
                            <SelectItem key={b.code} value={b.code}>{b.code} — {b.name_th}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>ประเภทเอกสาร</Label>
                      <Select value={tplType} onValueChange={v => setTplType(v as DocTypeCode)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="ประเภท" /></SelectTrigger>
                        <SelectContent>
                          {DOC_TYPE_CODES.map(t => (
                            <SelectItem key={t} value={t}>{t} — {DOC_TYPES[t].label.th}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-md border bg-muted/40 p-3 text-sm">
                      {tplActive ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">เวอร์ชัน {tplActive.version}</span>
                            <Badge variant="secondary">ใช้งานอยู่</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            บันทึก {formatDate(tplActive.created_at)} · โดย {tplActive.creator?.full_name || '-'}
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">
                          ยังไม่มีแม่แบบสำหรับชุดนี้ — PDF ใช้ค่าเริ่มต้นตามประเภทเอกสาร
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-0">
                    <div className="border-b px-4 py-2 text-sm font-medium">ประวัติเวอร์ชัน</div>
                    {tplVersions.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">ยังไม่มีประวัติ</p>
                    ) : (
                      <ul className="divide-y">
                        {tplVersions.map(v => (
                          <li key={v.id} className="flex items-center gap-2 px-4 py-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm">v{v.version}</span>
                                {v.is_active && <Badge variant="secondary">ใช้งานอยู่</Badge>}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {formatDate(v.created_at)} · {v.creator?.full_name || '-'}
                              </p>
                            </div>
                            {!v.is_active && (
                              <Button
                                variant="outline" size="sm" disabled={isPending}
                                onClick={() => activateVersion(v.id, v.version)}
                              >
                                <RotateCcw className="size-3.5" />
                                ใช้เวอร์ชันนี้
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ขวา: ฟอร์มแก้ไข — key ทำให้ remount (โหลดค่าใหม่เข้าฟอร์ม+editor)
                  เมื่อเปลี่ยนชุดหรือสลับเวอร์ชัน แทนการ setState ใน effect */}
              <TemplateForm
                key={`${tplBrand}-${tplType}-${tplActive?.id || 'none'}`}
                brandCode={tplBrand}
                docType={tplType}
                initial={tplActive ? templateFieldsFrom(tplActive, tplType) : defaultTemplateFields(tplType)}
                pending={isPending}
                onSave={submitTemplate}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialog: แบรนด์ ─────────────────────────────────────────────────── */}
      <Dialog open={brandOpen} onOpenChange={setBrandOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isNewBrand ? 'เพิ่มแบรนด์' : `แก้ไขแบรนด์ ${brandForm.original_code}`}</DialogTitle>
            <DialogDescription>ข้อมูลนี้ใช้เป็นหัวกระดาษบน PDF ของทุกเอกสารในแบรนด์นี้</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>รหัสแบรนด์ (3 ตัวอักษร)</Label>
              <Input
                value={brandForm.code}
                disabled={codeLocked}
                maxLength={3}
                className="font-mono uppercase"
                onChange={e => setBrandForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))}
              />
              {codeLocked && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  ล็อกแล้ว — มีเอกสารที่ออกเลขด้วยรหัสนี้
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>ลำดับการแสดง</Label>
              <Input
                type="number"
                value={brandForm.sort_order}
                onChange={e => setBrandForm(f => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1">
              <Label>ชื่อ (ไทย) *</Label>
              <Input value={brandForm.name_th} onChange={e => setBrandForm(f => ({ ...f, name_th: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>ชื่อ (อังกฤษ)</Label>
              <Input value={brandForm.name_en || ''} onChange={e => setBrandForm(f => ({ ...f, name_en: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>ที่อยู่ออกเอกสาร</Label>
              <Textarea
                rows={3}
                value={brandForm.address || ''}
                onChange={e => setBrandForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>เลขผู้เสียภาษี (13 หลัก)</Label>
              <Input
                inputMode="numeric"
                maxLength={13}
                className="font-mono"
                value={brandForm.tax_id || ''}
                onChange={e => setBrandForm(f => ({ ...f, tax_id: e.target.value.replace(/\D/g, '') }))}
              />
            </div>
            <div className="space-y-1">
              <Label>สาขา</Label>
              <Input value={brandForm.branch || ''} onChange={e => setBrandForm(f => ({ ...f, branch: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>เบอร์โทร</Label>
              <Input value={brandForm.phone || ''} onChange={e => setBrandForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>อีเมล</Label>
              <Input value={brandForm.email || ''} onChange={e => setBrandForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>เว็บไซต์</Label>
              <Input value={brandForm.website || ''} onChange={e => setBrandForm(f => ({ ...f, website: e.target.value }))} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="font-normal">จดทะเบียน VAT</Label>
              <Switch
                checked={brandForm.vat_registered}
                onCheckedChange={v => setBrandForm(f => ({
                  ...f,
                  vat_registered: v,
                  default_vat_mode: v ? f.default_vat_mode : 'none',
                }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="font-normal">เปิดใช้งาน</Label>
              <Switch
                checked={brandForm.is_active}
                onCheckedChange={v => setBrandForm(f => ({ ...f, is_active: v }))}
              />
            </div>

            <div className="space-y-1">
              <Label>โหมด VAT เริ่มต้น</Label>
              <Select
                value={brandForm.default_vat_mode}
                disabled={!brandForm.vat_registered}
                onValueChange={v => setBrandForm(f => ({ ...f, default_vat_mode: v as VatMode }))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['none', 'exclusive', 'inclusive'] as VatMode[]).map(m => (
                    <SelectItem key={m} value={m}>{VAT_MODE_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!brandForm.vat_registered && (
                <p className="text-xs text-muted-foreground">แบรนด์ที่ไม่ได้จด VAT ถูกบังคับเป็น &quot;ไม่มี VAT&quot;</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>หัก ณ ที่จ่ายเริ่มต้น</Label>
              <Select
                value={String(brandForm.default_wht_rate)}
                onValueChange={v => setBrandForm(f => ({ ...f, default_wht_rate: Number(v) }))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WHT_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>โลโก้ (PNG / JPG / WebP ≤ 2MB)</Label>
              <div className="flex items-center gap-3">
                {brandLogo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={brandLogo} alt="logo" className="h-14 w-14 rounded border object-contain" />
                  : <div className="h-14 w-14 rounded border bg-muted" />}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => onPickLogo(e.target.files?.[0])}
                />
                <Button type="button" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Upload className="size-4" />
                  {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลดโลโก้'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">อัปโหลดแล้วบันทึกทันที (ต้องมีรหัสแบรนด์ก่อน)</p>
            </div>
          </div>

          {brandError && <p className="text-sm text-red-600 dark:text-red-400">{brandError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBrandOpen(false)}>ยกเลิก</Button>
            <Button onClick={submitBrand} disabled={isPending}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: ตัวนับ ─────────────────────────────────────────────────── */}
      <Dialog open={counterOpen} onOpenChange={setCounterOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{counterNew ? 'เพิ่มชุดตัวนับ' : 'แก้ไขเลขล่าสุด'}</DialogTitle>
            <DialogDescription>
              {counterNew
                ? 'สร้างชุดตัวนับใหม่สำหรับ แบรนด์ × ประเภท × งวด'
                : `${counterForm.brand_code} · ${typeLabel(counterForm.doc_type)} · งวด ${counterForm.period}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {counterNew && (
              <>
                <div className="space-y-1">
                  <Label>แบรนด์</Label>
                  <Select
                    value={counterForm.brand_code}
                    onValueChange={v => setCounterForm(f => ({ ...f, brand_code: v }))}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="เลือกแบรนด์" /></SelectTrigger>
                    <SelectContent>
                      {brands.map(b => <SelectItem key={b.code} value={b.code}>{b.code} — {b.name_th}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>ประเภทเอกสาร</Label>
                  <Select
                    value={counterForm.doc_type}
                    onValueChange={v => setCounterForm(f => ({ ...f, doc_type: v }))}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="เลือกประเภท" /></SelectTrigger>
                    <SelectContent>
                      {DOC_TYPE_CODES.map(t => (
                        <SelectItem key={t} value={t}>{t} — {DOC_TYPES[t].label.th}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>งวด</Label>
                  <Input
                    className="font-mono"
                    value={counterForm.period}
                    onChange={e => setCounterForm(f => ({ ...f, period: e.target.value.replace(/\D/g, '') }))}
                  />
                  <p className="text-xs text-muted-foreground">{periodHint}</p>
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label>เลขล่าสุด</Label>
              <Input
                type="number"
                min={0}
                value={counterForm.last_number}
                onChange={e => setCounterForm(f => ({ ...f, last_number: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
              />
              <p className="text-xs text-muted-foreground">เอกสารใบถัดไปจะได้เลข {counterForm.last_number + 1}</p>
              {!counterNew && counterForm.last_number < counterBefore && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  ลดเลขต่ำกว่าที่ออกไปแล้วไม่ได้ — ระบบจะปฏิเสธเพื่อกันเลขซ้ำ
                </p>
              )}
            </div>
          </div>

          {counterError && <p className="text-sm text-red-600 dark:text-red-400">{counterError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCounterOpen(false)}>ยกเลิก</Button>
            <Button onClick={submitCounter} disabled={isPending}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================================
// ฟอร์มแก้แม่แบบ — แยกออกมาเพื่อให้ parent สั่ง remount ด้วย `key` ได้
// (React Compiler ห้าม setState ใน effect; remount ง่ายกว่าและรีเซ็ต TipTap ให้ด้วย)
// ============================================================================

function TemplateForm({
  brandCode, docType, initial, pending, onSave,
}: {
  brandCode: string
  docType: DocTypeCode
  initial: TemplateFields
  pending: boolean
  onSave: (fields: TemplateFields) => void
}) {
  const [form, setForm] = useState<TemplateFields>(initial)
  const [previewing, setPreviewing] = useState(false)

  const set = (patch: Partial<TemplateFields>) => setForm(f => ({ ...f, ...patch }))

  async function preview() {
    if (!brandCode) return
    // เปิดแท็บก่อน await ไม่งั้นโดน popup blocker (ต้องอยู่ใน user gesture)
    const win = window.open('', '_blank')
    setPreviewing(true)
    try {
      const res = await fetch('/api/pdf/document/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_code: brandCode, doc_type: docType, ...form }),
      })
      if (!res.ok) {
        win?.close()
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(j.error || 'สร้าง PDF ตัวอย่างไม่สำเร็จ')
        return
      }
      const url = URL.createObjectURL(await res.blob())
      if (win) win.location.href = url
      else window.open(url, '_blank')
    } catch {
      win?.close()
      toast.error('สร้าง PDF ตัวอย่างไม่สำเร็จ')
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label>ชื่อหัวเอกสาร</Label>
          <Input
            value={form.title}
            onChange={e => set({ title: e.target.value })}
            placeholder={defaultTemplateFields(docType).title}
          />
        </div>

        <div className="space-y-1.5">
          <Label>เงื่อนไข / หมายเหตุมาตรฐาน</Label>
          <DocRichTextEditor
            value={form.terms}
            onChange={html => set({ terms: html })}
            placeholder="เช่น ราคานี้ยังไม่รวมค่าเดินทางต่างจังหวัด…"
          />
        </div>

        {PAYMENT_INFO_TYPES.includes(docType) && (
          <div className="space-y-1.5">
            <Label>ข้อมูลการชำระเงิน</Label>
            <Textarea
              rows={3}
              value={form.payment_info}
              onChange={e => set({ payment_info: e.target.value })}
              placeholder="ธนาคาร / เลขที่บัญชี / ชื่อบัญชี"
            />
            <p className="text-xs text-muted-foreground">แสดงเฉพาะใบเสนอราคา (QT) และใบแจ้งหนี้ (IV)</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>ป้ายช่องลงนามที่ 1</Label>
            <Input value={form.signer_label_1} onChange={e => set({ signer_label_1: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>ป้ายช่องลงนามที่ 2</Label>
            <Input value={form.signer_label_2} onChange={e => set({ signer_label_2: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>ข้อความท้ายกระดาษ</Label>
          <Input
            value={form.footer}
            onChange={e => set({ footer: e.target.value })}
            placeholder="เช่น เอกสารนี้ออกโดยระบบ Document Control"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          เอกสารที่ออกเลขแล้วจะยังใช้เวอร์ชันเดิมที่ผูกไว้ — การบันทึกนี้มีผลกับเอกสารที่ออกเลขหลังจากนี้เท่านั้น
        </p>

        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={preview} disabled={previewing || !brandCode}>
            <Eye className="size-4" />
            {previewing ? 'กำลังสร้าง…' : 'ดูตัวอย่าง PDF'}
          </Button>
          <Button onClick={() => onSave(form)} disabled={pending || !brandCode}>
            <Save className="size-4" />
            บันทึกเป็นเวอร์ชันใหม่และใช้งาน
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
