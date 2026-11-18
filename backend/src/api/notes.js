// Notes (FR-CNT-003/005, proposals §19.2): on an email, card or project, or standalone; masked on save. Each secret
// found gets a masked_secrets row with its type; the value is never kept (§18.4: an encrypted placeholder until
// value_enc is nullable). Note bodies are never logged.
import { Router } from 'express';
import { Fail, UUID, idParam, isStr, object, own, pageParams, route, searchParams, toPage } from '../http.js';
import { encrypt } from '../services/crypto.js';
import { query, tx } from '../services/db.js';
import { listItem } from '../services/emails.js';
import { publish } from '../services/events.js';
import { maskSecrets } from '../services/mask.js';

export const notes = Router();

const TARGETS = ['email', 'card', 'project'];
const MAX = 20_000;

const toNote = (n) => ({
  id: n.id,
  target_type: n.target_type,
  target_id: n.target_id,
  body: n.body,
  created_at: n.created_at.toISOString(),
  updated_at: n.updated_at.toISOString(),
});

/** The target must be the user's own: 404 otherwise. */
async function checkTarget(user, type, id) {
  if (!UUID.test(id)) throw new Fail(404, 'not_found', 'Target not found');
  const sql = {
    email: 'SELECT e.id FROM emails e JOIN mailboxes m ON m.id = e.mailbox_id WHERE e.id = $1 AND m.user_id = $2',
    card: 'SELECT id FROM actions WHERE id = $1 AND user_id = $2 AND email_id IS NULL',
    project: 'SELECT id FROM projects WHERE id = $1 AND owner_user_id = $2',
  }[type];
  own((await query(sql, [id, user.id])).rows[0], type === 'card' ? 'Card' : type === 'email' ? 'Email' : 'Project');
}

/** Masks the body and replaces the note's masked_secrets rows (types only). */
async function store(c, user, noteId, body) {
  const { masked_text, secrets } = maskSecrets(body);
  await c.query('DELETE FROM masked_secrets WHERE note_id = $1', [noteId]);
  for (const s of secrets) {
    await c.query('INSERT INTO masked_secrets (note_id, owner_user_id, secret_type, value_enc) VALUES ($1, $2, $3, $4)', [noteId, user.id, s.type, encrypt('[omitted]')]);
  }
  return masked_text;
}

async function emitEmail(user, n) {
  if (n.target_type === 'email') publish(user.id, 'email.triaged', { email_id: n.target_id, email: await listItem(user.id, n.target_id) });
}

route(notes, 'get', '/notes', 'user', async (req, user) => {
  const params = searchParams(req);
  const p = pageParams(params);
  const type = params.get('target_type');
  const id = params.get('target_id');
  if (type && type !== 'none' && !TARGETS.includes(type)) throw new Fail(400, 'bad_request', 'Unknown target_type');
  if (type && type !== 'none' && !id) throw new Fail(400, 'bad_request', 'target_id is required with target_type');
  if (type && type !== 'none') await checkTarget(user, type, id);
  const { rows } = await query(
    `SELECT * FROM notes WHERE owner_user_id = $1
        AND ($2::text IS NULL OR ($2 = 'none' AND target_type IS NULL) OR (target_type = $2 AND target_id = $3::uuid))
      ORDER BY updated_at DESC LIMIT $4 OFFSET $5`,
    [user.id, type, type && type !== 'none' ? id : null, p.limit + 1, p.offset],
  );
  return toPage(rows.map(toNote), p);
});

route(notes, 'post', '/notes', 'user', async (req, user) => {
  const f = object(req.body).only(['target_type', 'target_id', 'body']);
  const type = f.body.target_type ?? null;
  const id = f.body.target_id ?? null;
  if (type !== null && !TARGETS.includes(type)) f.add('target_type', 'Must be email, card, project or null');
  if ((type === null) !== (id === null)) f.add('target_id', 'Give both target_type and target_id, or neither');
  if (!isStr(f.body.body, MAX)) f.add('body', `Text, at most ${MAX} characters`);
  f.done();
  if (type) await checkTarget(user, type, id);
  const row = await tx(async (c) => {
    const n = (await c.query('INSERT INTO notes (tenant_id, owner_user_id, target_type, target_id, body) VALUES ($1, $2, $3, $4, $5) RETURNING id', [user.tenant_id, user.id, type, id, ''])).rows[0];
    const body = await store(c, user, n.id, f.body.body);
    return (await c.query('UPDATE notes SET body = $2 WHERE id = $1 RETURNING *', [n.id, body])).rows[0];
  });
  await emitEmail(user, row);
  return toNote(row);
}, { status: 201 });

route(notes, 'patch', '/notes/:id', 'user', async (req, user) => {
  const id = idParam(req, 'Note');
  const f = object(req.body).only(['body']);
  if (!isStr(f.body.body, MAX)) f.add('body', `Text, at most ${MAX} characters`);
  f.done();
  const row = await tx(async (c) => {
    own((await c.query('SELECT id FROM notes WHERE id = $1 AND owner_user_id = $2 FOR UPDATE', [id, user.id])).rows[0], 'Note');
    const body = await store(c, user, id, f.body.body);
    return (await c.query('UPDATE notes SET body = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, body])).rows[0];
  });
  return toNote(row);
});

route(notes, 'delete', '/notes/:id', 'user', async (req, user) => {
  const id = idParam(req, 'Note');
  const { rows: [n] } = await query('DELETE FROM notes WHERE id = $1 AND owner_user_id = $2 RETURNING *', [id, user.id]);
  own(n, 'Note');
  await emitEmail(user, n);
});
