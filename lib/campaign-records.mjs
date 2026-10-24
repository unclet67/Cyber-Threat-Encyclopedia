// The pipe editor exposes four fields; preserve analyst evidence and extension metadata.
export function mergeCampaignEdits(previous=[],edited=[]) {
 const names=edited.map(c=>c.name);
 if(new Set(names).size!==names.length)throw new Error('Campaign names must be unique before saving.');
 return edited.map(c=>{
  const matches=previous.filter(old=>old?.name===c.name);
  if(matches.length>1)throw new Error('Existing campaign identity is ambiguous; resolve duplicate names before saving.');
  const old=matches[0];if(!old)return {...c};
  const core=x=>JSON.stringify([x.date||'',x.name,x.summary,[...(x.sources||[])].sort()]);
  return {...old,...c,...(old.evidence?.length&&core(old)!==core(c)?{evidenceStatus:'stale'}:{})};
 });
}
