import { compareEntry } from '../lib/galaxy.mjs';
const json = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
const fingerprint = async actor => {
  const {_revision, ...data} = actor;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({revision:actor._revision||0,document:data})));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
};
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value && value <= new Date().toISOString().slice(0,10);
async function currentActor(db, seed, user, id) {
  const stored=await db.prepare('SELECT document, revision, deleted FROM profiles WHERE user_id = ? AND actor_id = ?').bind(user,id).first();
  return stored ? (stored.deleted ? null : {...JSON.parse(stored.document),_revision:stored.revision}) : seed.actors.find(a=>a.id===id);
}
const validEvidence = evidence => Array.isArray(evidence) && evidence.length > 0 && evidence.length <= 30 && evidence.every(x => {
  try { const u = new URL(x.url); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password &&
    typeof x.title === 'string' && x.title.trim() && typeof x.publisher === 'string' && x.publisher.trim() &&
    date(x.publishedAt) && date(x.accessedAt) && x.publishedAt <= x.accessedAt; } catch { return false; }
});
export async function handleEnrichment(request, db, seed, snapshot) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user) return json({error:'Sign in to review enrichment.'},401);
  if (!db) return json({error:'Enrichment review storage is unavailable.'},503);
  if (!['GET','POST'].includes(request.method)) return json({error:'Method not allowed.'},405);
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({error:'Review enrichment from this Site.'},403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Expected JSON.'},415);
  }
  try {
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('actor');
      const {results} = await db.prepare('SELECT document FROM galaxy_reviews WHERE user_id = ? AND actor_id = ?').bind(user,id).all();
      const actor=await currentActor(db,seed,user,id);
      const hash=actor?await fingerprint(actor):null;
      return json({reviews:results.map(x=>{const r=JSON.parse(x.document);return {...r,isStale:r.snapshotId!==snapshot.id||r.baseFingerprint!==hash};}),snapshotId:snapshot.id});
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 40000) return json({error:'Review exceeds 40 KB.'},413);
    let body; try { body=JSON.parse(text); } catch { return json({error:'Invalid JSON.'},400); }
    if (!body || !['stage','ready','approve','reject'].includes(body.action) || typeof body.actorId !== 'string' || typeof body.entryId !== 'string' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0)
      return json({error:'Invalid review request.'},400);
    const entry = snapshot.entries.find(e=>e.uuid===body.entryId);
    if (!entry) return json({error:'Galaxy entry not found in this snapshot.'},404);
    const actor=await currentActor(db,seed,user,body.actorId);
    if (!actor) return json({error:'Profile not found.'},404);
    const now = new Date().toISOString(), hash = await fingerprint(actor);
    // Keep prior reviewed contexts immutable when either the profile or feeds change.
    const contextId=snapshot.id+':'+hash;
    const row = await db.prepare('SELECT document, revision FROM galaxy_reviews WHERE user_id = ? AND actor_id = ? AND entry_id = ? AND snapshot_id = ?').bind(user,actor.id,entry.uuid,contextId).first();
    let review;
    if (body.action === 'stage') {
      if (row || body.expectedRevision !== 0) return json({error:'A draft already exists. Reload before reviewing.'},409);
      review={actorId:actor.id,entryId:entry.uuid,snapshotId:snapshot.id,baseRevision:actor._revision||0,baseFingerprint:hash,
        status:'Research Required',comparison:compareEntry(entry,actor,snapshot),relation:'unresolved',evidence:[],rationale:'',history:[]};
    } else {
      if (!row) return json({error:'No draft for this account and current profile/snapshot. Create a fresh draft.'},404);
      review=JSON.parse(row.document);
      if (row.revision !== body.expectedRevision || review.baseRevision !== (actor._revision||0) || review.baseFingerprint !== hash)
        return json({error:'Profile or draft changed. Review a fresh draft before continuing.'},409);
      if (body.action === 'ready') {
        if (review.status !== 'Research Required') return json({error:'Only a research draft can be submitted.'},409);
        if (!['equivalent','overlap','related','distinct','unresolved'].includes(body.relation) || typeof body.rationale !== 'string' || body.rationale.trim().length < 15 || body.rationale.length > 10000 || !validEvidence(body.evidence))
          return json({error:'Provide an explicit relationship judgment, rationale, and citations with verified publication and access dates (YYYY-MM-DD).'},400);
        review={...review,status:'Ready for Review',relation:body.relation,rationale:body.rationale.trim(),evidence:body.evidence.map(({url,title,publisher,publishedAt,accessedAt})=>({url,title,publisher,publishedAt,accessedAt}))};
      } else {
        if (review.status !== 'Ready for Review') return json({error:'Only Ready for Review drafts can be approved or rejected.'},409);
        review.status=body.action==='approve'?'Analyst Approved':'Rejected';
      }
    }
    review.revision=body.expectedRevision+1;
    review.history.push({action:body.action,by:user,at:now});
    // One atomic compare-and-swap; this module deliberately never writes profiles or research_jobs.
    const saved=await db.prepare(`INSERT INTO galaxy_reviews (user_id, actor_id, entry_id, snapshot_id, document, revision) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, actor_id, entry_id, snapshot_id) DO UPDATE SET document=excluded.document, revision=excluded.revision WHERE galaxy_reviews.revision = ?`)
      .bind(user,actor.id,entry.uuid,contextId,JSON.stringify(review),review.revision,body.expectedRevision).run();
    if (!saved.meta.changes) return json({error:'Draft changed in another tab. Reload.'},409);
    return json({review},body.action==='stage'?201:200);
  } catch {
    return json({error:'Enrichment review storage is unavailable. No profile changes were made.'},503);
  }
}
