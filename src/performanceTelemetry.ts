export type PerformanceOperation=
  |'inventory.scanAll'
  |'inventory.scanChannel'
  |'render.scanFolder'
  |'render.fingerprint'
  |'render.runtimeEvidence'
  |'production.channelState'
  |'production.listBatches'
  |'music.index';

export type PerformanceTelemetrySnapshot={
  since:string;
  appReadyMs:number|null;
  totals:Record<PerformanceOperation,number>;
  reasons:Record<string,number>;
};

const startedAt=new Date().toISOString();
const startedAtMs=typeof performance!=='undefined'?performance.now():0;
const totals:Record<PerformanceOperation,number>={
  'inventory.scanAll':0,'inventory.scanChannel':0,'render.scanFolder':0,'render.fingerprint':0,
  'render.runtimeEvidence':0,'production.channelState':0,'production.listBatches':0,'music.index':0
};
const reasons:Record<string,number>={};
let appReadyMs:number|null=null;

export function markPerformanceAppReady(){
  if(appReadyMs===null&&typeof performance!=='undefined')appReadyMs=Math.max(0,performance.now()-startedAtMs)
}

export function recordPerformanceOperation(operation:PerformanceOperation,reason?:string,amount=1){
  const n=Number.isFinite(amount)?Math.max(0,Math.floor(amount)):0;
  totals[operation]+=n;
  if(reason){const key=`${operation}:${reason}`;reasons[key]=(reasons[key]||0)+n}
}

export function performanceTelemetrySnapshot():PerformanceTelemetrySnapshot{
  return{since:startedAt,appReadyMs,totals:{...totals},reasons:{...reasons}}
}

export function performanceTelemetryDelta(before:PerformanceTelemetrySnapshot,after=performanceTelemetrySnapshot()){
  const delta={} as Record<PerformanceOperation,number>;
  for(const key of Object.keys(after.totals) as PerformanceOperation[])delta[key]=Math.max(0,after.totals[key]-(before.totals[key]||0));
  return delta
}

export function resetPerformanceTelemetryForTests(){
  for(const key of Object.keys(totals) as PerformanceOperation[])totals[key]=0;
  for(const key of Object.keys(reasons))delete reasons[key];
  appReadyMs=null
}

