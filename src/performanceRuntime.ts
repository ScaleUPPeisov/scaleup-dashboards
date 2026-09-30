export type PerfMetricName='reactCommit'|'storeBatch'|'persistSnapshot'|'persistIpc'|'filesystemScan'|'navigation';

const LIMIT=240;
const samples:Record<PerfMetricName,number[]>={
  reactCommit:[],storeBatch:[],persistSnapshot:[],persistIpc:[],filesystemScan:[],navigation:[]
};
let navigationStartedAt=0;

export function recordPerfMetric(name:PerfMetricName,duration:number){
  if(!Number.isFinite(duration)||duration<0)return;
  const rows=samples[name];rows.push(duration);if(rows.length>LIMIT)rows.splice(0,rows.length-LIMIT);
}
export function beginNavigationPerf(){navigationStartedAt=performance.now()}
export function completeNavigationPerf(){
  if(!navigationStartedAt)return;
  recordPerfMetric('navigation',performance.now()-navigationStartedAt);
  navigationStartedAt=0;
}
function percentile(rows:number[],p:number){
  if(!rows.length)return 0;
  const sorted=[...rows].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]||0;
}
export function perfMetricStats(name:PerfMetricName){
  const rows=samples[name];
  return {
    count:rows.length,
    last:rows[rows.length-1]||0,
    avg:rows.length?rows.reduce((a,b)=>a+b,0)/rows.length:0,
    p95:percentile(rows,.95),
    max:rows.length?Math.max(...rows):0
  };
}
export function resetPerfMetrics(){
  (Object.keys(samples) as PerfMetricName[]).forEach(k=>samples[k].splice(0));
}
