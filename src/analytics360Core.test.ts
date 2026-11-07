import {describe,it,expect} from 'vitest';
import {strictMetricTotal,weightedCtrPercent,compareExactWindows,calendarMetricTotal,decimateExtrema,safeChannelId,safeVideoId} from './analytics360Core';
describe('Analytics 360 metric accuracy',()=>{
 it('does not transform missing rows into zero',()=>{expect(strictMetricTotal([2,null,4],3)).toMatchObject({value:null,status:'PARTIAL'})});
 it('preserves real zero',()=>{expect(strictMetricTotal([0,0],2)).toMatchObject({value:0,status:'AVAILABLE'})});
 it('requires a nonempty reach denominator',()=>{expect(weightedCtrPercent([{impressions:0,ctrPercent:2}]).value).toBeNull()});
 it('weights CTR by impressions, never average of percentages',()=>{const r=weightedCtrPercent([{impressions:100,ctrPercent:10},{impressions:900,ctrPercent:2}]);expect(r.status).toBe('AVAILABLE');expect(r.value).toBeCloseTo(2.8)});
 it('refuses partial CTR',()=>{expect(weightedCtrPercent([{impressions:100,ctrPercent:4},{impressions:null,ctrPercent:null}]).status).toBe('PARTIAL')});
 it('refuses percentage change over zero baseline',()=>{expect(compareExactWindows([{date:'2026-01-02',views:7}],[{date:'2026-01-01',views:0}],1)).toMatchObject({percent:null,status:'INSUFFICIENT_DATA'})});
 it('calculates a comparable period delta when complete',()=>{expect(compareExactWindows([{date:'2026-01-02',views:30}],[{date:'2026-01-01',views:10}],1)).toMatchObject({delta:20,percent:200,status:'AVAILABLE'})});
 it('rejects incomplete calendar periods, even when other rows have valid numbers',()=>{
   const r=calendarMetricTotal([{date:'2026-01-01',views:5},{date:'2026-01-03',views:10}],'views','2026-01-01','2026-01-03');
   expect(r).toMatchObject({status:'PARTIAL',value:null,observed:2,expected:3});
 });
 it('distinguishes actual zero from missing and duplicate data',()=>{
   expect(calendarMetricTotal([{date:'2026-02-01',views:0}],'views','2026-02-01','2026-02-01'))
     .toMatchObject({status:'AVAILABLE',value:0});
   expect(calendarMetricTotal([{date:'2026-02-01',views:4},{date:'2026-02-01',views:5}],'views','2026-02-01','2026-02-01').status).toBe('ERROR');
 });
 it('renders ten-year history without thousands of line points while keeping spikes',()=>{
   const points=Array.from({length:9000},(_,i)=>({date:String(i),v:i===4001?10000:i===6800?-2000:12}));
   const reduced=decimateExtrema(points,480);
   expect(reduced.length).toBeLessThanOrEqual(480);
   expect(reduced[0]).toBe(points[0]);
   expect(reduced.at(-1)).toBe(points.at(-1));
   expect(reduced.some(v=>v.v===10000)).toBe(true);
   expect(reduced.some(v=>v.v===-2000)).toBe(true);
 });
 it('does not alter small series',()=>{
   const points=[{v:2},{v:1},{v:3}];
   expect(decimateExtrema(points,20)).toEqual(points);
 });
 it('never lets YouTube identifiers become filesystem traversal',()=>{expect(safeChannelId('UC1234567890123456789012')).toBe(true);expect(safeChannelId('../../etc/passwd')).toBe(false);expect(safeVideoId('aBc1234-X_y')).toBe(true);expect(safeVideoId('a/../z')).toBe(false)});
});
