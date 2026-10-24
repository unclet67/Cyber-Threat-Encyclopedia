import { createCampaignAssessmentDraft, safeSource } from './campaign-assessment.mjs';
const sections=['identification','attribution','objectives','targeting','capabilities','attack','campaigns','diamond','implications'];
const textOf=value=>typeof value==='string'?value:Array.isArray(value)?value.map(textOf).join(' '):value&&typeof value==='object'?Object.values(value).map(textOf).join(' '):'';
export function analyzeIntelligenceGaps(actor) {
 const gaps=[],sources=Array.isArray(actor.sources)?actor.sources:[],refs=new Set(sources.filter(s=>s&&safeSource(s)).map(s=>s.ref));
 const add=(id,section,reason,priority='medium',origin='analyzer')=>gaps.push({id,section,priority,reason,origin,classification:origin==='profile'?'recorded_gap':'analytic_inference',pir:'What evidence is needed to assess '+(actor.primaryName||actor.id)+' in '+section+' for the planning decision?',eeis:['Identify original reporting that addresses: '+reason,'Record publication date, campaign scope, source excerpt and confidence rationale.']});
 for(const key of sections){
  const text=textOf(actor[key]).trim();
  if(!text||/^(Research Required|Unknown|Not assessed)(?:\b|$)/i.test(text)){add(key+':missing',key,'No supported '+key+' assessment is recorded.',key==='attribution'?'high':'medium');continue;}
  const citations=[...text.matchAll(/\[([^\]]+)\]/g)].map(m=>m[1]);
  if(!citations.length||citations.some(r=>!refs.has(r)))add(key+':citations',key,'Verify section claims against dated, resolvable citations.','high');
 }
 if(!refs.size)add('sources:missing','sources','No validated dated sources are recorded.','high');
 for(const source of sources)if(!source||!safeSource(source))add('source:'+String(source?.ref||gaps.length),'sources','Validate source metadata and publication date: '+(source?.ref||'unidentified source')+'.','high');
 for(const [i,c] of (Array.isArray(actor.campaigns)?actor.campaigns:[]).entries()){
  if(!c?.name){add('campaign:'+i,'campaigns','Campaign record has no unique name.','high');continue;}
  try{const draft=createCampaignAssessmentDraft(actor,c.name);for(const [element,v] of Object.entries(draft.diamond))if(v.claims[0].classification==='unknown')add('campaign:'+i+':'+element,'campaigns',c.name+': obtain campaign-specific '+element+' evidence.','high');}catch{add('campaign:'+i+':ambiguous','campaigns','Resolve duplicate campaign names before assessment.','high');}
 }
 for(const [i,reason] of (Array.isArray(actor.gaps)?actor.gaps:[]).entries())if(typeof reason==='string'&&reason.trim())add('recorded:'+i,'gaps',reason,'medium','profile');
 return gaps.sort((a,b)=>(a.priority==='high'?0:1)-(b.priority==='high'?0:1));
}
