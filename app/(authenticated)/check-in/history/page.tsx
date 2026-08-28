import { getMyCheckinHistory, getActiveDuties } from '../actions'
import { getJobEventsForSelect } from '../../finance/actions'
import HistoryView from './history-view'

export const revalidate = 0

export default async function CheckInHistoryPage() {
  const [history, allEvents, duties] = await Promise.all([
    getMyCheckinHistory(60),
    getJobEventsForSelect(),
    getActiveDuties(),
  ])
  return <HistoryView history={history} allEvents={allEvents} duties={duties} />
}
