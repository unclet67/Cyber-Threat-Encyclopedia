import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
const snapshot={actors:[{id:'salt-typhoon',primaryName:'Salt Typhoon',country:'CN'}]};
function database(){const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));return {sql,prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)??null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:{changes:sql.prepare(q).run(...args).changes}};}};}};}};}
const req=(body,user='owner')=>new Request('https://site.test/api/watchlist',{method:body?'POST':'GET',headers:{...(user?{'oai-authenticated-user-id':user}:{}),...(body?{origin:'https://site.test','content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('watchlist persists privately with revision checks and never changes profiles',async()=>{
 const {handleWatchlist}=await import('../server/watchlist.mjs');const db=database();
 assert.equal((await handleWatchlist(req({},null),db,snapshot)).status,401);
 const body={actorId:'salt-typhoon',expectedRevision:0,enabled:true,notes:'Watch telecom campaigns'};
 const r=await handleWatchlist(req(body),db,snapshot);assert.equal(r.status,200);assert.equal((await r.json()).entry.revision,1);
 assert.equal((await handleWatchlist(req(body),db,snapshot)).status,409);
 assert.equal((await (await handleWatchlist(req(null,'other'),db,snapshot)).json()).entries.length,0);
 assert.equal((await (await handleWatchlist(req(null),db,snapshot)).json()).entries[0].notes,body.notes);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM profiles').get().n,0);
 assert.equal((await handleWatchlist(req({...body,expectedRevision:1,enabled:false}),db,snapshot)).status,200);
 assert.equal((await handleWatchlist(req({...body,actorId:'missing'}),db,snapshot)).status,404);
});
