import {beforeEach,describe,expect,it} from 'vitest';
import {bindYoutubeQuotaTraceContext,recordYoutubeApiRequest,youtubeQuotaTrace} from './youtubeQuota';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{
 getItem:(k:string)=>storage.get(k)??null,
 setItem:(k:string,v:string)=>storage.set(k,v),
 removeItem:(k:string)=>storage.delete(k)
},configurable:true});

describe('VYRON 5 quota trace',()=>{
 beforeEach(()=>storage.clear());
 it('records safe operation context plus actual method-level cost',()=>{
  const op='stats-refresh-selection:group:1';
  bindYoutubeQuotaTraceContext(op,{reason:'BATCH_STATS_REFRESH',channelIds:['c12','c2','c12'],mode:'MANUAL',estimatedUnits:1});
  recordYoutubeApiRequest({method:'channels.list',operationId:op,at:new Date().toISOString()});
  const row=youtubeQuotaTrace(10)[0];
  expect(row.operationId).toBe(op);
  expect(row.reason).toBe('BATCH_STATS_REFRESH');
  expect(row.mode).toBe('MANUAL');
  expect(row.channelIds).toEqual(['c12','c2']);
  expect(row.estimatedUnits).toBe(1);
  expect(row.methods['channels.list']).toEqual({calls:1,cost:1});
  expect(row.buckets.general).toBe(1);
 });
 it('keeps secrets out of trace context by construction',()=>{
  const op='owner-inventory:background:c1';
  bindYoutubeQuotaTraceContext(op,{reason:'OWNER_INVENTORY_REFRESH',channelIds:['c1'],mode:'BACKGROUND',estimatedUnits:3});
  recordYoutubeApiRequest({method:'playlistItems.list',operationId:op,at:new Date().toISOString()});
  const raw=JSON.stringify(youtubeQuotaTrace(10));
  expect(raw).not.toMatch(/access_token|refresh_token|client_secret|password/i);
  expect(raw).toContain('OWNER_INVENTORY_REFRESH');
 });
});
