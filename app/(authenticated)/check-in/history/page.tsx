import { getMyCheckinHistory } from '../actions'
import HistoryView from './history-view'

export const revalidate = 0

export default async function CheckInHistoryPage() {
  const history = await getMyCheckinHistory(60)
  return <HistoryView history={history} />
}
