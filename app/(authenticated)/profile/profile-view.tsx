'use client'

import { useState } from 'react'
import { User, Phone, CreditCard, MapPin, Save, CheckCircle2, AlertTriangle, Building2, Hash, IdCard, Lock, Eye, EyeOff, KeyRound } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import BankSelect from '@/components/bank-select'
import ThaiAddressInput from '@/components/thai-address-input'
import { parseAddress, serializeAddress, type AddressData } from '@/lib/thai-address'
import { updateMyProfile, changePin } from './actions'
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

  // Change PIN state
  const [showPinSection, setShowPinSection] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState('')
  const [showCurrentPin, setShowCurrentPin] = useState(false)
  const [showNewPin, setShowNewPin] = useState(false)

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

  const handleChangePin = async () => {
    setPinLoading(true)
    setPinError('')
    setPinSuccess('')
    try {
      const result = await changePin({
        currentPin,
        newPin,
        confirmPin,
      })
      if (result?.error) {
        setPinError(result.error)
      } else {
        setPinSuccess('เปลี่ยน PIN สำเร็จ!')
        setCurrentPin('')
        setNewPin('')
        setConfirmPin('')
        setShowCurrentPin(false)
        setShowNewPin(false)
        setTimeout(() => setPinSuccess(''), 5000)
      }
    } catch {
      setPinError('เกิดข้อผิดพลาด')
    } finally {
      setPinLoading(false)
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

      {/* เปลี่ยน PIN */}
      <Card>
        <CardHeader className="pb-4 cursor-pointer" onClick={() => setShowPinSection(!showPinSection)}>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-zinc-500" />
            เปลี่ยน PIN เข้าสู่ระบบ
            <span className="ml-auto text-xs text-zinc-400 font-normal">
              {showPinSection ? '▼' : '▶'}
            </span>
          </CardTitle>
        </CardHeader>
        {showPinSection && (
          <CardContent className="space-y-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              PIN ใช้สำหรับเข้าสู่ระบบคู่กับเบอร์โทรศัพท์ (ตัวเลข 6 หลัก)
            </p>

            {/* Current PIN */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-zinc-400" />
                PIN ปัจจุบัน <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showCurrentPin ? 'text' : 'password'}
                  value={currentPin}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setCurrentPin(v)
                  }}
                  placeholder="●●●●●●"
                  maxLength={6}
                  className="font-mono tracking-[0.3em] text-center pr-10"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPin(!showCurrentPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  {showCurrentPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New PIN */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-zinc-400" />
                PIN ใหม่ <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showNewPin ? 'text' : 'password'}
                  value={newPin}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setNewPin(v)
                  }}
                  placeholder="●●●●●●"
                  maxLength={6}
                  className="font-mono tracking-[0.3em] text-center pr-10"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin(!showNewPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  {showNewPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPin && newPin.length !== 6 && (
                <p className="text-[10px] text-amber-500">กรุณากรอกให้ครบ 6 หลัก ({newPin.length}/6)</p>
              )}
            </div>

            {/* Confirm New PIN */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-zinc-400" />
                ยืนยัน PIN ใหม่ <span className="text-red-500">*</span>
              </Label>
              <Input
                type={showNewPin ? 'text' : 'password'}
                value={confirmPin}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setConfirmPin(v)
                }}
                placeholder="●●●●●●"
                maxLength={6}
                className="font-mono tracking-[0.3em] text-center"
                inputMode="numeric"
              />
              {confirmPin && newPin && confirmPin !== newPin && (
                <p className="text-[10px] text-red-500">PIN ไม่ตรงกัน</p>
              )}
              {confirmPin && newPin && confirmPin === newPin && confirmPin.length === 6 && (
                <p className="text-[10px] text-emerald-500">PIN ตรงกัน ✓</p>
              )}
            </div>

            {/* Error / Success */}
            {pinError && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-xl px-4 py-3 border border-red-100 dark:border-red-900/30">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {pinError}
              </div>
            )}
            {pinSuccess && (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl px-4 py-3 border border-emerald-100 dark:border-emerald-900/30">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> {pinSuccess}
              </div>
            )}

            {/* Change PIN Button */}
            <Button
              onClick={handleChangePin}
              disabled={pinLoading || !currentPin || newPin.length !== 6 || newPin !== confirmPin}
              variant="outline"
              className="w-full border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              {pinLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
                  กำลังเปลี่ยน PIN...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  เปลี่ยน PIN
                </span>
              )}
            </Button>
          </CardContent>
        )}
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
