'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
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
      job_event:events!expense_claims_job_event_id_fkey(id, name)
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
      job_event:events!expense_claims_job_event_id_fkey(id, name)
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
  const description = formData.get('description') as string || null
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
  const job_event_id = formData.get('job_event_id') as string || null

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
  const fieldsToCheck = ['title', 'description', 'category', 'amount', 'unit_price', 'unit', 'quantity', 'expense_date', 'vat_mode', 'withholding_tax_rate', 'notes'] as const
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
      status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  // If linked to event, find the corresponding job_cost_events and create cost item
  if (claim.job_event_id) {
    // Lookup job_cost_events by source_event_id (events.id → job_cost_events.source_event_id)
    const { data: jobEvent } = await supabase
      .from('job_cost_events')
      .select('id')
      .eq('source_event_id', claim.job_event_id)
      .maybeSingle()

    if (jobEvent) {
      // Event already imported to Costs → create cost item
      await supabase.from('job_cost_items').insert({
        job_event_id: jobEvent.id,
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
    // ถ้ายังไม่ import เข้า Costs → อนุมัติแล้วแต่ยังไม่สร้าง cost item
    // เมื่อ import event เข้า Costs ทีหลัง สามารถดูใบเบิกที่อนุมัติแล้วได้
  }

  await logActivity('APPROVE_EXPENSE_CLAIM', {
    claimId: id,
    claimNumber: claim.claim_number,
    totalAmount: claim.total_amount,
  })

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
    .select('claim_number, status')
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

  revalidatePath('/finance')
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
  if (claim.status === 'approved' && claim.job_event_id) {
    // หา job_cost_events ที่ source_event_id ตรงกัน
    const { data: jobEvent } = await supabase
      .from('job_cost_events')
      .select('id')
      .eq('source_event_id', claim.job_event_id)
      .maybeSingle()

    if (jobEvent) {
      await supabase
        .from('job_cost_items')
        .delete()
        .eq('job_event_id', jobEvent.id)
        .like('notes', `%${claim.claim_number}%`)
    }
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

  // ดึงจากตาราง events หลัก (ไม่ใช่ job_cost_events)
  const { data } = await supabase
    .from('events')
    .select('id, name, event_date')
    .order('event_date', { ascending: false })
    .limit(100)

  // Map to consistent shape
  return (data || []).map(e => ({
    id: e.id,
    event_name: e.name,
    event_date: e.event_date,
  }))
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
