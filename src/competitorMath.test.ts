import {describe,expect,it} from 'vitest';
import {competitorVelocity,viewsPerSubscriber} from './competitorMath';
import type {CompetitorSnapshot} from './types';
const snapshot=(at:string,views?:number)=>({at,views}) as CompetitorSnapshot;
describe('competitor metrics',()=>{
 it('retains confirmed zero but does not invent values for missing data',()=>{
  expect(viewsPerSubscriber(0,100)).toBe(0);
  expect(viewsPerSubscriber(undefined,100)).toBeUndefined();
  expect(viewsPerSubscriber(100,0)).toBeUndefined();
  expect(competitorVelocity([snapshot('2026-01-01',0),snapshot('2026-01-02',0)],'views')).toBe(0);
  expect(competitorVelocity([snapshot('2026-01-01'),snapshot('2026-01-02',5)],'views')).toBeUndefined();
 });
 it('uses the elapsed days only when both dates and values are known',()=>{
  expect(competitorVelocity([snapshot('2026-01-01',5),snapshot('2026-01-03',15)],'views')).toBe(5);
  expect(competitorVelocity([snapshot('invalid',5),snapshot('2026-01-03',15)],'views')).toBeUndefined();
 });
});
