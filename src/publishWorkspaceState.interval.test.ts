import {beforeEach,describe,expect,it} from 'vitest';
import {loadPublishWorkspace,savePublishWorkspace} from './publishWorkspaceState';

const memory=new Map<string,string>();
const storage={
 getItem:(key:string)=>memory.has(key)?memory.get(key)!:null,
 setItem:(key:string,value:string)=>{memory.set(key,String(value))},
 removeItem:(key:string)=>{memory.delete(key)},
 clear:()=>memory.clear(),
 key:(index:number)=>[...memory.keys()][index]??null,
 get length(){return memory.size}
} as Storage;
Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});

beforeEach(()=>memory.clear());

describe('EVERY_N_DAYS per-channel persistence',()=>{
 it('keeps schedule modes and intervals isolated by channel',()=>{
  savePublishWorkspace('A',{scheduleMode:'2/2'});
  savePublishWorkspace('B',{scheduleMode:'every_n_days',intervalDays:3});
  savePublishWorkspace('C',{scheduleMode:'3/1'});
  expect(loadPublishWorkspace('A').scheduleMode).toBe('2/2');
  expect(loadPublishWorkspace('B')).toMatchObject({scheduleMode:'every_n_days',intervalDays:3});
  expect(loadPublishWorkspace('C').scheduleMode).toBe('3/1');
 });
 it('survives save then reload with interval 3',()=>{
  savePublishWorkspace('B',{scheduleMode:'every_n_days',intervalDays:3});
  expect(loadPublishWorkspace('B')).toMatchObject({scheduleMode:'every_n_days',intervalDays:3});
 });
 it('defaults old persisted workspaces without intervalDays to 3',()=>{
  memory.set('vyron:youtube-publish-workspaces:v2',JSON.stringify({legacy:{channelId:'legacy',selectedIds:[],rows:[],docx:false,thumbs:[],allowMissingThumbs:false,allowDuplicate:false,scheduleMode:'daily',scheduleTimeSource:'common',scheduleStartDate:'',scheduleTime:'18:00',updatedAt:'2026-01-01T00:00:00.000Z'}}));
  expect(loadPublishWorkspace('legacy')).toMatchObject({scheduleMode:'daily',intervalDays:3});
 });
});
