'use client'

import { useActionState, useEffect, useState } from 'react'
import { updateEvent } from '../../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from 'next/link'

export default function EditEventForm({ event, availableKits, assignedKitIds }: { event: any, availableKits: any[], assignedKitIds: string[] }) {
  const [state, formAction, isPending] = useActionState(updateEvent.bind(null, event.id), { error: '' })

  const Label = ({ children, htmlFor, className }: any) => (
      <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>{children}</label>
  )
  
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/events">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-3xl font-bold tracking-tight">Edit Event</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
          <CardDescription>Update details for {event.name}</CardDescription>
        </CardHeader>
        <form action={formAction}>
           {/* Passing complex kit selection via hidden input or standard checkboxes if we can manage state */}
           {/* Standard checkboxes submit values if checked. We just need to ensure the list includes BOTH assigned and available */}

          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Event Name</Label>
              <Input id="name" name="name" defaultValue={event.name} required />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" name="location" defaultValue={event.location} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff">Staff List</Label>
              <Textarea id="staff" name="staff" defaultValue={event.staff} placeholder="List staff names here..." />
            </div>

            <div className="space-y-4">
               <Label>Assign Kits</Label>
               {(availableKits.length === 0 && assignedKitIds.length === 0) ? (
                   <p className="text-sm text-zinc-500 italic">No available kits found.</p>
               ) : (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded-lg p-4 max-h-[300px] overflow-y-auto">
                       {/* Show all relevant kits: those already assigned to THIS event, and those available (null event_id) */}
                       {/* We passed a combined list or need to handle logic? Page load should probably pass ALL relevant kits */}
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
                                   {kit.name} {checkedKits.has(kit.id) && !assignedKitIds.includes(kit.id) && <span className="text-xs text-green-600 font-bold ml-1">(New)</span>}
                                   {initialChecked.has(kit.id) && !checkedKits.has(kit.id) && <span className="text-xs text-red-500 font-bold ml-1">(Removing)</span>}
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
              <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
