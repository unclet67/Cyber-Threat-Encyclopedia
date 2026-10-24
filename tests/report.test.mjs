import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateReport } from '../lib/report.mjs';
const actor={id:'salt-typhoon',primaryName:'Salt Typhoon',country:'CN',objectives:'Sourced objective [S1]',sources:[{ref:'S1',title:'Original report',publisher:'CISA',date:'2025-09-01',url:'https://example.org/report'}],campaigns:[]};
test('profile report carries provenance, analytic limitations, dated citations and unknowns',()=>{
 const before=JSON.stringify(actor),r=generateReport({actors:[actor],format:'markdown',generatedAt:'2026-10-24T12:00:00Z'});
 assert.equal(r.mime,'text/markdown;charset=utf-8');assert.match(r.content,/2025-09-01/);assert.match(r.content,/https:\/\/example.org\/report/);assert.match(r.content,/Research Required/);assert.match(r.content,/not independently reverified/i);assert.equal(JSON.stringify(actor),before);
});
test('JSON assessment export preserves draft status and separates assessment from records',()=>{
 const d={status:'draft',publishable:false,diamond:{},sources:[]};const r=generateReport({actors:[actor],assessment:d,format:'json'});const parsed=JSON.parse(r.content);
 assert.equal(parsed.assessment.status,'draft');assert.equal(parsed.profileUpdatesApplied,false);assert.equal(parsed.actors[0].id,actor.id);
});
test('Markdown report escapes untrusted HTML and rejects unsafe source links',()=>{
 const r=generateReport({actors:[{...actor,primaryName:'<script>alert(1)</script>',sources:[{ref:'S1',title:'Bad',url:'javascript:alert(1)'}]}],format:'markdown'});
 assert.ok(!r.content.includes('<script>'));assert.ok(!r.content.includes('javascript:'));assert.match(r.content,/URL requires verification/);
 assert.throws(()=>generateReport({actors:[],format:'pdf'}),/format|actor/i);
});
