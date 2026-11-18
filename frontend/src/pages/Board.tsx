import { Board } from '../board/Board'
import { InboxHost } from '../inbox/InboxHost'

/** The Board full view (FR-ORC-007): every card of the user's, in To do · In progress · Done. */
export function Component() {
  return (
    <InboxHost>
      <div className="board-page">
        <Board label="Board" />
      </div>
    </InboxHost>
  )
}
