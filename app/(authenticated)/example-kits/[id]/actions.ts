'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function createServerSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

import { logActivity } from '@/lib/logger'

export async function updateTemplateStatus(itemId: string, status: string) {
    const supabase = createServerSupabase()
    
    // Fetch details for log
    const { data: item } = await supabase
        .from('kit_template_contents')
        .select('item_name, kit_templates(name)')
        .eq('id', itemId)
        .single()

    const { error } = await supabase
        .from('kit_template_contents')
        .update({ status })
        .eq('id', itemId)
    
    if (error) {
        console.error('Error updating status:', error)
    } else {
        await logActivity('UPDATE_TEMPLATE_STATUS', {
            templateName: (item?.kit_templates as any)?.name || 'Unknown',
            itemName: item?.item_name,
            newStatus: status,
            itemId
        })
    }
    
    revalidatePath('/example-kits/[id]', 'page')
    revalidatePath('/example-kits') 
}

export async function addTemplateItem(templateId: string, name: string, quantity: number) {
    const supabase = createServerSupabase()
    
    // Fetch template name
    const { data: template } = await supabase.from('kit_templates').select('name').eq('id', templateId).single()

    const { error } = await supabase
        .from('kit_template_contents')
        .insert({
            template_id: templateId,
            item_name: name,
            quantity: quantity,
            status: 'none'
        })

    if (error) {
        console.error('Error adding item:', error)
    } else {
        await logActivity('ADD_TEMPLATE_ITEM', {
            templateName: template?.name || 'Unknown',
            itemName: name,
            quantity,
            templateId
        })
    }

    revalidatePath(`/example-kits/${templateId}`)
    revalidatePath('/example-kits')
}

export async function removeTemplateItem(itemId: string, templateId: string) {
    const supabase = createServerSupabase()
    
    // Fetch details before delete
    const { data: item } = await supabase
        .from('kit_template_contents')
        .select('item_name, kit_templates(name)')
        .eq('id', itemId)
        .single()

    const { error } = await supabase
        .from('kit_template_contents')
        .delete()
        .eq('id', itemId)

    if (error) {
        console.error('Error removing item:', error)
    } else {
        await logActivity('REMOVE_TEMPLATE_ITEM', {
            templateName: (item?.kit_templates as any)?.name || 'Unknown',
            itemName: item?.item_name,
            itemId
        })
    }

    revalidatePath(`/example-kits/${templateId}`)
    revalidatePath('/example-kits')
}

export async function updateTemplateDetails(templateId: string, formData: FormData) {
    const supabase = createServerSupabase()
    const name = formData.get('name') as string
    const description = formData.get('description') as string
    
    const { error } = await supabase
        .from('kit_templates')
        .update({ name, description })
        .eq('id', templateId)

    if (error) {
        console.error('Error updating details:', error)
    } else {
        await logActivity('UPDATE_TEMPLATE', {
            name,
            templateId
        })
    }
    
    revalidatePath(`/example-kits/${templateId}`)
    revalidatePath('/example-kits')
}
