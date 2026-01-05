'use client'

import { useActionState } from 'react'
import { createEvent } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from 'next/link'
import { ThaiDatePicker } from '@/components/thai-date-picker'
import { useLanguage } from '@/contexts/language-context'

export default function CreateEventForm({ availableKits }: { availableKits: any[] }) {
  const { t } = useLanguage()
  const [state, formAction, isPending] = useActionState(createEvent, { error: '' })

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
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">{t.events.fields.name}</Label>
              <Input id="name" name="name" placeholder={t.events.fields.name} required />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="location">{t.events.fields.location}</Label>
              <Input id="location" name="location" placeholder={t.events.fields.location} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event_date">{t.events.fields.date}</Label>
              <ThaiDatePicker name="event_date" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff">Staff List</Label>
              <Textarea id="staff" name="staff" placeholder="List staff names here..." />
            </div>

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
