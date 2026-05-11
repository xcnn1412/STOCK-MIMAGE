'use client'

import { useActionState, useState, useTransition } from 'react'
import { updateEvent, linkEventToCrm, unlinkEventFromCrm } from '../../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Loader2, Users, X, Plus, Link2, Unlink, Check, ChevronsUpDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import Link from 'next/link'
import { useLanguage } from '@/contexts/language-context'
import EventsLogSheet, { type EventLog } from '../../events-log-sheet'
import type { Event, Kit } from '@/types'

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

interface CrmLead {
  id: string
  customer_name: string | null
  event_date: string | null
  package_name: string | null
}

export default function EditEventForm({
  event,
  availableKits,
  assignedKitIds,
  profiles,
  staffAssignments: initialStaffAssignments = [],
  staffRoles = [],
  crmLeads = [],
  logs = [],
}: {
  event: Event
  availableKits: Kit[]
  assignedKitIds: string[]
  profiles: Profile[]
  staffAssignments?: StaffAssignment[]
  staffRoles?: StaffRole[]
  crmLeads?: CrmLead[]
  logs?: EventLog[]
}) {
  const { t, lang } = useLanguage()
  const locale = lang || 'th'
  const [state, formAction, isPending] = useActionState(updateEvent.bind(null, event.id), { error: '' })
  const [isLinking, startLinkTransition] = useTransition()

  // CRM linking state
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [openCrmSelect, setOpenCrmSelect] = useState(false)
  const isLinkedToCrm = !!event.crm_lead_id
  const linkedLead = crmLeads.find(l => l.id === event.crm_lead_id)

  const handleLinkCrm = () => {
    if (!selectedLeadId) return
    startLinkTransition(async () => {
      await linkEventToCrm(event.id, selectedLeadId)
    })
  }
  const handleUnlinkCrm = () => {
    if (!confirm(locale === 'th' ? 'ยกเลิกการเชื่อมกับ CRM นี้?' : 'Unlink this CRM lead?')) return
    startLinkTransition(async () => {
      await unlinkEventFromCrm(event.id)
    })
  }

  const Label = ({ children, htmlFor, className }: any) => (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>{children}</label>
  )

  // Staff assignments — structured (user_id + role)
  const [assignments, setAssignments] = useState<StaffAssignment[]>(initialStaffAssignments)
  const [selectUser, setSelectUser] = useState('')
  const [selectRole, setSelectRole] = useState('')

  // Clean valid assigned kit IDs
  const initialChecked = new Set(assignedKitIds)
  const [checkedKits, setCheckedKits] = useState<Set<string>>(initialChecked)

  const handleCheckChange = (kitId: string, checked: boolean) => {
    const next = new Set(checkedKits)
    if (checked) {
      next.add(kitId)
    } else {
      next.delete(kitId)
    }
    setCheckedKits(next)
  }

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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/events">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight flex-1 min-w-0 truncate">{t.events.editTitle}</h2>
        <EventsLogSheet logs={logs} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.common.details}</CardTitle>
          <CardDescription>{t.events.editTitle}: {event.name}</CardDescription>
        </CardHeader>
        <form action={formAction}>
          {/* Hidden: structured staff assignments as JSON (only real UUIDs) */}
          <input type="hidden" name="staff_assignments" value={JSON.stringify(assignments.filter(a => !a.user_id.startsWith('legacy_')))} />
          {/* Backward compat: staff as comma-joined names */}
          <input type="hidden" name="staff" value={assignments.map(a => a.full_name).join(', ')} />

          <CardContent className="space-y-6">
            {/* === CRM Linking Section === */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Link2 className="h-4 w-4 text-blue-500" />
                {locale === 'th' ? 'เชื่อมกับ CRM' : 'Link to CRM'}
              </Label>
              {isLinkedToCrm ? (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <Link2 className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100 truncate">
                      {linkedLead?.customer_name || event.crm_lead_id}
                    </p>
                    {linkedLead?.package_name && (
                      <p className="text-xs text-blue-600 dark:text-blue-400">{linkedLead.package_name}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] shrink-0">
                    {locale === 'th' ? 'เชื่อมแล้ว' : 'Linked'}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    onClick={handleUnlinkCrm}
                    disabled={isLinking}
                  >
                    <Unlink className="h-3.5 w-3.5 mr-1" />
                    {locale === 'th' ? 'ยกเลิก' : 'Unlink'}
                  </Button>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1 flex flex-col items-start gap-1 w-full justify-end min-h-[36px]">
                    <label className="text-[10px] text-zinc-400">{locale === 'th' ? 'ค้นหา CRM Lead' : 'Search CRM Lead'}</label>
                    <Popover open={openCrmSelect} onOpenChange={setOpenCrmSelect}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openCrmSelect}
                          className="w-full justify-between h-9 text-sm font-normal"
                        >
                          {selectedLeadId
                            ? <span className="truncate">
                                {crmLeads.find((lead) => lead.id === selectedLeadId)?.customer_name || 'ไม่ระบุชื่อ'}
                              </span>
                            : <span className="text-zinc-500">{locale === 'th' ? 'ค้นหาจากชื่อ แพ็กเกจ วันที่...' : 'Search by name, package, date...'}</span>}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0 max-w-sm" align="start">
                        <Command
                           filter={(value, search) => {
                             const searchTerms = search.toLowerCase().split(' ')
                             const matchScore = searchTerms.every(term => value.toLowerCase().includes(term))
                             return matchScore ? 1 : 0
                           }}
                        >
                          <CommandInput placeholder={locale === 'th' ? 'ค้นหา CRM Lead...' : 'Search CRM Lead...'} />
                          <CommandList>
                            <CommandEmpty>{locale === 'th' ? 'ไม่พบข้อมูล' : 'No lead found.'}</CommandEmpty>
                            <CommandGroup>
                              {crmLeads.map((lead) => {
                                const searchString = `${lead.customer_name || ''} ${lead.package_name || ''} ${lead.event_date || ''}`
                                return (
                                  <CommandItem
                                    key={lead.id}
                                    value={searchString + `|${lead.id}`} // Store ID inside the value to ensure uniqueness and searchability
                                    onSelect={() => {
                                      setSelectedLeadId(lead.id === selectedLeadId ? "" : lead.id)
                                      setOpenCrmSelect(false)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        selectedLeadId === lead.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <span className="flex items-center gap-2 truncate">
                                      <span className="font-medium truncate">{lead.customer_name || 'ไม่ระบุชื่อ'}</span>
                                      {lead.package_name && (
                                        <span className="text-xs text-zinc-400 shrink-0">• {lead.package_name}</span>
                                      )}
                                      {lead.event_date && (
                                        <span className="text-xs text-zinc-400 shrink-0">• {lead.event_date}</span>
                                      )}
                                    </span>
                                  </CommandItem>
                                )
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 px-4 shrink-0"
                    onClick={handleLinkCrm}
                    disabled={!selectedLeadId || isLinking}
                  >
                    {isLinking ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
                    {locale === 'th' ? 'เชื่อม' : 'Link'}
                  </Button>
                </div>
              )}
            </div>
            {/* ชื่ออีเวนต์ */}
            <div className="space-y-2">
              <Label htmlFor="name">{t.events.fields.name}</Label>
              <Input id="name" name="name" defaultValue={event.name} required />
            </div>

            {/* สถานที่ */}
            <div className="space-y-2">
              <Label htmlFor="location">{t.events.fields.location}</Label>
              <Input id="location" name="location" defaultValue={event.location || ''} />
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
                        {a.user_id.startsWith('legacy_') && (
                          <Badge variant="outline" className="text-[9px] shrink-0 border-amber-300 text-amber-600 dark:text-amber-400">
                            {locale === 'th' ? 'ข้อมูลเก่า' : 'Legacy'}
                          </Badge>
                        )}
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
               <Label>{t.kits.title}</Label>
               {(availableKits.length === 0 && assignedKitIds.length === 0) ? (
                   <p className="text-sm text-zinc-500 italic">{t.common.noData}</p>
               ) : (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded-lg p-4 max-h-[300px] overflow-y-auto">
                       {availableKits.map((kit) => (
                           <div key={kit.id} className="flex items-center space-x-2">
                               <Checkbox 
                                id={`kit-${kit.id}`} 
                                name="kits" 
                                value={kit.id} 
                                defaultChecked={checkedKits.has(kit.id)}
                                onCheckedChange={(checked) => handleCheckChange(kit.id, checked as boolean)}
                               />
                               <Label htmlFor={`kit-${kit.id}`} className="font-normal cursor-pointer">
                                   {kit.name} {checkedKits.has(kit.id) && !assignedKitIds.includes(kit.id) && <span className="text-xs text-green-600 font-bold ml-1">({t.common.new})</span>}
                                   {initialChecked.has(kit.id) && !checkedKits.has(kit.id) && <span className="text-xs text-red-500 font-bold ml-1">({t.common.removing})</span>}
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
              {t.common.save}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
