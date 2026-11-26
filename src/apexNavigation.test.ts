import {describe,it,expect} from 'vitest';
import {apexNavigation,apexActivePage,apexYoutubeRoute} from './apexNavigation';
describe('APEX reference navigation',()=>{
 it('has exactly 21 unique destinations in four reference groups',()=>{
  const pages=apexNavigation.flatMap(g=>g.items.map(i=>i.page));
  expect(apexNavigation.map(g=>g.items.length)).toEqual([4,7,5,5]);expect(new Set(pages).size).toBe(21);
 });
 it('routes schedule and channel planning to the existing YouTube workspaces',()=>{
  expect(apexYoutubeRoute('schedule')).toBe('schedule');expect(apexYoutubeRoute('runway')).toBe('runway');expect(apexYoutubeRoute('uploads')).toBeUndefined();expect(apexActivePage('youtube')).toBe('publisher');
 });
});
