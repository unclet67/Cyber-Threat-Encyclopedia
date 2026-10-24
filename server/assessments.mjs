import { createCampaignAssessmentDraft } from './campaign-assessment.mjs';
import { json,guard,bodyOf,actorFor } from './http.mjs';
export async function handleAssessments(request,db,snapshot) {
 const denied=guard(request,db);if(denied)return denied;
 const user=request.headers.get('oai-authenticated-user-id');
 try {
  if(request.method==='GET'){
   const url=new URL(request.url),id=url.searchParams.get('id');
   if(id){const row=await db.prepare('SELECT * FROM campaign_assessments WHERE user_id = ? AND id = ?').bind(user,id).first();if(!row)return json({error:'Assessment not found.'},404);const a=await actorFor(db,snapshot,user,row.actor_id);return json({assessment:{...JSON.parse(row.document),isStale:JSON.stringify(a)!==row.base_document}});}
   const {results}=await db.prepare('SELECT document, base_document, actor_id FROM campaign_assessments WHERE user_id = ? AND actor_id = ? ORDER BY created_at DESC LIMIT 50').bind(user,url.searchParams.get('actor')).all();
   const actor=await actorFor(db,snapshot,user,url.searchParams.get('actor'));return json({assessments:results.map(r=>({...JSON.parse(r.document),isStale:JSON.stringify(actor)!==r.base_document}))});
  }
  let body;try{body=await bodyOf(request);}catch{return json({error:'Invalid assessment request.'},400);}
  if(body.action==='generate'){
   const actor=await actorFor(db,snapshot,user,body.actorId);if(!actor)return json({error:'Actor not found.'},404);
   let draft;try{draft=createCampaignAssessmentDraft(actor,body.campaign);}catch(e){return json({error:e.message},400);}
   const now=new Date().toISOString();draft={...draft,id:crypto.randomUUID(),revision:1,review:null,history:[{action:'generate',by:user,at:now}]};
   await db.prepare('INSERT INTO campaign_assessments (id,user_id,actor_id,base_document,document,revision,created_at) VALUES (?,?,?,?,?,?,?)').bind(draft.id,user,actor.id,JSON.stringify(actor),JSON.stringify(draft),1,now).run();return json({assessment:draft},201);
  }
  if(!['approve','revise'].includes(body.action))return json({error:'Unknown assessment action.'},400);
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||typeof body.rationale!=='string'||body.rationale.trim().length<10||body.rationale.length>6000||body.action==='approve'&&body.acknowledgeUnknowns!==true)return json({error:'Provide review rationale and acknowledge remaining unknowns.'},400);
  const row=await db.prepare('SELECT * FROM campaign_assessments WHERE user_id = ? AND id = ?').bind(user,body.id).first();if(!row)return json({error:'Assessment not found.'},404);
  const draft=JSON.parse(row.document),actor=await actorFor(db,snapshot,user,row.actor_id);
  if(row.revision!==body.expectedRevision||draft.status==='approved'||JSON.stringify(actor)!==row.base_document)return json({error:'Assessment or profile changed. Generate a fresh draft or reload.'},409);
  const at=new Date().toISOString(),revision=row.revision+1;
  const updated={...draft,revision,status:body.action==='approve'?'approved':'draft',review:{reviewer:user,reviewedAt:at,rationale:body.rationale.trim(),decision:body.action},history:[...draft.history,{action:body.action,by:user,at,rationale:body.rationale.trim()}]};
  const result=await db.prepare(`UPDATE campaign_assessments SET document = ?, revision = ? WHERE user_id = ? AND id = ? AND revision = ? AND
   (SELECT CASE WHEN COUNT(*) = 0 THEN 0 WHEN MAX(deleted) = 1 THEN -1 ELSE MAX(revision) END FROM profiles WHERE user_id = ? AND actor_id = ?) = ?`).bind(JSON.stringify(updated),revision,user,body.id,body.expectedRevision,user,row.actor_id,actor._revision||0).run();
  if(!result.meta.changes)return json({error:'Assessment changed. Reload.'},409);return json({assessment:updated});
 }catch{return json({error:'Assessment storage is unavailable.'},503);}
}
