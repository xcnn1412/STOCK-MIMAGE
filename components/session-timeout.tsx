'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Clock, RefreshCw } from 'lucide-react'

const IDLE_TIMEOUT_MS = 30 * 60 * 1000     // 30 minutes
const WARNING_BEFORE_MS = 5 * 60 * 1000     // Show warning 5 minutes before
const CHECK_INTERVAL_MS = 30 * 1000         // Check every 30 seconds
const ACTIVITY_KEY = 'last_activity_ts'

export default function SessionTimeout() {
    const router = useRouter()
    const [showWarning, setShowWarning] = useState(false)
    const [countdown, setCountdown] = useState(300) // 5 minutes in seconds
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Update last activity timestamp
    const recordActivity = useCallback(() => {
        const now = Date.now()
        try {
            localStorage.setItem(ACTIVITY_KEY, now.toString())
        } catch { /* SSR or private browsing */ }
        setShowWarning(false)
        if (countdownRef.current) {
            clearInterval(countdownRef.current)
            countdownRef.current = null
        }
    }, [])

    // Get last activity from localStorage (cross-tab sync)
    const getLastActivity = useCallback((): number => {
        try {
            const stored = localStorage.getItem(ACTIVITY_KEY)
            return stored ? parseInt(stored, 10) : Date.now()
        } catch {
            return Date.now()
        }
    }, [])

    // Perform logout
    const performLogout = useCallback(async () => {
        try {
            localStorage.removeItem(ACTIVITY_KEY)
        } catch { /* ignore */ }

        // Call the logout action via form submission
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = '/login'

        // Clear cookies client-side as fallback
        document.cookie = 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
        document.cookie = 'session_user_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
        document.cookie = 'session_role=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
        document.cookie = 'session_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'

        router.push('/login')
    }, [router])

    // Extend session
    const extendSession = useCallback(() => {
        recordActivity()
        setCountdown(300)
    }, [recordActivity])

    // Check idle status
    const checkIdle = useCallback(() => {
        const lastActivity = getLastActivity()
        const elapsed = Date.now() - lastActivity

        if (elapsed >= IDLE_TIMEOUT_MS) {
            // Session expired
            performLogout()
        } else if (elapsed >= IDLE_TIMEOUT_MS - WARNING_BEFORE_MS) {
            // Show warning
            const remainingMs = IDLE_TIMEOUT_MS - elapsed
            const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))
            setCountdown(remainingSec)
            setShowWarning(true)

            // Start countdown
            if (!countdownRef.current) {
                countdownRef.current = setInterval(() => {
                    setCountdown(prev => {
                        if (prev <= 1) {
                            performLogout()
                            return 0
                        }
                        return prev - 1
                    })
                }, 1000)
            }
        }
    }, [getLastActivity, performLogout])

    useEffect(() => {
        // Record initial activity
        recordActivity()

        // Listen for user activity
        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const
        const throttledRecord = (() => {
            let lastCall = 0
            return () => {
                const now = Date.now()
                if (now - lastCall > 10000) { // Throttle to once per 10 seconds
                    lastCall = now
                    recordActivity()
                }
            }
        })()

        events.forEach(event => {
            window.addEventListener(event, throttledRecord, { passive: true })
        })

        // Cross-tab sync via storage event
        const handleStorage = (e: StorageEvent) => {
            if (e.key === ACTIVITY_KEY && e.newValue) {
                setShowWarning(false)
                if (countdownRef.current) {
                    clearInterval(countdownRef.current)
                    countdownRef.current = null
                }
            }
        }
        window.addEventListener('storage', handleStorage)

        // Start periodic check
        intervalRef.current = setInterval(checkIdle, CHECK_INTERVAL_MS)

        return () => {
            events.forEach(event => {
                window.removeEventListener(event, throttledRecord)
            })
            window.removeEventListener('storage', handleStorage)
            if (intervalRef.current) clearInterval(intervalRef.current)
            if (countdownRef.current) clearInterval(countdownRef.current)
        }
    }, [recordActivity, checkIdle])

    const minutes = Math.floor(countdown / 60)
    const seconds = countdown % 60

    return (
        <Dialog open={showWarning} onOpenChange={(open) => { if (!open) extendSession() }}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-600">
                        <Clock className="h-5 w-5" />
                        Session กำลังจะหมดอายุ
                    </DialogTitle>
                    <DialogDescription>
                        คุณไม่ได้ใช้งานมาสักพัก ระบบจะ logout อัตโนมัติใน
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-4">
                    <div className="text-4xl font-bold font-mono text-amber-600 tabular-nums">
                        {minutes}:{seconds.toString().padStart(2, '0')}
                    </div>
                    <Button onClick={extendSession} className="w-full gap-2" size="lg">
                        <RefreshCw className="h-4 w-4" />
                        ต่อเวลาการใช้งาน
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
