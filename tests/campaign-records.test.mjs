import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCampaignEdits } from '../lib/campaign-records.mjs';
const previous=[{date:'2025',name:'Campaign',summary:'Summary [S1]',sources:['S1'],evidence:[{element:'victim',text:'Victim',excerpt:'Source excerpt',sourceRef:'S1'}],customMetadata:'preserve'}];
test('unrelated profile saves preserve campaign evidence and unknown metadata',()=>{
 const edited=[{date:'2025',name:'Campaign',summary:'Summary [S1]',sources:['S1']}];
 const result=mergeCampaignEdits(previous,edited);assert.deepEqual(result[0].evidence,previous[0].evidence);assert.equal(result[0].customMetadata,'preserve');assert.equal(result[0].evidenceStatus,undefined);
});
test('changed campaign content keeps evidence but marks it stale; ambiguous names fail explicitly',()=>{
 const result=mergeCampaignEdits(previous,[{...previous[0],summary:'Changed summary [S1]'}]);assert.equal(result[0].evidenceStatus,'stale');assert.equal(result[0].evidence.length,1);
 assert.throws(()=>mergeCampaignEdits(previous,[previous[0],previous[0]]),/unique/i);
 assert.throws(()=>mergeCampaignEdits([previous[0],previous[0]],[previous[0]]),/ambiguous/i);
});
