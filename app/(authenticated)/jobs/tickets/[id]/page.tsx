import { notFound } from 'next/navigation'
import { getTicket, getTicketReplies, getJobSettings, getSystemUsers, getTicketCategories } from '../../actions'
import TicketDetail from './ticket-detail'

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const [ticketResult, repliesResult, settingsResult, users, categoriesResult] = await Promise.all([
        getTicket(id),
        getTicketReplies(id),
        getJobSettings(),
        getSystemUsers(),
        getTicketCategories(),
    ])

    if (!ticketResult.data) return notFound()

    return (
        <TicketDetail
            ticket={ticketResult.data}
            replies={repliesResult.data || []}
            settings={settingsResult.data || []}
            users={users}
            categories={categoriesResult.data || []}
        />
    )
}
