import {describe,expect,it} from 'vitest';
import {metadataPublishAt,metadataRowForJob,resolvedUploadMetadata} from './publisherMetadata';
import type {VideoJob} from './types';
const job=(number=17):VideoJob=>({id:'j',channelId:'c',number,folder:'/x',status:'READY_UPLOAD',createdAt:'',tracksCount:1,minTracks:1,title:'old',description:'old d',tags:['old']});
describe('publisher metadata is authoritative at upload time',()=>{
 it('combines DATE + PUBLISH TIME in Krasnoyarsk instead of dropping the time',()=>expect(metadataPublishAt({number:1,publishAt:'2026-09-20T00:00:00.000Z',publishTime:'18:30',source:'x'})).toBe('2026-09-20T11:30:00.000Z'));
 it('honors explicit source timezone offset',()=>expect(metadataPublishAt({publishAt:'2026-09-20T00:00:00.000Z',publishTime:'18:30',publishUtcOffsetMinutes:180,source:'x'})).toBe('2026-09-20T15:30:00.000Z'));
 it('maps VIDEO number first, then selected-order number',()=>{const rows=[{number:1,title:'first',source:'x'},{number:17,title:'exact',source:'x'}];expect(metadataRowForJob(rows,job(17),0)?.title).toBe('exact');expect(metadataRowForJob([{number:1,title:'relative',source:'x'}],job(17),0)?.title).toBe('relative')});
 it('uses the file values in the final upload payload',()=>expect(resolvedUploadMetadata(job(),{title:'new',description:'new d',tags:['a','b'],source:'x'},'2026-09-20T11:00:00.000Z','24')).toEqual({title:'new',description:'new d',tags:['a','b'],publishAt:'2026-09-20T11:00:00.000Z',categoryId:'24'}));
});
