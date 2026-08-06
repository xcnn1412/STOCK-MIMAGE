'use server'

import { createServiceClient, removeStorageByUrls } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { createNotifications } from '@/lib/notifications'
import { cookies } from 'next/headers'
import { requireAuth } from '@/lib/auth'

// Resolve the acting user with a DB-verified role. NEVER trust the raw
// `session_role` cookie — it is unsigned and user-editable, so reading role
// from it let a staff user set `session_role=admin` and approve/pay/delete.
// Prefer the HMAC session_token (requireAuth); fall back to the legacy
// session_user_id cookie only when no token exists, and even then read role
// from the DB. ponytail: 8 lines of fallback, but the dual-cookie invariant
// in CLAUDE.md requires it — drop it once legacy sessions are fully retired.
async function getSession(): Promise<{ userId?: string; role?: string }> {
  const session = await requireAuth()
  if (session) return { userId: session.userId, role: session.role }

  const cookieStore = await cookies()
  // A token present but rejected by requireAuth (bad sig / kicked session) is a
  // hard no — don't let the legacy path re-grant it.
  if (cookieStore.get('session_token')?.value) return {}
  const legacyId = cookieStore.get('session_user_id')?.value
  if (!legacyId) return {}
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, role, is_approved')
    .eq('id', legacyId)
    .single()
  if (!data || !data.is_approved) return {}
  return { userId: data.id, role: data.role || 'staff' }
}

// ============================================================================
// Generate claim number: EXP-YYYYMM-NNN
// ============================================================================

async function generateClaimNumber(supabase: any) {
  const now = new Date()
  const prefix = `EXP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

  const { count } = await supabase
    .from('expense_claims')
    .select('id', { count: 'exact', head: true })
    .like('claim_number', `${prefix}%`)

  const seq = (count || 0) + 1
  return `${prefix}-${String(seq).padStart(3, '0')}`
}

// ============================================================================
// Get Claims
// ============================================================================

export async function getClaims(filters?: {
  status?: string | string[]
  claim_type?: string
  submitted_by?: string
}) {
  const { userId, role } = await getSession()
  if (!userId) return { data: [], error: 'Unauthorized' }

  const supabase = createServiceClient()

  let query = supabase
    .from('expense_claims')
    .select(`
      *,
      submitter:profiles!expense_claims_submitted_by_fkey(id, full_name),
      approver:profiles!expense_claims_approved_by_fkey(id, full_name),
      payer:profiles!expense_claims_paid_by_fkey(id, full_name),
      job_event:job_cost_events!expense_claims_job_event_id_fkey(id, event_name, source_event_id, linked_lead_id)
    `)
    .order('created_at', { ascending: false })

  // 🔒 Non-admins can only see their own claims
  if (role !== 'admin') query = query.eq('submitted_by', userId)

  if (filters?.status) {
    query = Array.isArray(filters.status)
      ? query.in('status', filters.status)
      : query.eq('status', filters.status)
  }
  if (filters?.claim_type) query = query.eq('claim_type', filters.claim_type)
  if (filters?.submitted_by) query = query.eq('submitted_by', filters.submitted_by)

  const { data, error } = await query
  return { data: data || [], error: error?.message }
}

export async function getClaim(id: string) {
  const { userId, role } = await getSession()
  if (!userId) return { data: null, error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('expense_claims')
    .select(`
      *,
      submitter:profiles!expense_claims_submitted_by_fkey(id, full_name),
      approver:profiles!expense_claims_approved_by_fkey(id, full_name),
      job_event:job_cost_events!expense_claims_job_event_id_fkey(id, event_name)
    `)
    .eq('id', id)
    .single()

  if (!data) return { data: null, error: error?.message }

  // 🔒 Non-admins can only access their own claims — EXCEPT petty-cash docs
  // (funds, top-ups, box expenses), which belong to the shared office box and
  // must be visible to every staff member who logs into it.
  const isPettyRelated = data.claim_type === 'petty_cash' || !!data.pettycash_fund_id
  if (role !== 'admin' && data.submitted_by !== userId && !isPettyRelated) {
    return { data: null, error: 'ไม่พบใบเบิก' }
  }

  return { data, error: error?.message }
}

// ============================================================================
// Upload receipt files to Supabase Storage
// ============================================================================

async function uploadReceiptFiles(supabase: any, files: File[], claimNumber: string): Promise<string[]> {
  const urls: string[] = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const ext = file.name.split('.').pop() || 'jpg'
    const safeName = claimNumber.replace(/[^a-zA-Z0-9-]/g, '_')
    const filePath = `claims/${safeName}/${Date.now()}_${i}.${ext}`

    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (error) {
      console.error('Upload receipt error:', error)
      continue
    }

    const { data: publicUrl } = supabase.storage
      .from('receipts')
      .getPublicUrl(data.path)

    if (publicUrl?.publicUrl) {
      urls.push(publicUrl.publicUrl)
    }
  }
  return urls
}

// ============================================================================
// Create Claim
// ============================================================================

export async function createClaim(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const claimNumber = await generateClaimNumber(supabase)

  const claim_type = formData.get('claim_type') as string
  const title = formData.get('title') as string
  const descriptionPart = (formData.get('description') as string || '').trim()
  const additionalDetails = (formData.get('additional_details') as string || '').trim()
  const description = [descriptionPart, additionalDetails].filter(Boolean).join(' — ') || null
  const category = formData.get('category') as string || 'other'
  const amount = Number(formData.get('amount')) || 0
  const unit_price = Number(formData.get('unit_price')) || 0
  const unit = formData.get('unit') as string || 'บาท'
  const quantity = Number(formData.get('quantity')) || 1
  const expense_date = formData.get('expense_date') as string || new Date().toISOString().split('T')[0]
  const vat_mode = formData.get('vat_mode') as string || 'none'
  const include_vat = vat_mode !== 'none'
  const withholding_tax_rate = Number(formData.get('withholding_tax_rate')) || 0
  const notes = formData.get('notes') as string || null
  let job_event_id = formData.get('job_event_id') as string || null
  const bank_name = (formData.get('bank_name') as string || '').trim() || null
  const bank_account_number = (formData.get('bank_account_number') as string || '').trim() || null
  const account_holder_name = (formData.get('account_holder_name') as string || '').trim() || null
  const fundingSourceRaw = (formData.get('funding_source') as string || 'company').trim()
  const funding_source: 'company' | 'personal' = fundingSourceRaw === 'personal' ? 'personal' : 'company'

  // Petty cash (เงินสดย่อย) — this claim OPENS the monthly fund (ใบแม่).
  // Expenses / top-ups into the fund are created from the fund page instead.
  const isPettyCash = claim_type === 'petty_cash'
  let pettycash_period_start: string | null = null
  let pettycash_period_end: string | null = null
  let pettycash_previous_claim_id: string | null = null
  if (isPettyCash) {
    const month = ((formData.get('pettycash_month') as string) || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(month)) return { error: 'กรุณาเลือกเดือนของวงเงินสดย่อย' }
    const [y, m] = month.split('-').map(Number)
    if (m < 1 || m > 12) return { error: 'เดือนไม่ถูกต้อง' }
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    pettycash_period_start = `${month}-01`
    pettycash_period_end = `${month}-${String(lastDay).padStart(2, '0')}`

    // One open fund at a time — the previous month must be closed (cash
    // returned) before a new month starts.
    const { data: openFund } = await supabase
      .from('expense_claims')
      .select('id, claim_number')
      .eq('claim_type', 'petty_cash')
      .is('pettycash_fund_id', null)
      .is('pettycash_closed_at', null)
      .not('status', 'in', '(cancelled,rejected)')
      .limit(1)
      .maybeSingle()
    if (openFund) {
      return { error: `มีวงเงินสดย่อย (${openFund.claim_number}) ที่ยังไม่ปิดอยู่ — กรุณาปิดเดือนและคืนเงินก่อนเปิดวงเงินใหม่` }
    }

    // Link the latest previous fund for month-to-month navigation.
    const { data: prevFund } = await supabase
      .from('expense_claims')
      .select('id')
      .eq('claim_type', 'petty_cash')
      .is('pettycash_fund_id', null)
      .not('status', 'in', '(cancelled,rejected)')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    pettycash_previous_claim_id = prevFund?.id || null
  }

  // Collect receipt files from FormData
  const receiptFiles: File[] = []
  const allEntries = formData.getAll('receipt_files')
  for (const entry of allEntries) {
    if (entry instanceof File && entry.size > 0) {
      receiptFiles.push(entry)
    }
  }

  if (!title) return { error: 'กรุณากรอกหัวข้อการเบิก' }
  if (amount <= 0 && unit_price <= 0) return { error: 'กรุณากรอกจำนวนเงินที่ถูกต้อง (ราคาต่อหน่วยต้องมากกว่า 0)' }
  if (claim_type === 'event' && !job_event_id) return { error: 'กรุณาเลือกอีเวนต์' }

  // Auto-import stock event → job_cost_events ถ้าเลือกจาก events table
  if (job_event_id && job_event_id.startsWith('stock:')) {
    const stockEventId = job_event_id.replace('stock:', '')
    const { importEventFromStock } = await import('../costs/actions')
    const importResult = await importEventFromStock(stockEventId)
    if (importResult.error) {
      // ถ้า import แล้ว อาจเป็น duplicate → ใช้ existingId ถ้ามี
      job_event_id = (importResult as any).existingId || null
      if (!job_event_id) return { error: `ไม่สามารถนำเข้าอีเวนต์ได้: ${importResult.error}` }
    } else {
      job_event_id = importResult.id || null
    }
  }

  // Auto-import closure event → job_cost_events ถ้าเลือกจากประวัติปิดงาน
  if (job_event_id && job_event_id.startsWith('closure:')) {
    const closureId = job_event_id.replace('closure:', '')
    const { importEventFromClosure } = await import('../costs/actions')
    const importResult = await importEventFromClosure(closureId)
    if (importResult.error) {
      // ถ้า import แล้ว อาจเป็น duplicate → ใช้ existingId ถ้ามี
      job_event_id = (importResult as any).existingId || null
      if (!job_event_id) return { error: `ไม่สามารถนำเข้าอีเวนต์ได้: ${importResult.error}` }
    } else {
      job_event_id = importResult.id || null
    }
  }

  // Upload receipt files first
  let receipt_urls: string[] = []
  if (receiptFiles.length > 0) {
    receipt_urls = await uploadReceiptFiles(supabase, receiptFiles, claimNumber)
  }

  const insertData: Record<string, any> = {
    claim_number: claimNumber,
    claim_type,
    job_event_id: claim_type === 'event' ? job_event_id : null,
    title,
    description,
    category,
    amount: amount || (unit_price * quantity),
    unit_price,
    unit,
    quantity,
    expense_date,
    vat_mode,
    include_vat,
    withholding_tax_rate,
    notes,
    bank_name,
    bank_account_number,
    account_holder_name,
    receipt_urls,
    funding_source,
    submitted_by: userId,
    status: 'draft',
  }
  // Only reference the pettycash_* columns for petty cash, so non-petty claim
  // creation keeps working even if the petty-cash migration hasn't been applied.
  if (isPettyCash) {
    insertData.pettycash_opening_balance = 0 // monthly model — no carried opening
    insertData.pettycash_previous_claim_id = pettycash_previous_claim_id
    insertData.pettycash_period_start = pettycash_period_start
    insertData.pettycash_period_end = pettycash_period_end
    insertData.pettycash_fund_id = null
  }

  const { data, error } = await supabase
    .from('expense_claims')
    .insert(insertData)
    .select('id')
    .single()

  if (error) {
    console.error('Create claim error:', error)
    const detail = error.details || error.hint || ''
    return { error: `เกิดข้อผิดพลาดในการสร้างใบเบิก: ${error.message}${detail ? ` (${detail})` : ''} [${error.code}]` }
  }

  await logActivity('CREATE_EXPENSE_CLAIM', {
    claimId: data?.id,
    claimNumber,
    title,
    amount,
    claim_type,
  })

  revalidatePath('/finance')
  return { success: true, id: data?.id }
}

// ============================================================================
// Update Claim (admin or owner if pending) + upload receipts + log changes
// ============================================================================

export async function updateClaim(id: string, updateData: {
  title?: string
  description?: string | null
  category?: string
  amount?: number
  unit_price?: number
  unit?: string
  quantity?: number
  expense_date?: string
  vat_mode?: string
  include_vat?: boolean
  withholding_tax_rate?: number
  notes?: string | null
  bank_name?: string | null
  bank_account_number?: string | null
  account_holder_name?: string | null
  claim_type?: string
  job_event_id?: string | null
  funding_source?: 'company' | 'personal'
  tax_invoice_numbers?: string[] | null
}, receiptFormData?: FormData) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }

  const isAdmin = role === 'admin'
  const isOwner = claim.submitted_by === userId

  // Admin แก้ไขได้ทุกสถานะ; เจ้าของแก้ไขได้เฉพาะ draft / pending เท่านั้น
  if (!isAdmin && !['draft', 'pending'].includes(claim.status)) return { error: 'แก้ไขได้เฉพาะใบเบิกที่ยังไม่ถูกดำเนินการ' }
  if (!isAdmin && !isOwner) return { error: 'คุณไม่มีสิทธิ์แก้ไขใบเบิกนี้' }

  // A closed petty-cash month is frozen — its leftover snapshot (refund_amount)
  // must keep reconciling with the children.
  if (claim.claim_type === 'petty_cash' && claim.pettycash_closed_at) {
    return { error: 'วงเงินสดย่อยนี้ปิดเดือนแล้ว ไม่สามารถแก้ไขได้ (admin ต้องเปิดรอบอีกครั้งก่อน)' }
  }
  // Children of a CLOSED month are frozen too — mutating them would desync the
  // refund snapshot taken at close. Admin escape hatch: reopenPettyCashMonth.
  if (claim.pettycash_fund_id) {
    const { data: parentFund } = await supabase
      .from('expense_claims')
      .select('pettycash_closed_at')
      .eq('id', claim.pettycash_fund_id)
      .single()
    if (parentFund?.pettycash_closed_at) {
      return { error: 'รอบเดือนของวงเงินนี้ปิดแล้ว ไม่สามารถแก้ไขรายการได้ (admin ต้องเปิดรอบอีกครั้งก่อน)' }
    }
  }

  // Auto-import stock event → job_cost_events
  if (updateData.job_event_id && updateData.job_event_id.startsWith('stock:')) {
    const stockEventId = updateData.job_event_id.replace('stock:', '')
    const { importEventFromStock } = await import('../costs/actions')
    const importResult = await importEventFromStock(stockEventId)
    if (importResult.error) {
      updateData.job_event_id = (importResult as any).existingId || null
      if (!updateData.job_event_id) return { error: `ไม่สามารถนำเข้าอีเวนต์ได้: ${importResult.error}` }
    } else {
      updateData.job_event_id = importResult.id || null
    }
  }

  // Auto-import closure event → job_cost_events
  if (updateData.job_event_id && updateData.job_event_id.startsWith('closure:')) {
    const closureId = updateData.job_event_id.replace('closure:', '')
    const { importEventFromClosure } = await import('../costs/actions')
    const importResult = await importEventFromClosure(closureId)
    if (importResult.error) {
      updateData.job_event_id = (importResult as any).existingId || null
      if (!updateData.job_event_id) return { error: `ไม่สามารถนำเข้าอีเวนต์ได้: ${importResult.error}` }
    } else {
      updateData.job_event_id = importResult.id || null
    }
  }

  // Track what changed for the log
  const changes: Record<string, { from: any; to: any }> = {}
  const fieldsToCheck = ['title', 'description', 'category', 'amount', 'unit_price', 'unit', 'quantity', 'expense_date', 'vat_mode', 'withholding_tax_rate', 'notes', 'bank_name', 'bank_account_number', 'account_holder_name', 'claim_type', 'job_event_id', 'funding_source'] as const
  for (const key of fieldsToCheck) {
    if (key in updateData && updateData[key as keyof typeof updateData] !== (claim as any)[key]) {
      changes[key] = { from: (claim as any)[key], to: updateData[key as keyof typeof updateData] }
    }
  }

  // Handle receipt file uploads
  let newReceiptUrls: string[] = []
  if (receiptFormData) {
    const files: File[] = []
    const entries = receiptFormData.getAll('receipt_files')
    for (const entry of entries) {
      if (entry instanceof File && entry.size > 0) files.push(entry)
    }
    if (files.length > 0) {
      newReceiptUrls = await uploadReceiptFiles(supabase, files, claim.claim_number)
    }
  }

  // SECURITY: whitelist columns — a server action is a callable endpoint and
  // accepts arbitrary runtime keys, so spreading caller input would let a
  // non-admin set e.g. { status: 'paid' } or { pettycash_fund_id: ... }.
  const finalData: any = {}
  for (const key of fieldsToCheck) {
    if (key in updateData) finalData[key] = (updateData as any)[key]
  }
  if ('include_vat' in updateData) finalData.include_vat = updateData.include_vat
  if (newReceiptUrls.length > 0) {
    const existing = claim.receipt_urls || []
    finalData.receipt_urls = [...existing, ...newReceiptUrls]
    changes['receipt_urls'] = { from: existing.length, to: finalData.receipt_urls.length }
  }

  // Tax invoice numbers — array, compare element-wise for change log
  if ('tax_invoice_numbers' in updateData) {
    const incoming = (updateData.tax_invoice_numbers ?? []).map(s => String(s).trim()).filter(Boolean)
    const existing = (claim.tax_invoice_numbers ?? []) as string[]
    const sameLength = incoming.length === existing.length
    const sameContent = sameLength && incoming.every((v, i) => v === existing[i])
    if (!sameContent) {
      changes['tax_invoice_numbers'] = { from: existing, to: incoming }
    }
    finalData.tax_invoice_numbers = incoming
  }

  const { error } = await supabase
    .from('expense_claims')
    .update(finalData)
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาดในการแก้ไข' }

  // Sync ต้นทุนในโมดูล Costs: ใบเบิกที่ผูก event จะ auto-สร้าง job_cost_item ไว้
  // (notes = "<claim_number>::<id>") เป็น snapshot ตอน approve ครั้งเดียว — เมื่อแก้ใบเบิก
  // ทีหลัง (เช่น แก้ยอด) ต้อง sync ให้ตรง ไม่งั้น Costs จะคิดต้นทุนผิด. แตะเฉพาะ row
  // ที่ auto-สร้าง (มี "::<id>" ใน notes) เท่านั้น — รายการที่กรอกมือไม่โดน.
  {
    const eff = { ...claim, ...finalData }
    const linkedEventId: string | null = eff.job_event_id ?? null
    if (linkedEventId) {
      const amount = Number(eff.amount) || (Number(eff.unit_price) || 0) * (Number(eff.quantity) || 0)
      await supabase.from('job_cost_items').update({
        job_event_id: linkedEventId,
        category: eff.category,
        description: `[เบิกเงิน] ${eff.title}`,
        amount,
        unit_price: Number(eff.unit_price) || amount,
        quantity: eff.quantity,
      }).like('notes', `%::${id}`)
    } else {
      // เลิกผูก event → ลบ cost item ที่ออโต้สร้างไว้
      await supabase.from('job_cost_items').delete().like('notes', `%::${id}`)
    }
  }

  // Log changes
  if (Object.keys(changes).length > 0) {
    await supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: 'update',
      changed_by: userId,
      changes,
      note: newReceiptUrls.length > 0
        ? `แก้ไขข้อมูล + อัพโหลดเอกสาร ${newReceiptUrls.length} ไฟล์`
        : 'แก้ไขข้อมูล',
    })
  } else if (newReceiptUrls.length > 0) {
    await supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: 'upload_receipt',
      changed_by: userId,
      changes: { receipt_urls: { from: (claim.receipt_urls || []).length, to: (claim.receipt_urls || []).length + newReceiptUrls.length } },
      note: `อัพโหลดเอกสาร ${newReceiptUrls.length} ไฟล์`,
    })
  }

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  revalidatePath('/costs')
  return { success: true }
}

// ============================================================================
// Remove a receipt file (admin any status; owner only draft/pending)
// ============================================================================

export async function removeReceiptFile(id: string, url: string) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('status, submitted_by, receipt_urls')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }

  const isAdmin = role === 'admin'
  const isOwner = claim.submitted_by === userId
  if (!isAdmin && !['draft', 'pending'].includes(claim.status)) return { error: 'ลบเอกสารได้เฉพาะใบเบิกที่ยังไม่ถูกดำเนินการ' }
  if (!isAdmin && !isOwner) return { error: 'คุณไม่มีสิทธิ์แก้ไขใบเบิกนี้' }

  const existing: string[] = claim.receipt_urls || []
  if (!existing.includes(url)) return { error: 'ไม่พบไฟล์นี้ในใบเบิก' }

  const { error } = await supabase
    .from('expense_claims')
    .update({ receipt_urls: existing.filter(u => u !== url) })
    .eq('id', id)
  if (error) return { error: 'เกิดข้อผิดพลาดในการลบเอกสาร' }

  await removeStorageByUrls(supabase, 'receipts', [url])

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'delete_receipt',
    changed_by: userId,
    changes: { receipt_urls: { from: existing.length, to: existing.length - 1 } },
    note: 'ลบเอกสารแนบ 1 ไฟล์',
  })

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  return { success: true }
}

// ============================================================================
// Get Claim Edit Logs
// ============================================================================

export async function getClaimLogs(claimId: string) {
  const { userId, role } = await getSession()
  if (!userId) return []

  const supabase = createServiceClient()

  // Non-admins may only read logs for claims they own — except petty-cash docs,
  // which belong to the shared office box.
  if (role !== 'admin') {
    const { data: owned } = await supabase
      .from('expense_claims')
      .select('submitted_by, claim_type, pettycash_fund_id')
      .eq('id', claimId)
      .single()
    const isPettyRelated = owned?.claim_type === 'petty_cash' || !!owned?.pettycash_fund_id
    if (!owned || (owned.submitted_by !== userId && !isPettyRelated)) return []
  }

  const { data, error } = await supabase
    .from('expense_claim_logs')
    .select(`
      *,
      editor:profiles!expense_claim_logs_changed_by_fkey(id, full_name)
    `)
    .eq('claim_id', claimId)
    .order('created_at', { ascending: false })

  if (error) return []
  return data || []
}

// ============================================================================
// Submit Claim (owner) — draft → pending
// Requires at least one receipt to be attached.
// ============================================================================

export async function submitClaim(id: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('status, submitted_by, receipt_urls, claim_number, title, amount, claim_type')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.submitted_by !== userId) return { error: 'คุณไม่มีสิทธิ์ยื่นใบเบิกนี้' }
  if (claim.status !== 'draft') return { error: 'ยื่นได้เฉพาะใบเบิกที่อยู่ในสถานะ "แบบร่าง" เท่านั้น' }
  // Advance (ทดลองจ่าย) and petty cash (เงินสดย่อย) don't require receipts at
  // submission — they're uploaded later as expenses are logged.
  if (claim.claim_type !== 'advance' && claim.claim_type !== 'petty_cash' && (!claim.receipt_urls || claim.receipt_urls.length === 0)) {
    return { error: 'กรุณาแนบเอกสารอย่างน้อย 1 ไฟล์ก่อนยื่นใบเบิก' }
  }

  const { error } = await supabase
    .from('expense_claims')
    .update({ status: 'pending', submitted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'submit',
    changed_by: userId,
    changes: { status: { from: 'draft', to: 'pending' } },
    note: 'ยื่นใบเบิกเพื่อขออนุมัติ',
  })

  await logActivity('SUBMIT_EXPENSE_CLAIM', {
    claimId: id,
    claimNumber: claim.claim_number,
    title: claim.title,
    amount: claim.amount,
  })

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  return { success: true }
}

// ============================================================================
// Cancel Claim (owner only) — draft | pending → cancelled
// ============================================================================

export async function cancelClaim(id: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('status, submitted_by, claim_number')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.submitted_by !== userId) return { error: 'เฉพาะผู้ยื่นใบเบิกเท่านั้นที่สามารถยกเลิกได้' }
  if (!['draft', 'pending'].includes(claim.status)) {
    return { error: 'ยกเลิกได้เฉพาะใบเบิกที่อยู่ในสถานะ "แบบร่าง" หรือ "รออนุมัติ" เท่านั้น' }
  }

  const { error } = await supabase
    .from('expense_claims')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId,
    })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'cancel',
    changed_by: userId,
    changes: { status: { from: claim.status, to: 'cancelled' } },
    note: 'ยกเลิกใบเบิกโดยผู้ยื่น',
  })

  await logActivity('CANCEL_EXPENSE_CLAIM', {
    claimId: id,
    claimNumber: claim.claim_number,
    fromStatus: claim.status,
  })

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  return { success: true }
}

// ============================================================================
// Approve / Reject
// ============================================================================

export async function approveClaim(id: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถอนุมัติได้' }

  const supabase = createServiceClient()

  // Get claim details
  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.status !== 'pending') return { error: 'อนุมัติได้เฉพาะใบเบิกที่อยู่ในสถานะ "รออนุมัติ" เท่านั้น' }

  const now = new Date().toISOString()

  // Update claim status: pending → approved
  const { error } = await supabase
    .from('expense_claims')
    .update({
      status: 'approved',
      approved_by: userId,
      approved_at: now,
    })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'approve',
    changed_by: userId,
    changes: { status: { from: 'pending', to: 'approved' } },
    note: 'อนุมัติใบเบิก',
  })

  // If linked to event → job_event_id ชี้ไป job_cost_events.id ตรงๆ แล้ว
  if (claim.job_event_id) {
    await supabase.from('job_cost_items').insert({
      job_event_id: claim.job_event_id,
      category: claim.category,
      description: `[เบิกเงิน] ${claim.title}`,
      amount: claim.amount || (claim.unit_price * claim.quantity),
      unit_price: claim.unit_price || claim.amount,
      quantity: claim.quantity,
      unit: 'รายการ',
      recorded_by: userId,
      notes: `${claim.claim_number}::${id}`,
    })
  }

  await logActivity('APPROVE_EXPENSE_CLAIM', {
    claimId: id,
    claimNumber: claim.claim_number,
    totalAmount: claim.total_amount,
  })

  // Notify the claim submitter
  if (claim.submitted_by) {
    await createNotifications({
      userIds: [claim.submitted_by],
      type: 'expense_approved',
      title: `ใบเบิก ${claim.claim_number} ได้รับการอนุมัติแล้ว`,
      body: claim.title,
      referenceType: 'expense_claim',
      referenceId: id,
      actorId: userId,
    })
  }

  revalidatePath('/finance')
  revalidatePath('/costs')
  return { success: true }
}

export async function rejectClaim(id: string, reason: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถปฏิเสธได้' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('claim_number, status, submitted_by, title')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.status !== 'pending') return { error: 'ปฏิเสธได้เฉพาะใบเบิกที่อยู่ในสถานะ "รออนุมัติ" เท่านั้น' }

  const { error } = await supabase
    .from('expense_claims')
    .update({
      status: 'rejected',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      reject_reason: reason || 'ไม่ระบุเหตุผล',
    })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'reject',
    changed_by: userId,
    changes: { status: { from: 'pending', to: 'rejected' } },
    note: reason || 'ไม่ระบุเหตุผล',
  })

  await logActivity('REJECT_EXPENSE_CLAIM', {
    claimId: id,
    claimNumber: claim.claim_number,
    reason,
  })

  // Notify the claim submitter
  if (claim.submitted_by) {
    await createNotifications({
      userIds: [claim.submitted_by],
      type: 'expense_rejected',
      title: `ใบเบิก ${claim.claim_number} ถูกปฏิเสธ`,
      body: reason || 'ไม่ระบุเหตุผล',
      referenceType: 'expense_claim',
      referenceId: id,
      actorId: userId,
    })
  }

  revalidatePath('/finance')
  return { success: true }
}

// ============================================================================
// Mark as Pending Month End (admin only) — awaiting_payment → pending_month_end
// ============================================================================

// ============================================================================
// Approve directly as Pending Month End (admin only) — pending → pending_month_end
// ============================================================================

export async function approveAsPendingMonthEnd(id: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.status !== 'pending') return { error: 'อนุมัติได้เฉพาะใบเบิกที่อยู่ในสถานะ "รออนุมัติ" เท่านั้น' }

  const now = new Date().toISOString()

  const { error } = await supabase
    .from('expense_claims')
    .update({
      status: 'pending_month_end',
      approved_by: userId,
      approved_at: now,
    })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  // Create cost item if linked to event (same as approveClaim)
  if (claim.job_event_id) {
    await supabase.from('job_cost_items').insert({
      job_event_id: claim.job_event_id,
      category: claim.category,
      description: `[เบิกเงิน] ${claim.title}`,
      amount: claim.amount || (claim.unit_price * claim.quantity),
      unit_price: claim.unit_price || claim.amount,
      quantity: claim.quantity,
      unit: 'รายการ',
      recorded_by: userId,
      notes: `${claim.claim_number}::${id}`,
    })
  }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'approve_month_end',
    changed_by: userId,
    changes: { status: { from: 'pending', to: 'pending_month_end' } },
    note: 'อนุมัติ — รอจ่ายสิ้นเดือน',
  })

  await logActivity('APPROVE_EXPENSE_CLAIM_MONTH_END', {
    claimId: id,
    claimNumber: claim.claim_number,
    totalAmount: claim.total_amount,
  })

  if (claim.submitted_by) {
    await createNotifications({
      userIds: [claim.submitted_by],
      type: 'expense_approved',
      title: `ใบเบิก ${claim.claim_number} ได้รับการอนุมัติ (รอจ่ายสิ้นเดือน)`,
      body: claim.title,
      referenceType: 'expense_claim',
      referenceId: id,
      actorId: userId,
    })
  }

  revalidatePath('/finance')
  revalidatePath('/finance/payouts')
  revalidatePath('/costs')
  return { success: true }
}

export async function markAsPendingMonthEnd(id: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('claim_number, status, total_amount')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  // Accept 'approved', 'waiting_tax_invoice' (new flow) and 'awaiting_payment' (legacy data)
  if (!['approved', 'awaiting_payment', 'waiting_tax_invoice'].includes(claim.status)) {
    return { error: 'เลื่อนจ่ายสิ้นเดือนได้เฉพาะใบเบิกที่อนุมัติแล้วเท่านั้น' }
  }

  const { error } = await supabase
    .from('expense_claims')
    .update({ status: 'pending_month_end' })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'defer_month_end',
    changed_by: userId,
    changes: { status: { from: claim.status, to: 'pending_month_end' } },
    note: 'เลื่อนจ่ายสิ้นเดือน',
  })

  await logActivity('MARK_CLAIM_PENDING_MONTH_END', {
    claimId: id,
    claimNumber: claim.claim_number,
    totalAmount: claim.total_amount,
  })

  revalidatePath('/finance')
  revalidatePath('/finance/payouts')
  return { success: true }
}

// ============================================================================
// Mark as Waiting Tax Invoice (admin only) — approved → waiting_tax_invoice
// ============================================================================

export async function markAsWaitingTaxInvoice(id: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('claim_number, status, submitted_by, title')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.status !== 'approved') {
    return { error: 'ขอใบกำกับภาษีได้เฉพาะใบเบิกที่อยู่ในสถานะ "อนุมัติแล้ว" เท่านั้น' }
  }

  const { error } = await supabase
    .from('expense_claims')
    .update({ status: 'waiting_tax_invoice' })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'waiting_tax_invoice',
    changed_by: userId,
    changes: { status: { from: 'approved', to: 'waiting_tax_invoice' } },
    note: 'รอใบกำกับภาษีจากผู้เบิก',
  })

  await logActivity('MARK_CLAIM_WAITING_TAX_INVOICE', {
    claimId: id,
    claimNumber: claim.claim_number,
  })

  if (claim.submitted_by) {
    await createNotifications({
      userIds: [claim.submitted_by],
      type: 'expense_waiting_tax_invoice',
      title: `ใบเบิก ${claim.claim_number} — กรุณาอัพโหลดใบกำกับภาษี`,
      body: 'Admin ขอใบกำกับภาษีสำหรับใบเบิกนี้ กรุณาอัพโหลดเพื่อดำเนินการชำระเงินต่อ',
      referenceType: 'expense_claim',
      referenceId: id,
      actorId: userId,
    })
  }

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  return { success: true }
}

// ============================================================================
// Upload Tax Invoice (owner or admin) — only when status = waiting_tax_invoice
// ============================================================================

export async function uploadTaxInvoice(id: string, formData: FormData) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('status, submitted_by, approved_by, claim_number, tax_invoice_urls, tax_invoice_numbers')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.status !== 'waiting_tax_invoice') {
    return { error: 'อัพโหลดใบกำกับภาษีได้เฉพาะเมื่ออยู่ในสถานะ "รอใบกำกับภาษี" เท่านั้น' }
  }
  if (role !== 'admin' && claim.submitted_by !== userId) {
    return { error: 'คุณไม่มีสิทธิ์อัพโหลดเอกสารนี้' }
  }

  // Paired upload: each tax invoice entry = (optional file, optional number).
  // The client appends them in matching order — index N of `tax_invoice_files`
  // corresponds to index N of `tax_invoice_numbers`. Empty placeholder
  // entries (an empty file or empty string) are still appended to keep alignment.
  const fileEntries = formData.getAll('tax_invoice_files')
  const numberEntries = formData.getAll('tax_invoice_numbers')
  const pairedCount = Math.max(fileEntries.length, numberEntries.length)

  type Pair = { file: File | null; number: string }
  const pairs: Pair[] = []
  for (let i = 0; i < pairedCount; i++) {
    const f = fileEntries[i]
    const n = numberEntries[i]
    const file = f instanceof File && f.size > 0 ? f : null
    const number = typeof n === 'string' ? n.trim() : ''
    if (!file && !number) continue
    pairs.push({ file, number })
  }

  if (pairs.length === 0) {
    return { error: 'กรุณาแนบไฟล์ใบกำกับภาษีหรือกรอกเลขที่ใบกำกับอย่างน้อย 1 รายการ' }
  }

  // Upload files; null files map to empty-string URLs so we keep the parallel
  // alignment between `tax_invoice_urls[i]` and `tax_invoice_numbers[i]`.
  const filesToUpload = pairs.filter(p => p.file).map(p => p.file as File)
  let uploadedUrls: string[] = []
  if (filesToUpload.length > 0) {
    uploadedUrls = await uploadReceiptFiles(supabase, filesToUpload, `${claim.claim_number}-tax-invoice`)
    if (uploadedUrls.length !== filesToUpload.length) {
      return { error: 'เกิดข้อผิดพลาดในการอัพโหลดไฟล์ใบกำกับภาษี' }
    }
  }

  // Re-map uploaded URLs back into pair order (entries without a file get '')
  const newUrls: string[] = []
  const newNumbers: string[] = []
  let uIdx = 0
  for (const p of pairs) {
    newUrls.push(p.file ? uploadedUrls[uIdx++] : '')
    newNumbers.push(p.number)
  }

  const existingUrls: string[] = (claim.tax_invoice_urls as string[]) || []
  const existingNumbers: string[] = (claim.tax_invoice_numbers as string[]) || []

  const updatePayload: Record<string, any> = {
    tax_invoice_urls: [...existingUrls, ...newUrls],
    tax_invoice_numbers: [...existingNumbers, ...newNumbers],
    // Auto-transition: waiting_tax_invoice → approved once entries are provided
    status: 'approved',
  }

  const { error } = await supabase
    .from('expense_claims')
    .update(updatePayload)
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาดในการบันทึก' }

  // Log: how many invoice entries were added (file + number pairs)
  const filesAdded = newUrls.filter(u => u !== '').length
  const numbersAdded = newNumbers.filter(n => n !== '').length
  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'upload_tax_invoice',
    changed_by: userId,
    changes: {
      tax_invoice_urls: { from: existingUrls.length, to: existingUrls.length + newUrls.length },
      tax_invoice_numbers: { from: existingNumbers.length, to: existingNumbers.length + newNumbers.length },
    },
    note: `เพิ่มใบกำกับภาษี ${pairs.length} รายการ (ไฟล์ ${filesAdded} • เลขที่ ${numbersAdded})`,
  })

  // Log the auto status transition
  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'auto_transition',
    changed_by: userId,
    changes: { status: { from: 'waiting_tax_invoice', to: 'approved' } },
    note: 'Auto-transition: Tax Invoice Uploaded',
  })

  // Notify only the approving admin (fallback: all admins if unknown)
  let recipientIds: string[] = claim.approved_by ? [claim.approved_by] : []
  if (recipientIds.length === 0) {
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
    recipientIds = (adminProfiles || []).map((p: { id: string }) => p.id)
  }
  if (recipientIds.length > 0) {
    await createNotifications({
      userIds: recipientIds,
      type: 'expense_tax_invoice_uploaded',
      title: `ใบเบิก ${claim.claim_number} — อัพโหลดใบกำกับภาษีแล้ว`,
      body: 'ผู้เบิกอัพโหลดใบกำกับภาษีแล้ว สถานะกลับเป็น "อนุมัติแล้ว" พร้อมดำเนินการชำระเงิน',
      referenceType: 'expense_claim',
      referenceId: id,
      actorId: userId,
    })
  }

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  revalidatePath('/finance/payouts')
  return { success: true, autoTransitioned: true }
}

// ============================================================================
// Set tax invoice entries — owner or admin (any post-submit status)
//
// Replaces both `tax_invoice_urls[]` and `tax_invoice_numbers[]` so they stay
// aligned by index (entry i = url[i] + number[i]). Used by the detail view's
// inline editor to delete an entry, edit a number, or reorder.
// ============================================================================

export async function setTaxInvoiceEntries(
  id: string,
  entries: { url: string; number: string }[],
) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('submitted_by, tax_invoice_urls, tax_invoice_numbers, claim_number')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  const isAdmin = role === 'admin'
  const isOwner = claim.submitted_by === userId
  if (!isAdmin && !isOwner) return { error: 'คุณไม่มีสิทธิ์แก้ไขใบเบิกนี้' }

  const cleaned = (entries || [])
    .map(e => ({ url: String(e?.url || '').trim(), number: String(e?.number || '').trim() }))
    .filter(e => e.url || e.number)

  const newUrls = cleaned.map(e => e.url)
  const newNumbers = cleaned.map(e => e.number)

  const existingUrls: string[] = (claim.tax_invoice_urls as string[]) || []
  const existingNumbers: string[] = (claim.tax_invoice_numbers as string[]) || []

  const { error } = await supabase
    .from('expense_claims')
    .update({
      tax_invoice_urls: newUrls,
      tax_invoice_numbers: newNumbers,
    })
    .eq('id', id)

  if (error) return { error: `เกิดข้อผิดพลาดในการบันทึก: ${error.message}` }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'update_tax_invoice_entries',
    changed_by: userId,
    changes: {
      tax_invoice_urls: { from: existingUrls.length, to: newUrls.length },
      tax_invoice_numbers: { from: existingNumbers, to: newNumbers },
    },
    note: `แก้ไขรายการใบกำกับภาษี (${existingUrls.length} → ${newUrls.length} รายการ)`,
  })

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  revalidatePath('/finance/overview')
  return { success: true }
}

// ============================================================================
// Mark as Paid (admin only) — approved | pending_month_end | awaiting_payment → paid
// ============================================================================

export async function markAsPaid(id: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  // Accept new 'approved', 'waiting_tax_invoice', legacy 'awaiting_payment' and deferred 'pending_month_end'
  if (!['approved', 'awaiting_payment', 'pending_month_end', 'waiting_tax_invoice'].includes(claim.status)) {
    return { error: 'ชำระเงินได้เฉพาะใบเบิกที่อนุมัติแล้วเท่านั้น' }
  }

  // A petty-cash top-up must not be paid into a CLOSED month — the close
  // snapshot already fixed the box balance.
  if (claim.claim_type === 'petty_cash' && claim.pettycash_fund_id) {
    const { data: parentFund } = await supabase
      .from('expense_claims')
      .select('pettycash_closed_at')
      .eq('id', claim.pettycash_fund_id)
      .single()
    if (parentFund?.pettycash_closed_at) {
      return { error: 'วงเงินปลายทางปิดเดือนแล้ว — จ่ายรายการเติมเงินนี้ไม่ได้ (ยกเลิกรายการแทน)' }
    }
  }

  const { error } = await supabase
    .from('expense_claims')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by: userId,
    })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'mark_paid',
    changed_by: userId,
    changes: { status: { from: claim.status, to: 'paid' } },
    note: 'ชำระเงินแล้ว',
  })

  await logActivity('MARK_CLAIM_PAID', {
    claimId: id,
    claimNumber: claim.claim_number,
    totalAmount: claim.total_amount,
  })

  revalidatePath('/finance')
  revalidatePath('/finance/payouts')
  revalidatePath('/finance/archive')
  return { success: true }
}

// ============================================================================
// Delete Claim (admin or owner if pending)
// ============================================================================

export async function deleteClaim(id: string) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถลบใบเบิกได้' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('claim_number, claim_type, submitted_by, status, job_event_id, receipt_urls, tax_invoice_urls, actual_receipt_urls, pettycash_fund_id')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }

  // Children of a CLOSED petty-cash month are frozen (refund snapshot).
  if (claim.pettycash_fund_id) {
    const { data: parentFund } = await supabase
      .from('expense_claims')
      .select('pettycash_closed_at')
      .eq('id', claim.pettycash_fund_id)
      .single()
    if (parentFund?.pettycash_closed_at) {
      return { error: 'รอบเดือนของวงเงินปิดแล้ว — admin ต้องเปิดรอบอีกครั้งก่อนจึงจะลบรายการได้' }
    }
  }

  // A petty-cash fund with children (expenses/top-ups) must not be deleted —
  // the children would orphan and the box audit trail would break.
  if (claim.claim_type === 'petty_cash') {
    const { count } = await supabase
      .from('expense_claims')
      .select('id', { count: 'exact', head: true })
      .eq('pettycash_fund_id', id)
    if ((count || 0) > 0) {
      return { error: 'วงเงินนี้มีรายการลูก (ค่าใช้จ่าย/เติมเงิน) อยู่ — ยกเลิก/ลบรายการลูกก่อนจึงจะลบวงเงินได้' }
    }
  }

  // ถ้าเคย approved → ลบ cost item ที่สร้างจากใบเบิกนี้ด้วย
  // job_event_id ชี้ไป job_cost_events.id ตรงๆ
  if (claim.status === 'approved' && claim.job_event_id) {
    await supabase
      .from('job_cost_items')
      .delete()
      .eq('job_event_id', claim.job_event_id)
      .like('notes', `%${claim.claim_number}%`)
  }

  const { error } = await supabase.from('expense_claims').delete().eq('id', id)
  if (error) return { error: 'เกิดข้อผิดพลาดในการลบ' }

  // ลบไฟล์ใบเสร็จออกจาก Storage ไม่ให้กลายเป็น orphan
  await removeStorageByUrls(supabase, 'receipts', [
    ...(claim.receipt_urls || []),
    ...(claim.tax_invoice_urls || []),
    ...(claim.actual_receipt_urls || []),
  ])

  await logActivity('DELETE_EXPENSE_CLAIM', {
    claimId: id,
    claimNumber: claim.claim_number,
  })

  revalidatePath('/finance')
  revalidatePath('/costs')
  return { success: true }
}

// ============================================================================
// Admin Override Status — Admin only, any → any transition with reason
// ============================================================================

export async function adminOverrideStatus(id: string, newStatus: string, reason: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถ Override สถานะได้' }
  if (!reason?.trim()) return { error: 'กรุณาระบุเหตุผลในการเปลี่ยนสถานะ' }

  const validStatuses = ['draft', 'pending', 'approved', 'waiting_tax_invoice', 'pending_month_end', 'paid', 'rejected', 'cancelled']
  if (!validStatuses.includes(newStatus)) return { error: 'สถานะไม่ถูกต้อง' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.status === newStatus) return { error: 'สถานะเดิมและสถานะใหม่เหมือนกัน' }

  // Petty-cash guardrails: children of a closed month are frozen, and a fund
  // with children must stay a live fund (its children reference it).
  if (claim.pettycash_fund_id) {
    const { data: parentFund } = await supabase
      .from('expense_claims')
      .select('pettycash_closed_at')
      .eq('id', claim.pettycash_fund_id)
      .single()
    if (parentFund?.pettycash_closed_at) {
      return { error: 'รอบเดือนของวงเงินปิดแล้ว — เปิดรอบอีกครั้งก่อนจึงจะแก้สถานะรายการลูกได้' }
    }
  }
  if (claim.claim_type === 'petty_cash' && !claim.pettycash_fund_id && ['draft', 'pending', 'cancelled', 'rejected'].includes(newStatus)) {
    const { count } = await supabase
      .from('expense_claims')
      .select('id', { count: 'exact', head: true })
      .eq('pettycash_fund_id', id)
    if ((count || 0) > 0) {
      return { error: 'วงเงินนี้มีรายการลูกอยู่ — ไม่สามารถย้อนเป็น draft/pending หรือยกเลิก/ปฏิเสธได้' }
    }
  }

  const now = new Date().toISOString()
  const fromStatus = claim.status

  // Build update payload — set/clear metadata fields based on target status
  const updatePayload: Record<string, any> = { status: newStatus }

  if (newStatus === 'draft') {
    updatePayload.submitted_at = null
    updatePayload.approved_by = null
    updatePayload.approved_at = null
    updatePayload.reject_reason = null
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
  } else if (newStatus === 'pending') {
    updatePayload.approved_by = null
    updatePayload.approved_at = null
    updatePayload.reject_reason = null
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
    if (!claim.submitted_at) updatePayload.submitted_at = now
  } else if (newStatus === 'approved') {
    updatePayload.approved_by = userId
    updatePayload.approved_at = now
    updatePayload.reject_reason = null
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
    if (!claim.submitted_at) updatePayload.submitted_at = now
  } else if (newStatus === 'waiting_tax_invoice') {
    if (!claim.approved_by) updatePayload.approved_by = userId
    if (!claim.approved_at) updatePayload.approved_at = now
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
    updatePayload.reject_reason = null
    if (!claim.submitted_at) updatePayload.submitted_at = now
  } else if (newStatus === 'pending_month_end') {
    if (!claim.approved_by) updatePayload.approved_by = userId
    if (!claim.approved_at) updatePayload.approved_at = now
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
    updatePayload.reject_reason = null
    if (!claim.submitted_at) updatePayload.submitted_at = now
  } else if (newStatus === 'paid') {
    if (!claim.approved_by) updatePayload.approved_by = userId
    if (!claim.approved_at) updatePayload.approved_at = now
    updatePayload.paid_at = now
    updatePayload.paid_by = userId
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
    updatePayload.reject_reason = null
    if (!claim.submitted_at) updatePayload.submitted_at = now
  } else if (newStatus === 'rejected') {
    updatePayload.reject_reason = reason
    updatePayload.approved_by = userId
    updatePayload.approved_at = now
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
  } else if (newStatus === 'cancelled') {
    updatePayload.cancelled_at = now
    updatePayload.cancelled_by = userId
    updatePayload.paid_at = null
    updatePayload.paid_by = null
  }

  const { error } = await supabase
    .from('expense_claims')
    .update(updatePayload)
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ' }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'admin_override',
    changed_by: userId,
    changes: { status: { from: fromStatus, to: newStatus } },
    note: `[Admin Override] ${reason}`,
  })

  await logActivity('ADMIN_OVERRIDE_CLAIM_STATUS', {
    claimId: id,
    claimNumber: claim.claim_number,
    fromStatus,
    toStatus: newStatus,
    reason,
  })

  // Notify submitter of the override
  if (claim.submitted_by && claim.submitted_by !== userId) {
    await createNotifications({
      userIds: [claim.submitted_by],
      type: 'expense_approved',
      title: `ใบเบิก ${claim.claim_number} สถานะถูกเปลี่ยนเป็น "${newStatus}" โดย Admin`,
      body: reason,
      referenceType: 'expense_claim',
      referenceId: id,
      actorId: userId,
    })
  }

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  revalidatePath('/finance/payouts')
  revalidatePath('/costs')
  return { success: true }
}

// ============================================================================
// Get Job Events for dropdown
// ============================================================================

export async function getJobEventsForSelect() {
  const supabase = createServiceClient()

  // 1. ดึงจาก job_cost_events (อีเวนต์ที่ import เข้าระบบ costs แล้ว)
  const { data: jobEvents } = await supabase
    .from('job_cost_events')
    .select('id, event_name, event_date, event_location, status, source_event_id')
    .order('event_date', { ascending: false })
    .limit(200)

  // 2. ดึงจาก event_closures (ประวัติปิดงาน)
  const { data: closures } = await supabase
    .from('event_closures')
    .select('id, event_name, event_date, event_location')
    .order('event_date', { ascending: false })
    .limit(200)

  // 3. ดึงจาก events (อีเวนต์ที่สร้างจากหน้า /events — ยังเปิดอยู่)
  const { data: stockEvents } = await supabase
    .from('events')
    .select('id, name, event_date, location, status')
    .order('event_date', { ascending: false })
    .limit(200)

  // Map job_cost_events (active + completed)
  const events = (jobEvents || []).map(e => ({
    id: e.id,
    event_name: e.event_name,
    event_date: e.event_date,
    event_location: e.event_location || null,
    status: e.status || 'draft',
  }))

  // สร้าง Set ของ source_event_id ที่ import ไปแล้ว เพื่อ dedup กับ events table
  const importedSourceIds = new Set(
    (jobEvents || []).filter(e => e.source_event_id).map(e => e.source_event_id)
  )

  // Map closures — prefix ID กับ "closure:" เพื่อแยก source
  // และเช็ค dedup ด้วย event_name + event_date
  const existingKeys = new Set(
    events.map(e => `${e.event_name}::${e.event_date || ''}`)
  )

  const closureEvents = (closures || [])
    .filter(c => !existingKeys.has(`${c.event_name}::${c.event_date || ''}`))
    .map(c => ({
      id: `closure:${c.id}`,
      event_name: c.event_name,
      event_date: c.event_date,
      event_location: c.event_location || null,
      status: 'closed',
    }))

  // Map stock events — prefix ID กับ "stock:" เพื่อแยก source
  // dedup: ตัดอีเวนต์ที่ import เข้า job_cost_events แล้ว
  const stockEventsMapped = (stockEvents || [])
    .filter(e => !importedSourceIds.has(e.id))
    .map(e => ({
      id: `stock:${e.id}`,
      event_name: e.name,
      event_date: e.event_date,
      event_location: e.location || null,
      status: e.status || 'upcoming',
    }))

  return [...events, ...closureEvents, ...stockEventsMapped]
}

// ============================================================================
// Recreate cost item from approved claim (ถ้าเผลอลบใน Costs)
// ============================================================================

export async function recreateCostItemFromClaim(claimId: string, jobCostEventId: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', claimId)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.status !== 'approved') return { error: 'ใบเบิกยังไม่ได้อนุมัติ' }

  // สร้าง cost item ใหม่
  const { error } = await supabase.from('job_cost_items').insert({
    job_event_id: jobCostEventId,
    category: claim.category,
    description: `[เบิกเงิน] ${claim.title}`,
    amount: claim.amount || (claim.unit_price * claim.quantity),
    unit_price: claim.unit_price || claim.amount,
    quantity: claim.quantity,
    unit: 'รายการ',
    recorded_by: userId,
    notes: `${claim.claim_number}::${claimId}`,
  })

  if (error) return { error: 'เกิดข้อผิดพลาดในการสร้างรายการ' }

  revalidatePath('/costs')
  revalidatePath('/finance')
  return { success: true }
}

// ============================================================================
// Settle Advance Claim (เบิกทดลองจ่าย) — update actual spent + upload receipts
// & optional refund slip. Refund amount is auto-calculated.
//
// Allowed actors: owner of the claim, or admin.
// Allowed statuses: approved | paid | pending_month_end | waiting_tax_invoice
//   (any post-approval state — the user has the money and is reconciling it)
// ============================================================================

export async function settleAdvanceClaim(id: string, formData: FormData) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.claim_type !== 'advance') {
    return { error: 'การอัพเดทค่าใช้จ่ายจริงใช้ได้กับใบเบิกประเภท "ทดลองจ่าย" เท่านั้น' }
  }

  const isAdmin = role === 'admin'
  const isOwner = claim.submitted_by === userId
  if (!isAdmin && !isOwner) return { error: 'คุณไม่มีสิทธิ์อัพเดทใบเบิกนี้' }

  if (claim.status === 'refund_confirmed') {
    return { error: 'ยืนยันการคืนเงินไปแล้ว ไม่สามารถแก้ไขได้ (ติดต่อ admin เพื่อ override สถานะ)' }
  }
  if (!['approved', 'paid', 'pending_month_end', 'waiting_tax_invoice'].includes(claim.status)) {
    return { error: 'อัพเดทค่าใช้จ่ายจริงได้หลังจากใบเบิกถูกอนุมัติแล้วเท่านั้น' }
  }

  // Accept itemized breakdown (preferred) or a single total.
  // If items are provided, actual_spent_amount = sum(items[].amount).
  let items: { description: string; amount: number }[] = []
  const itemsRaw = formData.get('actual_spent_items') as string | null
  if (itemsRaw) {
    try {
      const parsed = JSON.parse(itemsRaw)
      if (Array.isArray(parsed)) {
        items = parsed
          .map((x: any) => ({
            description: String(x?.description ?? '').trim(),
            amount: Number(x?.amount) || 0,
          }))
          .filter(i => i.amount > 0 || i.description.length > 0)
      }
    } catch {
      return { error: 'รูปแบบรายการค่าใช้จ่ายไม่ถูกต้อง' }
    }
  }

  let actualSpent: number
  if (items.length > 0) {
    actualSpent = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
  } else {
    const actualSpentRaw = formData.get('actual_spent_amount')
    const n = actualSpentRaw !== null && actualSpentRaw !== '' ? Number(actualSpentRaw) : null
    if (n === null || !Number.isFinite(n) || n < 0) {
      return { error: 'กรุณาระบุจำนวนเงินที่ใช้จ่ายจริง หรือเพิ่มรายการค่าใช้จ่าย' }
    }
    actualSpent = n
  }

  const advanceAmount = Number(claim.amount) || 0
  const refundAmount = Math.max(0, advanceAmount - actualSpent)

  // Collect file uploads
  const actualReceiptFiles: File[] = []
  for (const entry of formData.getAll('actual_receipt_files')) {
    if (entry instanceof File && entry.size > 0) actualReceiptFiles.push(entry)
  }
  const refundSlipFiles: File[] = []
  for (const entry of formData.getAll('refund_slip_files')) {
    if (entry instanceof File && entry.size > 0) refundSlipFiles.push(entry)
  }

  let newActualReceiptUrls: string[] = []
  if (actualReceiptFiles.length > 0) {
    newActualReceiptUrls = await uploadReceiptFiles(supabase, actualReceiptFiles, `${claim.claim_number}-actual`)
  }
  let newRefundSlipUrls: string[] = []
  if (refundSlipFiles.length > 0) {
    newRefundSlipUrls = await uploadReceiptFiles(supabase, refundSlipFiles, `${claim.claim_number}-refund`)
  }

  const existingActual: string[] = claim.actual_receipt_urls || []
  const existingRefund: string[] = claim.refund_slip_urls || []

  const updatePayload: Record<string, any> = {
    actual_spent_amount: actualSpent,
    actual_spent_items: items.length > 0 ? items : (claim.actual_spent_items ?? []),
    refund_amount: refundAmount,
    advance_settled_at: new Date().toISOString(),
    advance_settled_by: userId,
  }
  if (newActualReceiptUrls.length > 0) {
    updatePayload.actual_receipt_urls = [...existingActual, ...newActualReceiptUrls]
  }
  if (newRefundSlipUrls.length > 0) {
    updatePayload.refund_slip_urls = [...existingRefund, ...newRefundSlipUrls]
  }

  let { error } = await supabase
    .from('expense_claims')
    .update(updatePayload)
    .eq('id', id)

  // Fallback: if the itemized column hasn't been added to the DB yet,
  // retry without it so the totals (actual_spent_amount / refund_amount)
  // still persist. The migration `20260423_add_advance_spent_items.sql`
  // must be applied to restore the itemized breakdown.
  if (error && /actual_spent_items/i.test(error.message)) {
    console.warn('actual_spent_items column missing — retrying without it. Run migration 20260423_add_advance_spent_items.sql.')
    const { actual_spent_items: _dropped, ...fallbackPayload } = updatePayload
    const retry = await supabase
      .from('expense_claims')
      .update(fallbackPayload)
      .eq('id', id)
    error = retry.error
  }

  if (error) {
    console.error('Settle advance error:', error)
    return { error: `เกิดข้อผิดพลาดในการบันทึก: ${error.message}` }
  }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'settle_advance',
    changed_by: userId,
    changes: {
      actual_spent_amount: { from: claim.actual_spent_amount ?? null, to: actualSpent },
      refund_amount: { from: claim.refund_amount ?? null, to: refundAmount },
      ...(newActualReceiptUrls.length > 0
        ? { actual_receipt_urls: { from: existingActual.length, to: existingActual.length + newActualReceiptUrls.length } }
        : {}),
      ...(newRefundSlipUrls.length > 0
        ? { refund_slip_urls: { from: existingRefund.length, to: existingRefund.length + newRefundSlipUrls.length } }
        : {}),
    },
    note: `อัพเดทค่าใช้จ่ายจริง ฿${actualSpent.toLocaleString()} (เงินคืน ฿${refundAmount.toLocaleString()})`,
  })

  await logActivity('SETTLE_ADVANCE_CLAIM', {
    claimId: id,
    claimNumber: claim.claim_number,
    advanceAmount,
    actualSpent,
    refundAmount,
  })

  // Notify only the approving admin when a user settles their advance (fallback: all admins)
  if (!isAdmin) {
    let recipientIds: string[] = claim.approved_by ? [claim.approved_by] : []
    if (recipientIds.length === 0) {
      const { data: adminProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
      recipientIds = (adminProfiles || []).map((p: { id: string }) => p.id)
    }
    if (recipientIds.length > 0) {
      await createNotifications({
        userIds: recipientIds,
        type: 'expense_approved',
        title: `ใบเบิก ${claim.claim_number} — อัพเดทค่าใช้จ่ายจริง`,
        body: `ผู้เบิกอัพเดทค่าใช้จ่ายจริง ฿${actualSpent.toLocaleString()} / เงินคืน ฿${refundAmount.toLocaleString()}`,
        referenceType: 'expense_claim',
        referenceId: id,
        actorId: userId,
      })
    }
  }

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  return { success: true, refundAmount }
}

// ============================================================================
// Confirm Refund Received (admin-only)
// Marks an advance claim as fully settled once admin has verified the refund
// transfer slip and received the money back. Transitions status to
// 'refund_confirmed' (terminal).
// ============================================================================
export async function confirmRefundReceived(id: string) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่ยืนยันได้' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  // Advance claims AND petty-cash funds (month-close leftover) both return cash
  // to the company through this confirmation.
  const isPettyFund = claim.claim_type === 'petty_cash' && !claim.pettycash_fund_id
  if (claim.claim_type !== 'advance' && !isPettyFund) {
    return { error: 'ใช้ได้เฉพาะใบเบิกประเภท "ทดลองจ่าย" หรือวงเงินสดย่อยเท่านั้น' }
  }
  // A fund's return is only confirmable after the month has been closed —
  // the leftover snapshot doesn't exist before that.
  if (isPettyFund && !claim.pettycash_closed_at) {
    return { error: 'ต้องปิดเดือนก่อนจึงจะยืนยันเงินคืนได้' }
  }
  if (claim.status === 'refund_confirmed') {
    return { error: 'ยืนยันการคืนเงินไปแล้ว' }
  }
  if (!['approved', 'paid', 'pending_month_end', 'waiting_tax_invoice', 'awaiting_payment'].includes(claim.status)) {
    return { error: 'ยืนยันการคืนเงินได้หลังจากใบเบิกถูกอนุมัติแล้วเท่านั้น' }
  }
  const refundAmount = Number(claim.refund_amount) || 0
  if (refundAmount <= 0) {
    return { error: 'ใบเบิกนี้ไม่มีเงินคืนที่ต้องยืนยัน' }
  }
  // Fund-linked advance: the leftover is CASH going back into the box — there
  // is no transfer slip. Admin confirms against the box count instead.
  const refundsToBox = claim.claim_type === 'advance' && !!claim.pettycash_fund_id
  const refundSlips: string[] = claim.refund_slip_urls || []
  if (refundSlips.length === 0 && !refundsToBox) {
    return { error: 'ต้องมีสลิปโอนเงินคืนก่อนจึงจะยืนยันได้' }
  }

  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('expense_claims')
    .update({
      status: 'refund_confirmed',
      refund_confirmed_at: nowIso,
      refund_confirmed_by: userId,
    })
    .eq('id', id)

  if (error) {
    console.error('Confirm refund error:', error)
    return { error: `เกิดข้อผิดพลาดในการบันทึก: ${error.message}` }
  }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'confirm_refund',
    changed_by: userId,
    changes: {
      status: { from: claim.status, to: 'refund_confirmed' },
      refund_amount: { from: null, to: refundAmount },
    },
    note: `ยืนยันรับเงินคืนบริษัท ฿${refundAmount.toLocaleString()}`,
  })

  await logActivity('CONFIRM_REFUND_RECEIVED', {
    claimId: id,
    claimNumber: claim.claim_number,
    refundAmount,
  })

  if (claim.submitted_by && claim.submitted_by !== userId) {
    await createNotifications({
      userIds: [claim.submitted_by],
      type: 'expense_refund_confirmed',
      title: `ใบเบิก ${claim.claim_number} — ยืนยันรับเงินคืนแล้ว`,
      body: `admin ยืนยันรับเงินคืน ฿${refundAmount.toLocaleString()} เรียบร้อย`,
      referenceType: 'expense_claim',
      referenceId: id,
      actorId: userId,
    })
  }

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  return { success: true }
}

// ============================================================================
// Petty Cash (เงินสดย่อย) — monthly fund model
// Fund (ใบแม่): claim_type='petty_cash', pettycash_fund_id NULL, amount = ยอดตั้งต้น.
// Top-up: claim_type='petty_cash' + fund_id set (approve→pay adds cash to the box).
// Expense: claim_type='other' + fund_id set, created as PAID immediately — the
// cash already left the physical box; control = the box + admin audit at close.
//   balance = fund.amount (once paid) + Σ topups(paid) − Σ expenses(live)
// Month close: leftover returned to company via refund_amount/refund_slip_urls,
// then admin confirms via confirmRefundReceived → status 'refund_confirmed'.
// ============================================================================

const roundBaht = (n: number) => Math.round(n * 100) / 100

const PETTY_DEAD = ['cancelled', 'rejected']

// Children of a fund + money sums. Shared by fund page / ledger / close / PDF so
// the balance math lives in ONE place.
async function getPettyChildren(supabase: any, fundId: string) {
  const { data } = await supabase
    .from('expense_claims')
    .select(`
      id, claim_number, claim_type, title, category, amount, expense_date, status,
      receipt_urls, created_at, paid_at, refund_amount, advance_settled_at,
      submitter:profiles!expense_claims_submitted_by_fkey(id, full_name)
    `)
    .eq('pettycash_fund_id', fundId)
    .order('expense_date', { ascending: true })
    .limit(2000) // ponytail: PostgREST defaults to 1000 — a month won't hit 2000 entries

  const live = (data || []).filter((c: any) => !PETTY_DEAD.includes(c.status))
  const topups = live.filter((c: any) => c.claim_type === 'petty_cash')
  const expenses = live.filter((c: any) => c.claim_type !== 'petty_cash')
  const topupPaid = roundBaht(topups.filter((t: any) => t.status === 'paid').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0))
  const topupPending = roundBaht(topups.filter((t: any) => t.status !== 'paid').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0))
  const spent = roundBaht(expenses.reduce((s: number, e: any) => s + pettyExpenseAmount(e), 0))
  return { topups, expenses, topupPaid, topupPending, spent }
}

// Effective box cost of an expense. A fund-linked advance whose refund was
// confirmed put its leftover cash BACK in the box, so only the spent part counts.
function pettyExpenseAmount(e: any) {
  const amount = Number(e.amount) || 0
  const refund = e.claim_type === 'advance' && e.status === 'refund_confirmed' ? (Number(e.refund_amount) || 0) : 0
  return roundBaht(amount - refund)
}

export type PettyChildren = Awaited<ReturnType<typeof getPettyChildren>>

// The currently-open fund. Deliberately NOT scoped to the submitter — the box is
// a shared office resource and any staff member may log expenses into it.
export async function getOpenPettyCashFund() {
  const { userId } = await getSession()
  if (!userId) return { data: null }

  const supabase = createServiceClient()
  const { data: fund } = await supabase
    .from('expense_claims')
    .select('id, claim_number, title, amount, status, pettycash_period_start, pettycash_period_end')
    .eq('claim_type', 'petty_cash')
    .is('pettycash_fund_id', null)
    .is('pettycash_closed_at', null)
    .not('status', 'in', '(cancelled,rejected)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!fund) return { data: null }
  return {
    data: {
      id: fund.id as string,
      claimNumber: fund.claim_number as string,
      title: fund.title as string,
      amount: Number(fund.amount) || 0,
      status: fund.status as string,
      periodStart: fund.pettycash_period_start as string | null,
      periodEnd: fund.pettycash_period_end as string | null,
    },
  }
}

// Children + sums for the fund detail page (all staff may view — shared box).
export async function getPettyCashChildren(fundId: string) {
  const { userId } = await getSession()
  if (!userId) return null
  const supabase = createServiceClient()
  return getPettyChildren(supabase, fundId)
}

// Ledger: every fund (month) with its sums.
// ponytail: N+1 child queries — fine at ~12 funds/year, batch if it ever matters.
export async function getPettyCashLedger() {
  const { userId } = await getSession()
  if (!userId) return { funds: [] }

  const supabase = createServiceClient()
  const { data: fundRows } = await supabase
    .from('expense_claims')
    .select('*, submitter:profiles!expense_claims_submitted_by_fkey(id, full_name)')
    .eq('claim_type', 'petty_cash')
    .is('pettycash_fund_id', null)
    .not('status', 'in', '(cancelled,rejected)')
    .order('created_at', { ascending: false })

  const funds = []
  for (const fund of fundRows || []) {
    const kids = await getPettyChildren(supabase, fund.id)
    const funded = fund.status === 'paid' || fund.status === 'refund_confirmed'
    const initial = funded ? roundBaht(Number(fund.amount) || 0) : 0
    funds.push({
      fund,
      topups: kids.topups,
      expenses: kids.expenses,
      initial,
      topupPaid: kids.topupPaid,
      topupPending: kids.topupPending,
      spent: kids.spent,
      balance: roundBaht(initial + kids.topupPaid - kids.spent),
    })
  }
  return { funds }
}

// Log an expense paid from the cash box. Any staff member may log (shared box).
// The claim is created directly as PAID — the cash physically left the box; the
// control is the box itself + admin audit at month close. Corrections: admin
// override → cancelled.
export async function addPettyCashExpense(fundId: string, formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data: fund } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', fundId)
    .single()

  if (!fund || fund.claim_type !== 'petty_cash' || fund.pettycash_fund_id) {
    return { error: 'ไม่พบวงเงินสดย่อย' }
  }
  if (fund.pettycash_closed_at) return { error: 'วงเงินนี้ปิดเดือนแล้ว ไม่สามารถเพิ่มรายจ่ายได้' }
  if (fund.status !== 'paid') {
    return { error: 'วงเงินยังไม่เปิดใช้ — ต้องอนุมัติและจ่ายเงินตั้งต้นก่อน' }
  }

  const title = (formData.get('title') as string || '').trim()
  const category = (formData.get('category') as string) || 'other'
  const amount = roundBaht(Number(formData.get('amount')) || 0)
  const expense_date = (formData.get('expense_date') as string) || new Date().toISOString().split('T')[0]
  const description = (formData.get('description') as string || '').trim() || null
  if (!title) return { error: 'กรุณากรอกรายการค่าใช้จ่าย' }
  if (amount <= 0) return { error: 'กรุณากรอกจำนวนเงินให้ถูกต้อง' }
  // Keep the weekly buckets honest — expenses must belong to the fund's month.
  if (fund.pettycash_period_start && fund.pettycash_period_end
      && (expense_date < fund.pettycash_period_start || expense_date > fund.pettycash_period_end)) {
    return { error: `วันที่รายจ่ายต้องอยู่ในเดือนของวงเงิน (${fund.pettycash_period_start} ถึง ${fund.pettycash_period_end})` }
  }

  const receiptFiles: File[] = []
  for (const entry of formData.getAll('receipt_files')) {
    if (entry instanceof File && entry.size > 0) receiptFiles.push(entry)
  }

  const claimNumber = await generateClaimNumber(supabase)
  let receipt_urls: string[] = []
  if (receiptFiles.length > 0) {
    receipt_urls = await uploadReceiptFiles(supabase, receiptFiles, claimNumber)
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('expense_claims')
    .insert({
      claim_number: claimNumber,
      claim_type: 'other',
      pettycash_fund_id: fundId,
      title,
      description,
      category,
      amount,
      unit_price: amount,
      unit: 'บาท',
      quantity: 1,
      expense_date,
      vat_mode: 'none',
      include_vat: false,
      withholding_tax_rate: 0,
      receipt_urls,
      funding_source: 'company',
      submitted_by: userId,
      submitted_at: now,
      status: 'paid',
      paid_at: now,
      paid_by: userId,
    })
    .select('id')
    .single()

  if (error) return { error: `บันทึกรายจ่ายไม่สำเร็จ: ${error.message}` }

  // Race guard: if the fund was closed while this insert was in flight, void
  // the row — money must not enter a closed month.
  // ponytail: read-after-write instead of a DB lock; move close+insert into a
  // FOR UPDATE Postgres function if concurrent closes ever become common.
  const { data: fundAfterInsert } = await supabase
    .from('expense_claims')
    .select('pettycash_closed_at')
    .eq('id', fundId)
    .single()
  if (fundAfterInsert?.pettycash_closed_at) {
    await supabase.from('expense_claims').delete().eq('id', data.id)
    return { error: 'วงเงินถูกปิดเดือนระหว่างบันทึก — รายการถูกยกเลิก กรุณาติดต่อ admin' }
  }

  await supabase.from('expense_claim_logs').insert({
    claim_id: data.id,
    action: 'petty_cash_expense',
    changed_by: userId,
    changes: { status: { from: null, to: 'paid' } },
    note: `จ่ายจากเงินสดย่อย ${fund.claim_number} ฿${amount.toLocaleString()}`,
  })

  await logActivity('CREATE_EXPENSE_CLAIM', {
    claimId: data.id,
    claimNumber,
    title,
    amount,
    claim_type: 'other',
    pettyCashFund: fund.claim_number,
  })

  // Fresh balance so the UI can warn on overspend immediately.
  const kids = await getPettyChildren(supabase, fundId)
  const balance = roundBaht(roundBaht(Number(fund.amount) || 0) + kids.topupPaid - kids.spent)

  revalidatePath('/finance')
  revalidatePath(`/finance/${fundId}`)
  revalidatePath('/finance/petty-cash')
  return { success: true, id: data.id, balance }
}

// Request a mid-month top-up into the fund (fund owner or admin). Goes straight
// into the approval queue (pending → approve → pay adds cash to the box).
export async function createPettyCashTopup(fundId: string, formData: FormData) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data: fund } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', fundId)
    .single()

  if (!fund || fund.claim_type !== 'petty_cash' || fund.pettycash_fund_id) {
    return { error: 'ไม่พบวงเงินสดย่อย' }
  }
  if (fund.pettycash_closed_at) return { error: 'วงเงินนี้ปิดเดือนแล้ว' }
  if (fund.status !== 'paid') return { error: 'วงเงินยังไม่เปิดใช้' }

  const isAdmin = role === 'admin'
  const isOwner = fund.submitted_by === userId
  if (!isAdmin && !isOwner) return { error: 'เฉพาะผู้ดูแลวงเงินหรือ admin เท่านั้นที่เบิกเพิ่มได้' }

  const amount = roundBaht(Number(formData.get('amount')) || 0)
  const note = (formData.get('note') as string || '').trim()
  if (amount <= 0) return { error: 'กรุณากรอกจำนวนเงินให้ถูกต้อง' }

  const claimNumber = await generateClaimNumber(supabase)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('expense_claims')
    .insert({
      claim_number: claimNumber,
      claim_type: 'petty_cash',
      pettycash_fund_id: fundId,
      title: `เติมเงินสดย่อย ${fund.claim_number}${note ? ` — ${note}` : ''}`,
      description: note || null,
      category: 'other',
      amount,
      unit_price: amount,
      unit: 'บาท',
      quantity: 1,
      expense_date: now.split('T')[0],
      vat_mode: 'none',
      include_vat: false,
      withholding_tax_rate: 0,
      // Payout transfers to the fund custodian's account (copied from the fund).
      bank_name: fund.bank_name,
      bank_account_number: fund.bank_account_number,
      account_holder_name: fund.account_holder_name,
      funding_source: 'company',
      submitted_by: userId,
      submitted_at: now,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) return { error: `สร้างรายการเติมเงินไม่สำเร็จ: ${error.message}` }

  // Race guard: void the request if the fund closed mid-flight.
  const { data: fundAfterInsert } = await supabase
    .from('expense_claims')
    .select('pettycash_closed_at')
    .eq('id', fundId)
    .single()
  if (fundAfterInsert?.pettycash_closed_at) {
    await supabase.from('expense_claims').delete().eq('id', data.id)
    return { error: 'วงเงินถูกปิดเดือนระหว่างบันทึก — รายการถูกยกเลิก' }
  }

  await supabase.from('expense_claim_logs').insert({
    claim_id: data.id,
    action: 'submit',
    changed_by: userId,
    changes: { status: { from: null, to: 'pending' } },
    note: `ขอเติมเงินสดย่อย ฿${amount.toLocaleString()} เข้าวงเงิน ${fund.claim_number}`,
  })

  await logActivity('CREATE_EXPENSE_CLAIM', {
    claimId: data.id,
    claimNumber,
    title: `เติมเงินสดย่อย ${fund.claim_number}`,
    amount,
    claim_type: 'petty_cash',
    pettyCashFund: fund.claim_number,
  })

  revalidatePath('/finance')
  revalidatePath(`/finance/${fundId}`)
  revalidatePath('/finance/petty-cash')
  return { success: true, id: data.id }
}

// Close the monthly fund (owner or admin). Computes the leftover from the DB
// (fund + paid top-ups − live expenses), requires a return-transfer slip when
// leftover > 0, blocks while any top-up is still in flight. After closing, an
// admin confirms the returned cash via confirmRefundReceived → refund_confirmed.
// ── Pull an existing claim into the fund (ดึงใบเบิกเข้าวงเงิน) ──
// Linking = paying that claim with cash from the box instead of a company
// transfer: sets pettycash_fund_id + marks paid, so getPettyChildren counts it
// as a box expense automatically. Admin only (it IS a payment).

const PETTY_LINKABLE_TYPES = ['event', 'other', 'advance']
const PETTY_LINKABLE_STATUSES = ['approved', 'awaiting_payment', 'pending_month_end', 'waiting_tax_invoice']

// Approved-but-unpaid claims that can be pulled into the open fund.
export async function getLinkablePettyClaims() {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { data: [] }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('expense_claims')
    .select(`
      id, claim_number, claim_type, title, amount, expense_date, status,
      submitter:profiles!expense_claims_submitted_by_fkey(id, full_name)
    `)
    .in('claim_type', PETTY_LINKABLE_TYPES)
    .is('pettycash_fund_id', null)
    .in('status', PETTY_LINKABLE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(200)
  return { data: data || [] }
}

export async function linkClaimToPettyCash(fundId: string, claimId: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่ดึงใบเบิกเข้าวงเงินได้' }

  const supabase = createServiceClient()

  const { data: fund } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', fundId)
    .single()
  if (!fund || fund.claim_type !== 'petty_cash' || fund.pettycash_fund_id) {
    return { error: 'ไม่พบวงเงินสดย่อย' }
  }
  if (fund.pettycash_closed_at) return { error: 'วงเงินนี้ปิดเดือนแล้ว ไม่สามารถดึงใบเบิกเข้าได้' }
  if (fund.status !== 'paid') return { error: 'วงเงินยังไม่เปิดใช้ — ต้องอนุมัติและจ่ายเงินตั้งต้นก่อน' }

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', claimId)
    .single()
  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (!PETTY_LINKABLE_TYPES.includes(claim.claim_type)) {
    return { error: 'ดึงได้เฉพาะใบเบิกประเภทงานอีเวนต์ / อื่นๆ / ทดลองจ่ายเท่านั้น' }
  }
  if (claim.pettycash_fund_id) return { error: 'ใบเบิกนี้อยู่ในวงเงินสดย่อยอยู่แล้ว' }
  if (!PETTY_LINKABLE_STATUSES.includes(claim.status)) {
    return { error: 'ดึงได้เฉพาะใบเบิกที่อนุมัติแล้วและยังไม่จ่ายเงินเท่านั้น' }
  }

  // The box must cover the whole claim — blocked, not just warned (นโยบาย: ห้ามเบิกเกิน)
  const amount = roundBaht(Number(claim.amount) || 0)
  const kids = await getPettyChildren(supabase, fundId)
  const balance = roundBaht(roundBaht(Number(fund.amount) || 0) + kids.topupPaid - kids.spent)
  if (amount > balance) {
    return { error: `เงินในกล่องไม่พอ — คงเหลือ ฿${balance.toLocaleString()} แต่ใบเบิกนี้ ฿${amount.toLocaleString()} กรุณาเติมเงินเข้าวงเงินก่อน` }
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('expense_claims')
    .update({ pettycash_fund_id: fundId, status: 'paid', paid_at: now, paid_by: userId })
    .eq('id', claimId)
  if (error) return { error: `ดึงใบเบิกไม่สำเร็จ: ${error.message}` }

  // Race guard (same as addPettyCashExpense): fund closed mid-flight → revert.
  const { data: fundAfter } = await supabase
    .from('expense_claims')
    .select('pettycash_closed_at')
    .eq('id', fundId)
    .single()
  if (fundAfter?.pettycash_closed_at) {
    await supabase
      .from('expense_claims')
      .update({ pettycash_fund_id: null, status: claim.status, paid_at: claim.paid_at, paid_by: claim.paid_by })
      .eq('id', claimId)
    return { error: 'วงเงินถูกปิดเดือนระหว่างบันทึก — รายการถูกยกเลิก' }
  }

  await supabase.from('expense_claim_logs').insert({
    claim_id: claimId,
    action: 'link_petty_cash',
    changed_by: userId,
    changes: { status: { from: claim.status, to: 'paid' }, pettycash_fund_id: { from: null, to: fundId } },
    note: `จ่ายจากเงินสดย่อย ${fund.claim_number} ฿${amount.toLocaleString()}`,
  })
  await logActivity('LINK_CLAIM_TO_PETTY_CASH', {
    claimId,
    claimNumber: claim.claim_number,
    amount,
    pettyCashFund: fund.claim_number,
  })

  // Date outside the fund month is allowed — flagged so admin sees it (นโยบาย: เตือนอย่างเดียว)
  let warning: string | undefined
  if (fund.pettycash_period_start && fund.pettycash_period_end && claim.expense_date
      && (claim.expense_date < fund.pettycash_period_start || claim.expense_date > fund.pettycash_period_end)) {
    warning = `ดึงเข้าแล้ว — แต่วันที่ใบเบิก (${claim.expense_date}) อยู่นอกเดือนของวงเงิน (${fund.pettycash_period_start} ถึง ${fund.pettycash_period_end})`
  }

  revalidatePath('/finance')
  revalidatePath(`/finance/${fundId}`)
  revalidatePath(`/finance/${claimId}`)
  revalidatePath('/finance/petty-cash')
  return { success: true, warning }
}

// Undo a pull while the month is open — the cash goes back into the box and the
// claim returns to the payout queue (approved). Box-logged expenses were never
// approved (no approved_by) and can't be unlinked — cancel them instead.
export async function unlinkClaimFromPettyCash(claimId: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', claimId)
    .single()
  if (!claim || !claim.pettycash_fund_id || claim.claim_type === 'petty_cash') {
    return { error: 'ใบเบิกนี้ไม่ใช่รายการที่ดึงเข้าวงเงิน' }
  }
  if (!claim.approved_by) {
    return { error: 'รายการนี้บันทึกจากกล่องโดยตรง — ใช้การยกเลิกรายการ (admin override) แทน' }
  }

  const { data: fund } = await supabase
    .from('expense_claims')
    .select('claim_number, pettycash_closed_at')
    .eq('id', claim.pettycash_fund_id)
    .single()
  if (fund?.pettycash_closed_at) {
    return { error: 'รอบเดือนของวงเงินปิดแล้ว — เปิดรอบอีกครั้งก่อนจึงจะยกเลิกการดึงได้' }
  }

  const { error } = await supabase
    .from('expense_claims')
    .update({ pettycash_fund_id: null, status: 'approved', paid_at: null, paid_by: null })
    .eq('id', claimId)
  if (error) return { error: 'เกิดข้อผิดพลาด' }

  await supabase.from('expense_claim_logs').insert({
    claim_id: claimId,
    action: 'unlink_petty_cash',
    changed_by: userId,
    changes: { status: { from: claim.status, to: 'approved' }, pettycash_fund_id: { from: claim.pettycash_fund_id, to: null } },
    note: `ยกเลิกการจ่ายจากเงินสดย่อย ${fund?.claim_number || ''} — กลับเข้าคิวจ่ายเงิน`,
  })
  await logActivity('UNLINK_CLAIM_FROM_PETTY_CASH', {
    claimId,
    claimNumber: claim.claim_number,
    pettyCashFund: fund?.claim_number,
  })

  revalidatePath('/finance')
  revalidatePath(`/finance/${claim.pettycash_fund_id}`)
  revalidatePath(`/finance/${claimId}`)
  revalidatePath('/finance/petty-cash')
  return { success: true }
}

export async function closePettyCashMonth(id: string, formData?: FormData) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data: fund } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!fund || fund.claim_type !== 'petty_cash' || fund.pettycash_fund_id) {
    return { error: 'ไม่พบวงเงินสดย่อย' }
  }

  const isAdmin = role === 'admin'
  const isOwner = fund.submitted_by === userId
  if (!isAdmin && !isOwner) return { error: 'คุณไม่มีสิทธิ์ปิดวงเงินนี้' }

  if (fund.pettycash_closed_at) return { error: 'ปิดเดือนไปแล้ว' }
  if (fund.status !== 'paid') return { error: 'ปิดได้เฉพาะวงเงินที่เปิดใช้แล้วเท่านั้น' }

  const kids = await getPettyChildren(supabase, id)

  // Money in flight — a requested top-up that hasn't been paid yet would desync
  // the box balance. Resolve (pay or cancel) before closing.
  const pendingTopups = kids.topups.filter((t: any) => t.status !== 'paid')
  if (pendingTopups.length > 0) {
    return {
      error: `มีรายการเติมเงินค้างดำเนินการ ${pendingTopups.length} ใบ (${pendingTopups.map((t: any) => t.claim_number).join(', ')}) — อนุมัติ/จ่าย หรือยกเลิกให้เรียบร้อยก่อนปิดเดือน`,
    }
  }

  // A fund-linked advance that hasn't been settled yet also desyncs the box —
  // its leftover would come back to a closed month. Settle + confirm first.
  // (Fully-spent advances have refund 0 and never reach refund_confirmed — fine.)
  const unsettledAdvances = kids.expenses.filter((e: any) => e.claim_type === 'advance'
    && (!e.advance_settled_at || ((Number(e.refund_amount) || 0) > 0 && e.status !== 'refund_confirmed')))
  if (unsettledAdvances.length > 0) {
    return {
      error: `มีใบทดลองจ่ายในวงเงินที่ยังเคลียร์ไม่จบ ${unsettledAdvances.length} ใบ (${unsettledAdvances.map((e: any) => e.claim_number).join(', ')}) — เคลียร์และยืนยันเงินคืนเข้ากล่องก่อนปิดเดือน`,
    }
  }

  const initial = roundBaht(Number(fund.amount) || 0)
  const leftover = roundBaht(initial + kids.topupPaid - kids.spent)
  if (leftover < 0) {
    return { error: `ยอดคงเหลือติดลบ ฿${Math.abs(leftover).toLocaleString()} — รายจ่ายเกินวงเงิน กรุณาตรวจสอบรายการก่อนปิดเดือน` }
  }

  const updatePayload: Record<string, any> = {
    pettycash_closed_at: new Date().toISOString(),
    pettycash_closed_by: userId,
  }
  let note = 'ปิดวงเงินสดย่อยประจำเดือน — ไม่มีเงินคงเหลือ'

  if (leftover > 0) {
    const slipFiles: File[] = []
    if (formData) {
      for (const entry of formData.getAll('refund_slip_files')) {
        if (entry instanceof File && entry.size > 0) slipFiles.push(entry)
      }
    }
    const existingSlips: string[] = fund.refund_slip_urls || []
    if (slipFiles.length === 0 && existingSlips.length === 0) {
      return { error: `ต้องแนบสลิปโอนเงินคืนบริษัท ฿${leftover.toLocaleString()} ก่อนปิดเดือน` }
    }
    let slipUrls: string[] = []
    if (slipFiles.length > 0) {
      slipUrls = await uploadReceiptFiles(supabase, slipFiles, `${fund.claim_number}-return`)
      // Abort BEFORE committing the close if any slip failed to upload —
      // otherwise the month closes with a refund but no proof, and can never
      // be confirmed.
      if (slipUrls.length !== slipFiles.length) {
        return { error: 'อัพโหลดสลิปไม่สำเร็จครบทุกไฟล์ — ยังไม่ปิดเดือน กรุณาลองใหม่อีกครั้ง' }
      }
    }
    updatePayload.refund_amount = leftover
    if (slipUrls.length > 0) updatePayload.refund_slip_urls = [...existingSlips, ...slipUrls]
    note = `ปิดเดือน — คืนเงินคงเหลือให้บริษัท ฿${leftover.toLocaleString()} (รอ admin ยืนยันรับเงิน)`
  }

  // Conditional close — a concurrent close (double-click / second admin) must
  // not silently re-run and overwrite the snapshot.
  const { data: closedRows, error } = await supabase
    .from('expense_claims')
    .update(updatePayload)
    .eq('id', id)
    .is('pettycash_closed_at', null)
    .select('id')

  if (error) {
    console.error('Close petty cash month error:', error)
    return { error: `เกิดข้อผิดพลาดในการบันทึก: ${error.message}` }
  }
  if ((closedRows?.length ?? 0) === 0) {
    return { error: 'ปิดเดือนไปแล้ว (มีการกดปิดซ้อนกัน)' }
  }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'close_petty_cash',
    changed_by: userId,
    changes: {
      pettycash_closed_at: { from: null, to: 'closed' },
      ...(leftover > 0 ? { refund_amount: { from: fund.refund_amount ?? null, to: leftover } } : {}),
    },
    note,
  })

  await logActivity('CLOSE_PETTY_CASH_PERIOD', {
    claimId: id,
    claimNumber: fund.claim_number,
    initial,
    topupPaid: kids.topupPaid,
    spent: kids.spent,
    leftover,
  })

  // Ask only the fund's approving admin to verify the returned cash (fallback: all admins)
  if (leftover > 0) {
    let recipientIds: string[] = fund.approved_by && fund.approved_by !== userId ? [fund.approved_by] : []
    if (recipientIds.length === 0 && !fund.approved_by) {
      const { data: adminProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
      recipientIds = (adminProfiles || []).map((p: { id: string }) => p.id).filter((aid: string) => aid !== userId)
    }
    if (recipientIds.length > 0) {
      await createNotifications({
        userIds: recipientIds,
        type: 'expense_approved',
        title: `วงเงินสดย่อย ${fund.claim_number} ปิดเดือนแล้ว — รอยืนยันเงินคืน ฿${leftover.toLocaleString()}`,
        body: 'ตรวจสลิปการโอนคืน แล้วกดยืนยันรับเงินในหน้าวงเงิน',
        referenceType: 'expense_claim',
        referenceId: id,
        actorId: userId,
      })
    }
  }

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  revalidatePath('/finance/petty-cash')
  return { success: true, leftover }
}

// Reopen a closed month (admin only, before the return is confirmed) — the
// escape hatch for audit corrections, since a closed month's children are
// frozen. Clears the close snapshot; already-uploaded slips stay attached.
export async function reopenPettyCashMonth(id: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()

  const { data: fund } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!fund || fund.claim_type !== 'petty_cash' || fund.pettycash_fund_id) {
    return { error: 'ไม่พบวงเงินสดย่อย' }
  }
  if (!fund.pettycash_closed_at) return { error: 'วงเงินนี้ยังไม่ได้ปิดเดือน' }
  if (fund.status === 'refund_confirmed') {
    return { error: 'ยืนยันรับเงินคืนไปแล้ว ไม่สามารถเปิดรอบได้อีก' }
  }

  const { error } = await supabase
    .from('expense_claims')
    .update({
      pettycash_closed_at: null,
      pettycash_closed_by: null,
      refund_amount: null,
    })
    .eq('id', id)

  if (error) return { error: `เกิดข้อผิดพลาด: ${error.message}` }

  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'reopen_petty_cash',
    changed_by: userId,
    changes: {
      pettycash_closed_at: { from: 'closed', to: null },
      refund_amount: { from: fund.refund_amount ?? null, to: null },
    },
    note: 'เปิดรอบเดือนอีกครั้ง (admin) — ล้างยอดเงินคืนที่บันทึกไว้ ต้องปิดเดือนใหม่หลังแก้ไข',
  })

  await logActivity('CLOSE_PETTY_CASH_PERIOD', {
    claimId: id,
    claimNumber: fund.claim_number,
    reopened: true,
  })

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  revalidatePath('/finance/petty-cash')
  return { success: true }
}
