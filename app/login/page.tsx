'use client'

import { useActionState, useState } from 'react'
import { loginWithPhone, registerUser } from './actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Phone, Lock, User } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const initialState = {
  error: '',
}

export default function LoginPage() {
  const [loginState, loginAction, isLoginPending] = useActionState(loginWithPhone, initialState)
  const [registerState, registerAction, isRegisterPending] = useActionState(registerUser, initialState)
  const [activeTab, setActiveTab] = useState("login")

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 p-4">
      <Card className="w-full max-w-md shadow-lg border-zinc-200 dark:border-zinc-800">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-2xl font-bold tracking-tight text-center">Event Inventory</CardTitle>
          <CardDescription className="text-center">
            Managed by Image Automat
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="login">Login</TabsTrigger>
                    <TabsTrigger value="register">Register</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                    <form action={loginAction} className="space-y-4">
                        <div className="space-y-2">
                            <div className="relative">
                                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                <Input 
                                    name="phone" 
                                    type="tel" 
                                    placeholder="Phone Number" 
                                    className="pl-9"
                                    required
                                />
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                <Input 
                                    name="pin" 
                                    type="password" 
                                    placeholder="6-Digit PIN" 
                                    maxLength={6}
                                    pattern="\d{6}"
                                    className="pl-9"
                                    required
                                />
                            </div>
                        </div>
                        {loginState?.error && (
                            <p className="text-sm text-red-500 text-center">{loginState.error}</p>
                        )}
                        <Button type="submit" className="w-full" disabled={isLoginPending}>
                            {isLoginPending ? "Verifying..." : "Sign In"}
                        </Button>
                    </form>
                </TabsContent>

                <TabsContent value="register">
                    <form action={registerAction} className="space-y-4">
                         <div className="space-y-2">
                            <div className="relative">
                                <User className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                <Input 
                                    name="name" 
                                    type="text" 
                                    placeholder="Full Name" 
                                    className="pl-9"
                                    required
                                />
                            </div>
                            <div className="relative">
                                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                <Input 
                                    name="phone" 
                                    type="tel" 
                                    placeholder="Phone Number" 
                                    className="pl-9"
                                    required
                                />
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                <Input 
                                    name="pin" 
                                    type="password" 
                                    placeholder="Set 6-Digit PIN" 
                                    maxLength={6}
                                    pattern="\d{6}"
                                    className="pl-9"
                                    required
                                />
                                <p className="text-xs text-zinc-500 mt-1 ml-1">Must be exactly 6 numbers</p>
                            </div>
                        </div>
                        {registerState?.error && (
                            <p className="text-sm text-red-500 text-center">{registerState.error}</p>
                        )}
                        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={isRegisterPending}>
                            {isRegisterPending ? "Registering..." : "Create Account"}
                        </Button>
                    </form>
                </TabsContent>
            </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
