import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { makeResearchRequest, parseResearch, sectionSchemas } from '../server/research-schema.mjs';
import { handleResearch } from '../server/research.mjs';

const snapshot = { actors: [{ id: 'salt-typhoon', primaryName: 'Salt Typhoon' }], scenarios: [] };
const jobId = 'a1234567-1234-4234-8234-123456789012';
const sourceUrl = 'https://www.cisa.gov/news-events/cybersecurity-advisories/example';
function completion(url = sourceUrl) {
  return { id: 'resp_test', status: 'completed', output: [
    { type: 'web_search_call', status: 'completed', action: { sources: [{ url: sourceUrl }] } },
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
      summary: 'Research found reporting [R1].', cautions: ['Publication date unverified.'],
      sections: { ...Object.fromEntries(Object.keys(sectionSchemas).map(k => [k, null])), identification: { summary: 'Public reporting [R1].', firstObserved: '', notes: '' } },
      sources: [{ ref: 'R1', date: '', publisher: 'CISA', title: 'Public advisory', url }],
    }) }] },
  ] };
}
function database() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  return { prepare(query) { return { bind(...args) { return {
    async all() { return { results: sql.prepare(query).all(...args) }; },
    async first() { return sql.prepare(query).get(...args) ?? null; },
    async run() { return { meta: { changes: sql.prepare(query).run(...args).changes } }; },
  }; } }; } };
}
const request = (method, path = '', body, user = 'owner', origin = 'https://encyclopedia.test') => new Request(`https://encyclopedia.test/api/research${path}`, {
  method, headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), ...(body ? { 'Content-Type': 'application/json', origin } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
test('research request excludes saved notes, requires search, and uses structured output', () => {
  const r = makeResearchRequest({ primaryName: 'Salt Typhoon', objectives: 'PRIVATE NOTE' }, 'Attribution');
  assert.ok(!JSON.stringify(r).includes('PRIVATE NOTE'));
  assert.equal(r.tool_choice, 'required');
  assert.equal(r.background, true);
  assert.equal(r.text.format.strict, true);
});
test('matches citation URLs to search evidence and namespaces references', () => {
  const draft = parseResearch(completion(), jobId);
  assert.equal(draft.sources[0].ref, 'R-a1234567-1');
  assert.ok(draft.sections.identification.summary.includes('[R-a1234567-1]'));
  assert.throws(() => parseResearch(completion('https://fabricated.test/source'), jobId), /matched/);
  const noSearch = completion(); noSearch.output.shift();
  assert.throws(() => parseResearch(noSearch, jobId), /web search/);
  const noCitations = completion(); const d = JSON.parse(noCitations.output[1].content[0].text); d.sections.identification.summary = 'Unsupported claim'; noCitations.output[1].content[0].text = JSON.stringify(d);
  assert.throws(() => parseResearch(noCitations, jobId), /lacks valid/);
  const uncitedAttr = completion(); const da = JSON.parse(uncitedAttr.output[1].content[0].text); da.sections.attribution = { sponsor: 'Sponsor [R1]', confidence: 'High without ref', basis: 'Basis [R1]' }; uncitedAttr.output[1].content[0].text = JSON.stringify(da);
  assert.throws(() => parseResearch(uncitedAttr, jobId), /attribution field lacks/);
  const uncitedCamp = completion(); const dc = JSON.parse(uncitedCamp.output[1].content[0].text); dc.sections.campaigns = [{ date: '2025', name: 'Cited', summary: 'Summary [R1]', sources: ['R1'] }, { date: '2025', name: 'Uncited', summary: 'No ref here', sources: [] }]; uncitedCamp.output[1].content[0].text = JSON.stringify(dc);
  assert.throws(() => parseResearch(uncitedCamp, jobId), /campaign lacks/);
  const emptyTitle = completion(); const dt = JSON.parse(emptyTitle.output[1].content[0].text); dt.sources[0].title = '   '; emptyTitle.output[1].content[0].text = JSON.stringify(dt);
  assert.throws(() => parseResearch(emptyTitle, jobId), /matched/);
});
test('enforces identity and same-origin writes before calling provider', async () => {
  const env = { DB: database(), OPENAI_API_KEY: 'test-secret' };
  const never = () => { throw new Error('Provider must not be called'); };
  assert.equal((await handleResearch(request('POST', '', {}, null), env, snapshot, never)).status, 401);
  assert.equal((await handleResearch(request('POST', '', {}, 'owner', 'https://other.test'), env, snapshot, never)).status, 403);
  assert.equal((await handleResearch(request('GET', '?actor=salt-typhoon'), { DB: env.DB }, snapshot, never)).status, 503);
});
test('normalizes written dates and rejects impossible dates', () => {
  const result = completion();
  const draft = JSON.parse(result.output[1].content[0].text);
  draft.sources[0].date = 'September 03, 2025';
  result.output[1].content[0].text = JSON.stringify(draft);
  assert.equal(parseResearch(result, jobId).sources[0].date, '2025-09-03');
  draft.sources[0].date = '2025-02-30';
  result.output[1].content[0].text = JSON.stringify(draft);
  assert.throws(() => parseResearch(result, jobId), /invalid publication date/);
});
test('background jobs are idempotent, private, resumable, and do not save profiles', async () => {
  const env = { DB: database(), OPENAI_API_KEY: 'test-secret' };
  let starts = 0;
  const provider = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    if (options.method === 'POST') { starts++; return Response.json({ id: 'resp_test', status: 'queued' }); }
    return Response.json(completion());
  };
  const body = { actorId: 'salt-typhoon', focus: '', requestId: jobId };
  assert.equal((await handleResearch(request('POST', '', body), env, snapshot, provider)).status, 202);
  await handleResearch(request('POST', '', body), env, snapshot, provider);
  assert.equal(starts, 1);
  const other = await (await handleResearch(request('GET', `?job=${jobId}`, null, 'other'), env, snapshot, provider)).json();
  assert.equal(other.job, null);
  const ready = await (await handleResearch(request('GET', `?job=${jobId}`), env, snapshot, provider)).json();
  assert.equal(ready.job.status, 'completed');
  assert.equal(ready.job.draft.sources.length, 1);
  assert.equal((await env.DB.prepare('SELECT * FROM profiles').bind().all()).results.length, 0);
  const cached = await (await handleResearch(request('GET', '?actor=salt-typhoon'), env, snapshot, () => { throw new Error('Must use cached result'); })).json();
  assert.equal(cached.job.id, jobId);
});
test('provider errors do not leak keys or payloads', async () => {
  const env = { DB: database(), OPENAI_API_KEY: 'test-secret' };
  const result = await handleResearch(request('POST', '', { actorId: 'salt-typhoon', focus: '', requestId: jobId }), env, snapshot,
    async () => Response.json({ error: { message: 'test-secret internal details' } }, { status: 429 }));
  const text = await result.text();
  assert.equal(result.status, 502);
  assert.ok(text.includes('quota'));
  assert.ok(!text.includes('test-secret'));
});
