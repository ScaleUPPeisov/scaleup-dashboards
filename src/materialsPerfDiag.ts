import {useSyncExternalStore} from 'react';

export type MaterialsDiagMode='A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J';
export type MaterialsDiagConfig={
  mode:MaterialsDiagMode;
  inventoryPaused:boolean;
  snapshotSubscription:'full'|'isolated';
};

type DiagIpc={command:string;startedAt:number;duration?:number;ok?:boolean};
type InventoryScanDiag={channelId:string;reason:string;queuedAt:number;startedAt:number;endedAt?:number;duration?:number};
type LongTaskDiag={startTime:number;duration:number};
type DiagClick={
  id:number;
  from:string;
  startedAt:number;
  appBase:number;
  productionBase:number;
  materialsBase:number;
  rowBase:number;
  ipcBase:number;
  snapshotBase:number;
  inventoryStartedBase:number;
  inventoryCompletedBase:number;
  longTaskBase:number;
};
export type MaterialsDiagMeasurement={
  id:number;
  mode:MaterialsDiagMode;
  inventoryPaused:boolean;
  snapshotSubscription:'full'|'isolated';
  from:string;
  clickToCommit:number;
  clickToRaf:number;
  clickToNextFrame:number;
  appRenders:number;
  productionRenders:number;
  materialsRenders:number;
  rowRenders:number;
  snapshotUpdates:number;
  inventoryScansStarted:number;
  inventoryScansCompleted:number;
  ipcCount:number;
  longTaskCount:number;
  largestLongTask:number;
  renderCauses:Record<string,number>;
  phases:Record<string,number>;
};
type MaterialsPerfDiagState={
  sequence:number;
  appRenders:number;
  productionRenders:number;
  materialsRenders:number;
  rowRenders:number;
  snapshotUpdates:number;
  inventoryScansStarted:number;
  inventoryScansCompleted:number;
  click?:DiagClick;
  ipc:DiagIpc[];
  inventoryScans:InventoryScanDiag[];
  longTasks:LongTaskDiag[];
  phases:Record<string,number>;
  renderCauses:Record<string,number>;
  lastMeasurement?:MaterialsDiagMeasurement;
  lastReport?:string;
  benchmark:MaterialsDiagMeasurement[];
};

const DEFAULT_CONFIG:MaterialsDiagConfig={mode:'A',inventoryPaused:false,snapshotSubscription:'full'};
let config:MaterialsDiagConfig={...DEFAULT_CONFIG};
const configListeners=new Set<()=>void>();
const EMPTY_SNAPSHOTS:Record<string,never>=Object.freeze({});

declare global{
  interface Window{__VYRON_MATERIALS_DIAG__?:MaterialsPerfDiagState}
}

function state():MaterialsPerfDiagState{
  if(!window.__VYRON_MATERIALS_DIAG__)window.__VYRON_MATERIALS_DIAG__={
    sequence:0,appRenders:0,productionRenders:0,materialsRenders:0,rowRenders:0,
    snapshotUpdates:0,inventoryScansStarted:0,inventoryScansCompleted:0,
    ipc:[],inventoryScans:[],longTasks:[],phases:{},renderCauses:{},benchmark:[]
  };
  return window.__VYRON_MATERIALS_DIAG__;
}

function emitConfig(){for(const fn of configListeners)fn()}
export function getMaterialsDiagConfig(){return config}
export function useMaterialsDiagConfig(){
  return useSyncExternalStore(
    cb=>{configListeners.add(cb);return()=>configListeners.delete(cb)},
    ()=>config,
    ()=>config
  )
}
export function setMaterialsDiagMode(mode:MaterialsDiagMode){config={...config,mode};emitConfig()}
export function setMaterialsInventoryPaused(inventoryPaused:boolean){config={...config,inventoryPaused};emitConfig()}
export function setMaterialsSnapshotSubscription(snapshotSubscription:'full'|'isolated'){config={...config,snapshotSubscription};emitConfig()}
export function isMaterialsInventoryPaused(){return config.inventoryPaused}
export function isolatedInventorySnapshots<T extends Record<string,unknown>>(snapshots:T):T|Record<string,never>{
  return config.snapshotSubscription==='isolated'?EMPTY_SNAPSHOTS:snapshots
}

function mark(name:string){try{performance.mark(name)}catch{}}

let longTaskObserverStarted=false;
function ensureLongTaskObserver(){
  if(longTaskObserverStarted)return;
  longTaskObserverStarted=true;
  try{
    const observer=new PerformanceObserver(list=>{
      const s=state();
      for(const entry of list.getEntries()){
        if(entry.duration>=50){
          s.longTasks.push({startTime:entry.startTime,duration:entry.duration});
          if(s.longTasks.length>500)s.longTasks.splice(0,s.longTasks.length-500)
        }
      }
    });
    observer.observe({entryTypes:['longtask']});
  }catch{}
}

export function diagCount(kind:'app'|'production'|'materials'|'row'){
  const s=state();
  if(kind==='app')s.appRenders++;
  else if(kind==='production')s.productionRenders++;
  else if(kind==='materials')s.materialsRenders++;
  else s.rowRenders++;
}

export function recordInventorySnapshotMutation(){
  state().snapshotUpdates++;
}

export function beginInventoryScan(channelId:string,reason:string){
  const s=state(),now=performance.now();
  const row:InventoryScanDiag={channelId,reason,queuedAt:now,startedAt:now};
  s.inventoryScansStarted++;
  s.inventoryScans.push(row);
  if(s.inventoryScans.length>500)s.inventoryScans.splice(0,s.inventoryScans.length-500);
  return row
}
export function finishInventoryScan(row:InventoryScanDiag){
  row.endedAt=performance.now();row.duration=row.endedAt-row.startedAt;
  state().inventoryScansCompleted++;
}

export function beginMaterialsDiagClick(from:string){
  ensureLongTaskObserver();
  const s=state(),id=++s.sequence;
  s.phases={};s.renderCauses={};
  s.click={
    id,from,startedAt:performance.now(),
    appBase:s.appRenders,productionBase:s.productionRenders,materialsBase:s.materialsRenders,rowBase:s.rowRenders,
    ipcBase:s.ipc.length,snapshotBase:s.snapshotUpdates,
    inventoryStartedBase:s.inventoryScansStarted,inventoryCompletedBase:s.inventoryScansCompleted,longTaskBase:s.longTasks.length
  };
  mark('materials-click-'+id);
}

function buildMeasurement(firstRaf:number,now:number):MaterialsDiagMeasurement|undefined{
  const s=state(),click=s.click;if(!click)return;
  const tasks=s.longTasks.slice(click.longTaskBase);
  return{
    id:click.id,mode:config.mode,inventoryPaused:config.inventoryPaused,snapshotSubscription:config.snapshotSubscription,from:click.from,
    clickToCommit:s.phases['click → React commit']||0,
    clickToRaf:firstRaf-click.startedAt,clickToNextFrame:now-click.startedAt,
    appRenders:s.appRenders-click.appBase,productionRenders:s.productionRenders-click.productionBase,
    materialsRenders:s.materialsRenders-click.materialsBase,rowRenders:s.rowRenders-click.rowBase,
    snapshotUpdates:s.snapshotUpdates-click.snapshotBase,
    inventoryScansStarted:s.inventoryScansStarted-click.inventoryStartedBase,
    inventoryScansCompleted:s.inventoryScansCompleted-click.inventoryCompletedBase,
    ipcCount:s.ipc.length-click.ipcBase,longTaskCount:tasks.length,
    largestLongTask:tasks.reduce((m,x)=>Math.max(m,x.duration),0),
    renderCauses:{...s.renderCauses},phases:{...s.phases}
  }
}

function inventorySummary(){
  const s=state(),rows=s.inventoryScans.filter(x=>typeof x.duration==='number');
  const durations=rows.map(x=>x.duration||0);
  return{
    channels:new Set(rows.map(x=>x.channelId)).size,
    totalWall:durations.reduce((a,b)=>a+b,0),
    avg:durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:0,
    slowest:durations.length?Math.max(...durations):0,
    mutations:s.snapshotUpdates
  }
}

function reportFor(m:MaterialsDiagMeasurement){
  const s=state(),inv=inventorySummary(),click=s.click;
  const ipc=click?s.ipc.slice(click.ipcBase):[];
  return[
    'VYRON MATERIALS DIAG B',
    'Mode: '+m.mode,
    'Inventory: '+(m.inventoryPaused?'PAUSED':'ON'),
    'Snapshots subscription: '+m.snapshotSubscription.toUpperCase(),
    'from: '+m.from,
    '',
    'click → commit: '+m.clickToCommit.toFixed(1)+' ms',
    'click → first RAF: '+m.clickToRaf.toFixed(1)+' ms',
    'click → next frame: '+m.clickToNextFrame.toFixed(1)+' ms',
    'App renders: '+m.appRenders,
    'ProductionOS renders: '+m.productionRenders,
    'Materials renders: '+m.materialsRenders,
    'Materials row renders: '+m.rowRenders,
    'snapshot updates: '+m.snapshotUpdates,
    'inventory scans started: '+m.inventoryScansStarted,
    'inventory scans completed: '+m.inventoryScansCompleted,
    'IPC calls: '+m.ipcCount,
    'LONG TASK >50ms: '+m.longTaskCount,
    'largest long task: '+m.largestLongTask.toFixed(1)+' ms',
    '',
    'Render causes:',
    ...Object.entries(m.renderCauses).map(([name,count])=>'  '+name+': '+count),
    'Phases:',
    ...Object.entries(m.phases).map(([name,duration])=>'  '+name+': '+duration.toFixed(1)+' ms'),
    '',
    'Inventory:',
    '  channels measured: '+inv.channels,
    '  summed scan time: '+inv.totalWall.toFixed(1)+' ms',
    '  avg scan: '+inv.avg.toFixed(1)+' ms',
    '  slowest scan: '+inv.slowest.toFixed(1)+' ms',
    '  snapshot mutations total: '+inv.mutations,
    '',
    ...ipc.slice(0,30).map(x=>'IPC '+x.command+' '+(x.duration??0).toFixed(1)+' ms '+(x.ok===false?'ERR':'OK'))
  ].join('\n')
}

export function completeMaterialsDiagOnNextPaint():Promise<MaterialsDiagMeasurement|undefined>{
  const active=state().click;if(!active)return Promise.resolve(undefined);
  return new Promise(resolve=>requestAnimationFrame(()=>{
    const firstRaf=performance.now();
    requestAnimationFrame(()=>{
      const s=state();if(!s.click||s.click.id!==active.id){resolve(undefined);return}
      const now=performance.now(),measurement=buildMeasurement(firstRaf,now);
      if(measurement){
        s.lastMeasurement=measurement;s.lastReport=reportFor(measurement);
        const el=document.getElementById('materials-diag-overlay');if(el)el.textContent=s.lastReport;
        try{localStorage.setItem('vyron:materials-diag:last',s.lastReport)}catch{}
      }
      mark('materials-first-frame-'+active.id);
      try{performance.measure('materials-click-to-frame-'+active.id,'materials-click-'+active.id,'materials-first-frame-'+active.id)}catch{}
      resolve(measurement)
    })
  }))
}

let lastProductionInputs:Record<string,unknown>|undefined;
export function recordProductionRenderInputs(inputs:Record<string,unknown>){
  const s=state(),prev=lastProductionInputs;
  if(s.click&&prev){
    for(const [name,value] of Object.entries(inputs))if(prev[name]!==value)s.renderCauses[name]=(s.renderCauses[name]||0)+1;
  }
  lastProductionInputs=inputs;
}

export function recordMaterialsDiagPhase(name:string,duration:number){state().phases[name]=duration}
export function recordMaterialsCommitBoundary(){const s=state();if(s.click)s.phases['click → React commit']=performance.now()-s.click.startedAt}

export function beginMaterialsIpc(command:string){const row:DiagIpc={command,startedAt:performance.now()};state().ipc.push(row);return row}
export function finishMaterialsIpc(row:DiagIpc,ok:boolean){row.duration=performance.now()-row.startedAt;row.ok=ok}

export function lastMaterialsDiagReport(){return state().lastReport||'VYRON MATERIALS DIAG B — waiting for benchmark/click'}
export function getLastMaterialsDiagMeasurement(){return state().lastMeasurement}
export function resetMaterialsBenchmark(){state().benchmark=[]}
export function appendMaterialsBenchmark(m:MaterialsDiagMeasurement){state().benchmark.push(m)}
export function benchmarkReport(){
  const rows=state().benchmark;if(!rows.length)return lastMaterialsDiagReport();
  const avg=(fn:(x:MaterialsDiagMeasurement)=>number)=>rows.reduce((n,x)=>n+fn(x),0)/rows.length;
  const max=(fn:(x:MaterialsDiagMeasurement)=>number)=>Math.max(...rows.map(fn));
  return[
    'VYRON MATERIALS BENCHMARK',
    'cycles: '+rows.length,
    'Mode: '+config.mode,
    'Inventory: '+(config.inventoryPaused?'PAUSED':'ON'),
    'Snapshots: '+config.snapshotSubscription.toUpperCase(),
    'avg click→commit: '+avg(x=>x.clickToCommit).toFixed(1)+' ms',
    'avg click→RAF: '+avg(x=>x.clickToRaf).toFixed(1)+' ms',
    'avg click→next frame: '+avg(x=>x.clickToNextFrame).toFixed(1)+' ms',
    'worst next frame: '+max(x=>x.clickToNextFrame).toFixed(1)+' ms',
    'avg ProductionOS renders: '+avg(x=>x.productionRenders).toFixed(1),
    'avg Materials renders: '+avg(x=>x.materialsRenders).toFixed(1),
    'avg row renders: '+avg(x=>x.rowRenders).toFixed(1),
    'snapshot updates total: '+rows.reduce((n,x)=>n+x.snapshotUpdates,0),
    'IPC total: '+rows.reduce((n,x)=>n+x.ipcCount,0),
    'largest long task: '+max(x=>x.largestLongTask).toFixed(1)+' ms',
    '',
    'LAST CYCLE',
    lastMaterialsDiagReport()
  ].join('\n')
}
export async function copyMaterialsDiagReport(){
  const text=state().benchmark.length?benchmarkReport():lastMaterialsDiagReport();
  try{await navigator.clipboard.writeText(text);return true}catch{return false}
}
