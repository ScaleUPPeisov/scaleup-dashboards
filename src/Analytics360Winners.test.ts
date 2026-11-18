import {describe,it,expect} from 'vitest';
import {filterAndSortWinnerVideos,type WinnerVideo} from './Analytics360Winners';

const row=(videoId:string,score:number|null,channelId='UC1234567890123456789012',
 publishedAt='2026-11-01T00:00:00Z'):WinnerVideo=>({
 channelId,videoId,title:videoId,publishedAt,ageDays:10,
 current7Views:score===null?null:score*10,previous7Views:score===null?null:100,
 winnerScore:score,classification:score===null?'INSUFFICIENT_DATA':'RISING',scoreStatus:score===null?'INSUFFICIENT_DATA':'AVAILABLE',
});
describe('Winner Engine 2.0 UI pure filtering',()=>{
 it('puts missing scores last without converting null to zero',()=>{
  const input=[row('video000002',null),row('video000003',90),row('video000001',20)];
  const sorted=filterAndSortWinnerVideos(input,'all','all','score','all');
  expect(sorted.map(v=>v.videoId)).toEqual(['video000003','video000001','video000002']);
  expect(sorted[2].winnerScore).toBeNull();
  expect(input[0].videoId).toBe('video000002');
 });
 it('filters by exact channel, classification and publication window',()=>{
  const other='UC2222222222222222222222';
  const rows=[row('video000001',95),row('video000002',75,other),row('video000003',null,'UC1234567890123456789012','2025-01-01T00:00:00Z')];
  const now=new Date('2026-11-10T00:00:00Z');
  expect(filterAndSortWinnerVideos(rows,other,'RISING','score','30',now).map(v=>v.videoId)).toEqual(['video000002']);
  expect(filterAndSortWinnerVideos(rows,'all','INSUFFICIENT_DATA','score','90',now)).toEqual([]);
 });
 it('does not manufacture a growth percent from a zero prior window',()=>{
  const rows=[row('video000001',50),row('video000002',70)];
  rows[0].previous7Views=0;rows[1].previous7Views=50;
  expect(filterAndSortWinnerVideos(rows,'all','all','growth','all')[0].videoId).toBe('video000002');
 });
});
