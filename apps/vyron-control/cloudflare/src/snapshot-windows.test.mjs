import test from 'node:test';
import assert from 'node:assert/strict';
import {derivePublic24hSnapshots} from './snapshot-windows.mjs';
const id='UC'+'z'.repeat(22),now=new Date('2026-11-18T10:00:00.000Z');
test('24-hour public counter estimate only from observed snapshots ~24h apart',()=>{
 const rows=[
  {channel_id:id,observed_at:'2026-11-18T09:50:00.000Z',views:1200},
  {channel_id:id,observed_at:'2026-11-17T09:40:00.000Z',views:850}
 ];
 const result=derivePublic24hSnapshots(rows,now);
 assert.equal(result.summary.value,350);
 assert.equal(result.summary.covered,1);
 assert.equal(result.byChannel[id].approximate,true);
 assert.equal(result.byChannel[id].windowHours,24.2);
});
test('no baseline, stale readings and decreasing counters produce no fake 24h stats',()=>{
 const a=derivePublic24hSnapshots([{channel_id:id,
  observed_at:'2026-11-18T09:50:00.000Z',views:1200}],now);
 assert.equal(a.summary.value,null);
 assert.equal(a.summary.covered,0);
 const b=derivePublic24hSnapshots([
  {channel_id:id,observed_at:'2026-11-18T09:50:00.000Z',views:100},
  {channel_id:id,observed_at:'2026-11-17T09:50:00.000Z',views:500}
 ],now);
 assert.equal(b.summary.value,null);
 const c=derivePublic24hSnapshots([
  {channel_id:id,observed_at:'2026-11-15T09:50:00.000Z',views:800},
  {channel_id:id,observed_at:'2026-11-14T09:50:00.000Z',views:700}
 ],now);
 assert.equal(c.summary.value,null);
});
