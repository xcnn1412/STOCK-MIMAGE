'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global Error]', error)
  }, [error])

  return (
    <html>
      <body className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <h1 className="text-2xl font-semibold text-white">Application Error</h1>
          <p className="text-sm text-zinc-400 max-w-sm">{error.message || 'An unexpected error occurred.'}</p>
          <button
            onClick={reset}
            className="mt-2 px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg border border-zinc-700 transition-colors"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
