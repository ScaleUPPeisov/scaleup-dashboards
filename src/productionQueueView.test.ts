import {describe,expect,it} from 'vitest';
import type {VideoJob} from './types';
import {productionQueuePage,productionQueueRows} from './productionQueueView';

describe('production queue paging',()=>{
 it('limits rendered rows while retaining every filtered job for bulk actions',()=>{
  const jobs=Array.from({length:200},(_,index)=>({id:String(index),number:200-index,channelId:index%2?'b':'a',status:index%3?'NEED_IMAGE':'ERROR'} as VideoJob));
  const filtered=productionQueueRows(jobs,'a');
  expect(filtered).toHaveLength(100);
  expect(productionQueuePage(filtered,50)).toHaveLength(50);
  expect(filtered.map(job=>job.number)).toEqual([...filtered.map(job=>job.number)].sort((a,b)=>a-b));
  expect(new Set(filtered.map(job=>job.id)).size).toBe(100);
  expect(productionQueuePage(filtered,150)).toHaveLength(100);
  expect(productionQueueRows(jobs,'ERROR')).toHaveLength(67);
  expect(jobs[0].number).toBe(200);
 });
});
