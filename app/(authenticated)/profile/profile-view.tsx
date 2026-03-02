'use client'

import { useState } from 'react'
import { User, Phone, CreditCard, MapPin, Save, CheckCircle2, AlertTriangle, Building2, Hash, IdCard } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import BankSelect from '@/components/bank-select'
import ThaiAddressInput from '@/components/thai-address-input'
import { parseAddress, serializeAddress, type AddressData } from '@/lib/thai-address'
import { updateMyProfile } from './actions'
import { toast } from 'sonner'

interface ProfileData {
  id: string
  full_name: string
  nickname: string | null
  national_id: string | null
  address: string | null
  bank_name: string | null
  bank_account_number: string | null
  account_holder_name: string | null
  phone: string | null
  role: string | null
}

function getCompletionItems(profile: ProfileData) {
  return [
    { key: 'full_name', label: 'ชื่อ-นามสกุล', filled: !!profile.full_name },
    { key: 'nickname', label: 'ชื่อเล่น', filled: !!profile.nickname },
    { key: 'national_id', label: 'เลขบัตรประชาชน', filled: !!profile.national_id && profile.national_id.length === 13 },
    { key: 'address', label: 'ที่อยู่ตามบัตรประชาชน', filled: !!profile.address && profile.address.length > 10 },
    { key: 'bank_name', label: 'ชื่อธนาคาร', filled: !!profile.bank_name },
    { key: 'bank_account_number', label: 'เลขบัญชีธนาคาร', filled: !!profile.bank_account_number },
    { key: 'account_holder_name', label: 'ชื่อบัญชี', filled: !!profile.account_holder_name },
  ]
}

export default function ProfileView({ profile }: { profile: ProfileData }) {
  const [form, setForm] = useState({
    full_name: profile.full_name || '',
    nickname: profile.nickname || '',
    national_id: profile.national_id || '',
    address: parseAddress(profile.address),
    bank_name: profile.bank_name || '',
    bank_account_number: profile.bank_account_number || '',
    account_holder_name: profile.account_holder_name || '',
  })
  const [saving, setSaving] = useState(false)

  const completionItems = getCompletionItems({
    ...profile,
    full_name: form.full_name,
    nickname: form.nickname || null,
    national_id: form.national_id || null,
    address: serializeAddress(form.address),
    bank_name: form.bank_name || null,
    bank_account_number: form.bank_account_number || null,
    account_holder_name: form.account_holder_name || null,
  })
  const completedCount = completionItems.filter(i => i.filled).length
  const totalCount = completionItems.length
  const completionPercent = Math.round((completedCount / totalCount) * 100)
  const isComplete = completedCount === totalCount

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await updateMyProfile({
        full_name: form.full_name,
        nickname: form.nickname || undefined,
        national_id: form.national_id || undefined,
        address: serializeAddress(form.address),
        bank_name: form.bank_name || undefined,
        bank_account_number: form.bank_account_number || undefined,
        account_holder_name: form.account_holder_name || undefined,
      })
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('บันทึกข้อมูลเรียบร้อยแล้ว')
      }
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">โปรไฟล์ของฉัน</h1>
        <p className="text-sm text-zinc-500 mt-1">จัดการข้อมูลส่วนตัว ที่อยู่ และบัญชีธนาคาร</p>
      </div>

      {/* Completion Progress */}
      <Card className={`border-2 ${isComplete ? 'border-emerald-200 dark:border-emerald-800' : 'border-amber-200 dark:border-amber-800'}`}>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-3 mb-3">
            {isComplete ? (
              <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            ) : (
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {isComplete ? 'ข้อมูลครบถ้วน ✓' : `กรุณากรอกข้อมูลให้ครบ (${completedCount}/${totalCount})`}
              </p>
              <p className="text-xs text-zinc-500">
                {isComplete ? 'ข้อมูลของคุณพร้อมใช้งานในระบบเบิกจ่ายและออกเอกสาร' : 'ข้อมูลจำเป็นสำหรับระบบเบิกจ่ายและออกเอกสารภาษี'}
              </p>
            </div>
            <span className={`text-lg font-bold ${isComplete ? 'text-emerald-600' : 'text-amber-600'}`}>
              {completionPercent}%
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
          {/* Completion checklist */}
          {!isComplete && (
            <div className="mt-3 flex flex-wrap gap-2">
              {completionItems.filter(i => !i.filled).map(i => (
                <span key={i.key} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  ⚠ {i.label}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ข้อมูลส่วนตัว */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-zinc-500" />
            ข้อมูลส่วนตัว
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Phone (read-only) */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-zinc-400" />
              เบอร์โทรศัพท์
            </Label>
            <Input
              value={profile.phone || ''}
              disabled
              className="bg-zinc-50 dark:bg-zinc-800/50 cursor-not-allowed"
            />
            <p className="text-[10px] text-zinc-400">ใช้สำหรับเข้าสู่ระบบ ไม่สามารถเปลี่ยนได้</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>ชื่อ-นามสกุล <span className="text-red-500">*</span></Label>
              <Input
                value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                placeholder="ชื่อ-นามสกุล (ภาษาไทย)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ชื่อเล่น</Label>
              <Input
                value={form.nickname}
                onChange={e => setForm({ ...form, nickname: e.target.value })}
                placeholder="ชื่อเล่น"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <IdCard className="h-3.5 w-3.5 text-zinc-400" />
              เลขบัตรประชาชน <span className="text-red-500">*</span>
            </Label>
            <Input
              value={form.national_id}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 13)
                setForm({ ...form, national_id: v })
              }}
              placeholder="X-XXXX-XXXXX-XX-X"
              maxLength={13}
              className="font-mono tracking-wider"
            />
            {form.national_id && form.national_id.length !== 13 && (
              <p className="text-[10px] text-amber-500">กรุณากรอกให้ครบ 13 หลัก ({form.national_id.length}/13)</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ที่อยู่ตามบัตรประชาชน */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-zinc-500" />
            ที่อยู่ตามบัตรประชาชน
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ThaiAddressInput
            value={form.address}
            onChange={addr => setForm({ ...form, address: addr })}
          />
        </CardContent>
      </Card>

      {/* ข้อมูลการชำระเงิน */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-zinc-500" />
            ข้อมูลการชำระเงิน (เบิกจ่าย)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-zinc-400" />
              ธนาคาร
            </Label>
            <BankSelect
              value={form.bank_name}
              onChange={v => setForm({ ...form, bank_name: v })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5 text-zinc-400" />
                เลขบัญชี
              </Label>
              <Input
                value={form.bank_account_number}
                onChange={e => setForm({ ...form, bank_account_number: e.target.value.replace(/\D/g, '') })}
                placeholder="เลขบัญชีธนาคาร"
                className="font-mono tracking-wider"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ชื่อบัญชี</Label>
              <Input
                value={form.account_holder_name}
                onChange={e => setForm({ ...form, account_holder_name: e.target.value })}
                placeholder="ชื่อบัญชี (ตามหน้าสมุดบัญชี)"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pb-8">
        <Button
          onClick={handleSave}
          disabled={saving || !form.full_name.trim()}
          className="min-w-[160px] bg-emerald-600 hover:bg-emerald-700 text-white"
          size="lg"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              กำลังบันทึก...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              บันทึกข้อมูล
            </span>
          )}
        </Button>
      </div>
    </div>
  )
}
