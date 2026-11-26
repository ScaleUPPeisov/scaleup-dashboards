import {describe,it,expect} from 'vitest';
import {networkViewDays} from './ApexNetworkViews';
import type {Channel} from './types';
const channel=(daily:Array<{date:string;views:number}>)=>({analytics:{daily}} as Channel);
describe('APEX network daily views',()=>{
 it('uses only reported days and exposes partial coverage, including confirmed zero',()=>{
  const rows=networkViewDays([channel([{date:'2026-11-24',views:9},{date:'2026-11-25',views:0}]),channel([{date:'2026-11-24',views:3}])],3,Date.parse('2026-11-26T12:00:00Z'));
  expect(rows).toEqual([{date:'2026-11-23',views:null,covered:0},{date:'2026-11-24',views:12,covered:2},{date:'2026-11-25',views:0,covered:1}]);
 });
 it('does not count duplicate daily records or fabricate values from lifetime counters',()=>{
  const rows=networkViewDays([channel([{date:'2026-11-25',views:8},{date:'2026-11-25',views:10}]),{stats:{viewCount:1000}} as Channel],1,Date.parse('2026-11-26T12:00:00Z'));
  expect(rows).toEqual([{date:'2026-11-25',views:10,covered:1}]);
 });
});
