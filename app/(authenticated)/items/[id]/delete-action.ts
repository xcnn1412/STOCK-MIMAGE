'use server'
import { deleteItem } from './actions'

export async function deleteItemAction(id: string) {
    await deleteItem(id)
}
