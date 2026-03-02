'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { MapPin } from 'lucide-react'
import type { AddressData } from '@/lib/thai-address'

// Compact format: [subdistrict, district, province, postalCode]
type AddrTuple = [string, string, string, number]

interface ThaiAddressInputProps {
  value: AddressData
  onChange: (addr: AddressData) => void
}

// Lazy-loaded full address database
let _db: AddrTuple[] | null = null
let _loading = false
const _waiters: Array<(db: AddrTuple[]) => void> = []

async function getDB(): Promise<AddrTuple[]> {
  if (_db) return _db
  if (_loading) {
    return new Promise(resolve => _waiters.push(resolve))
  }
  _loading = true
  try {
    const res = await fetch('/data/thai-addresses.json')
    _db = await res.json()
    _waiters.forEach(w => w(_db!))
    _waiters.length = 0
    return _db!
  } catch {
    _loading = false
    return []
  }
}

function searchAddress(db: AddrTuple[], field: 'subdistrict' | 'district' | 'province' | 'postal', query: string, limit = 8): AddrTuple[] {
  if (!query.trim()) return []
  const q = query.trim().toLowerCase()
  const fieldIdx = field === 'subdistrict' ? 0 : field === 'district' ? 1 : field === 'province' ? 2 : 3
  const results: AddrTuple[] = []
  for (const entry of db) {
    const val = String(entry[fieldIdx]).toLowerCase()
    if (val.includes(q)) {
      results.push(entry)
      if (results.length >= limit) break
    }
  }
  return results
}

export default function ThaiAddressInput({ value, onChange }: ThaiAddressInputProps) {
  const [suggestions, setSuggestions] = useState<AddrTuple[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [dbReady, setDbReady] = useState(!!_db)
  const containerRef = useRef<HTMLDivElement>(null)

  // Preload database on mount
  useEffect(() => {
    getDB().then(() => setDbReady(true))
  }, [])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Province list for datalist (from DB or fallback)
  const provinces = useMemo(() => {
    if (!_db) return []
    const set = new Set(_db.map(d => d[2]))
    return [...set].sort()
  }, [dbReady])

  const handleFieldSearch = useCallback(async (field: 'subdistrict' | 'district' | 'province' | 'postal', q: string) => {
    const db = await getDB()
    if (field === 'postal' && q.length < 3) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    const results = searchAddress(db, field, q)
    setSuggestions(results)
    setShowSuggestions(results.length > 0)
  }, [])

  const handleSelect = useCallback((addr: AddrTuple) => {
    onChange({
      ...value,
      subdistrict: addr[0],
      district: addr[1],
      province: addr[2],
      postal_code: String(addr[3]),
    })
    setShowSuggestions(false)
    setSuggestions([])
  }, [onChange, value])

  const updateField = useCallback((field: keyof AddressData, v: string) => {
    onChange({ ...value, [field]: v })
  }, [onChange, value])

  const inputClass = 'w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors placeholder:text-zinc-400'

  return (
    <div ref={containerRef} className="space-y-3 relative">
      {/* ข้อมูลสถานที่พื้นฐาน */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">บ้านเลขที่ / ชื่ออาคาร / ชั้น / หมู่บ้าน</label>
        <input
          className={inputClass}
          value={value.house_no}
          onChange={e => updateField('house_no', e.target.value)}
          placeholder="เช่น 123/45 หมู่ 6"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">ซอย</label>
          <input
            className={inputClass}
            value={value.soi}
            onChange={e => updateField('soi', e.target.value)}
            placeholder="ซอย"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">ถนน</label>
          <input
            className={inputClass}
            value={value.road}
            onChange={e => updateField('road', e.target.value)}
            placeholder="ถนน"
          />
        </div>
      </div>

      {/* ข้อมูลเขตการปกครอง (Auto-complete) */}
      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
        <MapPin className="h-3 w-3" />
        พิมพ์ช่องใดช่องหนึ่ง → ระบบจะแนะนำให้อัตโนมัติ
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">ตำบล / แขวง</label>
          <input
            className={inputClass}
            value={value.subdistrict}
            onChange={e => {
              updateField('subdistrict', e.target.value)
              handleFieldSearch('subdistrict', e.target.value)
            }}
            onFocus={() => value.subdistrict && handleFieldSearch('subdistrict', value.subdistrict)}
            placeholder="ตำบล / แขวง"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">อำเภอ / เขต</label>
          <input
            className={inputClass}
            value={value.district}
            onChange={e => {
              updateField('district', e.target.value)
              handleFieldSearch('district', e.target.value)
            }}
            onFocus={() => value.district && handleFieldSearch('district', value.district)}
            placeholder="อำเภอ / เขต"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">จังหวัด</label>
          <input
            className={inputClass}
            value={value.province}
            onChange={e => {
              updateField('province', e.target.value)
              handleFieldSearch('province', e.target.value)
            }}
            onFocus={() => value.province && handleFieldSearch('province', value.province)}
            placeholder="จังหวัด"
            list="province-list"
          />
          <datalist id="province-list">
            {provinces.map(p => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">รหัสไปรษณีย์</label>
          <input
            className={`${inputClass} font-mono tracking-wider`}
            value={value.postal_code}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 5)
              updateField('postal_code', v)
              handleFieldSearch('postal', v)
            }}
            onFocus={() => value.postal_code && value.postal_code.length >= 3 && handleFieldSearch('postal', value.postal_code)}
            placeholder="XXXXX"
            maxLength={5}
          />
          {value.postal_code && value.postal_code.length > 0 && value.postal_code.length < 5 && (
            <p className="text-[10px] text-amber-500">{value.postal_code.length}/5 หลัก</p>
          )}
        </div>
      </div>

      {/* Suggestion Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden mt-1"
          style={{ bottom: 'auto' }}>
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            เลือกที่อยู่ ({suggestions.length} ผลลัพธ์)
          </div>
          <div className="max-h-48 overflow-y-auto overscroll-contain">
            {suggestions.map((s, i) => (
              <button
                key={`${s[0]}-${s[1]}-${s[2]}-${s[3]}-${i}`}
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0"
              >
                <MapPin className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <span className="text-zinc-800 dark:text-zinc-200">
                    {s[0]}, {s[1]}, {s[2]}
                  </span>
                  <span className="ml-1.5 text-xs font-mono text-zinc-400">{s[3]}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
