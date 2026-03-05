'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { createNotifications } from '@/lib/notifications'
import { cookies } from 'next/headers'

async function getSession() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value
  return { userId, role }
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
  status?: string
  claim_type?: string
  submitted_by?: string
}) {
  const { userId } = await getSession()
  if (!userId) return { data: [], error: 'Unauthorized' }

  const supabase = createServiceClient()

  let query = supabase
    .from('expense_claims')
    .select(`
      *,
      submitter:profiles!expense_claims_submitted_by_fkey(id, full_name),
      approver:profiles!expense_claims_approved_by_fkey(id, full_name),
      job_event:job_cost_events!expense_claims_job_event_id_fkey(id, event_name)
    `)
    .order('created_at', { ascending: false })

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.claim_type) query = query.eq('claim_type', filters.claim_type)
  if (filters?.submitted_by) query = query.eq('submitted_by', filters.submitted_by)

  const { data, error } = await query
  return { data: data || [], error: error?.message }
}

export async function getClaim(id: string) {
  const { userId } = await getSession()
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

  const { data, error } = await supabase
    .from('expense_claims')
    .insert({
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
      submitted_by: userId,
      status: 'pending',
    })
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
  if (claim.status !== 'pending') return { error: 'แก้ไขได้เฉพาะใบเบิกที่รออนุมัติเท่านั้น' }

  const isAdmin = role === 'admin'
  const isOwner = claim.submitted_by === userId
  if (!isAdmin && !isOwner) return { error: 'คุณไม่มีสิทธิ์แก้ไขใบเบิกนี้' }

  // Track what changed for the log
  const changes: Record<string, { from: any; to: any }> = {}
  const fieldsToCheck = ['title', 'description', 'category', 'amount', 'unit_price', 'unit', 'quantity', 'expense_date', 'vat_mode', 'withholding_tax_rate', 'notes', 'bank_name', 'bank_account_number', 'account_holder_name'] as const
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

  const finalData: any = { ...updateData }
  if (newReceiptUrls.length > 0) {
    const existing = claim.receipt_urls || []
    finalData.receipt_urls = [...existing, ...newReceiptUrls]
    changes['receipt_urls'] = { from: existing.length, to: finalData.receipt_urls.length }
  }

  const { error } = await supabase
    .from('expense_claims')
    .update(finalData)
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาดในการแก้ไข' }

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
  return { success: true }
}

// ============================================================================
// Get Claim Edit Logs
// ============================================================================

export async function getClaimLogs(claimId: string) {
  const supabase = createServiceClient()
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
  if (claim.status !== 'pending') return { error: 'ใบเบิกนี้ถูกดำเนินการแล้ว' }

  // Update claim status
  const { error } = await supabase
    .from('expense_claims')
    .update({
      status: 'awaiting_payment',
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  // If linked to event → job_event_id ชี้ไป job_cost_events.id ตรงๆ แล้ว
  if (claim.job_event_id) {
    await supabase.from('job_cost_items').insert({
      job_event_id: claim.job_event_id,
      category: claim.category,
      description: `[เบิกเงิน] ${claim.title}`,
      amount: claim.total_amount || (claim.amount * claim.quantity),
      unit_price: claim.amount,
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
  if (claim.status !== 'pending') return { error: 'ใบเบิกนี้ถูกดำเนินการแล้ว' }

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
// Mark as Paid (admin only) — awaiting_payment → paid
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
  if (claim.status !== 'awaiting_payment') return { error: 'ใบเบิกนี้ยังไม่อนุมัติหรือชำระแล้ว' }

  const { error } = await supabase
    .from('expense_claims')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by: userId,
    })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

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
    .select('claim_number, submitted_by, status, job_event_id')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }

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

  await logActivity('DELETE_EXPENSE_CLAIM', {
    claimId: id,
    claimNumber: claim.claim_number,
  })

  revalidatePath('/finance')
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
    .select('id, event_name, event_date, event_location, status')
    .order('event_date', { ascending: false })
    .limit(200)

  // 2. ดึงจาก event_closures (ประวัติปิดงาน)
  const { data: closures } = await supabase
    .from('event_closures')
    .select('id, event_name, event_date, event_location')
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

  return [...events, ...closureEvents]
}

// ============================================================================
// Recreate cost item from approved claim (ถ้าเผลอลบใน Costs)
// ============================================================================

export async function recreateCostItemFromClaim(claimId: string, jobCostEventId: string) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

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
    amount: claim.total_amount || (claim.amount * claim.quantity),
    unit_price: claim.amount,
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
