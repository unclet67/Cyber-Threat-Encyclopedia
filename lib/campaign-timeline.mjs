function dateInfo(value) {
 const displayDate=typeof value==='string'&&value.trim()?value.trim():'Undated';
 const match=/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(displayDate);
 if(!match)return {displayDate,precision:'unknown',sortKey:null};
 const iso=match[1]+'-'+(match[2]||'01')+'-'+(match[3]||'01');
 if(Number.isNaN(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)return {displayDate,precision:'unknown',sortKey:null};
 return {displayDate,precision:match[3]?'day':match[2]?'month':'year',sortKey:iso};
}
export function campaignTimeline(actor) {
 const sources=new Map((Array.isArray(actor.sources)?actor.sources:[]).filter(s=>s?.ref&&/^https?:\/\//i.test(s.url||'')).map(s=>[s.ref,s]));
 return (Array.isArray(actor.campaigns)?actor.campaigns:[]).map((campaign,index)=>{
  const c=campaign||{},refs=Array.isArray(c.sources)?c.sources:[];
  return {id:actor.id+':'+index,name:c.name||'Unnamed record',summary:c.summary||'Research Required',...dateInfo(c.date),dateRole:'record date; event/publication role requires verification',sources:refs.filter(r=>sources.has(r)).map(r=>sources.get(r)),unresolvedRefs:refs.filter(r=>!sources.has(r)),index};
 }).sort((a,b)=>(a.sortKey===null)-(b.sortKey===null)||(a.sortKey||'').localeCompare(b.sortKey||'')||a.index-b.index);
}
