import mockEmails from './mock/mockEmails.json'
import type { Email } from './types'
import { COLUMNS, groupByType } from './lib/board'
import { EmailCard } from './components/EmailCard'

const emails = mockEmails as Email[]
const groups = groupByType(emails)

export default function App() {
  return (
    <>
      <header className="app-header">
        <h1>Triage</h1>
        <p>{emails.length} classified emails</p>
      </header>
      {/* Focusable so keyboard users can scroll the columns sideways on narrow screens. */}
      <main className="board" tabIndex={0} aria-label="Emails by type">
        {COLUMNS.map(({ type, label }) => (
          <section key={type} className="column" data-type={type} aria-labelledby={`col-${type}`}>
            <h2 id={`col-${type}`}>
              {label} <span className="count">{groups[type].length}</span>
            </h2>
            {groups[type].length ? (
              <ol className="cards">
                {groups[type].map((e) => (
                  <li key={e.id}>
                    <EmailCard email={e} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">Nothing here</p>
            )}
          </section>
        ))}
      </main>
    </>
  )
}
