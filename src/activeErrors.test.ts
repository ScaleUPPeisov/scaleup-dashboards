import {describe,expect,it} from 'vitest';
import {activeErrorCount,activeJobErrors,clearActiveJobErrorPatch} from './activeErrors';
import type {VideoJob} from './types';
const job=(p:Partial<VideoJob>):VideoJob=>({id:'j',channelId:'c',number:1,folder:'',status:'ERROR',createdAt:'2026-09-22T00:00:00Z',tracksCount:0,minTracks:10,title:'',description:'',tags:[],...p});
describe('active error source',()=>{
 it('does not count historical cleared ERROR state',()=>{const rows=[job({error:undefined}),job({id:'x',error:'boom'})];expect(activeErrorCount(rows)).toBe(1);expect(activeJobErrors(rows)[0].id).toBe('x')});
 it('resolves cleared jobs to their real local stage',()=>{expect(clearActiveJobErrorPatch(job({finalPath:'/x.mp4',error:'old'})).status).toBe('READY_UPLOAD');expect(clearActiveJobErrorPatch(job({coverPath:'/x.jpg',tracksCount:10,error:'old'})).status).toBe('READY_RENDER')});
});
