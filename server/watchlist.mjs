import { json,guard,bodyOf,actorFor } from './http.mjs';
export async function handleWatchlist(request,db,snapshot,defaults=[]) {
 const denied=guard(request,db);if(denied)return denied;
 const user=request.headers.get('oai-authenticated-user-id');
 try{
  if(request.method==='GET'){
   const {results}=await db.prepare('SELECT actor_id,notes,enabled,revision,updated_at FROM watchlist WHERE user_id = ? ORDER BY updated_at DESC').bind(user).all();
   return json({entries:results.map(r=>({actorId:r.actor_id,notes:r.notes,enabled:!!r.enabled,revision:r.revision,updatedAt:r.updated_at})),defaults:defaults.filter(id=>snapshot.actors.some(a=>a.id===id))});
  }
  let b;try{b=await bodyOf(request,8000);}catch{return json({error:'Invalid watchlist request.'},400);}
  if(typeof b.actorId!=='string'||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0||typeof b.enabled!=='boolean'||typeof b.notes!=='string'||b.notes.length>2000)return json({error:'Choose an actor, revision, enabled state and notes up to 2,000 characters.'},400);
  if(!await actorFor(db,snapshot,user,b.actorId))return json({error:'Actor not found.'},404);
  const row=await db.prepare('SELECT revision FROM watchlist WHERE user_id = ? AND actor_id = ?').bind(user,b.actorId).first();
  if((row?.revision||0)!==b.expectedRevision)return json({error:'Watchlist changed. Reload before saving.'},409);
  const entry={actorId:b.actorId,notes:b.notes.trim(),enabled:b.enabled,revision:b.expectedRevision+1,updatedAt:new Date().toISOString()};
  const r=await db.prepare(`INSERT INTO watchlist (user_id,actor_id,notes,enabled,revision,updated_at)
   SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM watchlist WHERE user_id = ? AND actor_id = ?)
   OR (SELECT COUNT(*) FROM watchlist WHERE user_id = ?) < 100
   ON CONFLICT(user_id,actor_id) DO UPDATE SET notes=excluded.notes,enabled=excluded.enabled,revision=excluded.revision,updated_at=excluded.updated_at WHERE watchlist.revision = ?`)
   .bind(user,b.actorId,entry.notes,b.enabled?1:0,entry.revision,entry.updatedAt,user,b.actorId,user,b.expectedRevision).run();
  if(!r.meta.changes)return json({error:'Watchlist changed or reached its 100-actor limit.'},409);return json({entry});
 }catch{return json({error:'Watchlist storage is unavailable.'},503);}
}
