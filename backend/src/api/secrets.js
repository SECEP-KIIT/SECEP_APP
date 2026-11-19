// Reveal (FR-SEC-007/008) and click-time link checks (FR-SEC-004).
import { Router } from 'express';
import { Fail, idParam, own, route } from '../http.js';
import { audit } from '../services/audit.js';
import { decrypt } from '../services/crypto.js';
import { query, tx } from '../services/db.js';

export const secrets = Router();
const REAUTH_WINDOW_S = 5 * 60;

route(secrets, 'post', '/secrets/:id/reveal', 'user', async (req, user) => {
  const id = idParam(req, 'Secret');
  const s = own((await query('SELECT * FROM masked_secrets WHERE id = $1 AND owner_user_id = $2', [id, user.id])).rows[0], 'Secret');
  // FR-SEC-008: a Google sign-in within the last 5 minutes (auth_time in the token).
  if (!user.auth_time || Date.now() / 1000 - user.auth_time > REAUTH_WINDOW_S) {
    throw new Fail(401, 'reauth_required', 'Sign in again to reveal this value', { reauth_url: '/api/v1/auth/google?reauth=1' });
  }
  // Who revealed what kind of secret, never the value.
  await tx((c) => audit(c, { tenantId: user.tenant_id, actorId: user.id, event: 'secret.reveal', target: id, details: { secret_type: s.secret_type, email_id: s.email_id } }));
  return { value: decrypt(s.value_enc), expires_in: 60 };
});

/**
 * GET /links/:checkId/go (v1.2 JSON): the M5 resolver re-scores at click time. Until M5 runs, the stored verdict and
 * chain are used. Clean opens, Suspicious needs an interstitial, Malicious never opens.
 */
route(secrets, 'get', '/links/:id/go', 'user', async (req, user) => {
  const id = idParam(req, 'Link');
  const c = own((await query(
    `SELECT u.* FROM url_checks u JOIN emails e ON e.id = u.email_id JOIN mailboxes m ON m.id = e.mailbox_id AND m.user_id = $2 WHERE u.id = $1`,
    [id, user.id],
  )).rows[0], 'Link');
  const chain = c.redirect_chain ?? [c.url];
  const signals = Object.entries(c.signals ?? {}).filter(([, v]) => v === true).map(([k]) => k);
  const finalUrl = c.final_url ?? c.url;
  if (c.verdict === 'clean') return { action: 'open', url: finalUrl };
  if (c.verdict === 'suspicious') return { action: 'interstitial', verdict: 'suspicious', final_url: finalUrl, chain, signals };
  return { action: 'blocked', verdict: 'malicious', chain, signals };
});
