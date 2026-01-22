'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

export default function EventStatusBadge({ status, date }: { status: string, date: string }) {
    const [timeLeft, setTimeLeft] = useState<string | null>(null)
    const [urgency, setUrgency] = useState<'high' | 'medium' | 'low'>('low')
    
    useEffect(() => {
        if (!date) return

        const target = new Date(date).getTime()
        if (isNaN(target)) {
            console.error('Invalid date:', date)
            return
        }

        const updateTimer = () => {
            const now = new Date().getTime()
            const diff = target - now

            if (diff <= 0) {
                setTimeLeft(null)
                return
            }

            const totalSeconds = Math.floor(diff / 1000)
            const hours = Math.floor(totalSeconds / 3600)
            const minutes = Math.floor((totalSeconds % 3600) / 60)
            const seconds = totalSeconds % 60

            // Urgency Logic (monochrome)
            if (hours < 24) {
                setUrgency('high')
            } else if (hours < 48) {
                setUrgency('medium')
            } else {
                setUrgency('low')
            }

            // Format Logic
            if (hours >= 24) {
                 const days = Math.floor(hours / 24)
                 const remHours = hours % 24
                 setTimeLeft(`${days}d ${remHours}h ${minutes}m`)
            } else {
                 setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
            }
        }

        updateTimer()
        const timer = setInterval(updateTimer, 1000)
        return () => clearInterval(timer)
    }, [date])

    const displayStatus = status || 'Scheduled'
    const normalizedStatus = displayStatus.toLowerCase()
    
    const isActive = ['scheduled', 'upcoming'].includes(normalizedStatus)

    if (!isActive || !timeLeft) {
         // All statuses use monochrome zinc colors
         let colorClass = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
         
         if (normalizedStatus === 'completed') {
             colorClass = 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
         } else if (normalizedStatus === 'in_progress' || normalizedStatus === 'in progress') {
             colorClass = 'bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
         } else if (normalizedStatus === 'cancelled') {
             colorClass = 'bg-zinc-300 dark:bg-zinc-600 text-zinc-600 dark:text-zinc-300 line-through'
         }

         return (
            <div className={`capitalize px-2 py-1 rounded w-fit text-xs font-medium ${colorClass}`}>
                {displayStatus}
            </div>
         )
    }

    // Urgency-based monochrome styling
    const urgencyClasses = {
        high: 'bg-zinc-900 text-white border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-300',
        medium: 'bg-zinc-200 text-zinc-800 border-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-600',
        low: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
    }

    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded w-fit text-xs font-medium border ${urgencyClasses[urgency]}`}>
            <Clock className="w-3 h-3" />
            <span className="tabular-nums tracking-wide">{timeLeft}</span>
        </div>
    )
}
