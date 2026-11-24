import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {BuildRequest,BuildResult} from './productionManagerApi';

const mocks=vi.hoisted(()=>({invoke:vi.fn(),listen:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('@tauri-apps/api/event',()=>({listen:mocks.listen}));
vi.mock('@tauri-apps/plugin-dialog',()=>({open:vi.fn()}));
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(e:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
function request(id:string,channel=id):BuildRequest{return{requestId:id,channelId:channel,channelName:'fixture',workspace:'/fixture',projectCount:100,tracksPerProject:1,mode:'even',allowImageReuse:false,jobLinks:[]}}
const ready:BuildResult={status:'ready',availableImages:100,requestedProjects:100,batch:{batchId:'fixture',channelId:'one',channelName:'fixture',createdAt:'',projectCount:100,tracksAssigned:100,status:'ready',manifestPath:'/fixture/manifest',rootPath:'/fixture',completedProjects:0,errorProjects:0}};

describe('production progress notifications',()=>{
 beforeEach(()=>{vi.resetModules();vi.useFakeTimers();mocks.listen.mockReset();mocks.invoke.mockReset()});
 afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()});
 it('coalesces rapid progress while keeping the latest snapshot and immediate completion',async()=>{
  let receive!:(event:{payload:unknown})=>void;
  mocks.listen.mockImplementation((_event,callback)=>{receive=callback;return Promise.resolve(()=>{})});
  const build=deferred<BuildResult>();mocks.invoke.mockReturnValue(build.promise);
  const {productionBuildRuntime:runtime}=await import('./productionManagerApi');
  const observer=vi.fn();const stop=runtime.subscribe(observer);
  const running=runtime.start(request('one'));
  await Promise.resolve();await Promise.resolve();
  observer.mockClear();
  for(let n=1;n<=80;n++)receive({payload:{requestId:'one',batchId:'b',completed:n,total:100,stage:'Сборка'}});
  expect(runtime.snapshot('one')?.progress?.completed).toBe(80);
  expect(observer).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(249);expect(observer).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);expect(observer).toHaveBeenCalledTimes(1);
  receive({payload:{requestId:'one',batchId:'b',completed:90,total:100,stage:'Сборка'}});
  build.resolve(ready);await running;
  expect(observer).toHaveBeenCalledTimes(2);
  expect(runtime.snapshot('one')).toMatchObject({state:'COMPLETED',progress:{completed:100,total:100,stage:'Готово'}});
  await vi.advanceTimersByTimeAsync(500);expect(observer).toHaveBeenCalledTimes(2);
  stop();
 });
 it('ignores mismatched request IDs and prevents concurrent production operations',async()=>{
  let receive!:(event:{payload:unknown})=>void;
  mocks.listen.mockImplementation((_event,callback)=>{receive=callback;return Promise.resolve(()=>{})});
  const first=deferred<BuildResult>(),second=deferred<BuildResult>();
  mocks.invoke.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const {productionBuildRuntime:runtime}=await import('./productionManagerApi');
  const observer=vi.fn();const stop=runtime.subscribe(observer);
  const running=runtime.start(request('first','one'));await Promise.resolve();await Promise.resolve();
  await expect(runtime.start(request('second','two'))).rejects.toThrow('Сборка уже выполняется');
  observer.mockClear();
  receive({payload:{requestId:'second',batchId:'b',completed:40,total:100,stage:'Чужая'}});
  await vi.advanceTimersByTimeAsync(300);
  expect(observer).not.toHaveBeenCalled();expect(runtime.snapshot('one')?.progress?.completed).toBe(0);
  first.resolve(ready);await running;
  const next=runtime.start(request('second','two'));await Promise.resolve();await Promise.resolve();
  receive({payload:{requestId:'first',batchId:'b',completed:99,total:100,stage:'Старое'}});
  expect(runtime.snapshot('two')?.progress?.completed).toBe(0);
  second.resolve({...ready,batch:null});await next;
  expect(runtime.snapshot('two')).toMatchObject({state:'COMPLETED',progress:{completed:0,total:100,stage:'Готово'}});
  stop();
 });
 it('preserves latest progress with no subscribers and immediately reports failure',async()=>{
  let receive!:(event:{payload:unknown})=>void;
  mocks.listen.mockImplementation((_event,callback)=>{receive=callback;return Promise.resolve(()=>{})});
  const build=deferred<BuildResult>();mocks.invoke.mockReturnValue(build.promise);
  const {productionBuildRuntime:runtime}=await import('./productionManagerApi');
  const observer=vi.fn();const stop=runtime.subscribe(observer);
  const running=runtime.start(request('one'));const outcome=running.catch(error=>error);
  await Promise.resolve();await Promise.resolve();observer.mockClear();
  receive({payload:{requestId:'one',batchId:'b',completed:25,total:100,stage:'Сборка'}});
  stop();await vi.advanceTimersByTimeAsync(250);expect(observer).not.toHaveBeenCalled();
  receive({payload:{requestId:'one',batchId:'b',completed:30,total:100,stage:'Сборка'}});
  expect(runtime.snapshot('one')?.progress?.completed).toBe(30);
  const resumed=vi.fn();const unsubscribe=runtime.subscribe(resumed);
  build.reject(new Error('fixture error'));expect((await outcome).message).toBe('fixture error');
  expect(resumed).toHaveBeenCalledTimes(1);
  expect(runtime.snapshot('one')).toMatchObject({state:'FAILED',error:'Error: fixture error',progress:{completed:30}});
  await vi.advanceTimersByTimeAsync(500);expect(resumed).toHaveBeenCalledTimes(1);
  unsubscribe();
 });
 it.each([false,true])('keeps another subscriber after cleanup (same callback: %s)',async(sameCallback)=>{
  let receive!:(event:{payload:unknown})=>void;
  mocks.listen.mockImplementation((_event,callback)=>{receive=callback;return Promise.resolve(()=>{})});
  const build=deferred<BuildResult>();mocks.invoke.mockReturnValue(build.promise);
  const {productionBuildRuntime:runtime}=await import('./productionManagerApi');
  const first=vi.fn(),second=sameCallback?first:vi.fn();
  const offFirst=runtime.subscribe(first),offSecond=runtime.subscribe(second);
  const running=runtime.start(request('one'));
  await Promise.resolve();await Promise.resolve();first.mockClear();second.mockClear();
  receive({payload:{requestId:'one',batchId:'b',completed:25,total:100,stage:'Сборка'}});
  offFirst();await vi.advanceTimersByTimeAsync(250);
  expect(second).toHaveBeenCalledTimes(1);
  if(!sameCallback)expect(first).not.toHaveBeenCalled();
  build.resolve(ready);await running;
  expect(second).toHaveBeenCalledTimes(2);
  offSecond();
 });
});
