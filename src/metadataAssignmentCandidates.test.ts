import {describe,expect,it,vi} from 'vitest';
import type {Channel,VideoJob} from './types';
import {metadataAssignmentInputsChanged,metadataAssignmentKey,metadataChannelsNeedingAssignment} from './metadataAssignmentCandidates';

const job=(id:string,channelId:string,patch:Partial<VideoJob>={}):VideoJob=>({
 id,channelId,number:1,folder:`/fixture/${id}`,status:'READY_RENDER',createdAt:'2026-01-01T00:00:00Z',
 tracksCount:0,minTracks:1,title:'',description:'',tags:[],...patch
});

describe('metadata queue assignment IPC filtering',()=>{
 it('skips channels whose eligible jobs were already attempted and preserves channel order',()=>{
  const first=job('one','a'),second=job('two','b'),third=job('three','a');
  const attempted=new Set([metadataAssignmentKey(first),metadataAssignmentKey(third)]);
  const summary=vi.fn();
  for(const channel of metadataChannelsNeedingAssignment([first,second,third],attempted))summary(channel);
  expect(summary.mock.calls).toEqual([['b']]);
  attempted.clear();
  expect([...metadataChannelsNeedingAssignment([first,second,third],attempted)]).toEqual(['a','b']);
 });
 it('keeps the eligibility rules and retries when the folder changes',()=>{
  const first=job('one','a');
  const rows=[first,job('x','b',{folder:''}),job('y','c',{youtubeVideoId:'remote'}),
   job('z','d',{metadataLocked:true}),job('q','e',{metadataSource:'queue'}),
   job('i','f',{metadataSource:'import'}),job('a','g',{metadataSource:'ai'})];
  const attempted=new Set([metadataAssignmentKey(first)]);
  expect([...metadataChannelsNeedingAssignment(rows,attempted)]).toEqual([]);
  expect([...metadataChannelsNeedingAssignment([{...first,folder:'/fixture/moved'}],attempted)]).toEqual(['a']);
 });
 it('avoids summary calls for 33 fully attempted channels',()=>{
  const rows=Array.from({length:33},(_,i)=>job(`job-${i}`,`channel-${i}`));
  const attempted=new Set(rows.map(metadataAssignmentKey));
  const summary=vi.fn();
  for(const channel of metadataChannelsNeedingAssignment(rows,attempted))summary(channel);
  expect(summary).not.toHaveBeenCalled();
 });
 it('ignores unrelated job or channel updates while detecting assignment changes',()=>{
  const original=job('one','a');
  const channels=[{id:'a',name:'A'} as Channel];
  const base={channels,jobs:[original]};
  expect(metadataAssignmentInputsChanged(base,{channels,jobs:[{...original,uploadProgress:35}]})).toBe(false);
  expect(metadataAssignmentInputsChanged(base,{channels:[{...channels[0],color:'#fff'}],jobs:base.jobs})).toBe(false);
  for(const patch of [{folder:'/fixture/new'},{number:2},{metadataSource:'queue' as const},{metadataLocked:true},{youtubeVideoId:'remote'}]){
   expect(metadataAssignmentInputsChanged(base,{channels,jobs:[{...original,...patch}]})).toBe(true);
  }
  expect(metadataAssignmentInputsChanged(base,{channels:[{...channels[0],name:'B'}],jobs:base.jobs})).toBe(true);
  expect(metadataAssignmentInputsChanged(base,{channels,jobs:[]})).toBe(true);
 });
 it('detects reordering because it changes assignment order',()=>{
  const first=job('one','a'),second=job('two','a');
  const channels=[{id:'a',name:'A'} as Channel];
  expect(metadataAssignmentInputsChanged({channels,jobs:[first,second]},{channels,jobs:[second,first]})).toBe(true);
 });
});
