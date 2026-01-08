'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

export default function EventStatusBadge({ status, date }: { status: string, date: string }) {
    const [timeLeft, setTimeLeft] = useState<string | null>(null)
    const [badgeColor, setBadgeColor] = useState<'red' | 'orange' | 'blue'>('blue')
    
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

            // Color Logic
            if (hours < 24) {
                setBadgeColor('red')
            } else if (hours < 48) {
                setBadgeColor('orange')
            } else {
                setBadgeColor('blue')
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
         let colorClass = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
         
         if (normalizedStatus === 'completed') {
             colorClass = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
         } else if (normalizedStatus === 'in_progress' || normalizedStatus === 'in progress') {
             colorClass = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
         } else if (normalizedStatus === 'cancelled') {
             colorClass = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
         }

         return (
            <div className={`capitalize px-2 py-1 rounded w-fit text-xs font-medium ${colorClass}`}>
                {displayStatus}
            </div>
         )
    }

    const colorClasses = {
        red: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
        orange: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
        blue: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
    }

    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded w-fit text-xs font-medium border ${colorClasses[badgeColor]}`}>
            <Clock className="w-3 h-3" />
            <span className="tabular-nums tracking-wide">{timeLeft}</span>
        </div>
    )
}
