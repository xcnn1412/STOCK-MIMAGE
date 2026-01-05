'use server'
import { deleteKit } from './actions'

export async function deleteKitAction(id: string) {
    await deleteKit(id)
}
