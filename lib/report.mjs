import { analyzeIntelligenceGaps } from './intelligence-gaps.mjs';
import { campaignTimeline } from './campaign-timeline.mjs';
import { compareActors } from './actor-comparison.mjs';
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_{}\[\]()#!|])/g,'\\$1');
const fields=['identification','attribution','objectives','targeting','capabilities','attack','campaigns','diamond','gaps','implications'];
const lines=(value,depth=0)=>{
 if(value===null||value===undefined||value===''||Array.isArray(value)&&!value.length)return ['Research Required'];
 if(typeof value!=='object')return [esc(value)];
 return Object.entries(value).flatMap(([k,v])=>[`${'  '.repeat(Math.min(depth,4))}- ${esc(k)}:`,...lines(v,depth+1).map(l=>'  '+l)]);
};
function sourceLine(s){
 let url;try{const u=new URL(s?.url);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)url=u.href.replace(/\(/g,'%28').replace(/\)/g,'%29');}catch{}
 return `- ${esc(s?.ref||'Unidentified source')}: ${esc(s?.title||'Title unknown')} — ${esc(s?.publisher||'Publisher unknown')} — published ${esc(s?.date||'unknown')} — ${url?'['+esc('Source')+']('+url+')':'URL requires verification'}`;
}
export function generateReport({actors,assessment=null,format='markdown',generatedAt=new Date().toISOString()}) {
 if(!Array.isArray(actors)||!actors.length||actors.length>6||actors.some(a=>!a?.id))throw new Error('Select one to six actor records');
 if(!['markdown','json'].includes(format))throw new Error('Unsupported report format');
 const report={title:'Cyber Threat Actor Encyclopedia research report',generatedAt,classification:'UNCLASSIFIED — open-source research aid',profileUpdatesApplied:false,limitations:['Curated records are not independently reverified by report generation.','Analytic prompts and unknowns are not confirmed facts.','This export does not publish or modify profiles.'],actors,assessment,gapAnalysis:actors.map(a=>({actorId:a.id,gaps:analyzeIntelligenceGaps(a)})),timelines:actors.map(a=>({actorId:a.id,events:campaignTimeline(a)})),comparison:actors.length>1?compareActors(actors):null};
 if(format==='json')return {filename:'encyclopedia-report.json',mime:'application/json;charset=utf-8',content:JSON.stringify(report,null,2)};
 const md=['# '+report.title,'',report.classification,'','Generated: '+esc(generatedAt),'',...report.limitations.map(l=>'- '+esc(l))];
 for(const a of actors){
  md.push('','## '+esc(a.primaryName),'','Record ID: '+esc(a.id)+' · Country: '+esc(a.country)+' · Updated: '+esc(a.updatedAt||'unknown'));
  for(const key of fields)md.push('','### '+esc(key),'',...lines(a[key]));
  md.push('','### Dated sources','',...(a.sources||[]).map(sourceLine));
  md.push('','### Generated collection prompts — analyst inference','',...analyzeIntelligenceGaps(a).map(g=>'- '+esc(g.priority+' · '+g.reason)+'\n  Suggested PIR: '+esc(g.pir)+'\n'+g.eeis.map(e=>'  - '+esc(e)).join('\n')));
 }
 if(report.comparison)md.push('','## Recorded mapping comparison','',...lines(report.comparison));
 if(assessment)md.push('','## Campaign assessment — '+esc(assessment.status||'draft'),'','Accepting an assessment does not publish or modify profiles.','',...lines(assessment));
 return {filename:'encyclopedia-report.md',mime:'text/markdown;charset=utf-8',content:md.join('\n')+'\n'};
}
