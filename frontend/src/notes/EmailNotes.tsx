import { acceptAction, createAction, createCard, undoAction } from '../api/queries'
import type { EmailDetail, Person } from '../api/types'
import { openCard } from '../cards/cardBus'
import { shellToast } from '../lib/toastBus'
import { NotesPanel } from './NotesPanel'

const who = (p: Person) => (p.name ? `${p.name} <${p.address}>` : p.address)

/** FR-CNT-004: a new note on a Meeting email starts with its attendees and agenda. */
function meetingTemplate(email: EmailDetail) {
  const people = [email.from, ...email.to, ...email.cc]
  const seen = new Set<string>()
  const attendees = people.filter((p) => !seen.has(p.address.toLowerCase()) && seen.add(p.address.toLowerCase()))
  return [
    `## ${email.subject ?? 'Meeting'}`,
    '',
    '### Attendees',
    ...attendees.map((p) => `- ${who(p)}`),
    '',
    '### Agenda',
    `- ${email.summary_short ?? email.summary_one_line ?? ''}`.trimEnd(),
    '',
    '### Action items',
    '- [ ] ',
  ].join('\n')
}

/**
 * Notes in the email drawer (FR-CNT-003/004). On a Meeting email a new note starts from the template, and every open
 * `- [ ]` line offers → Card (a user card, filed in the email's projects) and → Jira (an issue from this email).
 */
export function EmailNotes({ email }: { email: EmailDetail }) {
  const meeting = email.triage?.email_type.label === 'Meeting'
  const toCard = async (title: string) => {
    try {
      const card = await createCard({ title: title.slice(0, 120) }, email.projects.map((p) => p.id))
      shellToast(`Added "${card.payload.title}" to To do`, 'info', { label: 'Open', run: () => openCard(card.id) })
    } catch (e) {
      shellToast(e instanceof Error ? e.message : "Couldn't add the card", 'error')
    }
  }
  const toJira = async (title: string) => {
    try {
      const a = await createAction(email.id, 'create_jira_issue', { title: title.slice(0, 120) })
      const done = await acceptAction(a)
      shellToast(done.status === 'done' ? `Created ${done.external_ref ?? 'the Jira issue'}` : (done.error ?? "Jira didn't take it"), done.status === 'done' ? 'info' : 'error', done.status === 'done' ? { label: 'Undo', run: () => void undoAction(done) } : undefined)
    } catch (e) {
      shellToast(e instanceof Error ? e.message : "Couldn't create the Jira issue", 'error')
    }
  }
  return (
    <NotesPanel
      scope={{ type: 'email', id: email.id }}
      template={meeting ? () => meetingTemplate(email) : undefined}
      newLabel={meeting ? 'Add meeting notes' : 'Add a note'}
      taskTools={(text) => (
        <>
          <button type="button" onClick={() => void toCard(text)} title="Make a card from this line">
            → Card
          </button>
          <button type="button" onClick={() => void toJira(text)} title="Make a Jira issue from this line">
            → Jira
          </button>
        </>
      )}
    />
  )
}
