'use client'

import { useActionState } from 'react'
import { createKit } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import Link from 'next/link'
import { ArrowLeft } from "lucide-react"

const initialState = {
  error: '',
}

export default function NewKitPage() {
  const [state, formAction, isPending] = useActionState(createKit, initialState)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
       <div className="flex items-center gap-4">
        <Link href="/kits">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-3xl font-bold tracking-tight">New Kit</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kit Details</CardTitle>
          <CardDescription>Create a new kit to assign items to.</CardDescription>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium leading-none">Name</label>
              <Input id="name" name="name" placeholder="Kit Name" required />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium leading-none">Description</label>
              <Textarea id="description" name="description" placeholder="Describe the kit contents or purpose" />
            </div>

            {state?.error && (
              <p className="text-sm text-red-500">{state.error}</p>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Link href="/kits">
                <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Create Kit"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
