import type { Email } from '../types'
import { MaskedText } from './MaskedText'

const timeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function EmailCard({ email }: { email: Email }) {
  const { urgency, sentiment } = email.triage!
  const secrets = email.maskedSecrets.length

  return (
    <article className="card">
      <header className="card-meta">
        <span className="sender" title={email.fromAddr}>
          {email.fromName ?? email.fromAddr}
        </span>
        <time dateTime={email.receivedAt}>{timeFmt.format(new Date(email.receivedAt))}</time>
      </header>
      <h3 className="subject">
        <MaskedText text={email.subject} />
      </h3>
      <p className={email.summary ? 'summary' : 'summary unavailable'}>
        {email.summary ? <MaskedText text={email.summary.oneLine} /> : 'Summary unavailable'}
      </p>
      <footer className="card-tags">
        <span className="badge" data-urgency={urgency}>
          <span className="sr-only">Urgency: </span>
          {urgency}
        </span>
        <span className="sentiment" data-sentiment={sentiment}>
          <span className="dot" aria-hidden="true" />
          <span className="sr-only">Sentiment: </span>
          {sentiment}
        </span>
        {secrets > 0 && (
          <span className="masked">
            <span aria-hidden="true">🔒</span> {secrets} masked credential{secrets > 1 ? 's' : ''}
          </span>
        )}
      </footer>
    </article>
  )
}
