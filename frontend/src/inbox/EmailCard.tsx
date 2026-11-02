import { Pin } from 'lucide-react'
import { memo, useId, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { EmailListItem } from '../api/types'
import { MaskedText } from '../components/MaskedText'
import { cardTags, cardTime, senderName, senderRole, visibleTags, type CardTag, type Density, type FilterPatch } from './cardModel'
import { CardActions } from './CardActions'
import { CorrectionMenu } from './CorrectionMenu'
import { useInbox } from './inboxContext'
import { TagIcon, TypeIcon, UrgencyMark } from './marks'

interface Props {
  email: EmailListItem
  now: Date
  density: Density
  /** Arrived through the "↑ n new" pill: fades in with an accent tint for 2 s (item 9). */
  fresh: boolean
  onFilter: (patch: FilterPatch) => void
}

/**
 * Card layer 1 (FR-UI-011, item 3): type icon · sender · role · time · urgency, subject (the only bold line), one-line
 * summary, tag strip. The card's height is fixed by its density (NFR-PERF-011): every line truncates, and the summary
 * and labels reserve their space while they load. Subject and summary are plain text with masked-secret chips; no
 * HTML is ever rendered from email content.
 *
 * Layer 2: CardActions (hover or focus). Layer 3: a click, Enter or Space opens the side drawer (Space is the quick
 * preview, FR-UI-015). Buttons inside the card stop their clicks, so they never also open the drawer.
 */
export const EmailCard = memo(function EmailCard({ email, now, density, fresh, onFilter }: Props) {
  const triage = email.triage
  const role = senderRole(email)
  // Per card instance: the same email can sit in several columns on one dashboard page.
  const subjectId = useId()
  const { open } = useInbox()
  const [leaving, setLeaving] = useState(false)
  const filter = (patch: FilterPatch) => (e: ReactMouseEvent) => {
    e.stopPropagation()
    onFilter(patch)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open(email.id)
    }
  }

  return (
    <article
      className="card"
      data-density={density}
      data-fresh={fresh || undefined}
      data-leaving={leaving || undefined}
      aria-labelledby={subjectId}
      aria-describedby="card-hint"
      tabIndex={0}
      onClick={() => open(email.id)}
      onKeyDown={onKeyDown}
    >
      <CardActions email={email} onLeave={setLeaving} />
      <div className="card-meta">
        {!triage ? (
          <span className="skel skel-chip" role="img" aria-label="Not classified yet" />
        ) : triage.needs_review ? (
          <CorrectionMenu email={{ ...email, triage }} />
        ) : (
          <button
            type="button"
            className="type-chip"
            title={`${triage.email_type.label}: click to show only this type`}
            onClick={filter({ group: 'type', value: triage.email_type.label })}
          >
            <TypeIcon type={triage.email_type.label} />
            <span className="sr-only">Type {triage.email_type.label}. Filter by this type</span>
          </button>
        )}
        {!email.read && (
          <span className="card-unread" title="Unread">
            <span className="sr-only">Unread</span>
          </span>
        )}
        <span className="card-sender" title={email.from.address} data-unread={!email.read || undefined}>
          {senderName(email)}
        </span>
        {role && <span className="card-role">{role}</span>}
        <span className="card-meta-end">
          {email.pinned && (
            <span className="card-pin" title="Pinned">
              <Pin size={12} aria-hidden="true" />
              <span className="sr-only">Pinned</span>
            </span>
          )}
          <time className="card-time" dateTime={email.received_at} title={new Date(email.received_at).toLocaleString()}>
            {cardTime(email.received_at, now)}
          </time>
          {triage && (
            <button
              type="button"
              className="urgency"
              title={`${triage.urgency.label} urgency: click to show only this urgency`}
              onClick={filter({ group: 'urgency', value: triage.urgency.label })}
            >
              <UrgencyMark urgency={triage.urgency.label} />
              <span className="sr-only">{triage.urgency.label} urgency. Filter by this urgency</span>
            </button>
          )}
        </span>
      </div>

      <h3 className="card-subject" id={subjectId}>
        {email.subject ? <MaskedText text={email.subject} /> : '(no subject)'}
      </h3>

      <p className="card-summary">
        {email.summary_one_line ? (
          <MaskedText text={email.summary_one_line} />
        ) : email.status === 'enrich_failed' ? (
          <span className="card-summary-missing">No summary available</span>
        ) : (
          <span className="skel skel-line" role="img" aria-label="Summary on its way" />
        )}
      </p>

      <TagStrip tags={cardTags(email, now)} onFilter={filter} />
    </article>
  )
})

/**
 * At most five tags, then +N (FR-UI-014). Hovering or focusing the strip shows every tag in a popover drawn over the
 * card itself: pure CSS with the 150 ms hover intent, no React state, and it stays inside the card, so the list's
 * scroll container can't clip it. Tags with a §6.5 query parameter (security, sentiment) are filter buttons.
 */
function TagStrip({ tags, onFilter }: { tags: CardTag[]; onFilter: (p: FilterPatch) => (e: ReactMouseEvent) => void }) {
  if (tags.length === 0) return <div className="card-tags" />
  const { shown, hidden } = visibleTags(tags)
  const rest = tags.slice(shown.length)

  return (
    <div className="card-tags">
      <ul className="tag-row" aria-label="Tags">
        {shown.map((t) => (
          <li key={t.kind}>
            <Tag tag={t} onFilter={onFilter} />
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <span className="tag tag-more" tabIndex={0} aria-label={`${hidden} more: ${rest.map((t) => t.label).join(', ')}`}>
              +{hidden}
            </span>
          </li>
        )}
      </ul>
      <ul className="tag-popover" aria-hidden="true">
        {tags.map((t) => (
          <li key={t.kind} className="tag" data-tone={t.tone}>
            <TagIcon tag={t} />
            {t.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Tag({ tag, onFilter }: { tag: CardTag; onFilter: (p: FilterPatch) => (e: ReactMouseEvent) => void }) {
  const body = (
    <>
      <TagIcon tag={tag} />
      {tag.text && <span aria-hidden="true">{tag.text}</span>}
    </>
  )
  if (tag.filter) {
    return (
      <button type="button" className="tag" data-tone={tag.tone} title={`${tag.label}: click to filter`} onClick={onFilter(tag.filter)}>
        {body}
        <span className="sr-only">{tag.label}. Filter by this</span>
      </button>
    )
  }
  return (
    <span className="tag" data-tone={tag.tone} title={tag.label}>
      {body}
      <span className="sr-only">{tag.label}</span>
    </span>
  )
}
