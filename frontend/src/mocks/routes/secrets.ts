// Reveal (FR-SEC-007/008) and click-time link checks (FR-SEC-004, v1.2 JSON response).
import { Fail, own, route } from '../http/route'
import { recentlySignedIn } from '../session'
import { audit } from '../store/audit'
import { db } from '../store/db'

export const secretRoutes = [
  route<{ id: string }>('post', '/secrets/:id/reveal', 'user', async ({ user, params }) => {
    const secret = own(db.secrets.find((s) => s.id === params.id), user, 'Secret')
    // FR-SEC-008: a Google sign-in within the last 5 minutes. The client sends the user to reauth_url and back.
    if (!recentlySignedIn()) {
      throw new Fail(401, 'reauth_required', 'Sign in again to reveal this value', { reauth_url: '/api/v1/auth/google?reauth=1' })
    }
    // The audit entry records who revealed what kind of secret, never the value.
    await audit(user.id, 'secret.reveal', secret.id, { secret_type: secret.secret_type, email_id: secret.email_id })
    return { value: secret.value, expires_in: 60 }
  }),

  route<{ checkId: string }>('get', '/links/:checkId/go', 'user', ({ user, params }) => {
    const check = db.urlChecks.find((c) => c.id === params.checkId)
    const email = check && db.emails.get(check.email_id)
    own(email, user, 'Link')
    if (check!.verdict === 'pending') throw new Fail(409, 'conflict', 'Link not checked yet')
    // The resolver re-scores the final URL; the mock reuses the stored verdict and chain.
    if (check!.verdict === 'clean') return { action: 'open', url: check!.final_url }
    if (check!.verdict === 'suspicious') {
      return { action: 'interstitial', verdict: 'suspicious', final_url: check!.final_url, chain: [...check!.chain], signals: [...check!.signals] }
    }
    return { action: 'blocked', verdict: 'malicious', chain: [...check!.chain], signals: [...check!.signals] }
  }),
]
