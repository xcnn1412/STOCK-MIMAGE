'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { ALL_BANKS } from '@/lib/bank-list'

interface BankSelectProps {
  value: string
  onChange: (value: string) => void
  name?: string
  placeholder?: string
  className?: string
}

export default function BankSelect({ value, onChange, name, placeholder = 'เลือกธนาคาร', className = '' }: BankSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Focus search on open
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus()
    }
  }, [open])

  const selectedBank = ALL_BANKS.find(b => b.value === value)

  const filtered = search.trim()
    ? ALL_BANKS.filter(b => {
        const q = search.toLowerCase()
        return (
          b.value.toLowerCase().includes(q) ||
          b.label.toLowerCase().includes(q) ||
          b.abbr.toLowerCase().includes(q)
        )
      })
    : ALL_BANKS

  // Split into Thai and International for display
  const thaiFiltered = filtered.filter(b => /^[ก-ฮเแโใไ]/.test(b.label))
  const intlFiltered = filtered.filter(b => !/^[ก-ฮเแโใไ]/.test(b.label))

  const handleSelect = (bankValue: string) => {
    onChange(bankValue)
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Hidden input for form submission */}
      {name && <input type="hidden" name={name} value={value} />}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-left transition-colors hover:border-zinc-400"
      >
        <span className={selectedBank ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'}>
          {selectedBank ? (
            <span>
              {selectedBank.value}
              <span className="text-zinc-400 ml-1.5 text-xs">({selectedBank.abbr})</span>
            </span>
          ) : placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {value && (
            <span
              role="button"
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-700">
            <Search className="h-4 w-4 text-zinc-400 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาธนาคาร..."
              className="w-full text-sm bg-transparent outline-none placeholder:text-zinc-400"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-zinc-400 hover:text-zinc-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-zinc-400">
                ไม่พบธนาคารที่ค้นหา
              </div>
            ) : (
              <>
                {/* Thai Banks */}
                {thaiFiltered.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 sticky top-0">
                      ธนาคารไทย
                    </div>
                    {thaiFiltered.map(bank => (
                      <button
                        key={bank.value}
                        type="button"
                        onClick={() => handleSelect(bank.value)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                          value === bank.value
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        <span className="truncate">{bank.label}</span>
                        <span className="text-xs text-zinc-400 shrink-0 ml-2 font-mono">{bank.abbr}</span>
                      </button>
                    ))}
                  </>
                )}

                {/* International Banks */}
                {intlFiltered.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 sticky top-0">
                      ธนาคารต่างประเทศ
                    </div>
                    {intlFiltered.map(bank => (
                      <button
                        key={bank.value}
                        type="button"
                        onClick={() => handleSelect(bank.value)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                          value === bank.value
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        <span className="truncate">{bank.label}</span>
                        <span className="text-xs text-zinc-400 shrink-0 ml-2 font-mono">{bank.abbr}</span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
