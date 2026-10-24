export const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export function guard(request,db) {
 if(!request.headers.get('oai-authenticated-user-id'))return json({error:'Sign in to use your private research workspace.'},401);
 if(!db)return json({error:'Storage is unavailable.'},503);
 if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed.'},405);
 if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Use this Site to save changes.'},403);
 if(request.method==='POST'&&!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Expected JSON.'},415);
}
export async function bodyOf(request,limit=32000) {
 const text=await request.text();if(new TextEncoder().encode(text).length>limit)throw new Error('Request too large');
 const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Expected an object');return body;
}
export async function actorFor(db,snapshot,user,id) {
 const row=await db.prepare('SELECT document, revision, deleted FROM profiles WHERE user_id = ? AND actor_id = ?').bind(user,id).first();
 return row?(row.deleted?null:{...JSON.parse(row.document),_revision:row.revision}):snapshot.actors.find(a=>a.id===id);
}
