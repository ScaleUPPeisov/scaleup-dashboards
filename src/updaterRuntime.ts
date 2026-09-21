import {create} from 'zustand';
import {api,type CheckedUpdaterCandidate,type UpdaterInstallPreflight,type UpdaterTransferProgress} from './api';
import {appendErrorHistory,type ErrorStage} from './errorHistory';
import type {UpdaterBlocker} from './updaterGuard';
import type {UpdaterStatus} from './updaterPolicy';
import {UPDATER_AUTO_INTERVAL_MS,updaterNextAutomaticCheckAt} from './updaterSchedule';

export type RuntimeUpdaterStatus=UpdaterStatus|'READY_TO_INSTALL'|'RESTARTING'|'UPDATED';
export type UpdaterRuntimeState={
  currentVersion:string;latestVersion:string;status:RuntimeUpdaterStatus;progress:number;downloadedBytes:number;totalBytes:number;
  notes:string;releaseDate?:string;endpoint:string;versionComparison:string;lastCheckedAt?:number;lastCheckAttemptAt?:number;nextAutomaticCheckAt?:number;
  consecutiveCheckFailures:number;errorCode?:string;errorMessage?:string;
  blockers:UpdaterBlocker[];hasChecked:boolean;preflight?:UpdaterInstallPreflight;
  bootstrapVersion:()=>Promise<void>;check:(options?:{silent?:boolean;force?:boolean})=>Promise<void>;download:()=>Promise<void>;
  installAndRestart:(blockers?:UpdaterBlocker[])=>Promise<boolean>;markUpdated:(version:string)=>void;clearBlockers:()=>void;
};

let candidate:CheckedUpdaterCandidate|undefined;
let checkPromise:Promise<void>|undefined;
let lastRecordedError='';
const ERROR_FINGERPRINT_KEY='vyron:updater-last-error-fingerprint';
const errorCode=(e:unknown)=>String(e??'').match(/([A-Z][A-Z0-9_]+):/)?.[1]||'UPDATER_INSTALL_FAILED';
const historyStage=(stage:'check'|'download'|'install'|'relaunch'):ErrorStage=>`updater-${stage}` as ErrorStage;
function storedErrorFingerprint(){try{return globalThis.localStorage?.getItem(ERROR_FINGERPRINT_KEY)||''}catch{return''}}
function saveErrorFingerprint(value:string){try{globalThis.localStorage?.setItem(ERROR_FINGERPRINT_KEY,value)}catch{}}
function clearRecordedFailure(){lastRecordedError='';try{globalThis.localStorage?.removeItem(ERROR_FINGERPRINT_KEY)}catch{}}
function recordFailure(stage:'check'|'download'|'install'|'relaunch',error:unknown,currentVersion:string,targetVersion:string){
  const code=errorCode(error),detail=String(error??''),fingerprint=`${stage}:${code}:${currentVersion}:${targetVersion}`;
  const prior=lastRecordedError||storedErrorFingerprint();
  if(fingerprint===prior)return code;
  lastRecordedError=fingerprint;saveErrorFingerprint(fingerprint);
  appendErrorHistory(`Updater: ${stage} failed`,'Текущая версия VYRON сохранена. Повторите операцию после устранения причины.',detail,{errorCode:code,stage:historyStage(stage),currentVersion,targetVersion});
  return code;
}

async function ensureUpdaterInstallable(set:(x:Partial<UpdaterRuntimeState>)=>void){
  const fn=(api as typeof api&{updaterInstallPreflight?:()=>Promise<UpdaterInstallPreflight>}).updaterInstallPreflight;
  if(!fn)return undefined;
  const preflight=await fn();set({preflight});
  if(preflight.runningFromDmg)throw new Error('RUNNING_FROM_DMG: VYRON запущен из установочного образа');
  if(!preflight.bundleReplaceable)throw new Error('APP_NOT_REPLACEABLE: установленный VYRON.app недоступен для безопасной замены');
  return preflight;
}

export const useUpdaterRuntime=create<UpdaterRuntimeState>((set,get)=>({
  currentVersion:'',latestVersion:'',status:'UP_TO_DATE',progress:0,downloadedBytes:0,totalBytes:0,notes:'',endpoint:'',versionComparison:'',blockers:[],hasChecked:false,consecutiveCheckFailures:0,preflight:undefined,
  bootstrapVersion:async()=>{if(get().currentVersion)return;try{const v=await api.appVersion();set({currentVersion:v,latestVersion:get().latestVersion||v})}catch(error){const code=recordFailure('check',error,'','');set({status:'ERROR',errorCode:code,errorMessage:String(error),hasChecked:true,lastCheckedAt:Date.now()})}},
  check:async(options={})=>{
    void options.silent;void options.force;
    if(checkPromise)return checkPromise;
    const state=get();
    if(['DOWNLOADING','VERIFYING','READY_TO_INSTALL','INSTALLING','READY_TO_RESTART','RESTARTING'].includes(state.status))return;
    const attemptAt=Date.now();
    const priorFailures=state.consecutiveCheckFailures||0;
    set({status:'CHECKING',errorCode:undefined,errorMessage:undefined,blockers:[],lastCheckAttemptAt:attemptAt});
    checkPromise=(async()=>{
      const prior=get();
      try{
        const result=await api.checkUpdate();
        const checkedAt=Date.now();
        clearRecordedFailure();
        if(result.none){
          candidate=undefined;
          set({currentVersion:result.current||prior.currentVersion,latestVersion:result.latest||result.current||prior.currentVersion,status:'UP_TO_DATE',endpoint:result.endpoint||'',versionComparison:result.versionComparison||'',lastCheckedAt:checkedAt,lastCheckAttemptAt:attemptAt,nextAutomaticCheckAt:checkedAt+UPDATER_AUTO_INTERVAL_MS,consecutiveCheckFailures:0,hasChecked:true,progress:0,downloadedBytes:0,totalBytes:0,notes:''});
          return;
        }
        candidate=result;
        set({currentVersion:result.current||prior.currentVersion,latestVersion:result.latest||result.version||'',status:'AVAILABLE',notes:result.body||'',releaseDate:result.date,endpoint:result.endpoint||'',versionComparison:result.versionComparison||'',lastCheckedAt:checkedAt,lastCheckAttemptAt:attemptAt,nextAutomaticCheckAt:checkedAt+UPDATER_AUTO_INTERVAL_MS,consecutiveCheckFailures:0,hasChecked:true,progress:0,downloadedBytes:0,totalBytes:0});
      }catch(error){
        const current=get().currentVersion,target=get().latestVersion;const code=recordFailure('check',error,current,target);
        const checkedAt=Date.now(),failures=priorFailures+1;
        set({status:'ERROR',errorCode:code,errorMessage:String(error),lastCheckedAt:checkedAt,lastCheckAttemptAt:attemptAt,nextAutomaticCheckAt:updaterNextAutomaticCheckAt(checkedAt,failures,checkedAt),consecutiveCheckFailures:failures,hasChecked:true});
      }finally{checkPromise=undefined}
    })();
    return checkPromise;
  },
  download:async()=>{
    if(!candidate)return;
    set({status:'DOWNLOADING',progress:0,downloadedBytes:0,totalBytes:0,errorCode:undefined,errorMessage:undefined,blockers:[]});
    try{
      await ensureUpdaterInstallable(set);
      await candidate.download((p:UpdaterTransferProgress)=>set({status:p.status==='VERIFYING'?'VERIFYING':'DOWNLOADING',progress:p.percent,downloadedBytes:p.downloadedBytes,totalBytes:p.totalBytes}));
      set({status:'READY_TO_INSTALL',progress:100});
    }catch(error){const s=get();const code=recordFailure('download',error,s.currentVersion,s.latestVersion);set({status:'ERROR',errorCode:code,errorMessage:String(error)})}
  },
  installAndRestart:async(blockers=[])=>{
    if(!candidate)return false;
    if(blockers.length){set({blockers});return false}
    const target=get().latestVersion||candidate.version;localStorage.setItem('vyron:update-installing-version',target);
    try{
      await ensureUpdaterInstallable(set);
      set({status:'VERIFYING',blockers:[]});
      await candidate.install(status=>set({status}));
      set({status:'READY_TO_RESTART'});
    }catch(error){localStorage.removeItem('vyron:update-installing-version');const s=get();const code=recordFailure('install',error,s.currentVersion,target);set({status:'ERROR',errorCode:code,errorMessage:String(error)});return false}
    try{set({status:'RESTARTING'});await candidate.restart();return true}catch(error){const s=get();const code=recordFailure('relaunch',error,s.currentVersion,target);set({status:'ERROR',errorCode:code,errorMessage:String(error)});return false}
  },
  markUpdated:(version:string)=>{candidate=undefined;clearRecordedFailure();const now=Date.now();set({currentVersion:version,latestVersion:version,status:'UPDATED',progress:100,downloadedBytes:0,totalBytes:0,errorCode:undefined,errorMessage:undefined,blockers:[],hasChecked:true,lastCheckedAt:now,lastCheckAttemptAt:now,nextAutomaticCheckAt:now+UPDATER_AUTO_INTERVAL_MS,consecutiveCheckFailures:0})},
  clearBlockers:()=>set({blockers:[]})
}));

export function resetUpdaterRuntimeForTests(){candidate=undefined;checkPromise=undefined;lastRecordedError='';try{globalThis.localStorage?.removeItem(ERROR_FINGERPRINT_KEY)}catch{}useUpdaterRuntime.setState({currentVersion:'',latestVersion:'',status:'UP_TO_DATE',progress:0,downloadedBytes:0,totalBytes:0,notes:'',releaseDate:undefined,endpoint:'',versionComparison:'',lastCheckedAt:undefined,lastCheckAttemptAt:undefined,nextAutomaticCheckAt:undefined,consecutiveCheckFailures:0,errorCode:undefined,errorMessage:undefined,blockers:[],hasChecked:false,preflight:undefined})}
