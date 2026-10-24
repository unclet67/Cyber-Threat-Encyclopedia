import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignTimeline } from '../lib/campaign-timeline.mjs';
test('timeline sorts known dates and retains partial precision, invalid dates and original records',()=>{
 const a={campaigns:[{name:'Undated',date:''},{name:'Later',date:'2025-09'},{name:'Earlier',date:'2024'},{name:'Bad',date:'2025-02-30'}],sources:[]};
 const before=JSON.stringify(a),events=campaignTimeline(a);
 assert.deepEqual(events.map(e=>e.name),['Earlier','Later','Undated','Bad']);assert.equal(events[0].precision,'year');assert.equal(events[0].displayDate,'2024');assert.equal(events[3].precision,'unknown');assert.equal(JSON.stringify(a),before);
});
test('timeline distinguishes record dates from publication dates and exposes unresolved references',()=>{
 const [e]=campaignTimeline({campaigns:[{name:'Event',date:'2024-03-01',summary:'Reported event',sources:['S1','MISSING']}],sources:[{ref:'S1',date:'2025-09-01',title:'Report',url:'https://example.org/report'}]});
 assert.equal(e.displayDate,'2024-03-01');assert.equal(e.sources[0].date,'2025-09-01');assert.deepEqual(e.unresolvedRefs,['MISSING']);assert.equal(e.dateRole,'record date; event/publication role requires verification');
});
