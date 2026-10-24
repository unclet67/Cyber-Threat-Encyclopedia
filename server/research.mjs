import { researchLimits, researchPeriods, researchBudget } from './research-budget.mjs';
import { makeResearchRequest, parseResearch } from './research-schema.mjs';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const publicJob = row => ({ id: row.id, actorId: row.actor_id, baseRevision: row.base_revision, status: row.status, ...(row.result ? JSON.parse(row.result) : {}) });
export async function handleResearch(request, env, snapshot, fetchApi = fetch) {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId) return json({ error: 'Sign in to ChatGPT to research actors.' }, 401);
  if (!env.DB || !env.OPENAI_API_KEY) return json({ error: 'Research is not configured. The Site owner needs to configure the research API secret.' }, 503);
  const db = env.DB;
  const api = async (path, options = {}) => {
    const response = await fetchApi(`https://api.openai.com/v1/responses${path}`, {
      ...options, signal: AbortSignal.timeout(25000),
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json', ...options.headers },
    });
    if (!response.ok) {
      // Never return provider payloads or credentials to the browser/logs.
      const message = response.status === 429 ? 'Research API quota or rate limit reached. Check API billing or try later.'
        : response.status === 401 || response.status === 403 ? 'The research API key cannot access this model. Ask the Site owner to check API access.'
        : 'The research service could not complete the request. Please try again later.';
      throw new Error(message);
    }
    return response.json();
  };
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      if(url.searchParams.get('budget')==='1')return json({budget:await researchBudget(db,userId,env)});
      const id = url.searchParams.get('job');
      const actor = url.searchParams.get('actor');
      if (!id && !actor) return json({ error: 'Choose an actor to research.' }, 400);
      const row = id
        ? await db.prepare('SELECT * FROM research_jobs WHERE id = ? AND user_id = ?').bind(id, userId).first()
        : await db.prepare('SELECT * FROM research_jobs WHERE actor_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1').bind(actor, userId).first();
      if (!row) return json({ job: null });
      if (['queued', 'in_progress'].includes(row.status) && row.response_id) {
        let response;
        try { response = await api(`/${encodeURIComponent(row.response_id)}?include[]=web_search_call.action.sources`); }
        catch (error) { return json({ error: error.message }, 502); }
        if (['queued', 'in_progress'].includes(response.status)) row.status = response.status;
        else {
          try { row.result = JSON.stringify({ draft: parseResearch(response, row.id) }); row.status = 'completed'; }
          catch (error) { row.result = JSON.stringify({ error: error.message }); row.status = 'failed'; }
        }
        await db.prepare('UPDATE research_jobs SET status = ?, result = ? WHERE id = ? AND user_id = ?').bind(row.status, row.result, row.id, userId).run();
      } else if (row.status === 'starting' && row.created_at < Date.now() - 60000) {
        row.status = 'failed'; row.result = JSON.stringify({ error: 'Research could not start. Please try again.' });
        await db.prepare('UPDATE research_jobs SET status = ?, result = ? WHERE id = ? AND user_id = ?').bind(row.status, row.result, row.id, userId).run();
      }
      return json({ job: publicJob(row) });
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Start research from this Site.' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Expected a research request.' }, 415);
    const text = await request.text();
    if (text.length > 5000) return json({ error: 'Research focus is too long.' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'Invalid research request.' }, 400); }
    if (!body || typeof body.actorId !== 'string' || typeof body.focus !== 'string' || body.focus.length > 1500 || !/^[0-9a-f-]{36}$/.test(body.requestId || ''))
      return json({ error: 'Choose an actor and a focus of 1,500 characters or fewer.' }, 400);
    const previous = await db.prepare('SELECT * FROM research_jobs WHERE id = ? AND user_id = ?').bind(body.requestId, userId).first();
    if (previous) return json({ job: publicJob(previous) });
    const stored = await db.prepare('SELECT document, revision, deleted FROM profiles WHERE user_id = ? AND actor_id = ?').bind(userId, body.actorId).first();
    const actor = stored ? (stored.deleted ? null : { ...JSON.parse(stored.document), _revision: stored.revision }) : snapshot.actors.find(a => a.id === body.actorId);
    if (!actor) return json({ error: 'Actor profile not found.' }, 404);
    const now = Date.now();
    const limits=researchLimits(env),period=researchPeriods(now);
    const claim = await db.prepare(`INSERT OR IGNORE INTO research_jobs (id, user_id, actor_id, base_revision, status, created_at)
      SELECT ?, ?, ?, ?, 'starting', ? WHERE NOT EXISTS
      (SELECT 1 FROM research_jobs WHERE user_id = ? AND ((status IN ('starting','queued','in_progress') AND created_at > ?) OR created_at > ?))
      AND (SELECT COUNT(*) FROM research_jobs WHERE user_id = ? AND created_at >= ?) < ?
      AND (SELECT COUNT(*) FROM research_jobs WHERE created_at >= ?) < ?
      AND (SELECT COUNT(*) FROM research_jobs WHERE created_at >= ?) < ?`)
      .bind(body.requestId, userId, actor.id, actor._revision || 0, now, userId, now - 15 * 60000, now - 20000, userId,period.day,limits.userDailyLimit,period.day,limits.globalDailyLimit,period.month,limits.monthlyLimit).run();
    if (!claim.meta.changes) return json({ error: 'Research budget reached, another run is active, or a run just started. Check budget and saved research before retrying.' }, 429);
    try {
      const response = await api('', { method: 'POST', headers: { 'Idempotency-Key': body.requestId }, body: JSON.stringify(makeResearchRequest(actor, body.focus, env.RESEARCH_MODEL || 'gpt-5.5')) });
      let status = ['queued', 'in_progress'].includes(response.status) ? response.status : 'completed';
      let result = null;
      if (status === 'completed') result = JSON.stringify({ draft: parseResearch(response, body.requestId) });
      await db.prepare('UPDATE research_jobs SET response_id = ?, status = ?, result = ? WHERE id = ? AND user_id = ?')
        .bind(response.id, status, result, body.requestId, userId).run();
      return json({ job: { id: body.requestId, actorId: actor.id, baseRevision: actor._revision || 0, status, ...(result ? JSON.parse(result) : {}) } }, 202);
    } catch (error) {
      await db.prepare("UPDATE research_jobs SET status = 'failed', result = ? WHERE id = ? AND user_id = ?").bind(JSON.stringify({ error: error.message }), body.requestId, userId).run();
      return json({ error: error.message }, 502);
    }
  } catch {
    return json({ error: 'Research storage is unavailable. Please try again later.' }, 503);
  }
}

