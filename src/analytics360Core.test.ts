import {describe,it,expect} from 'vitest';
import {strictMetricTotal,weightedCtrPercent,compareExactWindows,calendarMetricTotal,decimateExtrema,acceptSelectedChannelResult,safeChannelId,safeVideoId,breakdownMetrics,analyticsRequestKey,scopedAnalyticsSnapshot,type AnalyticsRequest} from './analytics360Core';
describe('Analytics 360 metric accuracy',()=>{
 it('preserves missing breakdown values without inventing zero or inflated shares',()=>{
   expect(breakdownMetrics([20,null,0,undefined,NaN,-1])).toEqual([
    {value:20,share:null},{value:null,share:null},{value:0,share:null},
    {value:null,share:null},{value:null,share:null},{value:null,share:null}]);
   expect(breakdownMetrics([20,80,0])).toEqual([{value:20,share:20},{value:80,share:80},{value:0,share:0}]);
   expect(breakdownMetrics([0,0])).toEqual([{value:0,share:null},{value:0,share:null}]);
 });
 it('rejects impossible calendar bounds and normalized invalid row dates',()=>{
   expect(calendarMetricTotal([{date:'2026-03-02',views:9}],'views','2026-02-30','2026-02-30'))
    .toMatchObject({status:'INSUFFICIENT_DATA',value:null});
   expect(calendarMetricTotal([{date:'2026-02-30',views:9}],'views','2026-03-02','2026-03-02'))
    .toMatchObject({status:'NOT_YET_COLLECTED',value:null});
   expect(calendarMetricTotal([{date:'2024-02-29',views:0}],'views','2024-02-29','2024-02-29'))
    .toMatchObject({status:'AVAILABLE',value:0});
 });
 it('hides loaded data immediately when any analytics request dimension changes',()=>{
   const request:AnalyticsRequest={channelId:'UC1234567890123456789012',period:'custom',
    startDate:'2026-01-01',endDate:'2026-01-31',page:0,contentType:'all',sort:'recent',videoId:null,revision:0};
   const value={views:99},loaded={key:analyticsRequestKey(request),value};
   expect(scopedAnalyticsSnapshot(loaded,analyticsRequestKey(request))).toBe(value);
   for(const patch of [{channelId:undefined},{channelId:'UC2222222222222222222222'},
    {period:'7'},{startDate:'2026-01-02'},{endDate:'2026-01-30'},{page:1},
    {contentType:'live'},{sort:'views'},{videoId:'aBc1234-X_y'},{revision:1}]){
     expect(scopedAnalyticsSnapshot(loaded,analyticsRequestKey({...request,...patch}))).toBeNull();
   }
   expect(scopedAnalyticsSnapshot(null,analyticsRequestKey(request))).toBeNull();
 });
 it('does not transform missing rows into zero',()=>{expect(strictMetricTotal([2,null,4],3)).toMatchObject({value:null,status:'PARTIAL'})});
 it('preserves real zero',()=>{expect(strictMetricTotal([0,0],2)).toMatchObject({value:0,status:'AVAILABLE'})});
 it('requires a nonempty reach denominator',()=>{expect(weightedCtrPercent([{impressions:0,ctrPercent:2}]).value).toBeNull()});
 it('weights CTR by impressions, never average of percentages',()=>{const r=weightedCtrPercent([{impressions:100,ctrPercent:10},{impressions:900,ctrPercent:2}]);expect(r.status).toBe('AVAILABLE');expect(r.value).toBeCloseTo(2.8)});
 it('refuses partial CTR',()=>{expect(weightedCtrPercent([{impressions:100,ctrPercent:4},{impressions:null,ctrPercent:null}]).status).toBe('PARTIAL')});
 it('refuses impossible CTR percentages instead of presenting misleading averages',()=>{
   for(const bad of [-1,101,NaN,Infinity]){
     const r=weightedCtrPercent([{impressions:300,ctrPercent:bad},{impressions:700,ctrPercent:5}]);
     expect(r).toMatchObject({value:null,status:'PARTIAL'});
   }
   expect(weightedCtrPercent([{impressions:200,ctrPercent:100},{impressions:800,ctrPercent:0}]))
     .toMatchObject({status:'AVAILABLE',value:20});
 });
 it('does not report confirmed growth from negative YouTube daily views',()=>{
   const current=[{date:'2026-01-02',views:-10}];
   const previous=[{date:'2026-01-01',views:10}];
   expect(compareExactWindows(current,previous,1)).toEqual({delta:null,percent:null,status:'INSUFFICIENT_DATA'});
 });
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
 it('does not apply delayed result to a different selected YouTube channel',()=>{
   const first='UC1234567890123456789012';
   const second='UC2222222222222222222222';
   expect(acceptSelectedChannelResult(first,first,8,8)).toBe(true);
   expect(acceptSelectedChannelResult(first,second,8,8)).toBe(false);
   expect(acceptSelectedChannelResult(first,first,8,9)).toBe(false);
   expect(acceptSelectedChannelResult(first,undefined,8,8)).toBe(false);
 });
 it('never lets YouTube identifiers become filesystem traversal',()=>{expect(safeChannelId('UC1234567890123456789012')).toBe(true);expect(safeChannelId('../../etc/passwd')).toBe(false);expect(safeVideoId('aBc1234-X_y')).toBe(true);expect(safeVideoId('a/../z')).toBe(false)});
 it('does not count extra rows as a complete numeric window',()=>{
   expect(strictMetricTotal([10,null,20],2)).toMatchObject({value:null,status:'PARTIAL',observed:2,expected:2});
   expect(strictMetricTotal([10,20],1)).toMatchObject({value:null,status:'PARTIAL'});
 });
 it('does not fabricate growth from a duplicated day hiding a missing day',()=>{
   const current=[{date:'2026-01-01',views:10},{date:'2026-01-01',views:10},{date:'2026-01-03',views:15}];
   const previous=[{date:'2025-12-29',views:5},{date:'2025-12-30',views:5},{date:'2025-12-31',views:5}];
   expect(compareExactWindows(current,previous,3)).toEqual({delta:null,percent:null,status:'INSUFFICIENT_DATA'});
 });
 it('rejects sparse, invalid-date and wrong-size comparison windows',()=>{
   const prior=[{date:'2025-12-29',views:5},{date:'2025-12-30',views:5},{date:'2025-12-31',views:5}];
   const sparse=[{date:'2026-01-01',views:5},{date:'2026-01-02',views:5},{date:'2026-01-04',views:10}];
   const invalid=[{date:'2026-02-30',views:5},{date:'2026-03-01',views:5},{date:'2026-03-02',views:10}];
   for(const rows of [sparse,invalid,sparse.slice(0,2)]){
     expect(compareExactWindows(rows,prior,3)).toMatchObject({delta:null,percent:null,status:'INSUFFICIENT_DATA'});
   }
 });
 it('compares complete unsorted daily windows without losing correct growth',()=>{
   const current=[{date:'2026-01-03',views:30},{date:'2026-01-01',views:10},{date:'2026-01-02',views:20}];
   const previous=[{date:'2025-12-31',views:10},{date:'2025-12-29',views:10},{date:'2025-12-30',views:10}];
   expect(compareExactWindows(current,previous,3)).toMatchObject({status:'AVAILABLE',delta:30,percent:100});
 });
});

