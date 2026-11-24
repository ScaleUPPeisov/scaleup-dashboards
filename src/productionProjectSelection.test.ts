import {describe,expect,it,vi} from 'vitest';
import {countSelectedProjects} from './productionProjectSelection';

describe('production project selection',()=>{
 it('counts only IDs present in the current batch, including repeated selected IDs',()=>{
  const current=new Set(['a','b','c']);
  expect(countSelectedProjects(['a','missing','a','c'],current)).toBe(3);
  expect(countSelectedProjects([],current)).toBe(0);
  expect(countSelectedProjects(['x'],new Set())).toBe(0);
 });
 it('uses one indexed lookup per selected project for a 10,000-project batch',()=>{
  const ids=Array.from({length:10_000},(_,i)=>`PROJECT_${i}`);
  const actual=new Set(ids);
  const has=vi.fn((id:string)=>actual.has(id));
  const indexed={has} as unknown as ReadonlySet<string>;
  expect(countSelectedProjects(ids,indexed)).toBe(10_000);
  expect(has).toHaveBeenCalledTimes(ids.length);
 });
});
