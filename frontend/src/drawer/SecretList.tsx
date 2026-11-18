import { Copy, Eye, EyeOff, LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { revealSecret } from '../api/queries'
import { startSignIn } from '../api/session'
import { errorText, useInbox } from '../inbox/inboxContext'
import { secretLabel } from '../lib/masked'

type State = { kind: 'hidden' } | { kind: 'busy' } | { kind: 'reauth' } | { kind: 'shown'; value: string; left: number } | { kind: 'error'; message: string }

/**
 * Masked secrets in this email (FR-SEC-007/008). Reveal needs a Google sign-in within the last 5 minutes: a
 * `reauth_required` answer offers "Sign in again", then reveals. The value lives only in this component's state,
 * never in the query cache or storage, and hides itself after the server's `expires_in` (60 s) or when the drawer
 * closes. Every reveal is audited by the server, without the value.
 */
export function SecretList({ secrets }: { secrets: { id: string; secret_type: string }[] }) {
  return (
    <ul className="secrets" aria-label="Masked secrets">
      {secrets.map((s) => (
        <SecretRow key={s.id} id={s.id} type={s.secret_type} />
      ))}
    </ul>
  )
}

function SecretRow({ id, type }: { id: string; type: string }) {
  const { toast } = useInbox()
  const [state, setState] = useState<State>({ kind: 'hidden' })
  const label = secretLabel(type)

  const reveal = async () => {
    setState({ kind: 'busy' })
    try {
      const { value, expires_in } = await revealSecret(id)
      setState({ kind: 'shown', value, left: expires_in })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'reauth_required') setState({ kind: 'reauth' })
      else setState({ kind: 'error', message: errorText(err) })
    }
  }

  // Count down once a second; at zero the value is dropped from memory.
  const shown = state.kind === 'shown'
  useEffect(() => {
    if (!shown) return
    const t = setInterval(() => setState((s) => (s.kind !== 'shown' ? s : s.left <= 1 ? { kind: 'hidden' } : { ...s, left: s.left - 1 })), 1000)
    return () => clearInterval(t)
  }, [shown])

  return (
    <li className="secret">
      <span className="secret-label">
        <span aria-hidden="true">🔒</span> {label[0].toUpperCase() + label.slice(1)}
      </span>
      {state.kind === 'shown' ? (
        <span className="secret-shown">
          <code className="secret-value">{state.value}</code>
          <button
            type="button"
            className="text-button"
            onClick={() => navigator.clipboard?.writeText(state.value).then(() => toast(`${label} copied`), () => toast("Couldn't copy", 'error'))}
          >
            <Copy size={14} aria-hidden="true" /> Copy
          </button>
          <button type="button" className="text-button" onClick={() => setState({ kind: 'hidden' })}>
            <EyeOff size={14} aria-hidden="true" /> Hide
          </button>
          <span className="secret-timer" aria-live="off">
            hides in {state.left} s
          </span>
        </span>
      ) : state.kind === 'reauth' ? (
        <span className="secret-shown">
          <span className="drawer-muted">For safety, sign in again first.</span>
          <button type="button" className="text-button" onClick={() => void startSignIn(true).then(reveal)}>
            <LogIn size={14} aria-hidden="true" /> Sign in again
          </button>
        </span>
      ) : (
        <span className="secret-shown">
          {state.kind === 'error' && (
            <span className="drawer-muted" role="alert">
              {state.message}
            </span>
          )}
          <button type="button" className="text-button" disabled={state.kind === 'busy'} onClick={() => void reveal()}>
            <Eye size={14} aria-hidden="true" /> {state.kind === 'busy' ? 'Revealing…' : 'Reveal'}
          </button>
        </span>
      )}
    </li>
  )
}
