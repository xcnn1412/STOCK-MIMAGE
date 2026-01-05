'use client'

import { useActionState } from 'react'
import { createKit } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import Link from 'next/link'
import { ArrowLeft } from "lucide-react"
import { useLanguage } from '@/contexts/language-context'

const initialState = {
  error: '',
}

export default function NewKitPage() {
  const { t } = useLanguage()
  const [state, formAction, isPending] = useActionState(createKit, initialState)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
       <div className="flex items-center gap-4">
        <Link href="/kits">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-3xl font-bold tracking-tight">{t.kits.newTitle}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.kits.newTitle}</CardTitle>
          <CardDescription>{t.kits.newSubtitle}</CardDescription>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium leading-none">{t.kits.fields.name}</label>
              <Input id="name" name="name" placeholder={t.kits.fields.name} required />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium leading-none">{t.kits.fields.description}</label>
              <Textarea id="description" name="description" placeholder={t.kits.fields.description} />
            </div>

            {state?.error && (
              <p className="text-sm text-red-500">{state.error}</p>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Link href="/kits">
                <Button variant="outline" type="button">{t.common.cancel}</Button>
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? t.common.save + "..." : t.kits.createKit}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
