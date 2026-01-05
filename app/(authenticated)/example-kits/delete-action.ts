'use server'
import { deleteTemplate } from './actions'

export async function deleteTemplateAction(id: string) {
    await deleteTemplate(id)
}
