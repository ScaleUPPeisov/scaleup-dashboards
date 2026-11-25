import {describe,expect,it} from 'vitest';
import {indexJobsByChannel,productionReadiness} from './commandCenterCore';
import type {Channel,VideoJob} from './types';

describe('command center job indexing',()=>{
 it('keeps channel order and readiness identical for a 33-channel synthetic workload',()=>{
  const channels=Array.from({length:33},(_,i)=>({id:`channel-${i}`,enabled:true}) as Channel);
  const jobs=Array.from({length:3300},(_,i)=>({id:`job-${i}`,channelId:`channel-${i%33}`,status:i%7?'READY_UPLOAD':'ERROR',tracksCount:10,minTracks:10,title:'title',description:'description',tags:['tag'],finalPath:`/fixture/${i}`,publishAt:'2030-01-01'}) as VideoJob);
  const index=indexJobsByChannel(jobs);
  for(const channel of channels){
   const grouped=index.get(channel.id)||[];
   expect(grouped.map(job=>job.id)).toEqual(jobs.filter(job=>job.channelId===channel.id).map(job=>job.id));
   expect(productionReadiness(channel,grouped,30)).toEqual(productionReadiness(channel,jobs,30));
  }
 });
 it('does not include malformed jobs in a channel',()=>{
  const index=indexJobsByChannel([null,undefined,{id:'x',channelId:'a'}] as unknown as VideoJob[]);
  expect(index.get('a')?.map(job=>job.id)).toEqual(['x']);
 });
});
