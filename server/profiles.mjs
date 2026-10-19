const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' },
});
const countries = new Set(['CN', 'RU', 'IR', 'KP', 'FIN', 'DEV', 'PSOA', 'OTH']);

export async function handleProfiles(request, db, snapshot) {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId) return json({ error: 'Sign in to ChatGPT to edit your encyclopedia.' }, 401);
  if (!db) return json({ error: 'Profile storage is unavailable. Please try again later.' }, 503);
  const method = request.method;
  if (method !== 'GET') {
    // Browser writes must originate from this Site. Dispatch supplies trusted identity.
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return json({ error: 'This write must come from the encyclopedia.' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return json({ error: 'Expected a JSON profile.' }, 415);
  }
  try {
    if (method === 'GET') {
      const { results } = await db.prepare('SELECT actor_id, document, revision, deleted FROM profiles WHERE user_id = ?').bind(userId).all();
      const actors = new Map(snapshot.actors.map(a => [a.id, { ...a, _revision: 0 }]));
      for (const row of results) {
        if (row.deleted) actors.delete(row.actor_id);
        else actors.set(row.actor_id, { ...JSON.parse(row.document), _revision: row.revision });
      }
      return json({ actors: [...actors.values()], scenarios: snapshot.scenarios, userId });
    }
    if (!['POST', 'PUT', 'DELETE'].includes(method)) return json({ error: 'Method not allowed.' }, 405);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 512000) return json({ error: 'Profile is too large (maximum 500 KB).' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    const { actor, expectedRevision } = body;
    const id = method === 'DELETE' ? body.id : actor?.id;
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,159}$/.test(id) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      return json({ error: 'Invalid profile ID or revision.' }, 400);
    const seed = snapshot.actors.some(a => a.id === id);
    const existing = await db.prepare('SELECT revision, deleted FROM profiles WHERE user_id = ? AND actor_id = ?').bind(userId, id).first();
    if (method === 'POST' && (seed || existing)) return json({ error: 'A profile with this ID already exists.' }, 409);
    if (method !== 'POST' && (!seed && !existing || existing?.deleted)) return json({ error: 'Profile not found.' }, 404);
    if ((existing?.revision ?? 0) !== expectedRevision)
      return json({ error: 'This profile changed in another tab. Reload before editing again.' }, 409);
    let document = null;
    if (method !== 'DELETE') {
      if (!actor || typeof actor.primaryName !== 'string' || !actor.primaryName.trim() || actor.primaryName.length > 200 || !countries.has(actor.country))
        return json({ error: 'A primary name and valid country are required.' }, 400);
      for (const field of ['aliases', 'attack', 'campaigns', 'gaps', 'sources'])
        if (!Array.isArray(actor[field])) return json({ error: `Invalid ${field} field.` }, 400);
      for (const field of ['identification', 'attribution', 'targeting', 'capabilities', 'diamond', 'implications'])
        if (!actor[field] || typeof actor[field] !== 'object' || Array.isArray(actor[field])) return json({ error: `Invalid ${field} field.` }, 400);
      const { _revision, ...data } = actor;
      document = { ...data, primaryName: actor.primaryName.trim(), updatedAt: new Date().toISOString(), updatedBy: userId };
    }
    const revision = expectedRevision + 1;
    // Atomic revision check also protects against a concurrent write after the SELECT.
    const result = await db.prepare(`INSERT INTO profiles (user_id, actor_id, document, revision, deleted)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, actor_id) DO UPDATE SET
      document = excluded.document, revision = excluded.revision, deleted = excluded.deleted
      WHERE profiles.revision = ?`).bind(userId, id, document ? JSON.stringify(document) : null, revision, method === 'DELETE' ? 1 : 0, expectedRevision).run();
    if (!result.meta.changes) return json({ error: 'This profile changed in another tab. Reload before editing again.' }, 409);
    return json({ actor: document ? { ...document, _revision: revision } : null });
  } catch (error) {
    console.error('Profile storage operation failed', error);
    return json({ error: 'Profile storage is unavailable. Your changes have not been saved. Please try again.' }, 503);
  }
}
