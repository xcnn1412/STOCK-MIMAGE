'use client'

import { useActionState, useState, useRef, useEffect } from 'react'
import { loginWithPhoneAndSelfie, registerUser } from './actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Phone, Lock, User, Camera, MapPin, AlertCircle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import type { ActionState } from '@/types'

const initialState: ActionState = {
    error: '',
}

export default function LoginPage() {
    const [loginState, loginAction, isLoginPending] = useActionState(loginWithPhoneAndSelfie, initialState)
    const [registerState, registerAction, isRegisterPending] = useActionState(registerUser, initialState)
    const [activeTab, setActiveTab] = useState("login")

    // Login Form States
    const [phone, setPhone] = useState('')
    const [pin, setPin] = useState('')
    const [showCamera, setShowCamera] = useState(false)
    const [capturedImage, setCapturedImage] = useState<string | null>(null)
    const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null)
    const [cameraError, setCameraError] = useState('')

    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const formRef = useRef<HTMLFormElement>(null)

    // Start Camera
    useEffect(() => {
        let stream: MediaStream | null = null;

        if (showCamera) {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setCameraError("Camera access is not supported in this browser or requires a secure connection (HTTPS).");
                return;
            }

            navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
                .then(s => {
                    stream = s;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                    // Also get location when camera opens
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                            (position) => {
                                setLocation({
                                    lat: position.coords.latitude,
                                    lng: position.coords.longitude
                                })
                            },
                            (err) => console.error("Location error:", err)
                        );
                    }
                })
                .catch(err => {
                    console.error("Camera error:", err)
                    setCameraError("Unable to access camera. Please allow camera permissions.")
                })
        }

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        }
    }, [showCamera])

    const handleInitialSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (phone && pin.length === 6) {
            setShowCamera(true)
        }
    }

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d')
            if (context) {
                // Set canvas dimensions to match video
                canvasRef.current.width = videoRef.current.videoWidth
                canvasRef.current.height = videoRef.current.videoHeight

                // Draw
                context.drawImage(videoRef.current, 0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight)

                // Get data
                const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.7)
                setCapturedImage(dataUrl)
                setShowCamera(false) // Close modal

                // Now we can auto-submit or let user click "Login"?
                // Let's auto submit for smoothness, but we need to wait for state update?
                // Actually, we can just trigger form submission right here programmatically if we put values in hidden inputs
            }
        }
    }

    // Effect to auto-submit when image is captured
    useEffect(() => {
        if (capturedImage && phone && pin && formRef.current) {
            formRef.current.requestSubmit()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [capturedImage])

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 p-4" suppressHydrationWarning>
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
                            <form ref={formRef} action={loginAction} onSubmit={!capturedImage ? handleInitialSubmit : undefined} className="space-y-4">
                                {/* Hidden inputs for Server Action */}
                                <input type="hidden" name="latitude" value={location?.lat || ''} />
                                <input type="hidden" name="longitude" value={location?.lng || ''} />
                                <input type="hidden" name="selfie_image" value={capturedImage || ''} />

                                <div className="space-y-2">
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                        <Input
                                            name="phone"
                                            type="tel"
                                            placeholder="Phone Number"
                                            className="pl-9"
                                            required
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                        // Make readOnly if processing to prevent edits? Optional.
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
                                            value={pin}
                                            onChange={e => setPin(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {loginState?.error && (
                                    <Alert variant="destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Error</AlertTitle>
                                        <AlertDescription>{loginState.error}</AlertDescription>
                                    </Alert>
                                )}

                                <Button type="submit" className="w-full" disabled={isLoginPending || (showCamera && !capturedImage)}>
                                    {isLoginPending ? "Verifying..." : capturedImage ? "Logging in..." : "Next"}
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
                                    </div>
                                </div>
                                {registerState?.error && (
                                    <p className="text-sm text-red-500 text-center">{registerState.error}</p>
                                )}
                                {registerState?.success && registerState?.message && (
                                    <p className="text-sm text-green-600 text-center">{registerState.message}</p>
                                )}
                                <Button type="submit" className="w-full bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200" disabled={isRegisterPending}>
                                    {isRegisterPending ? "Registering..." : "Create Account"}
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Camera Dialog */}
            <Dialog open={showCamera} onOpenChange={setShowCamera}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Identity Verification</DialogTitle>
                        <DialogDescription>
                            Please take a selfie to confirm your identity and location.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-4 py-4">
                        {cameraError ? (
                            <div className="p-4 bg-red-50 text-red-600 rounded-md text-center">
                                {cameraError}
                            </div>
                        ) : (
                            <div className="relative w-full aspect-[3/4] bg-black rounded-lg overflow-hidden border-2 border-zinc-200 shadow-inner">
                                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                                <canvas ref={canvasRef} className="hidden" />
                            </div>
                        )}

                        <div className="flex flex-col items-center gap-1">
                            {location ? (
                                <div className="flex items-center text-xs text-green-600 gap-1 bg-green-50 px-2 py-1 rounded-full">
                                    <MapPin className="h-3 w-3" /> Location Acquired
                                </div>
                            ) : (
                                <div className="flex items-center text-xs text-amber-600 gap-1 bg-amber-50 px-2 py-1 rounded-full animate-pulse">
                                    <MapPin className="h-3 w-3" /> Locating...
                                </div>
                            )}
                        </div>

                        <Button onClick={capturePhoto} className="w-full gap-2" size="lg" disabled={!!cameraError}>
                            <Camera className="h-5 w-5" /> Take Selfie & Login
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    )
}
