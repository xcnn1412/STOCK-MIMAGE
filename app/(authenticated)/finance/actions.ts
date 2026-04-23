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

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.claim_type) query = query.eq('claim_type', filters.claim_type)
  if (filters?.submitted_by) query = query.eq('submitted_by', filters.submitted_by)

  const { data, error } = await query
  return { data: data || [], error: error?.message }
}

export async function getClaim(id: string) {
  const { userId, role } = await getSession()
  if (!userId) return { data: null, error: 'Unauthorized' }

  const supabase = createServiceClient()

  let query = supabase
    .from('expense_claims')
    .select(`
      *,
      submitter:profiles!expense_claims_submitted_by_fkey(id, full_name),
      approver:profiles!expense_claims_approved_by_fkey(id, full_name),
      job_event:job_cost_events!expense_claims_job_event_id_fkey(id, event_name)
    `)
    .eq('id', id)

  // 🔒 Non-admins can only access their own claim
  if (role !== 'admin') query = query.eq('submitted_by', userId)

  const { data, error } = await query.single()
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
      status: 'draft',
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
  claim_type?: string
  job_event_id?: string | null
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
  const fieldsToCheck = ['title', 'description', 'category', 'amount', 'unit_price', 'unit', 'quantity', 'expense_date', 'vat_mode', 'withholding_tax_rate', 'notes', 'bank_name', 'bank_account_number', 'account_holder_name', 'claim_type', 'job_event_id'] as const
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
  revalidatePath('/costs')
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
  // Advance (ทดลองจ่าย) claims don't require receipts at submission — they're uploaded on settlement
  if (claim.claim_type !== 'advance' && (!claim.receipt_urls || claim.receipt_urls.length === 0)) {
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
    .select('status, submitted_by, claim_number, tax_invoice_urls')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.status !== 'waiting_tax_invoice') {
    return { error: 'อัพโหลดใบกำกับภาษีได้เฉพาะเมื่ออยู่ในสถานะ "รอใบกำกับภาษี" เท่านั้น' }
  }
  if (role !== 'admin' && claim.submitted_by !== userId) {
    return { error: 'คุณไม่มีสิทธิ์อัพโหลดเอกสารนี้' }
  }

  const files: File[] = []
  for (const entry of formData.getAll('tax_invoice_files')) {
    if (entry instanceof File && entry.size > 0) files.push(entry)
  }
  if (files.length === 0) return { error: 'กรุณาเลือกไฟล์อย่างน้อย 1 ไฟล์' }

  const newUrls = await uploadReceiptFiles(supabase, files, `${claim.claim_number}-tax-invoice`)
  if (newUrls.length === 0) return { error: 'เกิดข้อผิดพลาดในการอัพโหลดไฟล์' }

  const existing: string[] = claim.tax_invoice_urls || []
  const { error } = await supabase
    .from('expense_claims')
    .update({
      tax_invoice_urls: [...existing, ...newUrls],
      // Auto-transition: waiting_tax_invoice → approved once files are uploaded
      status: 'approved',
    })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาดในการบันทึก' }

  // Log the file upload
  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'upload_tax_invoice',
    changed_by: userId,
    changes: { tax_invoice_urls: { from: existing.length, to: existing.length + newUrls.length } },
    note: `อัพโหลดใบกำกับภาษี ${newUrls.length} ไฟล์`,
  })

  // Log the auto status transition
  await supabase.from('expense_claim_logs').insert({
    claim_id: id,
    action: 'auto_transition',
    changed_by: userId,
    changes: { status: { from: 'waiting_tax_invoice', to: 'approved' } },
    note: 'Auto-transition: Tax Invoice Uploaded',
  })

  // Notify all admins that the tax invoice has been uploaded and claim is ready
  const { data: adminProfiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')

  const adminIds = (adminProfiles || []).map((p: { id: string }) => p.id)
  if (adminIds.length > 0) {
    await createNotifications({
      userIds: adminIds,
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

  const { error } = await supabase
    .from('expense_claims')
    .update(updatePayload)
    .eq('id', id)

  if (error) {
    console.error('Settle advance error:', error)
    return { error: 'เกิดข้อผิดพลาดในการบันทึก' }
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

  // Notify admins when a user settles their advance so they can reconcile
  if (!isAdmin) {
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
    const adminIds = (adminProfiles || []).map((p: { id: string }) => p.id)
    if (adminIds.length > 0) {
      await createNotifications({
        userIds: adminIds,
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
