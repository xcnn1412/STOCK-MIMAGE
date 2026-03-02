'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

export default function PdfPreviewPage() {
  const [claimId, setClaimId] = useState('a7023804-f09a-44d1-b8e7-09f7a8e41cdd')
  const [key, setKey] = useState(0) // force iframe refresh

  const pdfUrl = `/api/pdf/payment-voucher?id=${claimId}&t=${key}`

  return (
    <div className="h-screen flex flex-col bg-zinc-100 dark:bg-zinc-950">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <h1 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
          📄 PDF Preview
        </h1>
        <input
          type="text"
          value={claimId}
          onChange={e => setClaimId(e.target.value)}
          placeholder="Claim ID"
          className="flex-1 max-w-md px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 outline-none font-mono"
        />
        <button
          onClick={() => setKey(k => k + 1)}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
        <span className="text-xs text-zinc-400">
          แก้ไข payment-voucher.tsx แล้วกด Refresh เพื่อดู preview
        </span>
      </div>

      {/* PDF iframe */}
      <iframe
        key={key}
        src={pdfUrl}
        className="flex-1 w-full border-0"
        title="Payment Voucher Preview"
      />
    </div>
  )
}
