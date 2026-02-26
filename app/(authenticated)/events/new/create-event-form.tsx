'use client'

import { useActionState, useState } from 'react'
import { createEvent } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, Loader2, Users, UserCheck, Search, Info } from "lucide-react"
import Link from 'next/link'
import { ThaiDatePicker } from '@/components/thai-date-picker'
import { useLanguage } from '@/contexts/language-context'

interface Profile {
  id: string
  full_name: string | null
  role: string
}

interface Prefill {
  name: string
  location: string
  eventDate: string
  sellerNames: string[]
  staffNames: string[]
  crmLeadId: string
}

export default function CreateEventForm({
  availableKits,
  profiles,
  prefill,
}: {
  availableKits: any[]
  profiles: Profile[]
  prefill?: Prefill
}) {
  const { t } = useLanguage()
  const [state, formAction, isPending] = useActionState(createEvent, { error: '' })

  // Multi-select state for staff and seller — initialize from prefill if available
  const [selectedStaff, setSelectedStaff] = useState<string[]>(prefill?.staffNames || [])
  const [selectedSellers, setSelectedSellers] = useState<string[]>(prefill?.sellerNames || [])
  const [staffSearch, setStaffSearch] = useState('')
  const [sellerSearch, setSellerSearch] = useState('')

  const Label = ({ children, htmlFor, className }: any) => (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>{children}</label>
  )

  const toggleStaff = (name: string) => {
    setSelectedStaff(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  const toggleSeller = (name: string) => {
    setSelectedSellers(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  // Filter profiles by search
  const filteredStaffProfiles = profiles.filter(p =>
    p.full_name?.toLowerCase().includes(staffSearch.toLowerCase())
  )
  const filteredSellerProfiles = profiles.filter(p =>
    p.full_name?.toLowerCase().includes(sellerSearch.toLowerCase())
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

            {/* ผู้ขาย (Seller) — Multi-select from users */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-blue-500" />
                ผู้ขาย (Seller)
              </Label>

              {/* Selected badges */}
              {selectedSellers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedSellers.map(name => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-medium rounded-full cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                      onClick={() => toggleSeller(name)}
                      title="คลิกเพื่อลบ"
                    >
                      {name}
                      <span className="text-blue-400">×</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="ค้นหาชื่อ..."
                  value={sellerSearch}
                  onChange={(e) => setSellerSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>

              {/* Checkbox list */}
              <div className="border rounded-lg p-3 max-h-[160px] overflow-y-auto space-y-1">
                {filteredSellerProfiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2 text-center">ไม่พบข้อมูล</p>
                ) : (
                  filteredSellerProfiles.map(profile => (
                    <div key={profile.id} className="flex items-center space-x-2 py-1 px-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <Checkbox
                        id={`seller-${profile.id}`}
                        checked={selectedSellers.includes(profile.full_name || '')}
                        onCheckedChange={() => toggleSeller(profile.full_name || '')}
                      />
                      <label htmlFor={`seller-${profile.id}`} className="text-sm font-normal cursor-pointer flex-1">
                        {profile.full_name || 'Unknown'}
                      </label>
                      <span className="text-[10px] text-muted-foreground">{profile.role}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Hidden input — join selected names */}
              <input type="hidden" name="seller" value={selectedSellers.join(', ')} />
            </div>

            {/* Staff List — Multi-select from users */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-green-500" />
                Staff List (ทีมงาน)
              </Label>

              {/* Selected badges */}
              {selectedStaff.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedStaff.map(name => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium rounded-full cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                      onClick={() => toggleStaff(name)}
                      title="คลิกเพื่อลบ"
                    >
                      {name}
                      <span className="text-green-400">×</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="ค้นหาชื่อ..."
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>

              {/* Checkbox list */}
              <div className="border rounded-lg p-3 max-h-[160px] overflow-y-auto space-y-1">
                {filteredStaffProfiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2 text-center">ไม่พบข้อมูล</p>
                ) : (
                  filteredStaffProfiles.map(profile => (
                    <div key={profile.id} className="flex items-center space-x-2 py-1 px-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <Checkbox
                        id={`staff-${profile.id}`}
                        checked={selectedStaff.includes(profile.full_name || '')}
                        onCheckedChange={() => toggleStaff(profile.full_name || '')}
                      />
                      <label htmlFor={`staff-${profile.id}`} className="text-sm font-normal cursor-pointer flex-1">
                        {profile.full_name || 'Unknown'}
                      </label>
                      <span className="text-[10px] text-muted-foreground">{profile.role}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Hidden input — join selected names */}
              <input type="hidden" name="staff" value={selectedStaff.join(', ')} />
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
