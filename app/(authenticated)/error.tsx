'use client'

import { useEffect } from 'react'

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Auth Error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
        <span className="text-red-600 dark:text-red-400 text-xl font-bold">!</span>
      </div>
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Something went wrong</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <button
        onClick={reset}
        className="mt-2 px-4 py-2 text-sm bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-100 dark:hover:bg-zinc-300 text-white dark:text-zinc-900 rounded-lg transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
