import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleProfiles } from '../server/profiles.mjs';

const seed = JSON.parse(readFileSync(new URL('../data/bundle.json', import.meta.url)));
const actor = seed.actors[0];
function database() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  return { prepare(query) { return { bind(...args) { return {
    async all() { return { results: sql.prepare(query).all(...args) }; },
    async first() { return sql.prepare(query).get(...args) ?? null; },
    async run() { return { meta: { changes: sql.prepare(query).run(...args).changes } }; },
  }; } }; } };
}
function request(method = 'GET', body, user = 'owner', origin = 'https://encyclopedia.test') {
  return new Request('https://encyclopedia.test/api/profiles', { method, headers: {
    ...(user ? { 'oai-authenticated-user-id': user } : {}),
    ...(body ? { origin, 'content-type': 'application/json' } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
test('requires authentication and rejects cross-origin writes', async () => {
  const db = database();
  assert.equal((await handleProfiles(request('GET', null, null), db, seed)).status, 401);
  assert.equal((await handleProfiles(request('PUT', { actor, expectedRevision: 0 }, 'owner', 'https://other.test'), db, seed)).status, 403);
});
test('edits persist across reads, isolate users, and reject stale updates', async () => {
  const db = database();
  const edited = { ...actor, primaryName: 'Updated profile' };
  const save = await handleProfiles(request('PUT', { actor: edited, expectedRevision: 0 }), db, seed);
  assert.equal(save.status, 200);
  assert.equal((await save.json()).actor._revision, 1);
  const current = await (await handleProfiles(request(), db, seed)).json();
  assert.equal(current.actors.find(a => a.id === actor.id).primaryName, 'Updated profile');
  const other = await (await handleProfiles(request('GET', null, 'other'), db, seed)).json();
  assert.equal(other.actors.find(a => a.id === actor.id).primaryName, actor.primaryName);
  assert.equal((await handleProfiles(request('PUT', { actor, expectedRevision: 0 }), db, seed)).status, 409);
});
test('creates profiles, prevents duplicates, and preserves deletion across reloads', async () => {
  const db = database();
  const added = { ...actor, id: 'test-profile', primaryName: 'Test profile' };
  assert.equal((await handleProfiles(request('POST', { actor: added, expectedRevision: 0 }), db, seed)).status, 200);
  assert.equal((await handleProfiles(request('POST', { actor: added, expectedRevision: 0 }), db, seed)).status, 409);
  assert.equal((await handleProfiles(request('DELETE', { id: actor.id, expectedRevision: 0 }), db, seed)).status, 200);
  const reloaded = await (await handleProfiles(request(), db, seed)).json();
  assert.ok(reloaded.actors.some(a => a.id === added.id));
  assert.ok(!reloaded.actors.some(a => a.id === actor.id));
  assert.equal((await handleProfiles(request('PUT', { actor, expectedRevision: 1 }), db, seed)).status, 404);
});
test('validates records and fails closed when database is unavailable', async () => {
  const db = database();
  assert.equal((await handleProfiles(request('POST', { actor: { ...actor, id: 'invalid', primaryName: '' }, expectedRevision: 0 }), db, seed)).status, 400);
  assert.equal((await handleProfiles(request(), null, seed)).status, 503);
});
