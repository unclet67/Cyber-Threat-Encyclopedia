import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareActors } from '../lib/actor-comparison.mjs';
const a={id:'a',primaryName:'A',attack:[{id:'T1001'},{id:'T1001'},{id:'T1002'}]},b={id:'b',primaryName:'B',attack:[{id:'T1001'},{id:'T1003'}]};
test('comparison deduplicates techniques and distinguishes shared from observed-unique mappings',()=>{
 const d=compareActors([a,b]);assert.deepEqual(d.sharedTechniques,['T1001']);assert.equal(d.pairs[0].jaccard,1/3);assert.deepEqual(d.actors[0].observedUniqueTechniques,['T1002']);assert.equal(d.attributionConclusion,null);
});
test('missing mappings are unknown, not evidence of zero capability or zero similarity',()=>{
 const d=compareActors([a,{id:'b',primaryName:'B',attack:[]}]);assert.equal(d.pairs[0].jaccard,null);assert.equal(d.sharedTechniques,null);assert.equal(d.actors[1].coverage,'unknown');
 assert.throws(()=>compareActors([a,a]),/distinct/);assert.throws(()=>compareActors([a]),/two/);
});
