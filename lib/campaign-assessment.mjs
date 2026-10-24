// Curated evidence only. An excerpt is recorded evidence, not independent source verification.
export const diamondElements = ['adversary','capability','infrastructure','victim'];
export function validEvidenceDate(value) {
 if(typeof value!=='string')return false;
 const m=/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?: \([^)]+\))?$/.exec(value);if(!m)return false;
 const prefix=m[1]+(m[2]?'-'+m[2]:'')+(m[3]?'-'+m[3]:'');
 const iso=m[1]+'-'+(m[2]||'01')+'-'+(m[3]||'01');
 return !Number.isNaN(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso&&prefix<=new Date().toISOString().slice(0,prefix.length);
}
export function safeSource(source) {
 try { const u=new URL(source.url);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&source.ref&&source.title?.trim()&&validEvidenceDate(source.date); } catch { return false; }
}
export function createCampaignAssessmentDraft(actor,campaignName) {
 if(!actor?.id)throw new Error('Actor profile required');
 const matches=(actor.campaigns||[]).filter(c=>c.name===campaignName);
 if(matches.length!==1)throw new Error('Select one uniquely identified campaign');
 const campaign=matches[0], refs=new Set(campaign.sources||[]);
 const sources=(actor.sources||[]).filter(s=>safeSource(s)&&refs.has(s.ref));
 const unique=new Map(sources.filter(s=>sources.filter(x=>x.ref===s.ref).length===1).map(s=>[s.ref,s]));
 const diamond=Object.fromEntries(diamondElements.map(element=>{
  const claims=(campaign.evidence||[]).filter(e=>e.element===element&&typeof e.text==='string'&&e.text.trim()&&typeof e.excerpt==='string'&&e.excerpt.trim()&&unique.has(e.sourceRef)).map(e=>({text:e.text,classification:'sourced_fact',confidence:'Not independently assessed',confidence_rationale:'Campaign-specific excerpt recorded in the curated profile; analyst must verify source context.',source_ids:[e.sourceRef],source_date:unique.get(e.sourceRef).date,evidence_excerpt:e.excerpt,gaps:[]}));
  if(!claims.length)claims.push({text:'Research Required — no validated campaign-specific evidence',classification:'unknown',confidence:'Not assessed',confidence_rationale:'Actor-level fields are not campaign evidence.',source_ids:[],source_date:null,evidence_excerpt:'',gaps:['Obtain a dated original source and campaign-linked excerpt.']});
  return [element,{claims}];
 }));
 const gaps=diamondElements.filter(k=>diamond[k].claims[0].classification==='unknown').map(k=>'Confirm campaign-specific '+k+' using original reporting.');
 const cited=[...String(campaign.summary||'').matchAll(/\[([^\]]+)\]/g)].map(m=>m[1]);
 return {actorId:actor.id,actorName:actor.primaryName,campaign:campaign.name,generatedAt:new Date().toISOString(),status:'draft',requiresAnalystReview:true,publishable:false,diamond,
  campaignSummary:(cited.length?cited.every(r=>unique.has(r)):refs.size>0&&[...refs].every(r=>unique.has(r)))?campaign.summary+' '+[...refs].map(r=>'['+r+']').join(' '):'Research Required — campaign summary lacks validated dated citations.',
  sources:[...unique.values()],gaps,analyticJudgments:[],
  jipoe:{operational_implications:[{classification:'analytic_inference',text:'Assess whether the documented campaign could affect mission dependencies; this draft does not establish access to your environment.',confidence_rationale:'Planning prompt, not a finding about friendly exposure.'}],pirs:['Could this documented campaign affect mission-critical dependencies during the planning period?'],eeis:gaps.map(g=>'Collection question: '+g),intelligence_gaps:gaps},
  cautions:['Profile excerpts require human source verification.','Actor-level infrastructure, capabilities and victims are never promoted automatically.','Approval accepts this assessment only and does not publish or modify a profile.']};
}
