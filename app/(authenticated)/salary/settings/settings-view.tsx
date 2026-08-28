'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Plus, Save, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatThaiDate } from '@/lib/thai-date'
import { EMPLOYMENT_LABEL, fmtMoney } from '../format'
import type { EmploymentType } from '../compute'
import {
  createSalaryDuty, updateSalaryDuty, updateSalarySettings, upsertSalaryProfile,
  type DutyFormInput, type SalaryDutyRow, type SalaryProfileListRow, type SalarySettings,
} from './actions'

interface Props {
  settings: SalarySettings
  duties: SalaryDutyRow[]
  profiles: SalaryProfileListRow[]
  departments: string[]
}

const PAY_MODE_LABEL: Record<DutyFormInput['pay_mode'], string> = {
  per_checkin: 'คิดต่อครั้ง',
  manual_daily: 'กรอกมือรายวัน',
}

const EMPTY_DUTY: DutyFormInput = {
  code: '',
  name_th: '',
  rate: 0,
  pay_mode: 'per_checkin',
  is_active: true,
  sort_order: 0,
}

const NO_DEPARTMENT = '__none__'
const ALL_DEPARTMENTS = '__all__'

function displayName(p: SalaryProfileListRow) {
  return p.full_name || p.nickname || '(ไม่มีชื่อ)'
}

function sameDuty(a: SalaryDutyRow, b: SalaryDutyRow) {
  return a.name_th === b.name_th
    && Number(a.rate) === Number(b.rate)
    && a.pay_mode === b.pay_mode
    && a.is_active === b.is_active
    && Number(a.sort_order) === Number(b.sort_order)
}

export default function SettingsView({ settings, duties, profiles, departments }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ── 1. ค่าตั้งค่างวด ───────────────────────────────────────────────────────
  const [cutoffDay, setCutoffDay] = useState(String(settings.cutoff_day))
  const [oopRate, setOopRate] = useState(String(settings.out_of_province_rate))

  const settingsDirty =
    Number(cutoffDay) !== settings.cutoff_day || Number(oopRate) !== settings.out_of_province_rate

  function saveSettings() {
    startTransition(async () => {
      const res = await updateSalarySettings({
        cutoff_day: Number(cutoffDay),
        out_of_province_rate: Number(oopRate),
      })
      if (res.error) { toast.error(res.error); return }
      toast.success('บันทึกค่าตั้งค่างวดแล้ว')
      router.refresh()
    })
  }

  // ── 2. Rate card ─────────────────────────────────────────────────────────
  // แก้ในตารางได้เลย — ปุ่มบันทึกของแถวขึ้นเมื่อค่าต่างจากที่บันทึกไว้
  // เก็บเฉพาะ "สิ่งที่แก้" ไม่ copy ทั้งตารางลง state → หลัง router.refresh()
  // ตารางเห็นข้อมูลใหม่จาก server ทันที (รวมหน้าที่ที่เพิ่งเพิ่ม)
  const [dutyEdits, setDutyEdits] = useState<Record<string, Partial<SalaryDutyRow>>>({})
  const [dutyOpen, setDutyOpen] = useState(false)
  const [newDuty, setNewDuty] = useState<DutyFormInput>(EMPTY_DUTY)

  const dutyRows = useMemo(
    () => duties.map(d => ({ ...d, ...(dutyEdits[d.code] || {}) })),
    [duties, dutyEdits]
  )
  const originalDuties = useMemo(() => new Map(duties.map(d => [d.code, d])), [duties])

  function patchDuty(code: string, patch: Partial<SalaryDutyRow>) {
    setDutyEdits(e => ({ ...e, [code]: { ...(e[code] || {}), ...patch } }))
  }

  function saveDuty(row: SalaryDutyRow) {
    startTransition(async () => {
      const res = await updateSalaryDuty({
        code: row.code,
        name_th: row.name_th,
        rate: Number(row.rate),
        pay_mode: row.pay_mode,
        is_active: row.is_active,
        sort_order: Number(row.sort_order),
      })
      if (res.error) { toast.error(res.error); return }
      toast.success(`บันทึก "${row.name_th}" แล้ว`)
      setDutyEdits(e => {
        const next = { ...e }
        delete next[row.code]
        return next
      })
      router.refresh()
    })
  }

  function submitNewDuty() {
    startTransition(async () => {
      const res = await createSalaryDuty(newDuty)
      if (res.error) { toast.error(res.error); return }
      toast.success('เพิ่มหน้าที่แล้ว')
      setDutyOpen(false)
      setNewDuty(EMPTY_DUTY)
      router.refresh()
    })
  }

  // ── 3. โปรไฟล์เงินเดือน ───────────────────────────────────────────────────
  const [dept, setDept] = useState(ALL_DEPARTMENTS)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<SalaryProfileListRow | null>(null)

  const filteredProfiles = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return profiles.filter(p => {
      if (dept === NO_DEPARTMENT && p.department) return false
      if (dept !== ALL_DEPARTMENTS && dept !== NO_DEPARTMENT && p.department !== dept) return false
      if (!needle) return true
      return `${p.full_name || ''} ${p.nickname || ''} ${p.position || ''}`.toLowerCase().includes(needle)
    })
  }, [profiles, dept, q])

  const unconfiguredCount = profiles.filter(p => !p.configured).length

  function saveProfile() {
    if (!editing) return
    const row = editing
    startTransition(async () => {
      const res = await upsertSalaryProfile({
        user_id: row.user_id,
        employment_type: row.employment_type,
        base_salary: Number(row.base_salary),
        work_start: row.work_start,
        work_end: row.work_end,
        ot_rate: Number(row.ot_rate),
        position: row.position,
        start_date: row.start_date,
      })
      if (res.error) { toast.error(res.error); return }
      toast.success(`บันทึกโปรไฟล์เงินเดือนของ ${displayName(row)} แล้ว`)
      setEditing(null)
      router.refresh()
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">ตั้งค่าเงินเดือน</h1>
        <p className="text-sm text-muted-foreground">
          วันตัดรอบ · rate card หน้าที่หน้างาน · โปรไฟล์เงินเดือนต่อคน
        </p>
      </div>

      <Tabs defaultValue="period">
        <TabsList>
          <TabsTrigger value="period">ค่าตั้งค่างวด</TabsTrigger>
          <TabsTrigger value="duties">หน้าที่หน้างาน</TabsTrigger>
          <TabsTrigger value="profiles">โปรไฟล์เงินเดือน</TabsTrigger>
        </TabsList>

        {/* ── ค่าตั้งค่างวด ─────────────────────────────────────────────────── */}
        <TabsContent value="period" className="space-y-3">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cutoff">วันตัดรอบ</Label>
                  <Input
                    id="cutoff"
                    type="number"
                    min={1}
                    max={28}
                    step={1}
                    value={cutoffDay}
                    onChange={e => setCutoffDay(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    จำนวนเต็ม 1–28 · งวด &ldquo;สิงหาคม&rdquo; ที่วันตัดรอบ {Number(cutoffDay) || settings.cutoff_day} =
                    วันที่ {(Number(cutoffDay) || settings.cutoff_day) + 1} ก.ค. ถึง {Number(cutoffDay) || settings.cutoff_day} ส.ค.
                    · เปลี่ยนแล้วมีผลกับงวดที่เปิดใหม่เท่านั้น
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oop">อัตราเบิ้ลต่างจังหวัด (บาท/ครั้ง)</Label>
                  <Input
                    id="oop"
                    type="number"
                    min={0}
                    step="0.01"
                    value={oopRate}
                    onChange={e => setOopRate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    บวกให้ต่อเช็คอินหน้างานที่ admin ติ๊กว่าเป็นงานต่างจังหวัด
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveSettings} disabled={isPending || !settingsDirty}>
                  <Save className="size-4" />
                  บันทึก
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── หน้าที่หน้างาน (rate card) ────────────────────────────────────── */}
        <TabsContent value="duties" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              รหัสหน้าที่แก้ไม่ได้หลังสร้าง (ถูกอ้างในเช็คอินและสลิปที่ปิดงวดแล้ว) — เลิกใช้ให้ปิดสวิตช์แทนการลบ
            </p>
            <Button onClick={() => { setNewDuty(EMPTY_DUTY); setDutyOpen(true) }}>
              <Plus className="size-4" />
              เพิ่มหน้าที่
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">รหัส</TableHead>
                    <TableHead>ชื่อหน้าที่</TableHead>
                    <TableHead className="w-32">อัตรา (บาท)</TableHead>
                    <TableHead className="w-44">โหมดการจ่าย</TableHead>
                    <TableHead className="w-24">ลำดับ</TableHead>
                    <TableHead className="w-24">เปิดใช้งาน</TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dutyRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        ยังไม่มีหน้าที่หน้างาน
                      </TableCell>
                    </TableRow>
                  )}
                  {dutyRows.map(d => {
                    const original = originalDuties.get(d.code)
                    const dirty = !original || !sameDuty(original, d)
                    return (
                      <TableRow key={d.code}>
                        <TableCell className="font-mono text-xs">{d.code}</TableCell>
                        <TableCell>
                          <Input
                            value={d.name_th}
                            disabled={isPending}
                            onChange={e => patchDuty(d.code, { name_th: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={d.rate}
                            disabled={isPending || d.pay_mode === 'manual_daily'}
                            onChange={e => patchDuty(d.code, { rate: Number(e.target.value) })}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={d.pay_mode}
                            onValueChange={v =>
                              patchDuty(d.code, { pay_mode: v as DutyFormInput['pay_mode'] })
                            }
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="per_checkin">{PAY_MODE_LABEL.per_checkin}</SelectItem>
                              <SelectItem value="manual_daily">{PAY_MODE_LABEL.manual_daily}</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step={1}
                            value={d.sort_order}
                            disabled={isPending}
                            onChange={e => patchDuty(d.code, { sort_order: Number(e.target.value) })}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={d.is_active}
                            disabled={isPending}
                            onCheckedChange={v => patchDuty(d.code, { is_active: v })}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={dirty ? 'default' : 'outline'}
                            disabled={isPending || !dirty}
                            onClick={() => saveDuty(d)}
                          >
                            <Save className="size-3.5" />
                            บันทึก
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── โปรไฟล์เงินเดือนต่อคน ────────────────────────────────────────── */}
        <TabsContent value="profiles" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-56"><SelectValue placeholder="แผนก" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DEPARTMENTS}>ทุกแผนก</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
                <SelectItem value={NO_DEPARTMENT}>ยังไม่ระบุแผนก</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative min-w-50 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="ค้นหาชื่อ / ตำแหน่ง"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>

            {unconfiguredCount > 0 && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-500"
              >
                ยังไม่ตั้งค่า {unconfiguredCount} คน
              </Badge>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ชื่อ</TableHead>
                    <TableHead>ชื่อเล่น</TableHead>
                    <TableHead>แผนก</TableHead>
                    <TableHead>ประเภทการจ้าง</TableHead>
                    <TableHead className="text-right">เงินเดือนฐาน</TableHead>
                    <TableHead>เวลาทำงาน</TableHead>
                    <TableHead className="text-right">อัตรา OT</TableHead>
                    <TableHead>ตำแหน่ง</TableHead>
                    <TableHead>วันเริ่มงาน</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                        ไม่พบผู้ใช้ที่ตรงกับตัวกรอง
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredProfiles.map(p => (
                    <TableRow key={p.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{displayName(p)}</span>
                          {!p.configured && (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-500"
                            >
                              ยังไม่ตั้งค่า
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{p.nickname || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{p.department || '-'}</TableCell>
                      <TableCell>
                        {p.configured ? EMPLOYMENT_LABEL[p.employment_type] : '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.configured ? fmtMoney(p.base_salary) : '-'}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {p.configured ? `${p.work_start} – ${p.work_end}` : '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.configured ? fmtMoney(p.ot_rate) : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.position || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.start_date ? formatThaiDate(p.start_date) : '-'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setEditing({ ...p })}>
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
      </Tabs>

      {/* ── Dialog: เพิ่มหน้าที่ ─────────────────────────────────────────────── */}
      <Dialog open={dutyOpen} onOpenChange={setDutyOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>เพิ่มหน้าที่หน้างาน</DialogTitle>
            <DialogDescription>
              รหัสใช้อ้างในเช็คอินและสลิป — ตั้งแล้วแก้ไม่ได้
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>รหัส (a-z, 0-9, _)</Label>
              <Input
                className="font-mono"
                placeholder="check_up"
                value={newDuty.code}
                onChange={e =>
                  setNewDuty(f => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>ชื่อหน้าที่</Label>
              <Input
                placeholder="เช็คอัพ"
                value={newDuty.name_th}
                onChange={e => setNewDuty(f => ({ ...f, name_th: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>โหมดการจ่าย</Label>
              <Select
                value={newDuty.pay_mode}
                onValueChange={v =>
                  setNewDuty(f => ({ ...f, pay_mode: v as DutyFormInput['pay_mode'] }))
                }
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_checkin">{PAY_MODE_LABEL.per_checkin}</SelectItem>
                  <SelectItem value="manual_daily">{PAY_MODE_LABEL.manual_daily}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>อัตรา (บาท/ครั้ง)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                disabled={newDuty.pay_mode === 'manual_daily'}
                value={newDuty.rate}
                onChange={e => setNewDuty(f => ({ ...f, rate: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label>ลำดับการแสดง</Label>
              <Input
                type="number"
                step={1}
                value={newDuty.sort_order}
                onChange={e => setNewDuty(f => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={newDuty.is_active}
                onCheckedChange={v => setNewDuty(f => ({ ...f, is_active: v }))}
              />
              <Label>เปิดใช้งาน</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDutyOpen(false)} disabled={isPending}>
              ยกเลิก
            </Button>
            <Button onClick={submitNewDuty} disabled={isPending}>
              เพิ่มหน้าที่
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: โปรไฟล์เงินเดือน ─────────────────────────────────────────── */}
      <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>โปรไฟล์เงินเดือน — {editing ? displayName(editing) : ''}</DialogTitle>
            <DialogDescription>
              ค่าที่เครื่องคำนวณใช้ต่อคน · ฟรีแลนซ์ไม่ได้เงินเดือนฐาน
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>ประเภทการจ้าง</Label>
                <Select
                  value={editing.employment_type}
                  onValueChange={v =>
                    setEditing(f => (f ? { ...f, employment_type: v as EmploymentType } : f))
                  }
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fulltime">{EMPLOYMENT_LABEL.fulltime}</SelectItem>
                    <SelectItem value="freelance">{EMPLOYMENT_LABEL.freelance}</SelectItem>
                    <SelectItem value="intern">{EMPLOYMENT_LABEL.intern}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>เงินเดือนฐาน (บาท/งวด)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={editing.employment_type === 'freelance'}
                  value={editing.base_salary}
                  onChange={e =>
                    setEditing(f => (f ? { ...f, base_salary: Number(e.target.value) } : f))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>เวลาเริ่มงาน</Label>
                <Input
                  type="time"
                  value={editing.work_start}
                  onChange={e => setEditing(f => (f ? { ...f, work_start: e.target.value } : f))}
                />
              </div>
              <div className="space-y-1">
                <Label>เวลาเลิกงาน</Label>
                <Input
                  type="time"
                  value={editing.work_end}
                  onChange={e => setEditing(f => (f ? { ...f, work_end: e.target.value } : f))}
                />
              </div>
              <div className="space-y-1">
                <Label>อัตรา OT (บาท/ชม.)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.ot_rate}
                  onChange={e => setEditing(f => (f ? { ...f, ot_rate: Number(e.target.value) } : f))}
                />
              </div>
              <div className="space-y-1">
                <Label>ตำแหน่ง</Label>
                <Input
                  value={editing.position || ''}
                  onChange={e => setEditing(f => (f ? { ...f, position: e.target.value } : f))}
                />
              </div>
              <div className="space-y-1">
                <Label>วันเริ่มงาน</Label>
                <Input
                  type="date"
                  value={editing.start_date || ''}
                  onChange={e => setEditing(f => (f ? { ...f, start_date: e.target.value } : f))}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={isPending}>
              ยกเลิก
            </Button>
            <Button onClick={saveProfile} disabled={isPending}>
              <Save className="size-4" />
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
