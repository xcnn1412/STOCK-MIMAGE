'use client'

import { useActionState } from 'react'
import { loginWithPhone } from './actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Phone } from "lucide-react"

const initialState = {
  error: '',
}

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginWithPhone, initialState)

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 p-4">
      <Card className="w-full max-w-md shadow-lg border-zinc-200 dark:border-zinc-800">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight text-center">Event Inventory</CardTitle>
          <CardDescription className="text-center">
            Enter your phone number to access the dashboard
          </CardDescription>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <Input 
                  name="phone" 
                  type="tel" 
                  placeholder="e.g. +1 555 000 0000" 
                  className="pl-9"
                  required
                />
              </div>
            </div>
            {state?.error && (
              <p className="text-sm text-red-500 text-center">{state.error}</p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Verifying..." : "Sign In"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
