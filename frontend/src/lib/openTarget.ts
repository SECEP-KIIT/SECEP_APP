// What a notification points at: an email (inbox drawer), a user card (card dialog) or a calendar event.
import type { AppNotification } from '../api/types'
import { openCard } from '../cards/cardBus'
import { goTo } from './navigate'
import { openEmail } from './openEmail'

export function openNotificationTarget(target: AppNotification['target'], pathname: string) {
  if (target?.type === 'email') {
    openEmail(target.id, pathname === '/inbox')
    if (pathname !== '/inbox') goTo('/inbox')
  } else if (target?.type === 'card') openCard(target.id)
  else if (target?.type === 'event') goTo('/calendar')
}
