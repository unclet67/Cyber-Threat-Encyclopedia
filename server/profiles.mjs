const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' },
});
const countries = new Set(['CN', 'RU', 'IR', 'KP', 'FIN', 'DEV', 'PSOA', 'OTH']);
const sectionKeys = {
  identification: ['summary', 'firstObserved', 'notes'],
  attribution: ['sponsor', 'confidence', 'basis'],
  targeting: ['sectors', 'regions', 'notes'],
  capabilities: ['summary', 'software'],
  diamond: ['adversary', 'capability', 'infrastructure', 'victim'],
  implications: ['jipoe', 'jcc2'],
};
const datePrefixRe = /^((19|20)\d{2})(?:-(\d{2})(?:-(\d{2}))?)?(?:\s*\([^)]+\))?$/;
const citeRe = /\[(S\d+|R-[0-9a-f]{8}-\d+|MS|M)\]/g;

function validSourceDate(val) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return true;
  const m = datePrefixRe.exec(trimmed);
  if (!m) return false;
  const year = Number(m[1]), month = m[3] ? Number(m[3]) : null, day = m[4] ? Number(m[4]) : null;
  if (month !== null) {
    if (month < 1 || month > 12) return false;
    if (day !== null) {
      const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const d = new Date(`${iso}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return false;
    }
  }
  return true;
}

function validateActorPayload(actor) {
  if (!actor || typeof actor.primaryName !== 'string' || !actor.primaryName.trim() || actor.primaryName.length > 200 || !countries.has(actor.country))
    return 'A primary name and valid country are required.';
  if (actor.mitreGroupId && (typeof actor.mitreGroupId !== 'string' || !/^G\d{4}$/.test(actor.mitreGroupId)))
    return 'Invalid MITRE group ID (expected G####).';
  if (typeof actor.objectives !== 'string') return 'Invalid objectives field.';
  for (const field of ['aliases', 'attack', 'campaigns', 'gaps', 'sources'])
    if (!Array.isArray(actor[field])) return `Invalid ${field} field.`;
  for (const [field, keys] of Object.entries(sectionKeys)) {
    if (!actor[field] || typeof actor[field] !== 'object' || Array.isArray(actor[field])) return `Invalid ${field} field.`;
    for (const key of keys) if (!(key in actor[field])) return `Missing ${field}.${key} field.`;
  }
  if (!Array.isArray(actor.targeting.sectors) || !Array.isArray(actor.targeting.regions))
    return 'Invalid targeting sectors or regions.';
  if (!Array.isArray(actor.capabilities.software))
    return 'Invalid capabilities.software field.';
  for (const al of actor.aliases)
    if (!al || typeof al !== 'object' || typeof al.name !== 'string' || !al.name.trim())
      return 'Each alias requires a non-empty name.';
  for (const t of actor.attack)
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !/^T\d{4}(\.\d{3})?$/.test(t.id) || typeof t.name !== 'string' || !t.name.trim())
      return 'Each ATT&CK technique requires a valid T#### ID and name.';
  const refs = new Set();
  for (const s of actor.sources) {
    if (!s || typeof s !== 'object' || typeof s.url !== 'string' || !/^https?:\/\//i.test(s.url.trim()))
      return 'Each source requires a valid http(s) URL.';
    if (!validSourceDate(s.date ?? ''))
      return `Invalid source date "${s.date}". Use YYYY-MM-DD, YYYY-MM, or YYYY.`;
    const ref = typeof s.ref === 'string' ? s.ref.trim() : '';
    if (ref) {
      if (refs.has(ref)) return `Duplicate source reference "${ref}".`;
      refs.add(ref);
    }
  }
  for (const c of actor.campaigns) {
    if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name.trim() || typeof c.summary !== 'string' || !c.summary.trim() || !Array.isArray(c.sources))
      return 'Each campaign requires a name, summary, and sources list.';
    for (const sr of c.sources)
      if (typeof sr !== 'string' || !refs.has(sr))
        return `Campaign cites unknown source "${sr}".`;
  }
  const { sources, provenance, _revision, ...rest } = actor;
  const cited = [...JSON.stringify(rest).matchAll(citeRe)].map(m => m[1]);
  for (const ref of cited)
    if (!refs.has(ref)) return `Profile text cites [${ref}] which is not in sources.`;
  return null;
}

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
      const validationError = validateActorPayload(actor);
      if (validationError) return json({ error: validationError }, 400);
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
