import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { compareEntry, correlateMicrosoft } from '../lib/galaxy.mjs';
import { handleEnrichment } from '../server/enrichment.mjs';
const ms = [{ name:'Brass Typhoon', aliases:['APT41','BARIUM'] }, { name:'Wicked Panda', aliases:['APT41'] }];
const entry = { uuid:'entry-1', name:'APT41', description:'Galaxy summary', aliases:['Winnti'], meta:{country:'CN'}, refs:['https://microsoft.com.evil.test/fake'] };
const actor = { id:'brass-typhoon', primaryName:'Brass Typhoon', country:'CN', msName:'Brass Typhoon', aliases:[], sources:[], identification:{}, attribution:{}, targeting:{}, capabilities:{}, diamond:{}, implications:{}, attack:[], campaigns:[], gaps:[] };
const snapshot = { id:'snapshot-1', retrievedAt:'2026-10-19T00:00:00Z', sources:{galaxy:{url:'https://github.com/MISP/misp-galaxy/blob/abc/clusters/threat-actor.json',revision:'abc',publishedAt:null,retrievedAt:'2026-10-19T00:00:00Z'},microsoft:{url:'https://github.com/microsoft/mstic/blob/abc/PublicFeeds/ThreatActorNaming/MicrosoftMapping.json',revision:'abc',publishedAt:null,retrievedAt:'2026-10-19T00:00:00Z'}}, entries:[entry], microsoft:ms };
test('Microsoft correlation is primary-feed backed, exact only, and never transitive equivalence', () => {
  const matches=correlateMicrosoft(entry, ms);
  assert.equal(matches.length,2);
  assert.equal(matches[0].relation,'candidate');
  assert.deepEqual(matches[0].matchedNames,['APT41']);
  assert.equal(correlateMicrosoft({...entry,name:'APT 41',aliases:[]},ms).length,0);
  assert.equal(correlateMicrosoft({...entry,name:'Winnti',aliases:[]},ms).length,0);
});
test('comparison exposes gaps, conflicts and unknown publication dates without mutating a profile', () => {
  const before=JSON.stringify(actor);
  const result=compareEntry(entry,actor,snapshot);
  assert.equal(result.status,'Research Required');
  assert.ok(result.gaps.some(x=>x.includes('Multiple Microsoft')));
  assert.ok(result.gaps.some(x=>x.includes('publication date')));
  assert.ok(result.gaps.some(x=>x.includes('identification')));
  assert.equal(result.provenance.galaxy.retrievedAt,snapshot.retrievedAt);
  assert.equal(result.provenance.galaxy.publishedAt,null);
  assert.equal(JSON.stringify(actor),before);
});
function database(){const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));return {sql,prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)??null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:{changes:sql.prepare(q).run(...args).changes}};}};}};}};}
const req=(body,user='owner',origin='https://site.test')=>new Request('https://site.test/api/enrichment?actor=brass-typhoon',{method:body?'POST':'GET',headers:{...(user?{'oai-authenticated-user-id':user}:{}),...(body?{'content-type':'application/json',origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
const seed={actors:[actor],scenarios:[]};
const stage={action:'stage',actorId:actor.id,entryId:entry.uuid,expectedRevision:0};
const evidence={url:'https://www.microsoft.com/en-us/security/blog/2023/04/18/microsoft-shifts-to-a-new-threat-actor-naming-taxonomy/',title:'Microsoft naming taxonomy',publisher:'Microsoft',publishedAt:'2023-04-18',accessedAt:'2026-10-19'};
test('requires authentication, same-origin writes, available storage, and valid entry IDs',async()=>{
 const db=database();
 assert.equal((await handleEnrichment(req(null,null),db,seed,snapshot)).status,401);
 assert.equal((await handleEnrichment(req(stage,'owner','https://evil.test'),db,seed,snapshot)).status,403);
 assert.equal((await handleEnrichment(req(stage),null,seed,snapshot)).status,503);
 assert.equal((await handleEnrichment(req({...stage,entryId:'missing'}),db,seed,snapshot)).status,404);
});
test('approval requires Ready for Review, dated evidence, and explicit analyst judgment; never writes profiles',async()=>{
 const db=database();
 let r=await handleEnrichment(req(stage),db,seed,snapshot);assert.equal(r.status,201);let review=(await r.json()).review;
 const action=(name,extra={})=>({action:name,actorId:actor.id,entryId:entry.uuid,expectedRevision:review.revision,...extra});
 assert.equal((await handleEnrichment(req(action('approve')),db,seed,snapshot)).status,409);
 assert.equal((await handleEnrichment(req(action('ready',{rationale:'Needs corroboration',relation:'overlap',evidence:[{...evidence,publishedAt:''}]})),db,seed,snapshot)).status,400);
 assert.equal((await handleEnrichment(req(action('ready',{rationale:'Needs corroboration',relation:'overlap',evidence:[{...evidence,publishedAt:'2023-02-30'}]})),db,seed,snapshot)).status,400);
 r=await handleEnrichment(req(action('ready',{rationale:'Analyst compared vendor scope; partial overlap only.',relation:'overlap',evidence:[evidence]})),db,seed,snapshot);assert.equal(r.status,200);review=(await r.json()).review;assert.equal(review.status,'Ready for Review');
 assert.equal((await handleEnrichment(req(action('approve'),'other'),db,seed,snapshot)).status,404);
 r=await handleEnrichment(req(action('approve')),db,seed,snapshot);assert.equal(r.status,200);review=(await r.json()).review;assert.equal(review.status,'Analyst Approved');assert.equal(review.history.at(-1).by,'owner');
 assert.equal(db.sql.prepare('SELECT count(*) n FROM profiles').get().n,0);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM research_jobs').get().n,0);
 assert.equal((await handleEnrichment(req(action('ready',{rationale:'overwrite'})),db,seed,snapshot)).status,409);
});
test('rejects stale review revisions, changed seed profiles and changed snapshots',async()=>{
 const db=database();await handleEnrichment(req(stage),db,seed,snapshot);
 assert.equal((await handleEnrichment(req(stage),db,seed,snapshot)).status,409);
 const ready={...stage,action:'ready',expectedRevision:1,rationale:'Compare scoped claims.',relation:'unresolved',evidence:[evidence]};
 assert.equal((await handleEnrichment(req(ready),db,{actors:[{...actor,primaryName:'Changed'}]},snapshot)).status,404);
 assert.equal((await handleEnrichment(req(ready),db,seed,{...snapshot,id:'snapshot-2'})).status,404);
});

test('reviewed contexts survive profile changes and fresh drafts; saved profiles and research are preserved',async()=>{
 const db=database();
 db.sql.prepare('INSERT INTO profiles VALUES (?, ?, ?, ?, ?)').run('owner',actor.id,JSON.stringify({...actor,reviewed:true}),7,0);
 db.sql.prepare('INSERT INTO research_jobs (id,user_id,actor_id,base_revision,status,created_at) VALUES (?, ?, ?, ?, ?, ?)').run('existing','owner',actor.id,7,'completed',1);
 const beforeProfiles=db.sql.prepare('SELECT * FROM profiles').all();const beforeResearch=db.sql.prepare('SELECT * FROM research_jobs').all();
 assert.equal((await handleEnrichment(req(stage),db,seed,snapshot)).status,201);
 const ready={...stage,action:'ready',expectedRevision:1,rationale:'Primary sources support scoped overlap only.',relation:'overlap',evidence:[evidence]};
 assert.equal((await handleEnrichment(req(ready),db,seed,snapshot)).status,200);
 assert.equal((await handleEnrichment(req({...stage,action:'approve',expectedRevision:2}),db,seed,snapshot)).status,200);
 assert.deepEqual(db.sql.prepare('SELECT * FROM profiles').all(),beforeProfiles);
 assert.deepEqual(db.sql.prepare('SELECT * FROM research_jobs').all(),beforeResearch);
 db.sql.prepare('UPDATE profiles SET revision=8, document=?').run(JSON.stringify({...actor,reviewed:true,objectives:'New supported assessment'}));
 const loaded=await (await handleEnrichment(req(),db,seed,snapshot)).json();assert.equal(loaded.reviews[0].isStale,true);
 assert.equal((await handleEnrichment(req(stage),db,seed,snapshot)).status,201);
 const rows=db.sql.prepare('SELECT document FROM galaxy_reviews').all();assert.equal(rows.length,2);
 assert.ok(rows.some(x=>JSON.parse(x.document).status==='Analyst Approved'));
});

test('the shipped snapshot has immutable provenance, unique UUIDs, complete aliases and unresolved reporting dates',()=>{
 const data=JSON.parse(readFileSync('data/enrichment/galaxy.json','utf8'));
 assert.equal(new Set(data.entries.map(x=>x.uuid)).size,data.entries.length);
 assert.ok(data.entries.length>1000);
 for(const source of Object.values(data.sources)){
  assert.match(source.revision,/^[0-9a-f]{40}$/);assert.match(source.sha256,/^[0-9a-f]{64}$/);
  assert.ok(source.url.includes('/blob/'+source.revision+'/'));assert.equal(source.publishedAt,null);
  assert.ok(!Number.isNaN(Date.parse(source.retrievedAt)));
 }
 assert.ok(data.entries.every(x=>x.name&&Array.isArray(x.aliases)&&Array.isArray(x.refs)));
 const volt=data.entries.find(x=>x.name==='Volt Typhoon');
 assert.ok(volt);assert.ok(correlateMicrosoft(volt,data.microsoft).some(x=>x.name==='Volt Typhoon'));
});
