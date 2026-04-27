'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, ShieldAlert } from 'lucide-react'

type Variant = 'default' | 'destructive' | 'warning'

interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  /** Visual emphasis — destructive uses red button, warning uses amber */
  variant?: Variant
  confirmLabel?: string
  cancelLabel?: string
  /** Optional details panel below the description (e.g. claim no. + amount) */
  details?: { label: string; value: React.ReactNode }[]
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({ open: false, title: '' })
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    setState({ ...options, open: true })
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve
    })
  }, [])

  const handleResolve = useCallback((ok: boolean) => {
    resolverRef.current?.(ok)
    resolverRef.current = null
    setState(prev => ({ ...prev, open: false }))
  }, [])

  const variant: Variant = state.variant || 'default'
  const accent = variant === 'destructive'
    ? { btn: 'bg-red-600 hover:bg-red-700', icon: 'text-red-500', Icon: ShieldAlert }
    : variant === 'warning'
      ? { btn: 'bg-amber-600 hover:bg-amber-700', icon: 'text-amber-500', Icon: AlertTriangle }
      : { btn: 'bg-emerald-600 hover:bg-emerald-700', icon: 'text-emerald-500', Icon: AlertTriangle }
  const Icon = accent.Icon

  const dialog = (
    <Dialog
      open={state.open}
      onOpenChange={open => { if (!open) handleResolve(false) }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${accent.icon}`} />
            <span>{state.title}</span>
          </DialogTitle>
          {state.description && (
            <DialogDescription>{state.description}</DialogDescription>
          )}
        </DialogHeader>

        {state.details && state.details.length > 0 && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-3 space-y-1.5 text-sm">
            {state.details.map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-500">{d.label}</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100 text-right">
                  {d.value}
                </span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <button
            onClick={() => handleResolve(false)}
            className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            {state.cancelLabel || 'ยกเลิก'}
          </button>
          <button
            onClick={() => handleResolve(true)}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${accent.btn}`}
          >
            {state.confirmLabel || 'ยืนยัน'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { confirm, dialog }
}
