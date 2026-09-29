import {youtubeQuotaUsage} from './youtubeQuota';

export const STARTUP_QUOTA_PROBE_MS=600_000;
export const STARTUP_QUOTA_TARGET_MAX=0;
export const STARTUP_QUOTA_HARD_MAX=0;
const KEY='vyron:startup-quota-probe:v1';

export type StartupQuotaProbeResult={
 startedAt:string;completedAt:string;durationMs:number;ptDate:string;
 baselineUsed:number;finalUsed:number;deltaGeneralUnits:number;
 status:'TARGET'|'ACCEPTABLE'|'FAIL'
};

let activeTimer:number|undefined;
let activeStart:StartupQuotaProbeResult|undefined;

export function classifyStartupQuotaDelta(delta:number):StartupQuotaProbeResult['status']{
 const value=Math.max(0,Math.floor(Number(delta)||0));
 return value===0?'TARGET':'FAIL'
}
export function readStartupQuotaProbe():StartupQuotaProbeResult|undefined{
 try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&typeof x.deltaGeneralUnits==='number'?x:undefined}catch{return undefined}
}
export function beginStartupQuotaProbe(durationMs=STARTUP_QUOTA_PROBE_MS){
 if(typeof window==='undefined'||activeTimer!==undefined||activeStart)return;
 const baseline=youtubeQuotaUsage(),startedAt=new Date().toISOString();
 activeStart={startedAt,completedAt:'',durationMs,ptDate:baseline.ptDate,baselineUsed:baseline.used,finalUsed:baseline.used,deltaGeneralUnits:0,status:'TARGET'};
 activeTimer=window.setTimeout(()=>{
  const current=youtubeQuotaUsage(),completedAt=new Date().toISOString();
  const sameQuotaDay=current.ptDate===activeStart!.ptDate;
  const delta=sameQuotaDay?Math.max(0,current.used-activeStart!.baselineUsed):0;
  const result:StartupQuotaProbeResult={...activeStart!,completedAt,durationMs,finalUsed:current.used,deltaGeneralUnits:delta,status:classifyStartupQuotaDelta(delta)};
  try{localStorage.setItem(KEY,JSON.stringify(result))}catch{}
  try{window.dispatchEvent(new CustomEvent('vyron:startup-quota-probe',{detail:result}))}catch{}
  activeStart=undefined;activeTimer=undefined
 },Math.max(1000,durationMs))
}
export function resetStartupQuotaProbeForTests(){
 if(activeTimer!==undefined&&typeof window!=='undefined')window.clearTimeout(activeTimer);
 activeTimer=undefined;activeStart=undefined;
 try{localStorage.removeItem(KEY)}catch{}
}
