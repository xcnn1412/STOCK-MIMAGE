'use client'

// ============================================================================
// ตัวห่อ action ของมุมมองรายวัน — ใช้ร่วมกันทั้งตารางเดสก์ท็อปและการ์ดมือถือ
// spec: docs/specs/salary-slip-daily-ui.md §Actions
//
// ทุกตัวคืน SaveResult ({} = สำเร็จ) ให้ช่องใน inline-cells ใช้ตรงๆ และส่งสลิป
// ที่คำนวณใหม่แล้วกลับผ่าน onSlipChange — ไม่มีปุ่ม "คำนวณใหม่" ให้กดเอง
// การแก้ "เช็คอิน" ต้อง router.refresh() ด้วย เพราะ action คืนมาแค่สลิป
// ส่วนแถวเช็คอิน/อีเวนต์มาจาก server component ของหน้าเพจ
// ============================================================================

import { useRouter } from 'next/navigation'
import {
  clearSlipLineOverride, editSlipCheckin, overrideSlipLine, setRunnerAmounts,
  type SlipCheckinPatch, type SlipDetail,
} from '../../actions'
import type { SaveResult } from './inline-cells'

export interface SlipEdits {
  saveCheckin: (checkinId: string, patch: SlipCheckinPatch) => Promise<SaveResult>
  saveOverride: (key: string, amount: number, note: string) => Promise<SaveResult>
  clearOverride: (key: string) => Promise<SaveResult>
  /** null = ล้างยอดรันเนอร์กลับเป็น "ยังไม่กรอก" */
  saveRunner: (key: string, amount: number | null) => Promise<SaveResult>
  /** "ใช้ยอดนี้กับวันที่ยังว่าง" — ตัวเรียกส่งคีย์ของบรรทัดที่ยังว่างมาให้ */
  applyRunnerToEmpty: (keys: string[], amount: number) => Promise<SaveResult>
}

export function useSlipEdits(
  slipId: string,
  onSlipChange: (slip: SlipDetail) => void
): SlipEdits {
  const router = useRouter()

  async function saveCheckin(checkinId: string, patch: SlipCheckinPatch): Promise<SaveResult> {
    const res = await editSlipCheckin(slipId, checkinId, patch)
    if ('error' in res) return { error: res.error }
    onSlipChange(res.slip)
    router.refresh()
    return {}
  }

  async function saveOverride(key: string, amount: number, note: string): Promise<SaveResult> {
    const res = await overrideSlipLine(slipId, key, amount, note)
    if (res.error) return { error: res.error }
    if (res.slip) onSlipChange(res.slip)
    return {}
  }

  async function clearOverride(key: string): Promise<SaveResult> {
    const res = await clearSlipLineOverride(slipId, key)
    if (res.error) return { error: res.error }
    if (res.slip) onSlipChange(res.slip)
    return {}
  }

  async function saveRunner(key: string, amount: number | null): Promise<SaveResult> {
    if (amount === null) return clearOverride(key)
    const res = await setRunnerAmounts(slipId, [{ key, amount }])
    if ('error' in res) return { error: res.error }
    onSlipChange(res.slip)
    return {}
  }

  async function applyRunnerToEmpty(keys: string[], amount: number): Promise<SaveResult> {
    if (keys.length === 0) return {}
    const res = await setRunnerAmounts(slipId, keys.map(key => ({ key, amount })))
    if ('error' in res) return { error: res.error }
    onSlipChange(res.slip)
    return {}
  }

  return { saveCheckin, saveOverride, clearOverride, saveRunner, applyRunnerToEmpty }
}
