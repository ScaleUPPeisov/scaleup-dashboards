import test from 'node:test';
import assert from 'node:assert/strict';
import {mirrorProduction} from './production.mjs';

const youtube='UC'+'z'.repeat(22);
test('production mirror exports distinct safe jobs and local unverified schedules',()=>{
  const state={channels:[{id:'private-local-id',name:'Test',youtubeChannelId:youtube}],
    jobs:[{id:'job1',channelId:'private-local-id',status:'READY_UPLOAD',title:'Video 1',
      publishAt:'2026-11-20T08:00:00Z',finalPath:'/Users/secret/private.mp4',
      accessToken:'SHOULD_NOT_LEAK'},{id:'job1',channelId:'private-local-id',
      status:'READY_UPLOAD',title:'Duplicate'},{id:'job2',channelId:'private-local-id',
      status:'UPLOADING',uploadProgress:64,title:'Video 2'}]};
  const result=mirrorProduction(state,new Date('2026-11-18T00:00:00Z'));
  assert.equal(result.items.length,2);
  assert.equal(result.items[0].channelId,youtube);
  assert.equal(result.items[0].status,'READY_UPLOAD');
  assert.equal(result.items[0].scheduleSource,'MAC_LOCAL_UNVERIFIED');
  assert.equal(result.items[1].progress,64);
  assert.ok(!JSON.stringify(result).includes('/Users/'));
  assert.ok(!JSON.stringify(result).includes('SHOULD_NOT_LEAK'));
  assert.ok(!JSON.stringify(result).includes('private-local-id'));
});
test('unknown or empty YouTube identity is never guessed from name',()=>{
  const a=mirrorProduction({channels:[{id:'local',name:'Glass City Lovers'}],
    jobs:[{id:'x',channelId:'local',status:'RENDERING'}]});
  assert.deepEqual(a.items,[]);
});
test('invalid progress and private paths never escape',()=>{
  const result=mirrorProduction({channels:[{id:'local',youtubeChannelId:youtube}],
    jobs:[{id:'test',channelId:'local',status:'RENDERING',title:'Secret\u0000 title',
      uploadProgress:9999,publishAt:'invalid',secret:'token',folder:'/private'}]});
  assert.equal(result.items[0].progress,null);
  assert.equal(result.items[0].plannedPublishAt,null);
  assert.equal(result.items[0].title,'Secret  title');
  assert.ok(!JSON.stringify(result).includes('token'));
});
