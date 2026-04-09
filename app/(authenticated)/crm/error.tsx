'use client'

import { useEffect } from 'react'

export default function CrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[CRM Error]', error)
  }, [error])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-6">
        <h2 className="text-base font-semibold text-red-800 dark:text-red-300 mb-1">Failed to load CRM</h2>
        <p className="text-sm text-red-600 dark:text-red-400">
          {error.message || 'Could not fetch leads data. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="mt-4 px-4 py-2 text-sm bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  )
}
