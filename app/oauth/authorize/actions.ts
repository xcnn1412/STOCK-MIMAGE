'use server'

import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { getLicenseStatus } from '@/lib/license'
import { logActivity } from '@/lib/logger'
import { checkAuthorizeRequest, issueCode, MCP_SCOPE, modulesFor, type AuthorizeParams } from '@/lib/oauth'
import { createServiceClient } from '@/lib/supabase-server'

// หน้าอนุญาตให้ Claude เข้าถึง — ตรวจทุกอย่างซ้ำฝั่ง server (ค่าจากฟอร์มแก้ได้)
// redirect ไป redirect_uri ได้เฉพาะหลังตรวจแล้วว่าตรงกับที่แอปลงทะเบียนไว้

/** ต่อพารามิเตอร์ท้าย redirect_uri (เผื่อมี query เดิมอยู่แล้ว) */
function withParams(uri: string, params: Record<string, string>): string {
  const url = new URL(uri)
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v)
  return url.toString()
}

/** กด "อนุญาต" → ออก code แล้วส่งกลับไปที่ Claude */
export async function grantAuthorization(params: AuthorizeParams): Promise<{ error: string }> {
  if (getLicenseStatus().expired) return { error: 'ใบอนุญาตใช้งานระบบหมดอายุ' }
  const auth = await requireAuth()
  if (!auth) return { error: 'กรุณาเข้าสู่ระบบใหม่' }

  const db = createServiceClient()
  const check = await checkAuthorizeRequest(db, params)
  if (!check.ok) return { error: check.error }

  const { data: profile } = await db
    .from('profiles')
    .select('role, is_blocked, allowed_modules')
    .eq('id', auth.userId)
    .maybeSingle()
  if (!profile || profile.is_blocked) return { error: 'บัญชีนี้ใช้งานไม่ได้' }
  const modules = modulesFor({ role: auth.role, allowed_modules: (profile.allowed_modules as string[] | null) ?? null })
  if (modules.length === 0) return { error: 'บัญชีนี้ไม่มีโมดูลที่ Claude ใช้ได้' }

  let code: string
  try {
    code = await issueCode(db, {
      clientId: params.clientId,
      userId: auth.userId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scope: MCP_SCOPE,
      resource: params.resource,
    })
  } catch {
    return { error: 'อนุญาตไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }

  await logActivity('MCP_CONNECT', { clientId: params.clientId, clientName: check.clientName, modules }, undefined, auth.userId)
  redirect(withParams(params.redirectUri, { code, state: params.state }))
}

/** กด "ปฏิเสธ" → บอก Claude ว่าไม่อนุญาต (เฉพาะ redirect_uri ที่ตรวจแล้ว) */
export async function denyAuthorization(params: AuthorizeParams): Promise<{ error: string }> {
  const auth = await requireAuth()
  if (!auth) return { error: 'กรุณาเข้าสู่ระบบใหม่' }
  const check = await checkAuthorizeRequest(createServiceClient(), params)
  if (!check.ok) return { error: check.error }
  redirect(withParams(params.redirectUri, { error: 'access_denied', state: params.state }))
}
