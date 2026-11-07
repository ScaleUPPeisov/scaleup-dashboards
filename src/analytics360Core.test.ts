import {describe,it,expect} from 'vitest';
import {strictMetricTotal,weightedCtrPercent,compareExactWindows,safeChannelId,safeVideoId} from './analytics360Core';
describe('Analytics 360 metric accuracy',()=>{
 it('does not transform missing rows into zero',()=>{expect(strictMetricTotal([2,null,4],3)).toMatchObject({value:null,status:'PARTIAL'})});
 it('preserves real zero',()=>{expect(strictMetricTotal([0,0],2)).toMatchObject({value:0,status:'AVAILABLE'})});
 it('requires a nonempty reach denominator',()=>{expect(weightedCtrPercent([{impressions:0,ctrPercent:2}]).value).toBeNull()});
 it('weights CTR by impressions, never average of percentages',()=>{const r=weightedCtrPercent([{impressions:100,ctrPercent:10},{impressions:900,ctrPercent:2}]);expect(r.status).toBe('AVAILABLE');expect(r.value).toBeCloseTo(2.8)});
 it('refuses partial CTR',()=>{expect(weightedCtrPercent([{impressions:100,ctrPercent:4},{impressions:null,ctrPercent:null}]).status).toBe('PARTIAL')});
 it('refuses percentage change over zero baseline',()=>{expect(compareExactWindows([{date:'2026-01-02',views:7}],[{date:'2026-01-01',views:0}],1)).toMatchObject({percent:null,status:'INSUFFICIENT_DATA'})});
 it('calculates a comparable period delta when complete',()=>{expect(compareExactWindows([{date:'2026-01-02',views:30}],[{date:'2026-01-01',views:10}],1)).toMatchObject({delta:20,percent:200,status:'AVAILABLE'})});
 it('never lets YouTube identifiers become filesystem traversal',()=>{expect(safeChannelId('UC1234567890123456789012')).toBe(true);expect(safeChannelId('../../etc/passwd')).toBe(false);expect(safeVideoId('aBc1234-X_y')).toBe(true);expect(safeVideoId('a/../z')).toBe(false)});
});
