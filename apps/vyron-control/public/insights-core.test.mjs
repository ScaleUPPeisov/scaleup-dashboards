import test from 'node:test';
import assert from 'node:assert/strict';
import {channelMomentum,buildDeterministicInsights} from './insights-core.mjs';
const DAY=86400000,now=new Date('2026-11-18T12:00:00Z');
const id='UC'+'a'.repeat(22);
const sample=mult=>Array.from({length:14},(_,i)=>({
  date:new Date(Date.UTC(2026,10,4)+i*DAY).toISOString().slice(0,10),
  views:i<7?100:Math.round(100*mult),subscribersGained:i<7?3:1,subscribersLost:0
}));
const channel=mult=>({id,name:'TEST',analytics:{source:'GOOGLE_ANALYTICS_API',daily:sample(mult)}});
test('drop detection requires confirmed consecutive recent 14-day coverage',()=>{
 const m=channelMomentum(channel(.5),now);
 assert.equal(m.previous,700);assert.equal(m.latest,350);
 assert.equal(m.change,-.5);
 const insights=buildDeterministicInsights({channels:[channel(.5)]},now);
 assert.ok(insights.some(x=>x.title.includes('Падение просмотров')));
});
test('missing days and stale snapshots do not trigger fabricated change',()=>{
 const a=channel(.5);a.analytics.daily.splice(5,1);
 assert.equal(channelMomentum(a,now),null);
 assert.equal(channelMomentum(channel(.5),new Date('2026-12-18')),null);
});
test('no verified schedule means explicit no-data and no invented runway',()=>{
 const c=channel(1.2);
 const result=buildDeterministicInsights({channels:[c],production:{items:[
   {channelId:id,plannedPublishAt:'2026-12-15T00:00:00Z'}]}},now);
 assert.ok(result.some(x=>x.title==='Расписание YouTube ещё не подтверждено'));
 assert.ok(!result.some(x=>x.title.includes('Низкий запас публикаций')));
});
test('real runway risk is only reported from explicitly confirmed runway days',()=>{
 const c={...channel(1),scheduledContentDays:2};
 const insights=buildDeterministicInsights({channels:[c]},now);
 assert.ok(insights.some(x=>x.title.includes('Низкий запас публикаций')));
});
