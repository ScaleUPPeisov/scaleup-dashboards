import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const {mockApi}=vi.hoisted(()=>({mockApi:{appVersion:vi.fn(),checkUpdate:vi.fn(),updaterInstallPreflight:vi.fn()}}));
vi.mock('./api',()=>({api:mockApi}));
import {resetUpdaterRuntimeForTests,useUpdaterRuntime} from './updaterRuntime';
import {replaceFactualActiveRenders,resetActiveOperationFactsForTests,setRenderMonitoringExpected} from './activeOperationFacts';
const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)},configurable:true});
const preflight={runningFromDmg:false,bundleReplaceable:true};

describe('update installation render-safety',()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(100_000);storage.clear();resetUpdaterRuntimeForTests();resetActiveOperationFactsForTests();mockApi.appVersion.mockReset().mockResolvedValue('1.0.0');mockApi.checkUpdate.mockReset();mockApi.updaterInstallPreflight.mockReset().mockResolvedValue(preflight)});
 afterEach(()=>{resetActiveOperationFactsForTests();vi.useRealTimers()});
 it('does not install if a slow preflight makes the last render observation stale',async()=>{
  const c={version:'2.0.0',current:'1.0.0',latest:'2.0.0',status:'AVAILABLE',download:vi.fn(async()=>{}),install:vi.fn(async()=>{}),restart:vi.fn(async()=>{})};
  mockApi.checkUpdate.mockResolvedValue(c);
  await useUpdaterRuntime.getState().check();await useUpdaterRuntime.getState().download();
  setRenderMonitoringExpected(true);replaceFactualActiveRenders([],Date.now());
  let release!:(value:typeof preflight)=>void;
  mockApi.updaterInstallPreflight.mockImplementationOnce(()=>new Promise<typeof preflight>(r=>{release=r}));
  const installing=useUpdaterRuntime.getState().installAndRestart([]);
  await Promise.resolve();vi.advanceTimersByTime(20_001);release(preflight);
  expect(await installing).toBe(false);expect(c.install).not.toHaveBeenCalled();expect(c.restart).not.toHaveBeenCalled();
  expect(useUpdaterRuntime.getState().status).toBe('READY_TO_INSTALL');
  expect(useUpdaterRuntime.getState().blockers[0]?.kind).toBe('RENDERS_UNKNOWN')
 });
});
