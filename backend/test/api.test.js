// M6 core against a real PostgreSQL (TEST_DATABASE_URL, default secep_test): migrated and seeded fresh, then the
// API is exercised over HTTP the way the frontend calls it. Skipped when the database isn't reachable.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';

const DB = process.env.TEST_DATABASE_URL || 'postgres://secep:secep@localhost:5432/secep_test';
process.env.DATABASE_URL = DB;
process.env.JWT_SECRET ||= 'test-jwt-secret-test-jwt-secret-test';
process.env.MASTER_KEY ||= '0'.repeat(64);
process.env.DEV_LOGIN = '1';

const probe = new pg.Client({ connectionString: DB });
const reachable = await probe.connect().then(() => true, () => false);
await probe.end().catch(() => {});

describe('M6 API', { skip: !reachable && 'no test database' }, () => {
  let base;
  let server;
  let io;
  let cookie;
  let token;
  const api = async (path, init = {}) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...init.headers },
      redirect: 'manual',
    });
    const json = res.headers.get('content-type')?.includes('application/json');
    return { status: res.status, body: json ? await res.json() : null, res };
  };

  before(async () => {
    execFileSync(process.execPath, ['scripts/seed-demo.js', '--fresh'], { env: process.env, stdio: 'ignore' });
    const { default: app } = await import('../src/app.js');
    const { attachSocket } = await import('../src/services/events.js');
    const { createServer } = await import('node:http');
    server = createServer(app);
    io = attachSocket(server);
    await new Promise((r) => server.listen(0, r));
    base = `http://localhost:${server.address().port}`;
  });
  after(async () => {
    io?.close();
    server?.closeAllConnections();
    server?.close();
    await (await import('../src/services/db.js')).pool.end();
  });

  test('sign-in: no cookie is 401; dev login sets an httpOnly refresh cookie; refresh gives a bearer token', async () => {
    assert.equal((await api('/auth/refresh', { method: 'POST' })).status, 401);
    assert.equal((await api('/me')).status, 401);
    const login = await api('/auth/dev?email=demo@northwind.example&return=/inbox');
    assert.equal(login.status, 302);
    assert.equal(login.res.headers.get('location'), '/inbox');
    const set = login.res.headers.get('set-cookie');
    assert.match(set, /HttpOnly/i);
    assert.match(set, /SameSite=Strict/i);
    cookie = set.split(';')[0];
    // Open redirect: an absolute return is ignored.
    assert.equal((await api('/auth/dev?return=//evil.example')).res.headers.get('location'), '/');
    const r = await api('/auth/refresh', { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    token = r.body.access_token;
    const me = await api('/me');
    assert.equal(me.body.email, 'demo@northwind.example');
  });

  test('GET /emails: page shape, filters, 400/422 and pinned-first', async () => {
    const all = await api('/emails?limit=50');
    assert.ok(all.body.items.length > 20);
    const first = all.body.items[0];
    for (const k of ['id', 'from', 'triage', 'summary_one_line', 'handled', 'read', 'due_date', 'jira_key', 'reply_count']) assert.ok(k in first, k);
    const crit = await api('/emails?urgency=Critical&limit=50');
    assert.ok(crit.body.items.every((e) => e.triage.urgency.label === 'Critical'));
    assert.ok((await api('/emails?view=handled&limit=50')).body.items.every((e) => e.handled));
    assert.ok(all.body.items.every((e) => !e.handled));
    assert.equal((await api('/emails?type=Spam')).status, 400);
    assert.equal((await api('/emails?view=nope')).body.error.code, 'invalid_parameter');
    const page1 = await api('/emails?limit=5');
    const page2 = await api(`/emails?limit=5&cursor=${encodeURIComponent(page1.body.next_cursor)}`);
    assert.equal(new Set([...page1.body.items, ...page2.body.items].map((e) => e.id)).size, 10);

    const pin = all.body.items.at(-1).id;
    assert.equal((await api(`/emails/${pin}`, { method: 'PATCH', body: JSON.stringify({ pinned: true, read: true }) })).body.pinned, true);
    assert.equal((await api('/emails?limit=50')).body.items[0].id, pin);
    assert.equal((await api(`/emails/${pin}`, { method: 'PATCH', body: JSON.stringify({ bogus: 1 }) })).status, 422);
    assert.equal((await api('/emails/not-a-uuid')).status, 404);
  });

  test('accept → one issue (idempotent) → undo deletes it → 409; the socket hears action.updated', async () => {
    const { io } = await import('socket.io-client');
    const socket = io(`${base}/ws`, { path: '/api/socket.io', transports: ['websocket'], auth: { token } });
    const heard = [];
    socket.on('action.updated', (p) => heard.push(p.action.id));
    await new Promise((r, j) => (socket.on('connect', r), socket.on('connect_error', j)));

    const items = (await api('/emails?limit=50')).body.items.filter((e) => e.proposed_action_count > 0);
    let action;
    for (const e of items) {
      action = (await api(`/emails/${e.id}`)).body.actions.find((a) => a.type === 'create_jira_issue' && a.status === 'proposed');
      if (action) break;
    }
    assert.ok(action, 'a proposed Jira action');
    const [a1, a2] = await Promise.all([api(`/actions/${action.id}/accept`, { method: 'POST', body: '{}' }), api(`/actions/${action.id}/accept`, { method: 'POST', body: '{}' })]);
    const ok = [a1, a2].filter((r) => r.status === 200);
    assert.ok(ok.length >= 1);
    assert.ok([a1, a2].every((r) => r.status === 200 || r.status === 409));
    const done = (await api(`/actions/${action.id}/accept`, { method: 'POST', body: '{}' })).body;
    assert.equal(done.status, 'done');
    assert.equal(done.board_column, 'todo');
    assert.ok(ok.every((r) => r.body.external_ref === done.external_ref), 'exactly one issue');

    const undone = await api(`/actions/${action.id}/undo`, { method: 'POST' });
    assert.equal(undone.body.status, 'proposed');
    assert.equal(undone.body.external_ref, null);
    assert.equal((await api(`/actions/${action.id}/undo`, { method: 'POST' })).status, 409);
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(heard.includes(action.id));
    socket.close();
  });

  test('reveal needs a recent sign-in, returns the value for 60 s and audits without it', async () => {
    const db = new pg.Client({ connectionString: DB });
    await db.connect();
    const { rows: [s] } = await db.query(`SELECT ms.id FROM masked_secrets ms JOIN users u ON u.id = ms.owner_user_id WHERE u.email = 'demo@northwind.example' LIMIT 1`);
    const r = await api(`/secrets/${s.id}/reveal`, { method: 'POST' });
    assert.equal(r.status, 200);
    assert.equal(r.body.expires_in, 60);
    const { rows: [a] } = await db.query(`SELECT details FROM audit_log WHERE event = 'secret.reveal' ORDER BY id DESC LIMIT 1`);
    assert.ok(!JSON.stringify(a.details).includes(r.body.value));
    // The audit log is append-only (NFR-SEC-006).
    await assert.rejects(db.query('UPDATE audit_log SET event = event'));
    await db.end();
  });

  test('layouts: starter by default; full replace; stale save 409; bad stack 422', async () => {
    const start = (await api('/layouts/desktop')).body;
    assert.equal(start.is_default, true);
    const pages = [{ ...start.pages[0], name: 'Mine' }];
    const saved = await api('/layouts/desktop', { method: 'PUT', body: JSON.stringify({ pages, base_updated_at: null }) });
    assert.equal(saved.status, 200);
    assert.equal((await api('/layouts/desktop', { method: 'PUT', body: JSON.stringify({ pages, base_updated_at: null }) })).status, 409);
    const next = await api('/layouts/desktop', { method: 'PUT', body: JSON.stringify({ pages, base_updated_at: saved.body.updated_at }) });
    assert.equal(next.status, 200);
    const bad = structuredClone(pages);
    bad[0].widgets[0].stacked = true;
    const r = await api('/layouts/desktop', { method: 'PUT', body: JSON.stringify({ pages: bad, base_updated_at: next.body.updated_at }) });
    assert.equal(r.status, 422);
    assert.ok('pages.0.widgets.0.stacked' in r.body.error.details.fields);
  });

  test('sign out clears the cookie', async () => {
    const r = await api('/auth/logout', { method: 'POST' });
    assert.equal(r.status, 204);
    assert.match(r.res.headers.get('set-cookie'), /secep_refresh=;/);
  });
});
