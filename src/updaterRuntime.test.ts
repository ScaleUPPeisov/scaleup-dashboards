import {beforeEach,describe,expect,it,vi} from 'vitest';

const {mockApi}=vi.hoisted(()=>({mockApi:{appVersion:vi.fn(),checkUpdate:vi.fn()}}));
vi.mock('./api',()=>({api:mockApi}));
import {resetUpdaterRuntimeForTests,useUpdaterRuntime} from './updaterRuntime';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)},configurable:true});

function candidate(overrides:any={}){
 return {version:'2.1.5',current:'2.1.4',latest:'2.1.5',body:'notes',date:'2026-09-13T10:00:00Z',status:'AVAILABLE',endpoint:'https://example/latest.json',versionComparison:'current 2.1.4 -> latest 2.1.5',
  download:vi.fn(async(cb:any)=>{cb?.({status:'DOWNLOADING',percent:50,downloadedBytes:50,totalBytes:100});cb?.({status:'VERIFYING',percent:100,downloadedBytes:100,totalBytes:100})}),
  install:vi.fn(async(cb:any)=>{cb?.('VERIFYING');cb?.('INSTALLING');cb?.('READY_TO_RESTART')}),restart:vi.fn(async()=>{}),...overrides};
}

describe('shared remote updater lifecycle',()=>{
 beforeEach(()=>{storage.clear();resetUpdaterRuntimeForTests();mockApi.appVersion.mockReset().mockResolvedValue('2.1.4');mockApi.checkUpdate.mockReset()});
 it('discovers an update without navigation to Settings and keeps one shared state',async()=>{mockApi.checkUpdate.mockResolvedValue(candidate());await useUpdaterRuntime.getState().check();const s=useUpdaterRuntime.getState();expect(s.status).toBe('AVAILABLE');expect(s.currentVersion).toBe('2.1.4');expect(s.latestVersion).toBe('2.1.5')});
 it('downloads with byte progress, then waits for explicit install/restart',async()=>{const c=candidate();mockApi.checkUpdate.mockResolvedValue(c);await useUpdaterRuntime.getState().check();await useUpdaterRuntime.getState().download();let s=useUpdaterRuntime.getState();expect(s.status).toBe('READY_TO_INSTALL');expect(s.progress).toBe(100);expect(s.downloadedBytes).toBe(100);expect(c.install).not.toHaveBeenCalled();expect(c.restart).not.toHaveBeenCalled();await useUpdaterRuntime.getState().installAndRestart([]);s=useUpdaterRuntime.getState();expect(c.install).toHaveBeenCalledTimes(1);expect(c.restart).toHaveBeenCalledTimes(1);expect(storage.get('vyron:update-installing-version')).toBe('2.1.5')});
 it('does not install or restart while critical jobs exist',async()=>{const c=candidate();mockApi.checkUpdate.mockResolvedValue(c);await useUpdaterRuntime.getState().check();await useUpdaterRuntime.getState().download();const ok=await useUpdaterRuntime.getState().installAndRestart([{kind:'UPLOADS',label:'Uploads',count:3}]);expect(ok).toBe(false);expect(c.install).not.toHaveBeenCalled();expect(c.restart).not.toHaveBeenCalled();expect(useUpdaterRuntime.getState().blockers[0]?.count).toBe(3)});
 it('keeps app usable on network check failure and records ERROR state',async()=>{mockApi.checkUpdate.mockRejectedValue(new Error('UPDATER_MANIFEST_FETCH_FAILED: offline'));await useUpdaterRuntime.getState().check();expect(useUpdaterRuntime.getState().status).toBe('ERROR');expect(useUpdaterRuntime.getState().errorCode).toBe('UPDATER_MANIFEST_FETCH_FAILED')});
 it('blocks a bad-signature package before install',async()=>{const c=candidate({download:vi.fn(async()=>{throw new Error('UPDATER_SIGNATURE_INVALID: bad signature')})});mockApi.checkUpdate.mockResolvedValue(c);await useUpdaterRuntime.getState().check();await useUpdaterRuntime.getState().download();expect(useUpdaterRuntime.getState().status).toBe('ERROR');expect(useUpdaterRuntime.getState().errorCode).toBe('UPDATER_SIGNATURE_INVALID');expect(c.install).not.toHaveBeenCalled()});
 it('shows same-version state without update warning',async()=>{mockApi.checkUpdate.mockResolvedValue({none:true,current:'2.1.4',latest:'2.1.4',status:'UP_TO_DATE',endpoint:'feed',versionComparison:'current == latest'});await useUpdaterRuntime.getState().check();expect(useUpdaterRuntime.getState().status).toBe('UP_TO_DATE');expect(useUpdaterRuntime.getState().latestVersion).toBe('2.1.4')});
});
