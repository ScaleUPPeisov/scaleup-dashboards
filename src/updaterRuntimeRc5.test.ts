import {beforeEach,describe,expect,it,vi} from 'vitest';

const {mockApi,mockAppend}=vi.hoisted(()=>({
  mockApi:{appVersion:vi.fn(),checkUpdate:vi.fn()},
  mockAppend:vi.fn()
}));
vi.mock('./api',()=>({api:mockApi}));
vi.mock('./errorHistory',()=>({appendErrorHistory:mockAppend}));
import {resetUpdaterRuntimeForTests,useUpdaterRuntime} from './updaterRuntime';
import {UPDATER_AUTO_INTERVAL_MS} from './updaterSchedule';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{
  getItem:(k:string)=>storage.get(k)??null,
  setItem:(k:string,v:string)=>storage.set(k,v),
  removeItem:(k:string)=>storage.delete(k)
},configurable:true});

function none(){return {none:true,current:'2.1.15-rc.4',latest:'2.1.15-rc.4',status:'UP_TO_DATE',endpoint:'feed',versionComparison:'current == latest'}}

describe('RC5 updater runtime concurrency/backoff',()=>{
  beforeEach(()=>{
    storage.clear();resetUpdaterRuntimeForTests();mockAppend.mockReset();mockApi.appVersion.mockReset().mockResolvedValue('2.1.15-rc.4');mockApi.checkUpdate.mockReset();
  });

  it('manual force joins an in-flight background request instead of creating a second HTTP check',async()=>{
    let release!:(value:any)=>void;
    const pending=new Promise<any>(resolve=>{release=resolve});
    mockApi.checkUpdate.mockReturnValue(pending);
    const a=useUpdaterRuntime.getState().check({silent:true});
    const b=useUpdaterRuntime.getState().check({force:true});
    expect(mockApi.checkUpdate).toHaveBeenCalledTimes(1);
    release(none());
    await Promise.all([a,b]);
    expect(mockApi.checkUpdate).toHaveBeenCalledTimes(1);
  });

  it('successful check schedules the next automatic check 15 minutes later',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T14:00:00Z'));
    mockApi.checkUpdate.mockResolvedValue(none());
    await useUpdaterRuntime.getState().check({silent:true});
    const s=useUpdaterRuntime.getState();
    expect(s.consecutiveCheckFailures).toBe(0);
    expect(s.nextAutomaticCheckAt! - s.lastCheckedAt!).toBe(UPDATER_AUTO_INTERVAL_MS);
    vi.useRealTimers();
  });

  it('backs off repeated manifest failures at 15m then 30m and deduplicates identical Error Center incidents',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T14:00:00Z'));
    mockApi.checkUpdate.mockRejectedValue(new Error('UPDATER_MANIFEST_FETCH_FAILED: offline'));
    await useUpdaterRuntime.getState().check({silent:true});
    let s=useUpdaterRuntime.getState();
    expect(s.consecutiveCheckFailures).toBe(1);
    expect(s.nextAutomaticCheckAt! - s.lastCheckedAt!).toBe(15*60*1000);
    expect(mockAppend).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-09-20T14:15:00Z'));
    await useUpdaterRuntime.getState().check({silent:true});
    s=useUpdaterRuntime.getState();
    expect(s.consecutiveCheckFailures).toBe(2);
    expect(s.nextAutomaticCheckAt! - s.lastCheckedAt!).toBe(30*60*1000);
    expect(mockAppend).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('a successful check resets failure backoff and error dedup state',async()=>{
    mockApi.checkUpdate.mockRejectedValueOnce(new Error('UPDATER_MANIFEST_FETCH_FAILED: offline')).mockResolvedValueOnce(none()).mockRejectedValueOnce(new Error('UPDATER_MANIFEST_FETCH_FAILED: offline'));
    await useUpdaterRuntime.getState().check();
    await useUpdaterRuntime.getState().check();
    expect(useUpdaterRuntime.getState().consecutiveCheckFailures).toBe(0);
    await useUpdaterRuntime.getState().check();
    expect(mockAppend).toHaveBeenCalledTimes(2);
  });
});
