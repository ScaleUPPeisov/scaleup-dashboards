import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocked=vi.hoisted(()=>({saveState:vi.fn(async()=>({ok:true}))}));
vi.mock('./api',()=>({api:{saveState:mocked.saveState}}));
import {EMPTY_STATE,useApp} from './store';
import type {ProjectLifecycleRecord} from './types';
const browser=new EventTarget() as EventTarget & {setTimeout:typeof setTimeout;clearTimeout:typeof clearTimeout};
browser.setTimeout=((...args:Parameters<typeof setTimeout>)=>setTimeout(...args)) as typeof setTimeout;browser.clearTimeout=(id)=>clearTimeout(id);
Object.defineProperty(globalThis,'window',{configurable:true,value:browser});
const value=(projectId:string,updatedAt='one'):ProjectLifecycleRecord=>({projectId,jobId:'job-'+projectId,projectPath:'/fixture/'+projectId,renderPath:'/fixture/'+projectId+'.mp4',status:'SAFE_TO_CLEAN',renderExists:true,updatedAt});
describe('project lifecycle batching',()=>{
 beforeEach(()=>{vi.useFakeTimers();mocked.saveState.mockClear();useApp.setState({...EMPTY_STATE,settings:{...EMPTY_STATE.settings},projectLifecycle:{},booted:true})});
 afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()});
 it('updates many records once and ignores unchanged observations including timestamp',async()=>{
  const listener=vi.fn();const off=useApp.subscribe(listener);
  useApp.getState().patchProjectLifecycles({a:value('a'),b:value('b')});
  expect(listener).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(mocked.saveState).toHaveBeenCalledTimes(1);
  listener.mockClear();mocked.saveState.mockClear();
  useApp.getState().patchProjectLifecycles({a:value('a','later'),b:value('b','later')});
  await vi.advanceTimersByTimeAsync(2000);
  expect(listener).not.toHaveBeenCalled();expect(mocked.saveState).not.toHaveBeenCalled();
  expect(useApp.getState().projectLifecycle.a.updatedAt).toBe('one');off();
 });
});
