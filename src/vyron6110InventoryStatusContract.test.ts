import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ExistingInventoryCache} from './existingInventoryCodec';

const fx=vi.hoisted(()=>({files:new Map<string,any>(),read:vi.fn(),write:vi.fn(),failRead:false}));
vi.mock('./api',()=>({api:{
  youtubeInventoryRead:vi.fn(async(channelId:string)=>{fx.read(channelId);if(fx.failRead)throw new Error('OFFLINE');return fx.files.has(channelId)?{found:true,schemaVersion:2,channelId,path:'native',payload:fx.files.get(channelId)}:{found:false,schemaVersion:2,channelId,path:'native'}}),
  youtubeInventoryWrite:vi.fn(async(channelId:string,payload:any)=>{fx.write(channelId);fx.files.set(channelId,structuredClone(payload));return{ok:true,verified:true,schemaVersion:2,channelId,path:'native',bytes:JSON.stringify(payload).length}}),
  youtubeInventoryDelete:vi.fn(async(channelId:string)=>{fx.files.delete(channelId);return{ok:true,channelId,deleted:true}})
}}));

const mem=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>mem.get(k)??null,setItem:(k:string,v:string)=>mem.set(k,String(v)),removeItem:(k:string)=>mem.delete(k),clear:()=>mem.clear(),key:(i:number)=>[...mem.keys()][i]??null,get length(){return mem.size}}});

import {loadExistingInventory,resetExistingInventoryMemoryForTests,writeExistingInventory} from './existingInventoryNative';
import {encodeInventory} from './existingInventoryCodec';
const cache=(channelId:string):ExistingInventoryCache=>({version:1,updatedAt:'2026-10-11T00:00:00.000Z',videos:[],baseline:{},lastUndo:[],syncInfo:{complete:true,syncComplete:true,scheduleComplete:true,channelId}} as any);

describe('VYRON 6.1.10 focused inventory status contract',()=>{
 beforeEach(()=>{mem.clear();fx.files.clear();fx.read.mockClear();fx.write.mockClear();fx.failRead=false;resetExistingInventoryMemoryForTests()});
 it('ONLINE: verified native inventory is authoritative',async()=>{fx.files.set('A',encodeInventory('A',cache('A')));expect((await loadExistingInventory('A'))?.updatedAt).toBe('2026-10-11T00:00:00.000Z')});
 it('EMPTY and NOT_CONFIGURED: absent native inventory returns empty state without ERROR',async()=>{await expect(loadExistingInventory('none')).resolves.toBeUndefined()});
 it('ERROR: corrupt native inventory is explicit and never converted to factual empty',async()=>{fx.files.set('bad',{schemaVersion:2,channelId:'bad',updatedAt:'x',videos:'broken',baselineDelta:{}});await expect(loadExistingInventory('bad')).rejects.toThrow('INVENTORY_STORAGE_CORRUPT')});
 it('OFFLINE != ERROR: an already verified cached inventory remains readable without another native scan',async()=>{fx.files.set('A',encodeInventory('A',cache('A')));expect(await loadExistingInventory('A')).toBeTruthy();const reads=fx.read.mock.calls.length;fx.failRead=true;expect(await loadExistingInventory('A')).toBeTruthy();expect(fx.read.mock.calls.length).toBe(reads)});
 it('STALE/cached preservation: failed write does not erase last verified memory',async()=>{fx.files.set('A',encodeInventory('A',cache('A')));expect(await loadExistingInventory('A')).toBeTruthy();fx.failRead=true;expect((await loadExistingInventory('A'))?.updatedAt).toBe('2026-10-11T00:00:00.000Z')});
 it('reconnect works after an initially empty scan',async()=>{expect(await loadExistingInventory('A')).toBeUndefined();fx.files.set('A',encodeInventory('A',cache('A')));expect(await loadExistingInventory('A')).toBeTruthy()});
 it('no duplicate scan: memory hit short-circuits a second native read',async()=>{fx.files.set('A',encodeInventory('A',cache('A')));await loadExistingInventory('A');const reads=fx.read.mock.calls.length;await loadExistingInventory('A');expect(fx.read.mock.calls.length).toBe(reads)});
 it('verified native storage remains authoritative after write/readback',async()=>{expect((await writeExistingInventory('A',cache('A'))).ok).toBe(true);expect((await loadExistingInventory('A'))?.updatedAt).toBe('2026-10-11T00:00:00.000Z')});
});