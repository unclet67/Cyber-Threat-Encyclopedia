import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIntelligenceGaps } from '../lib/intelligence-gaps.mjs';
const actor={id:'salt',primaryName:'Salt Typhoon',sources:[],campaigns:[{name:'Campaign',summary:'Uncited',sources:[]}],gaps:['Resolve sponsor identity']};
test('gap analyzer prioritizes unsupported campaign elements and generates collection questions',()=>{
 const before=JSON.stringify(actor),gaps=analyzeIntelligenceGaps(actor);
 assert.ok(gaps.some(g=>g.section==='campaigns'&&g.priority==='high'&&g.eeis.length));
 assert.ok(gaps.some(g=>g.reason==='Resolve sponsor identity'&&g.origin==='profile'));
 assert.ok(gaps.some(g=>g.section==='sources'));assert.equal(JSON.stringify(actor),before);
});
test('valid section references resolve only to dated sources and malformed data stays unknown',()=>{
 const a={...actor,objectives:'Objective [S1]',sources:[{ref:'S1',title:'Report',date:'2025-09-01',url:'https://example.org/source'}]};
 assert.ok(!analyzeIntelligenceGaps(a).some(g=>g.id==='objectives:citations'));
 a.sources[0].date='2025-02-30';assert.ok(analyzeIntelligenceGaps(a).some(g=>g.id==='objectives:citations'));
 assert.doesNotThrow(()=>analyzeIntelligenceGaps({id:'empty',sources:[null],campaigns:[null]}));
});
