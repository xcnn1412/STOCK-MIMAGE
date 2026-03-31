'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Banknote, ToggleLeft, ToggleRight, Save, Zap, ZapOff,
  Info, Users, Calculator
} from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { updateRoleRate, updateAutoCalcSetting } from '../rate-config-actions'
import type { StaffRoleRate, AutoCalcSetting } from '../rate-config-actions'

interface Props {
  roleRates: StaffRoleRate[]
  autoCalcSettings: AutoCalcSetting[]
}

export default function RateConfigView({ roleRates, autoCalcSettings }: Props) {
  const router = useRouter()
  const { locale } = useLocale()
  const [isPending, startTransition] = useTransition()
  const isEn = locale === 'en'

  // Global toggle
  const globalEnabled = autoCalcSettings.find(s => s.key === 'auto_calc_enabled')?.value === 'true'
  const [globalToggle, setGlobalToggle] = useState(globalEnabled)

  // Local editable rates
  const [rates, setRates] = useState<Record<string, { price: number; auto_calc: boolean }>>(
    Object.fromEntries(roleRates.map(r => [r.id, { price: r.price, auto_calc: r.auto_calc }]))
  )

  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleGlobalToggle = () => {
    const newValue = !globalToggle
    setGlobalToggle(newValue)
    startTransition(async () => {
      await updateAutoCalcSetting('auto_calc_enabled', String(newValue))
      router.refresh()
    })
  }

  const handleRateChange = (id: string, price: number) => {
    setRates(prev => ({ ...prev, [id]: { ...prev[id], price } }))
  }

  const handleAutoCalcToggle = (id: string) => {
    setRates(prev => ({
      ...prev,
      [id]: { ...prev[id], auto_calc: !prev[id].auto_calc }
    }))
  }

  const handleSaveRate = (id: string) => {
    const r = rates[id]
    if (!r) return
    setError(null)
    setSaveSuccess(false)
    startTransition(async () => {
      const result = await updateRoleRate(id, { price: r.price, auto_calc: r.auto_calc })
      if (result.error) setError(result.error)
      else {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
        router.refresh()
      }
    })
  }

  const hasChanges = (id: string) => {
    const original = roleRates.find(r => r.id === id)
    const current = rates[id]
    if (!original || !current) return false
    return original.price !== current.price || original.auto_calc !== current.auto_calc
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-violet-500/30 transition-shadow"

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {isEn ? 'Rate Config & Auto-Calculation' : 'ตั้งค่า Rate & คำนวณอัตโนมัติ'}
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          {isEn
            ? 'Configure pay rates per role and toggle auto-calculation per role when staff check out from events'
            : 'กำหนดอัตราค่าจ้างตามหน้าที่ และ เปิด/ปิด การคำนวณอัตโนมัติแยกตามหน้าที่ เมื่อ Check-out จากงานอีเวนต์'}
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg text-red-600 text-sm">{error}</div>
      )}
      {saveSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg text-emerald-600 text-sm flex items-center gap-2">
          <Save className="h-4 w-4" />
          {isEn ? 'Saved successfully!' : 'บันทึกเรียบร้อย!'}
        </div>
      )}

      {/* Global Toggle Card */}
      <div className={`rounded-xl border overflow-hidden transition-all duration-300 ${
        globalToggle
          ? 'border-violet-200 dark:border-violet-800 bg-linear-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20'
          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
      }`}>
        <button
          onClick={handleGlobalToggle}
          disabled={isPending}
          className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/50 dark:hover:bg-white/5 disabled:opacity-50"
        >
          <div className={`flex items-center justify-center h-11 w-11 rounded-xl shrink-0 transition-all duration-300 ${
            globalToggle
              ? 'bg-linear-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/25'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
          }`}>
            {globalToggle ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
          </div>

          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold transition-colors ${
              globalToggle ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300'
            }`}>
              {isEn ? 'Auto-Calculation System' : 'ระบบคำนวณอัตโนมัติ'}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {globalToggle
                ? (isEn ? 'Enabled — Expense claims are auto-filled when staff check out from events' : 'เปิดอยู่ — ใบเบิกจะคำนวณค่าจ้างอัตโนมัติเมื่อ Check-out จากงาน')
                : (isEn ? 'Disabled — Expense claims will be created with ฿0 amount' : 'ปิดอยู่ — ใบเบิกจะสร้างด้วยจำนวนเงิน ฿0 ต้องกรอกเองทีหลัง')
              }
            </p>
          </div>

          <div className="shrink-0">
            {globalToggle
              ? <ToggleRight className="h-8 w-8 text-violet-500" />
              : <ToggleLeft className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            }
          </div>
        </button>
      </div>

      {/* Info Banner */}
      {globalToggle && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
          <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
            {isEn
              ? 'Roles with auto-calc ON will have the rate filled automatically. Roles with auto-calc OFF will create claims with ฿0 (manual entry required).'
              : 'หน้าที่ที่เปิด Auto-calc จะคำนวณค่าจ้างเข้าใบเบิกอัตโนมัติ / หน้าที่ที่ปิด Auto-calc จะสร้างใบเบิกด้วย ฿0 (ต้องกรอกเองทีหลัง)'}
          </p>
        </div>
      )}

      {/* Role Rates Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'Pay Rate per Role' : 'อัตราค่าจ้างตามหน้าที่'}
            </span>
            <span className="text-xs text-zinc-400">({roleRates.length})</span>
          </div>
          <span className="text-[10px] font-medium text-violet-600 bg-violet-50 dark:bg-violet-950/30 px-2 py-1 rounded">
            {isEn ? 'Per Event' : 'ต่องาน'}
          </span>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-[1fr_140px_100px_60px] gap-3 px-5 py-2.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50">
          <span className="text-[10px] font-medium text-zinc-500 uppercase">{isEn ? 'Role' : 'หน้าที่'}</span>
          <span className="text-[10px] font-medium text-zinc-500 uppercase">{isEn ? 'Rate (฿)' : 'อัตรา (฿)'}</span>
          <span className="text-[10px] font-medium text-zinc-500 uppercase text-center">
            <span className="inline-flex items-center gap-1">
              <Calculator className="h-2.5 w-2.5" />
              {isEn ? 'Auto' : 'อัตโนมัติ'}
            </span>
          </span>
          <span className="text-[10px] font-medium text-zinc-500 uppercase text-center">{isEn ? 'Save' : 'บันทึก'}</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {roleRates.map(role => {
            const current = rates[role.id]
            const changed = hasChanges(role.id)

            return (
              <div
                key={role.id}
                className={`grid grid-cols-[1fr_140px_100px_60px] gap-3 px-5 py-3 items-center transition-all duration-200 ${
                  changed ? 'bg-amber-50/50 dark:bg-amber-950/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                } ${!role.is_active ? 'opacity-40' : ''}`}
              >
                {/* Role Name */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white dark:ring-zinc-900"
                    style={{ backgroundColor: role.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {isEn ? role.label_en : role.label_th}
                    </p>
                    <p className="text-[10px] text-zinc-400 truncate">
                      {isEn ? role.label_th : role.label_en}
                    </p>
                  </div>
                </div>

                {/* Rate Input */}
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">฿</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={current?.price ?? 0}
                    onChange={e => handleRateChange(role.id, Number(e.target.value) || 0)}
                    disabled={!globalToggle}
                    className={`${inputCls} pl-7 text-right ${!globalToggle ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>

                {/* Auto-Calc Toggle */}
                <div className="flex justify-center">
                  <button
                    onClick={() => handleAutoCalcToggle(role.id)}
                    disabled={!globalToggle || isPending}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all duration-200 ${
                      !globalToggle
                        ? 'opacity-30 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                        : current?.auto_calc
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/40'
                          : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {current?.auto_calc
                      ? <><ToggleRight className="h-3.5 w-3.5" /><span>{isEn ? 'ON' : 'เปิด'}</span></>
                      : <><ToggleLeft className="h-3.5 w-3.5" /><span>{isEn ? 'OFF' : 'ปิด'}</span></>
                    }
                  </button>
                </div>

                {/* Save Button */}
                <div className="flex justify-center">
                  {changed && (
                    <button
                      onClick={() => handleSaveRate(role.id)}
                      disabled={isPending}
                      className="h-7 w-7 flex items-center justify-center rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50 shadow-sm"
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer Info */}
        <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-xs text-zinc-400 leading-relaxed">
            {isEn
              ? 'Rate is per event. When staff check out from an on-site event, the system will auto-create an expense claim with the configured rate for their assigned role.'
              : 'อัตราเป็น "ต่องาน" — เมื่อสตาฟ Check-out จากงานอีเวนต์ ระบบจะสร้างใบเบิกอัตโนมัติพร้อมจำนวนเงินตามอัตราของหน้าที่ที่ได้รับมอบหมาย'}
          </p>
        </div>
      </div>

      {/* Preview: How calculation works */}
      {globalToggle && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'Calculation Preview' : 'ตัวอย่างการคำนวณ'}
            </span>
          </div>
          <div className="px-5 py-4 space-y-2">
            {roleRates.filter(r => r.is_active).map(role => {
              const current = rates[role.id]
              return (
                <div key={role.id} className="flex items-center gap-3 text-sm">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                  <span className="flex-1 text-zinc-600 dark:text-zinc-400 truncate">
                    {isEn ? role.label_en : role.label_th}
                  </span>
                  <span className="text-xs text-zinc-400">→</span>
                  {current?.auto_calc ? (
                    <span className="text-sm font-medium text-violet-600 dark:text-violet-400 tabular-nums">
                      ฿{(current?.price || 0).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400 italic">
                      {isEn ? 'manual' : 'กรอกเอง'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
