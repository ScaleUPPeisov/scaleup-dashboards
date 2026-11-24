import {afterEach,describe,expect,it,vi} from 'vitest';
import type {RenderFolderVideoFile} from './api';

if(typeof (globalThis as any).window==='undefined')Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true});
const fx=vi.hoisted(()=>({root:'/fixture/render',files:[] as RenderFolderVideoFile[],fingerprint:vi.fn()}));
vi.mock('./api',()=>({api:{
 localSourceStatus:vi.fn(async(path:string)=>({path,exists:true,isFile:false})),
 scanRenderFolder:vi.fn(async()=>({root:fx.root,files:fx.files,scannedEntries:fx.files.length,truncated:false})),
 youtubeFileFingerprint:fx.fingerprint,
 saveState:vi.fn(async()=>({ok:true})),
}}));
import {enterPerformanceProbeMode,exitPerformanceProbeMode,useApp} from './store';
import {resetLiveInventoryForTests,scanInventoryChannel} from './renderInventoryRuntime';
const channel:any={id:'c1',name:'Fixture',enabled:true,renderFolderPath:'/fixture/render',cadenceDays:1};
const file=(i:number):RenderFolderVideoFile=>({path:`${fx.root}/${i}.mov`,name:`${i}.mov`,size:i+100,modifiedAt:i+1000});
const hash='a'.repeat(64);

afterEach(async()=>{await enterPerformanceProbeMode();exitPerformanceProbeMode();resetLiveInventoryForTests();vi.clearAllMocks()});
describe('inventory scan responsiveness',()=>{
 it('yields to another task while processing cached candidates and does not rehash them',async()=>{
  fx.files=Array.from({length:130},(_,i)=>file(i+1));
  const cache=Object.fromEntries(fx.files.map(f=>[f.path,{path:f.path,size:f.size,mtimeMs:f.modifiedAt,sha256:hash,computedAt:'fixture'}]));
  Object.freeze(cache);
  useApp.setState({channels:[channel],jobs:[],uploadHistory:[],fingerprintCache:cache} as any);
  let complete=false;
  const scan=scanInventoryChannel('c1','publisher').then(result=>{complete=true;return result});
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  expect(complete).toBe(false);
  const result=await scan;
  expect(result?.physicalFiles).toBe(130);
  expect(fx.fingerprint).not.toHaveBeenCalled();
  expect(useApp.getState().fingerprintCache).toBe(cache);
 });
 it('writes newly computed entries without mutating the prior cache object',async()=>{
  fx.files=[file(1)];
  const cache=Object.freeze({});
  useApp.setState({channels:[channel],jobs:[],uploadHistory:[],fingerprintCache:cache} as any);
  fx.fingerprint.mockResolvedValue({fingerprint:hash,size:fx.files[0].size,modifiedAt:fx.files[0].modifiedAt});
  const result=await scanInventoryChannel('c1','publisher');
  expect(result?.physicalFiles).toBe(1);
  expect(fx.fingerprint).toHaveBeenCalledTimes(1);
  expect(Object.keys(cache)).toEqual([]);
  expect(useApp.getState().fingerprintCache[fx.files[0].path]?.sha256).toBe(hash);
 });
});
