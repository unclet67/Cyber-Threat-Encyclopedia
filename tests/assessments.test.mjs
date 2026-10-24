import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createCampaignAssessmentDraft } from '../server/campaign-assessment.mjs';

export const actor = { id:'salt-typhoon',primaryName:'Salt Typhoon',campaigns:[{name:'Documented campaign',summary:'A campaign summary [S1].',sources:['S1']}],sources:[{ref:'S1',title:'Original report',publisher:'Publisher',date:'2025-09-01',url:'https://example.org/report'}],diamond:{infrastructure:'ACTOR LEVEL ONLY'},_revision:0 };
export function database() {
 const sql=new DatabaseSync(':memory:'); for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 return {sql,prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)??null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:{changes:sql.prepare(q).run(...args).changes}};}};}};}};
}
export const req=(body,user='owner',path='/api/assessments',origin='https://site.test')=>new Request('https://site.test'+path,{method:body?'POST':'GET',headers:{...(user?{'oai-authenticated-user-id':user}:{}),...(body?{'content-type':'application/json',origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('campaign assessment never promotes actor-level facts; unsupported elements stay unknown',()=>{
 const before=JSON.stringify(actor);const draft=createCampaignAssessmentDraft(actor,'Documented campaign');
 assert.equal(draft.diamond.adversary.claims[0].classification,'unknown');
 assert.equal(draft.diamond.infrastructure.claims[0].classification,'unknown');
 assert.equal(draft.status,'draft');assert.equal(draft.publishable,false);assert.equal(JSON.stringify(actor),before);
 assert.ok(draft.jipoe.pirs.length);assert.ok(draft.jipoe.eeis.length);
});
test('accepts only campaign-linked evidence with a real excerpt and dated citation',()=>{
 const a=structuredClone(actor);a.campaigns[0].evidence=[{element:'victim',text:'Telecom operators',excerpt:'The campaign targeted telecom operators.',sourceRef:'S1'}];
 const d=createCampaignAssessmentDraft(a,'Documented campaign');assert.equal(d.diamond.victim.claims[0].classification,'sourced_fact');assert.equal(d.diamond.victim.claims[0].source_date,'2025-09-01');
 a.campaigns[0].sources=[];assert.equal(createCampaignAssessmentDraft(a,'Documented campaign').diamond.victim.claims[0].classification,'unknown');
 a.campaigns[0].sources=['S1'];a.sources[0].date='2025-02-30';assert.equal(createCampaignAssessmentDraft(a,'Documented campaign').diamond.victim.claims[0].classification,'unknown');
});
test('assessment persistence is private, stale-safe and never updates profiles',async()=>{
 const {handleAssessments}=await import('../server/assessments.mjs');const db=database(),snapshot={actors:[actor]};
 assert.equal((await handleAssessments(req({},null),db,snapshot)).status,401);
 assert.equal((await handleAssessments(req({},'owner','/api/assessments','https://evil.test'),db,snapshot)).status,403);
 const r=await handleAssessments(req({action:'generate',actorId:actor.id,campaign:'Documented campaign'}),db,snapshot);assert.equal(r.status,201);const {assessment:d}=await r.json();
 assert.equal((await handleAssessments(req(null,'other','/api/assessments?id='+d.id),db,snapshot)).status,404);
 const review={action:'approve',id:d.id,expectedRevision:1,rationale:'Reviewed evidence; remaining unknowns accepted.',acknowledgeUnknowns:true};
 assert.equal((await handleAssessments(req({...review,acknowledgeUnknowns:false}),db,snapshot)).status,400);
 assert.equal((await handleAssessments(req(review),db,{actors:[{...actor,objectives:'Changed'}]})).status,409);
 const approved=await (await handleAssessments(req(review),db,snapshot)).json();assert.equal(approved.assessment.status,'approved');assert.equal(approved.assessment.history.at(-1).by,'owner');
 assert.equal((await handleAssessments(req(review),db,snapshot)).status,409);
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM profiles').get().n,0);
});
test('real Salt Typhoon advisory assessment leaves uncaptured campaign elements unknown',()=>{
 const a=JSON.parse(readFileSync('data/bundle.json','utf8')).actors.find(a=>a.id==='salt-typhoon');
 const d=createCampaignAssessmentDraft(a,'AA25-239A multinational advisory');
 assert.ok(d.sources.length);assert.ok(Object.values(d.diamond).every(x=>x.claims[0].classification==='unknown'));
 assert.equal(d.publishable,false);assert.ok(d.campaignSummary.includes('['));
});
test('approval rejects a profile edit interleaved immediately before its atomic update',async()=>{
 const {handleAssessments}=await import('../server/assessments.mjs');const db=database(),snapshot={actors:[actor]};
 const {assessment:d}=await (await handleAssessments(req({action:'generate',actorId:actor.id,campaign:'Documented campaign'}),db,snapshot)).json();
 const hooked={prepare(q){const statement=db.prepare(q);return {bind(...args){const bound=statement.bind(...args);if(q.startsWith('UPDATE campaign_assessments'))return {...bound,async run(){db.sql.prepare('INSERT INTO profiles VALUES (?,?,?,?,?)').run('owner',actor.id,JSON.stringify({...actor,objectives:'Concurrent change'}),1,0);return bound.run();}};return bound;}};}};
 const result=await handleAssessments(req({action:'approve',id:d.id,expectedRevision:1,rationale:'Reviewed original source reporting.',acknowledgeUnknowns:true}),hooked,snapshot);
 assert.equal(result.status,409);assert.equal(JSON.parse(db.sql.prepare('SELECT document FROM campaign_assessments').get().document).status,'draft');
});
test('summary references never include rejected or duplicate source refs',()=>{
 const a=structuredClone(actor);a.campaigns[0].sources.push('S2');a.sources.push({ref:'S2',title:'Undated source',date:'',url:'https://example.org/undated'});
 const d=createCampaignAssessmentDraft(a,'Documented campaign');assert.ok(!d.campaignSummary.includes('[S2]'));assert.equal((d.campaignSummary.match(/\[S1\]/g)||[]).length,1);assert.ok(d.gaps.some(g=>g.includes('S2')));
});
test('stale campaign excerpts cannot generate sourced facts',()=>{
 const a=structuredClone(actor);a.campaigns[0].evidenceStatus='stale';a.campaigns[0].evidence=[{element:'victim',text:'Victim',excerpt:'Excerpt',sourceRef:'S1'}];
 assert.equal(createCampaignAssessmentDraft(a,'Documented campaign').diamond.victim.claims[0].classification,'unknown');
});
