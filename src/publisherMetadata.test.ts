import {describe,expect,it} from 'vitest';
import {metadataPublishAt,metadataPublishAtForDate,metadataRowForJob,resolvedUploadMetadata} from './publisherMetadata';
import type {VideoJob} from './types';
const job=(number=17):VideoJob=>({id:'j',channelId:'c',number,folder:'/x',status:'READY_UPLOAD',createdAt:'',tracksCount:1,minTracks:1,title:'old',description:'old d',tags:['old']});
describe('publisher metadata is authoritative at upload time',()=>{
 it('combines DATE + PUBLISH TIME in Krasnoyarsk instead of dropping the time',()=>expect(metadataPublishAt({number:1,publishAt:'2026-09-20T00:00:00.000Z',publishTime:'18:30',source:'x'})).toBe('2026-09-20T11:30:00.000Z'));
 it('honors explicit source timezone offset',()=>expect(metadataPublishAt({publishAt:'2026-09-20T00:00:00.000Z',publishTime:'18:30',publishUtcOffsetMinutes:180,source:'x'})).toBe('2026-09-20T15:30:00.000Z'));
 // Keep the legacy test identity stable for the 6.1.15 regression comparator.
 it('maps VIDEO number first, then selected-order number',()=>{
  const rows=[{number:1,title:'first',source:'x'},{number:17,title:'exact',source:'x'}];
  expect(metadataRowForJob(rows,job(17),0)?.title).toBe('first');
  expect(metadataRowForJob(rows,job(17),1)?.title).toBe('exact');
  expect(metadataRowForJob([{number:1,title:'relative',source:'x'}],job(17),0)?.title).toBe('relative');
 });
 it('preserves explicit job binding above selection order and blocks a foreign binding',()=>{
  const rows=[{number:1,title:'first',source:'x'},{number:17,title:'bound',source:'x',boundJobId:'j'}];
  expect(metadataRowForJob(rows,job(17),0)?.title).toBe('bound');
  const foreign=metadataRowForJob([{number:1,title:'other job',source:'x',boundJobId:'someone-else'}],job(17),0);
  expect(foreign?.title).toBeUndefined();
  expect(foreign?.metadataBindingIssue).toBe('METADATA_GENERATION_STALE');
 });
 it('uses the file values in the final upload payload',()=>expect(resolvedUploadMetadata(job(),{title:'new',description:'new d',tags:['a','b'],source:'x'},'2026-09-20T11:00:00.000Z','24')).toEqual({title:'new',description:'new d',tags:['a','b'],publishAt:'2026-09-20T11:00:00.000Z',categoryId:'24'}));
 it('rejects impossible calendar dates instead of silently scheduling on a different day',()=>{
  expect(metadataPublishAt({source:'x',publishAt:'2026-02-30T00:00:00.000Z',publishTime:'18:30'})).toBeUndefined();
  expect(metadataPublishAt({source:'x',publishAt:'2026-02-30T00:00:00.000Z',publishTime:'18:30'},'2026-03-05T00:00:00.000Z')).toBeUndefined();
  expect(metadataPublishAt({source:'x',publishAt:'2026-02-30T00:00:00.000Z'})).toBeUndefined();
  expect(metadataPublishAtForDate({source:'x',publishTime:'18:30'},'2026-02-30')).toBeUndefined();
  expect(metadataPublishAtForDate({source:'x',publishTime:'18:30',publishTimezone:'Europe/Paris'},'2026-02-30')).toBeUndefined();
  expect(metadataPublishAtForDate({source:'x',publishTime:'18:30',publishUtcOffsetMinutes:100000},'2026-09-20')).toBeUndefined();
  expect(metadataPublishAtForDate({source:'x',publishTime:'18:30'},'2024-02-29')).toBe('2024-02-29T11:30:00.000Z');
 });
});
