export type UploadProgressFact={
  jobId:string;
  projectId?:string;
  channelId?:string;
  profileId?:string;
  filePath?:string;
  bytesUploaded?:number;
  totalBytes?:number|null;
  progress?:number|null;
  timestamp:string;
  startedAt?:string;
  active?:boolean;
};

export type UploadRuntimeIdentity={
  jobId:string;
  projectId?:string;
  channelId:string;
  profileId:string;
  filePath:string;
  startedAt:string;
};

export type UploadSpeedState={
  startedAtMs:number;
  lastAtMs:number;
  lastBytes:number;
  usefulSamples:number;
  smoothedBps?:number;
};

export type UploadEstimate={
  bytesUploaded?:number;
  totalBytes?:number;
  percent?:number;
  indeterminate:boolean;
  speedBps?:number;
  usefulSamples:number;
  elapsedSeconds:number;
  etaSeconds?:number;
  expectedFinishAt?:string;
};

export type UploadTelemetryRecord=UploadRuntimeIdentity&UploadEstimate&{
  lastProgressAt:string;
};

export type UploadTelemetrySnapshot={version:number;active:UploadTelemetryRecord[]};

const EMA_ALPHA=0.35;
const ETA_WARMUP_MS=5_000;
const ETA_MIN_USEFUL_SAMPLES=3;

function finiteNonNegative(value:number|undefined|null){return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0}
function parseMs(value:string|undefined,fallback:number){const x=value?Date.parse(value):NaN;return Number.isFinite(x)?x:fallback}

export function progressFromBytes(bytesUploaded:number,totalBytes?:number|null){
  const bytes=finiteNonNegative(bytesUploaded);
  const total=typeof totalBytes==='number'&&Number.isFinite(totalBytes)&&totalBytes>0?totalBytes:undefined;
  if(!total)return{bytesUploaded:bytes,totalBytes:undefined,percent:undefined,indeterminate:true};
  const percent=Math.max(0,Math.min(100,bytes/total*100));
  return{bytesUploaded:bytes,totalBytes:total,percent,indeterminate:false};
}

export function initialUploadSpeedState(startedAtMs:number,initialBytes=0):UploadSpeedState{
  const started=Number.isFinite(startedAtMs)?startedAtMs:0;
  return{startedAtMs:started,lastAtMs:started,lastBytes:finiteNonNegative(initialBytes),usefulSamples:0};
}

export function advanceUploadSpeed(state:UploadSpeedState,timestampMs:number,bytesUploaded:number,alpha=EMA_ALPHA){
  const at=Number.isFinite(timestampMs)?timestampMs:state.lastAtMs;
  const bytes=finiteNonNegative(bytesUploaded);
  if(at<=state.lastAtMs)return{state:{...state,lastBytes:Math.max(state.lastBytes,bytes)},speedBps:state.smoothedBps,useful:false};
  const deltaBytes=bytes-state.lastBytes;
  const deltaSeconds=(at-state.lastAtMs)/1000;
  if(deltaBytes<=0||deltaSeconds<=0){
    return{state:{...state,lastAtMs:at,lastBytes:Math.max(state.lastBytes,bytes)},speedBps:0,useful:false};
  }
  const instant=deltaBytes/deltaSeconds;
  const a=Math.max(0.01,Math.min(1,alpha));
  const smoothed=state.smoothedBps==null?instant:(a*instant+(1-a)*state.smoothedBps);
  return{state:{...state,lastAtMs:at,lastBytes:bytes,usefulSamples:state.usefulSamples+1,smoothedBps:smoothed},speedBps:smoothed,useful:true};
}

export function uploadEstimate(state:UploadSpeedState,bytesUploaded:number,totalBytes:number|undefined|null,nowMs:number,speedBps?:number):UploadEstimate{
  const progress=progressFromBytes(bytesUploaded,totalBytes);
  const now=Number.isFinite(nowMs)?nowMs:state.lastAtMs;
  const elapsedSeconds=Math.max(0,(now-state.startedAtMs)/1000);
  const complete=Boolean(progress.totalBytes&&progress.bytesUploaded>=progress.totalBytes);
  const usableSpeed=typeof speedBps==='number'&&Number.isFinite(speedBps)&&speedBps>0?speedBps:undefined;
  let etaSeconds:number|undefined;
  if(complete)etaSeconds=0;
  else if(progress.totalBytes&&elapsedSeconds>=ETA_WARMUP_MS/1000&&state.usefulSamples>=ETA_MIN_USEFUL_SAMPLES&&usableSpeed){
    const remaining=Math.max(0,progress.totalBytes-progress.bytesUploaded);
    const eta=remaining/usableSpeed;
    if(Number.isFinite(eta)&&eta>=0)etaSeconds=eta;
  }
  const expectedFinishAt=etaSeconds==null?undefined:new Date(now+etaSeconds*1000).toISOString();
  return{...progress,speedBps:usableSpeed,usefulSamples:state.usefulSamples,elapsedSeconds,etaSeconds,expectedFinishAt};
}

const records=new Map<string,UploadTelemetryRecord>();
const speedStates=new Map<string,UploadSpeedState>();
const listeners=new Set<(snapshot:UploadTelemetrySnapshot)=>void>();
let version=0,lastNotify=0,notifyTimer:ReturnType<typeof setTimeout>|undefined;

function snapshot():UploadTelemetrySnapshot{return{version,active:[...records.values()].sort((a,b)=>a.startedAt.localeCompare(b.startedAt))}}
function notifyNow(){lastNotify=Date.now();notifyTimer=undefined;const s=snapshot();for(const cb of listeners)cb(s)}
function changed(){version++;const wait=Math.max(0,100-(Date.now()-lastNotify));if(wait===0)notifyNow();else if(!notifyTimer)notifyTimer=setTimeout(notifyNow,wait)}

export function subscribeUploadTelemetry(cb:(snapshot:UploadTelemetrySnapshot)=>void){listeners.add(cb);cb(snapshot());return()=>{listeners.delete(cb)}}
export function uploadTelemetrySnapshot(){return snapshot()}
export function factualActiveUploadCount(){return records.size}
export function factualActiveUploadIds(){return new Set(records.keys())}

export function registerUploadRuntime(identity:UploadRuntimeIdentity,totalBytes?:number,bytesUploaded=0){
  const now=Date.now(),startedAtMs=parseMs(identity.startedAt,now),atIso=new Date(now).toISOString();
  const state=initialUploadSpeedState(startedAtMs,bytesUploaded);speedStates.set(identity.jobId,state);
  const estimate=uploadEstimate(state,bytesUploaded,totalBytes,now,undefined);
  records.set(identity.jobId,{...identity,...estimate,lastProgressAt:atIso});changed();
}

export function applyUploadProgressFact(fact:UploadProgressFact){
  if(fact.active===false){endUploadRuntime(fact.jobId);return}
  const previous=records.get(fact.jobId),now=Date.now(),atMs=parseMs(fact.timestamp,now),startedAt=previous?.startedAt||fact.startedAt||fact.timestamp||new Date(now).toISOString(),bytesUploaded=fact.bytesUploaded??previous?.bytesUploaded??0;
  const identity:UploadRuntimeIdentity={
    jobId:fact.jobId,
    projectId:fact.projectId||previous?.projectId,
    channelId:fact.channelId||previous?.channelId||'',
    profileId:fact.profileId||previous?.profileId||'',
    filePath:fact.filePath||previous?.filePath||'',
    startedAt
  };
  let state=speedStates.get(fact.jobId);
  if(!state)state=initialUploadSpeedState(parseMs(startedAt,atMs),previous?.bytesUploaded||0);
  const moved=advanceUploadSpeed(state,atMs,bytesUploaded);state=moved.state;speedStates.set(fact.jobId,state);
  const estimate=uploadEstimate(state,bytesUploaded,fact.totalBytes??previous?.totalBytes,atMs,moved.speedBps);
  records.set(fact.jobId,{...identity,...estimate,lastProgressAt:fact.timestamp||new Date(atMs).toISOString()});changed();
}

export function seedActiveUploadFacts(facts:UploadProgressFact[]){for(const x of facts)applyUploadProgressFact({...x,active:true})}
export function endUploadRuntime(jobId:string){const had=records.delete(jobId);speedStates.delete(jobId);if(had)changed()}
export function resetUploadTelemetryForTests(){records.clear();speedStates.clear();version++;if(notifyTimer){clearTimeout(notifyTimer);notifyTimer=undefined}}

export function formatDuration(seconds:number|undefined){if(seconds==null||!Number.isFinite(seconds)||seconds<0)return'—';const whole=Math.max(0,Math.round(seconds)),h=Math.floor(whole/3600),m=Math.floor((whole%3600)/60),s=whole%60;return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
export function formatUploadBytes(bytes:number|undefined){if(bytes==null||!Number.isFinite(bytes)||bytes<0)return'—';const gb=bytes/1024/1024/1024;if(gb>=1)return`${gb.toFixed(gb>=10?1:2)} GB`;const mb=bytes/1024/1024;return`${mb.toFixed(mb>=100?0:1)} MB`}
export function formatUploadSpeed(bytesPerSecond:number|undefined){if(bytesPerSecond==null||!Number.isFinite(bytesPerSecond)||bytesPerSecond<=0)return'—';const mb=bytesPerSecond/1024/1024;return`${mb.toFixed(mb>=10?1:2)} MB/s`}
