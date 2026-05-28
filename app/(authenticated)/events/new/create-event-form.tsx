'use client'

import { useActionState, useState } from 'react'
import { createEvent } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Loader2, Users, Info, X, Plus } from "lucide-react"
import Link from 'next/link'
import { ThaiDatePicker } from '@/components/thai-date-picker'
import { useLanguage } from '@/contexts/language-context'
import { EVENT_PHASES } from '../../crm/event-phases'

interface Profile {
  id: string
  full_name: string | null
  role: string
}

interface StaffRole {
  value: string
  label_th: string
  label_en: string
  color: string | null
}

interface StaffAssignment {
  user_id: string
  full_name: string
  role: string
}

interface Prefill {
  name: string
  location: string
  eventDate: string
  sellerNames: string[]
  staffNames: string[]
  crmLeadId: string
  staffAssignments?: StaffAssignment[]
}

export default function CreateEventForm({
  availableKits,
  profiles,
  prefill,
  staffRoles = [],
}: {
  availableKits: any[]
  profiles: Profile[]
  prefill?: Prefill
  staffRoles?: StaffRole[]
}) {
  const { t, lang } = useLanguage()
  const locale = lang || 'th'
  const [state, formAction, isPending] = useActionState(createEvent, { error: '' })

  // Staff assignments — structured (user_id + role)
  const [assignments, setAssignments] = useState<StaffAssignment[]>(
    prefill?.staffAssignments || []
  )
  const [selectUser, setSelectUser] = useState('')
  const [selectRole, setSelectRole] = useState('')

  // Event phase — defaults to 'main'; user can pick setup / teardown / delivery / other for sub-events
  const [phase, setPhase] = useState<string>('main')

  const addAssignment = () => {
    if (!selectUser || !selectRole) return
    if (assignments.some(a => a.user_id === selectUser && a.role === selectRole)) return
    const profile = profiles.find(p => p.id === selectUser)
    setAssignments(prev => [...prev, {
      user_id: selectUser,
      full_name: profile?.full_name || selectUser,
      role: selectRole,
    }])
    setSelectUser('')
    setSelectRole('')
  }

  const removeAssignment = (idx: number) => {
    setAssignments(prev => prev.filter((_, i) => i !== idx))
  }

  const getRoleLabel = (roleValue: string) => {
    const r = staffRoles.find(s => s.value === roleValue)
    if (!r) return roleValue
    return locale === 'th' ? r.label_th : r.label_en
  }
  const getRoleColor = (roleValue: string) => {
    return staffRoles.find(s => s.value === roleValue)?.color || '#6b7280'
  }

  const Label = ({ children, htmlFor, className }: any) => (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>{children}</label>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/events">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-3xl font-bold tracking-tight">{t.events.newTitle}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.events.newTitle}</CardTitle>
          <CardDescription>{t.events.newSubtitle}</CardDescription>
        </CardHeader>
         <form action={formAction}>
          {/* Hidden field: CRM lead ID for linking back */}
          {prefill?.crmLeadId && (
            <input type="hidden" name="from_crm" value={prefill.crmLeadId} />
          )}
          {/* Hidden field: structured staff assignments as JSON */}
          <input type="hidden" name="staff_assignments" value={JSON.stringify(assignments)} />
          {/* Backward compat: staff as comma-joined names */}
          <input type="hidden" name="staff" value={assignments.map(a => a.full_name).join(', ')} />
          {/* Event phase (carried to job_cost_events on import) */}
          <input type="hidden" name="phase" value={phase} />

          <CardContent className="space-y-6">
            {/* CRM prefill banner */}
            {prefill && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800">
                <Info className="h-4 w-4 text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
                <p className="text-xs text-sky-700 dark:text-sky-300">
                  ข้อมูลถูกดึงจาก CRM อัตโนมัติ — ตรวจสอบแล้วกด &quot;สร้างอีเวนต์&quot;
                </p>
              </div>
            )}

            {/* ชื่ออีเวนต์ */}
            <div className="space-y-2">
              <Label htmlFor="name">{t.events.fields.name}</Label>
              <Input id="name" name="name" placeholder={t.events.fields.name} required defaultValue={prefill?.name || ''} />
            </div>

            {/* สถานที่ */}
            <div className="space-y-2">
              <Label htmlFor="location">{t.events.fields.location}</Label>
              <Input id="location" name="location" placeholder={t.events.fields.location} defaultValue={prefill?.location || ''} />
            </div>

            {/* วันและเวลา */}
            <div className="space-y-2">
              <Label htmlFor="event_date">{t.events.fields.date}</Label>
              <ThaiDatePicker name="event_date" defaultValue={prefill?.eventDate ? new Date(prefill.eventDate) : undefined} />
            </div>

            {/* Event Phase — for sub-event classification (setup/main/teardown/delivery) */}
            <div className="space-y-2">
              <Label htmlFor="phase">
                {locale === 'th' ? 'ประเภทของอีเวนต์ (Phase)' : 'Event Phase'}
              </Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger id="phase" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_PHASES.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="inline-flex items-center gap-1.5">
                        <span>{p.icon}</span>
                        <span>{locale === 'th' ? p.labelTh : p.labelEn}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-400">
                {locale === 'th'
                  ? 'เลือก "วันงาน" สำหรับงานหลัก / "เซ็ตอัพ" / "รื้อถอน" สำหรับงานช่วงก่อนหลัง'
                  : 'Pick "Main" for the main event day; use Setup/Teardown for prep/break-down sub-events'}
              </p>
            </div>

            {/* ===== Staff & Roles (Junction Table) ===== */}
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-amber-500" />
                {locale === 'th' ? 'ทีมงาน & หน้าที่' : 'Staff & Roles'}
              </Label>

              {/* Add row */}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-zinc-400">{locale === 'th' ? 'เลือกพนักงาน' : 'Select Staff'}</label>
                  <Select value={selectUser} onValueChange={setSelectUser}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={locale === 'th' ? 'เลือกพนักงาน...' : 'Select staff...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name || p.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-zinc-400">{locale === 'th' ? 'หน้าที่' : 'Role'}</label>
                  <Select value={selectRole} onValueChange={setSelectRole}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={locale === 'th' ? 'เลือกหน้าที่...' : 'Select role...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {staffRoles.map(role => (
                        <SelectItem key={role.value} value={role.value}>
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color || '#6b7280' }} />
                            {locale === 'th' ? role.label_th : role.label_en}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-3"
                  onClick={addAssignment}
                  disabled={!selectUser || !selectRole}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {locale === 'th' ? 'เพิ่ม' : 'Add'}
                </Button>
              </div>

              {/* Assigned staff list */}
              {assignments.length > 0 && (
                <div className="space-y-1.5">
                  {assignments.map((a, idx) => (
                    <div
                      key={`${a.user_id}-${a.role}-${idx}`}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 group hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 shrink-0">
                          {(a.full_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {a.full_name}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] shrink-0"
                          style={{ backgroundColor: getRoleColor(a.role) + '20', color: getRoleColor(a.role), borderColor: getRoleColor(a.role) + '40' }}
                        >
                          {getRoleLabel(a.role)}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                        onClick={() => removeAssignment(idx)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {assignments.length === 0 && (
                <p className="text-xs text-zinc-400 text-center py-2">
                  {locale === 'th' ? 'ยังไม่มีทีมงาน — เพิ่มพนักงานและเลือกหน้าที่' : 'No staff assigned — add staff and select a role'}
                </p>
              )}
            </div>

            {/* จัดการ กระเป๋า */}
            <div className="space-y-4">
               <Label>{t.common.actions} {t.kits.title}</Label>
               {availableKits.length === 0 ? (
                   <p className="text-sm text-zinc-500 italic">{t.common.noData}</p>
               ) : (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded-lg p-4 max-h-[200px] overflow-y-auto">
                       {availableKits.map((kit) => (
                           <div key={kit.id} className="flex items-center space-x-2">
                               <Checkbox id={`kit-${kit.id}`} name="kits" value={kit.id} />
                               <Label htmlFor={`kit-${kit.id}`} className="font-normal cursor-pointer">
                                   {kit.name}
                               </Label>
                           </div>
                       ))}
                   </div>
               )}
            </div>

            {state?.error && (
              <p className="text-sm text-red-500">{state.error}</p>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Link href="/events">
              <Button variant="outline" type="button">{t.common.cancel}</Button>
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t.events.createEvent}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
