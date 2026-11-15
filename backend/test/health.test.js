import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

test('GET /health returns status and version', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();

  const res = await fetch(`http://localhost:${port}/health`);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok', version: '0.1.0' });
});

test('unknown route returns 404 JSON', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();

  const res = await fetch(`http://localhost:${port}/nope`);

  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});
