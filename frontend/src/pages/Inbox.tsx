import { useMemo } from 'react'
import { useLocation } from 'react-router'
import { Column } from '../inbox/Column'
import { DEFAULT_COLUMN_STATE, parseColumnQuery } from '../inbox/cardModel'
import { InboxHost } from '../inbox/InboxHost'

/**
 * The Inbox full view: one column widget (FR-UI-006). Independent of the dashboard at `/`. A tile's ⤢ opens it with
 * the tile's filter and sort as GET /emails parameters (/inbox?view=due_today&sort=urgency).
 */
export function Component() {
  const { search } = useLocation()
  const initial = useMemo(() => ({ ...DEFAULT_COLUMN_STATE, ...parseColumnQuery(search) }), [search])
  return (
    <InboxHost>
      <div className="inbox-page">
        <Column key={search} title="Inbox" initial={initial} />
      </div>
    </InboxHost>
  )
}
