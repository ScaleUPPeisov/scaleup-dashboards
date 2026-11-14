import {save} from '@tauri-apps/plugin-dialog';
import {api,type PerformanceRuntimeSample} from './api';
import {summarizeFrameIntervals,type FrameMetrics} from './m1FrameMetrics';
import {performanceTelemetryDelta,performanceTelemetrySnapshot,type PerformanceOperation} from './performanceTelemetry';
import {readProductionPrefs} from './productionPrefs';
import {useApp} from './store';
import type {Page} from './types';
import {youtubeQuotaUsage} from './youtubeQuota';

export type OwnerPerformanceReport={
  schema:'vyron-owner-performance-v1';generatedAt:string;appVersion:string;durationMs:number;
  startup:{appReadyMs:number|null};
  navigation:{samples:number;p50Ms:number|null;p95Ms:number|null;p99Ms:number|null;worstMs:number|null;routes:Record<string,number[]>};
  frames:FrameMetrics|null;
  background:{delta:Record<PerformanceOperation,number>;totals:Record<PerformanceOperation,number>;automaticMusicIndexes:number;fullInventoryScans:number;targetedInventoryScans:number};
  runtime:{cpuAveragePercent:number|null;cpuPeakPercent:number|null;rssAverageMb:number|null;rssPeakMb:number|null;samples:number};
  disk:{workspaceConfigured:boolean;workspaceAvailable:boolean|null;workspaceIsFile:boolean|null;heavyWriteTestRun:false};
  youtube:{quotaCallsDelta:number;quotaUnitsDelta:number};
  context:{channels:number;jobs:number;platform:string;foreground:boolean};
  privacy:{sensitiveValuesIncluded:false;pathValuesIncluded:false};
  notes:string[];
};

let latest:OwnerPerformanceReport|null=null,running=false;
const subscribers=new Set<()=>void>();
const publish=()=>{for(const fn of subscribers)fn();window.dispatchEvent(new Event('vyron:owner-performance-report'))};
export const ownerPerformanceValidation={
  latest:()=>latest,
  running:()=>running,
  subscribe:(fn:()=>void)=>{subscribers.add(fn);return()=>{subscribers.delete(fn)}}
};
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function settle(frames=3){for(let i=0;i<frames;i++)await frame()}
const percentile=(values:number[],p:number)=>{if(!values.length)return null;const rows=[...values].sort((a,b)=>a-b);return rows[Math.min(rows.length-1,Math.floor((rows.length-1)*p))]};
function clickProductionTab(label:string){
  const button=[...document.querySelectorAll<HTMLButtonElement>('.productionNavThree button')].find(x=>(x.textContent||'').trim()===label);
  button?.click();return Boolean(button)
}
async function sampleRoute(page:Page,routes:Record<string,number[]>,label:string=page){
  const started=performance.now();useApp.getState().setPage(page);await settle();(routes[label]||=[]).push(performance.now()-started)
}
function summarizeRuntime(samples:PerformanceRuntimeSample[]){
  const cpu=samples.map(x=>x.cpuPercent).filter((x):x is number=>typeof x==='number'&&Number.isFinite(x));
  const rss=samples.map(x=>x.rssBytes).filter((x):x is number=>typeof x==='number'&&Number.isFinite(x)).map(x=>x/1024/1024);
  const average=(rows:number[])=>rows.length?rows.reduce((a,b)=>a+b,0)/rows.length:null;
  return{cpuAveragePercent:average(cpu),cpuPeakPercent:cpu.length?Math.max(...cpu):null,rssAverageMb:average(rss),rssPeakMb:rss.length?Math.max(...rss):null,samples:samples.length}
}

export async function runOwnerPerformanceValidation():Promise<OwnerPerformanceReport>{
  if(running)throw new Error('PERFORMANCE_CHECK_ALREADY_RUNNING');
  running=true;publish();
  const started=performance.now(),before=performanceTelemetrySnapshot(),quotaBefore=youtubeQuotaUsage(),state=useApp.getState(),originalPage=state.page;
  const routes:Record<string,number[]>={},intervals:number[]=[],nativeSamples:PerformanceRuntimeSample[]=[];
  let foreground=document.visibilityState==='visible',last:number|null=null,raf=0,sampleTimer:number|undefined;
  const capture=(now:number)=>{if(last!==null)intervals.push(now-last);last=now;raf=requestAnimationFrame(capture)};
  const onVisibility=()=>{if(document.visibilityState!=='visible')foreground=false};
  document.addEventListener('visibilitychange',onVisibility);raf=requestAnimationFrame(capture);
  const takeRuntimeSample=()=>void api.performanceRuntimeSample().then(x=>nativeSamples.push(x)).catch(()=>undefined);
  takeRuntimeSample();sampleTimer=window.setInterval(takeRuntimeSample,500);
  try{
    for(let round=0;round<2;round++){
      await sampleRoute('dashboard',routes);
      await sampleRoute('production',routes);
      for(const label of ['Обзор','Материалы','Сборка проектов']){
        const tabStarted=performance.now();if(clickProductionTab(label)){await settle();(routes[`production:${label}`]||=[]).push(performance.now()-tabStarted)}
      }
      await sampleRoute('youtube',routes);
      await sampleRoute('analytics',routes);
    }
    await sampleRoute('dashboard',routes,'idle-entry');
    await new Promise(resolve=>window.setTimeout(resolve,4_000));
    const workspace=useApp.getState().settings.workspace.trim();
    const disk=workspace?await api.localSourceStatus(workspace).catch(()=>null):null;
    try{localStorage.setItem('vyron:settings-target-tab','diagnostics')}catch{}
    await sampleRoute('settings',routes);
    const after=performanceTelemetrySnapshot(),delta=performanceTelemetryDelta(before,after),quotaAfter=youtubeQuotaUsage(),allNavigation=Object.values(routes).flat();
    latest={
      schema:'vyron-owner-performance-v1',generatedAt:new Date().toISOString(),appVersion:await api.appVersion().catch(()=>'unknown'),durationMs:performance.now()-started,
      startup:{appReadyMs:after.appReadyMs},
      navigation:{samples:allNavigation.length,p50Ms:percentile(allNavigation,.5),p95Ms:percentile(allNavigation,.95),p99Ms:percentile(allNavigation,.99),worstMs:allNavigation.length?Math.max(...allNavigation):null,routes},
      frames:summarizeFrameIntervals(intervals),
      background:{delta,totals:after.totals,automaticMusicIndexes:delta['music.index'],fullInventoryScans:delta['inventory.scanAll'],targetedInventoryScans:delta['inventory.scanChannel']},
      runtime:summarizeRuntime(nativeSamples),
      disk:{workspaceConfigured:Boolean(workspace),workspaceAvailable:disk?disk.exists&&!disk.isFile:null,workspaceIsFile:disk?.isFile??null,heavyWriteTestRun:false},
      youtube:{quotaCallsDelta:Math.max(0,quotaAfter.calls-quotaBefore.calls),quotaUnitsDelta:Math.max(0,quotaAfter.used-quotaBefore.used)},
      context:{channels:state.channels.length,jobs:state.jobs.length,platform:navigator.platform,foreground},
      privacy:{sensitiveValuesIncluded:false,pathValuesIncluded:false},
      notes:['Тест записи на HDD не запускался.','CPU/RAM недоступны на неподдерживаемой платформе и остаются null.','Физические показатели M1 действительны только при foreground=true.']
    };
    return latest
  }finally{
    cancelAnimationFrame(raf);if(sampleTimer!==undefined)window.clearInterval(sampleTimer);document.removeEventListener('visibilitychange',onVisibility);
    running=false;
    if(useApp.getState().page!=='settings'){
      try{localStorage.setItem('vyron:settings-target-tab','diagnostics')}catch{}
      useApp.getState().setPage('settings')
    }else if(originalPage==='settings')window.dispatchEvent(new CustomEvent('vyron:settings-target-tab',{detail:'diagnostics'}));
    publish()
  }
}

export async function exportOwnerPerformanceReport(report=latest){
  if(!report)throw new Error('PERFORMANCE_REPORT_NOT_READY');
  const stamp=report.generatedAt.replace(/[:.]/g,'-');
  const path=await save({title:'Экспорт диагностики производительности VYRON',defaultPath:`VYRON-performance-${stamp}.json`,filters:[{name:'JSON',extensions:['json']}]});
  if(!path)return'';
  return api.performanceDiagnosticExport(path,report)
}

