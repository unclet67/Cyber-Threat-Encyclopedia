export function compareActors(actors) {
 if(!Array.isArray(actors)||actors.length<2||actors.length>6)throw new Error('Select two to six actors');
 if(actors.some(a=>!a?.id)||new Set(actors.map(a=>a.id)).size!==actors.length)throw new Error('Select distinct actors');
 const sets=actors.map(a=>new Set((Array.isArray(a.attack)?a.attack:[]).map(t=>t?.id).filter(id=>/^T\d{4}(\.\d{3})?$/.test(id))));
 const count=new Map();sets.forEach(s=>s.forEach(id=>count.set(id,(count.get(id)||0)+1)));
 const pairs=[];for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
  const shared=[...sets[i]].filter(id=>sets[j].has(id)).sort(),union=new Set([...sets[i],...sets[j]]);
  pairs.push({actorIds:[actors[i].id,actors[j].id],shared,jaccard:sets[i].size&&sets[j].size?shared.length/union.size:null});
 }
 return {actors:actors.map((a,i)=>({id:a.id,name:a.primaryName,coverage:sets[i].size?'recorded mappings':'unknown',mappedTechniques:sets[i].size||null,observedUniqueTechniques:[...sets[i]].filter(id=>count.get(id)===1).sort()})),sharedTechniques:sets.every(s=>s.size)?[...count].filter(([,n])=>n===actors.length).map(([id])=>id).sort():null,pairs,attributionConclusion:null,cautions:['Similarity describes recorded mappings, not complete capability.','Observed-unique means absent from the other selected records, not exclusive to this actor.','Tool and technique overlap alone does not establish shared identity, sponsorship or campaign linkage.']};
}
