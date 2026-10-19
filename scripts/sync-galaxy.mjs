// Explicit, operator-run refresh. Downloads only two official repositories and
// writes the isolated enrichment snapshot, never data/actors or a database.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const specs = {
  galaxy:{repo:'MISP/misp-galaxy',branch:'main',path:'clusters/threat-actor.json'},
  microsoft:{repo:'microsoft/mstic',branch:'master',path:'PublicFeeds/ThreatActorNaming/MicrosoftMapping.json'},
};
const get = async url => {
  const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'Cyber-Threat-Encyclopedia-enrichment'}});
  if(!response.ok) throw new Error(`Upstream request failed: ${response.status} ${url}`);
  return response.text();
};
const sources={},raw={};
for(const [key,spec] of Object.entries(specs)){
  const commit=JSON.parse(await get(`https://api.github.com/repos/${spec.repo}/commits/${spec.branch}`));
  if(!/^[0-9a-f]{40}$/.test(commit.sha))throw new Error('Invalid upstream commit');
  const text=await get(`https://raw.githubusercontent.com/${spec.repo}/${commit.sha}/${spec.path}`);
  raw[key]=JSON.parse(text);
  sources[key]={publisher:key==='galaxy'?'MISP Project':'Microsoft',url:`https://github.com/${spec.repo}/blob/${commit.sha}/${spec.path}`,
    revision:commit.sha,sha256:createHash('sha256').update(text).digest('hex'),retrievedAt:new Date().toISOString(),
    repositoryCommittedAt:commit.commit.committer.date,publishedAt:null};
}
if(!Array.isArray(raw.galaxy.values)||!raw.galaxy.values.length||!Array.isArray(raw.microsoft)||!raw.microsoft.length)throw new Error('Empty or invalid feeds');
const strings=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'):[];
const entries=raw.galaxy.values.map(e=>{
  if(typeof e.uuid!=='string'||typeof e.value!=='string')throw new Error('Invalid Galaxy entry');
  return {uuid:e.uuid,name:e.value,description:e.description||'',aliases:strings(e.meta?.synonyms),refs:strings(e.meta?.refs),meta:e.meta||{},related:e.related||[]};
});
if(new Set(entries.map(x=>x.uuid)).size!==entries.length)throw new Error('Duplicate cluster UUIDs');
const microsoft=raw.microsoft.map(row=>{
  if(typeof row['Threat actor name']!=='string'||typeof row['Other names']!=='string')throw new Error('Microsoft schema changed');
  return {name:row['Threat actor name'],aliases:row['Other names'].split(',').map(s=>s.trim()).filter(Boolean),origin:row['Origin/Threat']||''};
});
const snapshot={schemaVersion:1,id:createHash('sha256').update(sources.galaxy.sha256+sources.microsoft.sha256).digest('hex'),retrievedAt:new Date().toISOString(),
  sources,galaxy:{uuid:raw.galaxy.uuid,version:raw.galaxy.version,authors:raw.galaxy.authors,description:raw.galaxy.description},
  entries,microsoft};
const root=new URL('../data/enrichment/',import.meta.url);
await mkdir(root,{recursive:true});
// Atomic replacement only after both feeds validate.
const {rename}=await import('node:fs/promises');
await writeFile(new URL('galaxy.json.tmp',root),JSON.stringify(snapshot));
await rename(new URL('galaxy.json.tmp',root),new URL('galaxy.json',root));
console.log(`Staged ${entries.length} Galaxy entries and ${microsoft.length} Microsoft mappings in ${fileURLToPath(root)}; no profiles changed.`);
