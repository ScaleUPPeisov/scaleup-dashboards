import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({saveState:vi.fn()}));
vi.mock('./api',()=>({api:{saveState:mocks.saveState}}));
import {EMPTY_STATE,useApp} from './store';

const browser=new EventTarget() as EventTarget & {
 setTimeout:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;
 clearTimeout:(id:ReturnType<typeof setTimeout>)=>void;
 requestIdleCallback?:(fn:()=>void,options?:{timeout:number})=>number;
 cancelIdleCallback?:(id:number)=>void;
};
browser.setTimeout=(fn,ms)=>setTimeout(fn,ms);
browser.clearTimeout=id=>clearTimeout(id);
Object.defineProperty(globalThis,'window',{configurable:true,value:browser});
const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)}});
if(typeof globalThis.CustomEvent==='undefined')Object.defineProperty(globalThis,'CustomEvent',{configurable:true,value:class<T> extends Event{detail:T|undefined;constructor(name:string,options?:{detail?:T}){super(name);this.detail=options?.detail}}});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}

describe('state autosave scheduling',()=>{
 beforeEach(()=>{
  vi.useFakeTimers();mocks.saveState.mockReset();mocks.saveState.mockResolvedValue({ok:true});storage.clear();
  delete browser.requestIdleCallback;delete browser.cancelIdleCallback;
  useApp.setState({...EMPTY_STATE,settings:{...EMPTY_STATE.settings},booted:true});
 });
 afterEach(async()=>{await useApp.getState().persist();vi.clearAllTimers();vi.useRealTimers()});
 it('explicit persist supersedes an older debounced save',async()=>{
  useApp.getState().patchSettings({workspace:'/fixture/one'});
  await useApp.getState().persist();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
  expect(mocks.saveState.mock.calls[0][0].settings.workspace).toBe('/fixture/one');
 });
 it('explicit persist also cancels an already scheduled idle callback',async()=>{
  browser.requestIdleCallback=(fn)=>browser.setTimeout(fn,5_000) as unknown as number;
  browser.cancelIdleCallback=id=>browser.clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
  useApp.getState().patchSettings({workspace:'/fixture/idle'});
  await vi.advanceTimersByTimeAsync(750);
  expect(mocks.saveState).not.toHaveBeenCalled();
  await useApp.getState().persist();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
 });
 it('saves a subsequent change after the active write without overlap',async()=>{
  const first=deferred<{ok:true}>();mocks.saveState.mockReturnValueOnce(first.promise);
  useApp.getState().patchSettings({workspace:'/fixture/one'});
  const flush=useApp.getState().persist();
  useApp.getState().patchSettings({workspace:'/fixture/two'});
  await vi.advanceTimersByTimeAsync(750);
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
  first.resolve({ok:true});await flush;
  expect(mocks.saveState).toHaveBeenCalledTimes(2);
  expect(mocks.saveState.mock.calls.map(call=>call[0].settings.workspace)).toEqual(['/fixture/one','/fixture/two']);
 });
 it('retains a requested follow-up when the in-flight write fails',async()=>{
  const first=deferred<{ok:true}>();mocks.saveState.mockReturnValueOnce(first.promise);
  useApp.getState().patchSettings({workspace:'/fixture/one'});
  const flush=useApp.getState().persist().catch(error=>error);
  useApp.getState().patchSettings({workspace:'/fixture/two'});
  await vi.advanceTimersByTimeAsync(750);
  first.reject(new Error('fixture failure'));expect((await flush).message).toBe('fixture failure');
  await vi.advanceTimersByTimeAsync(750);
  expect(mocks.saveState).toHaveBeenCalledTimes(2);
  expect(mocks.saveState.mock.calls[1][0].settings.workspace).toBe('/fixture/two');
 });
});
