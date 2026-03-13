import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getTicket, getTicketReplies, getJobSettings, getSystemUsers, getTicketCategories, getTicketReactions, getTicketEmojis, getCustomEmojis } from '../../actions'
import TicketDetail from './ticket-detail'

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const cookieStore = await cookies()
    const currentUserId = cookieStore.get('session_user_id')?.value || ''
    const [ticketResult, repliesResult, settingsResult, users, categoriesResult, reactionsResult, emojisResult, customEmojisResult] = await Promise.all([
        getTicket(id),
        getTicketReplies(id),
        getJobSettings(),
        getSystemUsers(),
        getTicketCategories(),
        getTicketReactions(id),
        getTicketEmojis(),
        getCustomEmojis(),
    ])

    if (!ticketResult.data) return notFound()

    return (
        <TicketDetail
            ticket={ticketResult.data}
            replies={repliesResult.data || []}
            settings={settingsResult.data || []}
            users={users}
            categories={categoriesResult.data || []}
            reactions={reactionsResult.data || []}
            availableEmojis={emojisResult.data || []}
            currentUserId={currentUserId}
            customEmojis={customEmojisResult.data || []}
        />
    )
}
