'use client'

import { useActionState, useState, useEffect, useRef } from 'react'
import { loginWithPhoneAndSelfie, registerUser } from './actions'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Phone, User, AlertCircle, ArrowLeft, ArrowRight, Loader2, Lock } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import PinKeypad from './pin-keypad'

import type { ActionState } from '@/types'

const initialState: ActionState = {
    error: '',
}

type LoginStep = 'phone' | 'pin'

export default function LoginPage() {
    const [loginState, loginAction, isLoginPending] = useActionState(loginWithPhoneAndSelfie, initialState)
    const [registerState, registerAction, isRegisterPending] = useActionState(registerUser, initialState)
    const [activeTab, setActiveTab] = useState("login")

    // Login Form States
    const [phone, setPhone] = useState('')
    const [pin, setPin] = useState('')
    const [loginStep, setLoginStep] = useState<LoginStep>('phone')

    // Register Form States  
    const [regName, setRegName] = useState('')
    const [regPhone, setRegPhone] = useState('')
    const [regPin, setRegPin] = useState('')
    const [regStep, setRegStep] = useState<'info' | 'pin'>('info')

    const loginFormRef = useRef<HTMLFormElement>(null)
    const phoneInputRef = useRef<HTMLInputElement>(null)

    // Focus phone input on mount
    useEffect(() => {
        if (loginStep === 'phone' && phoneInputRef.current && activeTab === 'login') {
            phoneInputRef.current.focus()
        }
    }, [loginStep, activeTab])

    const handlePhoneNext = (e: React.FormEvent) => {
        e.preventDefault()
        if (phone.length >= 9) {
            setLoginStep('pin')
        }
    }

    const handlePinComplete = () => {
        // Auto-submit when PIN is complete
        if (loginFormRef.current) {
            loginFormRef.current.requestSubmit()
        }
    }

    // Reset steps on error
    useEffect(() => {
        if (loginState?.error) {
            setPin('')
        }
    }, [loginState?.error])

    const handleBack = () => {
        if (loginStep === 'pin') {
            setLoginStep('phone')
            setPin('')
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 p-4" suppressHydrationWarning>
            <Card className="w-full max-w-md shadow-lg border-zinc-200 dark:border-zinc-800">
                <CardHeader className="space-y-1 pb-2">
                    <div className="flex items-center justify-center mb-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold shadow-sm">
                            EA
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-center">Event Inventory</CardTitle>
                    <CardDescription className="text-center">
                        Managed by Image Automat
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setLoginStep('phone'); setPin(''); setRegStep('info'); setRegPin('') }} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="login">Login</TabsTrigger>
                            <TabsTrigger value="register">Register</TabsTrigger>
                        </TabsList>

                        {/* ============ LOGIN TAB ============ */}
                        <TabsContent value="login">
                            <form ref={loginFormRef} action={loginAction} className="space-y-4">
                                {/* Hidden inputs */}
                                <input type="hidden" name="phone" value={phone} />
                                <input type="hidden" name="pin" value={pin} />

                                {/* Step: Phone */}
                                {loginStep === 'phone' && (
                                    <div className="space-y-4">
                                        <div className="space-y-3">
                                            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block">เบอร์โทรศัพท์</label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                                <input
                                                    ref={phoneInputRef}
                                                    type="tel"
                                                    placeholder="0XX-XXX-XXXX"
                                                    value={phone}
                                                    onChange={e => setPhone(e.target.value.replace(/[^\d+\-]/g, ''))}
                                                    onKeyDown={e => { if (e.key === 'Enter') handlePhoneNext(e) }}
                                                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 pl-9 text-sm tracking-wider ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:placeholder:text-zinc-400 dark:focus-visible:ring-zinc-300"
                                                />
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={handlePhoneNext}
                                            disabled={phone.length < 9}
                                            className="w-full"
                                        >
                                            ถัดไป <ArrowRight className="h-4 w-4 ml-1" />
                                        </Button>
                                    </div>
                                )}

                                {/* Step: PIN Keypad */}
                                {loginStep === 'pin' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={handleBack}
                                                className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                                            >
                                                <ArrowLeft className="h-3.5 w-3.5" /> กลับ
                                            </button>
                                            <span className="text-xs text-zinc-400 font-mono">{phone}</span>
                                        </div>

                                        <div className="text-center py-2">
                                            <Lock className="h-5 w-5 mx-auto mb-2 text-zinc-400" />
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">ใส่รหัส PIN 6 หลัก</p>
                                            <PinKeypad
                                                value={pin}
                                                onChange={setPin}
                                                length={6}
                                                disabled={isLoginPending}
                                                onComplete={handlePinComplete}
                                            />
                                        </div>

                                        {isLoginPending && (
                                            <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                กำลังตรวจสอบ...
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Error */}
                                {loginState?.error && (
                                    <Alert variant="destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Error</AlertTitle>
                                        <AlertDescription>{loginState.error}</AlertDescription>
                                    </Alert>
                                )}
                            </form>
                        </TabsContent>

                        {/* ============ REGISTER TAB ============ */}
                        <TabsContent value="register">
                            <form action={registerAction} className="space-y-4">
                                <input type="hidden" name="name" value={regName} />
                                <input type="hidden" name="phone" value={regPhone} />
                                <input type="hidden" name="pin" value={regPin} />

                                {regStep === 'info' && (
                                    <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ชื่อ-สกุล</label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                                <input
                                                    type="text"
                                                    placeholder="ชื่อ-สกุล"
                                                    value={regName}
                                                    onChange={e => setRegName(e.target.value)}
                                                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 pl-9 text-sm ring-offset-white file:border-0 file:bg-transparent placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:placeholder:text-zinc-400 dark:focus-visible:ring-zinc-300"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">เบอร์โทรศัพท์</label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                                <input
                                                    type="tel"
                                                    placeholder="0XX-XXX-XXXX"
                                                    value={regPhone}
                                                    onChange={e => setRegPhone(e.target.value.replace(/[^\d+\-]/g, ''))}
                                                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 pl-9 text-sm tracking-wider ring-offset-white file:border-0 file:bg-transparent placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:placeholder:text-zinc-400 dark:focus-visible:ring-zinc-300"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={() => { if (regName && regPhone.length >= 9) setRegStep('pin') }}
                                            disabled={!regName || regPhone.length < 9}
                                            className="w-full"
                                        >
                                            ตั้งรหัส PIN <ArrowRight className="h-4 w-4 ml-1" />
                                        </Button>
                                    </div>
                                )}

                                {regStep === 'pin' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={() => { setRegStep('info'); setRegPin('') }}
                                                className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                                            >
                                                <ArrowLeft className="h-3.5 w-3.5" /> กลับ
                                            </button>
                                            <span className="text-xs text-zinc-400">{regName}</span>
                                        </div>
                                        <div className="text-center py-2">
                                            <Lock className="h-5 w-5 mx-auto mb-2 text-zinc-400" />
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">ตั้งรหัส PIN 6 หลัก</p>
                                            <PinKeypad
                                                value={regPin}
                                                onChange={setRegPin}
                                                length={6}
                                                disabled={isRegisterPending}
                                            />
                                        </div>
                                        <Button
                                            type="submit"
                                            disabled={regPin.length < 6 || isRegisterPending}
                                            className="w-full bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                                        >
                                            {isRegisterPending ? (
                                                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> กำลังสมัคร...</>
                                            ) : (
                                                'สมัครบัญชี'
                                            )}
                                        </Button>
                                    </div>
                                )}

                                {registerState?.error && (
                                    <p className="text-sm text-red-500 text-center">{registerState.error}</p>
                                )}
                                {registerState?.success && registerState?.message && (
                                    <p className="text-sm text-green-600 text-center">{registerState.message}</p>
                                )}
                            </form>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    )
}
