/** Strict metric math for YouTube Analytics 360. Never infer zeros from missing rows. */
export type MetricStatus='AVAILABLE'|'PARTIAL'|'NOT_AUTHORIZED'|'NOT_PROVIDED_BY_API'|'NOT_YET_COLLECTED'|'INSUFFICIENT_DATA'|'ERROR';
export type DatePoint={date:string;views:number|null;watchMinutes?:number|null;subscribersGained?:number|null;subscribersLost?:number|null};
export type ReachRow={impressions:number|null;ctrPercent:number|null};
export type MathResult={value:number|null;status:MetricStatus;observed:number;expected:number};
/** API omissions must not become zero or inflate shares of the known rows. */
export function breakdownMetrics(values:readonly (number|null|undefined)[]):{value:number|null;share:number|null}[]{
 const known=values.map(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null);
 const complete=known.every(v=>v!==null);
 const total=known.reduce<number>((sum,v)=>sum+(v??0),0);
 return known.map(value=>({value,share:complete&&total>0&&value!==null?value/total*100:null}));
}

export type AnalyticsRequest={channelId:string|undefined;period:string;startDate:string;endDate:string;page:number;contentType:string;sort:string;videoId:string|null;revision:number};
export function analyticsRequestKey(request:AnalyticsRequest):string{
 return JSON.stringify([request.channelId??null,request.period,
  request.period==='custom'?request.startDate:null,request.period==='custom'?request.endDate:null,
  request.page,request.contentType,request.sort,request.videoId,request.revision]);
}
/** Reject already-loaded data during the render BEFORE the next effect runs. */
export function scopedAnalyticsSnapshot<T>(loaded:{key:string;value:T}|null,currentKey:string):T|null{
 return loaded?.key===currentKey?loaded.value:null;
}

/** Date.parse normalizes impossible dates such as February 30 into March. */
function calendarDay(value:string|null|undefined):number{
 if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;
 const ms=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value?ms:NaN;
}
export function strictMetricTotal(values:readonly (number|null|undefined)[],expected=values.length):MathResult{
 if(!Number.isSafeInteger(expected)||expected<0)return{value:null,status:'ERROR',observed:0,expected};
 const present=values.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));
 if(!present.length)return{value:null,status:'NOT_YET_COLLECTED',observed:0,expected};
 // Additional or duplicate input rows do not establish complete coverage.
 if(values.length!==expected||present.length!==expected)return{value:null,status:'PARTIAL',observed:present.length,expected};
 return{value:present.reduce((a,b)=>a+b,0),status:'AVAILABLE',observed:present.length,expected};
}
export function weightedCtrPercent(rows:readonly ReachRow[]):MathResult{
 const eligible=rows.filter((r):r is {impressions:number;ctrPercent:number}=>r.impressions!==null&&Number.isFinite(r.impressions)&&r.impressions>=0&&r.ctrPercent!==null&&Number.isFinite(r.ctrPercent)&&r.ctrPercent>=0&&r.ctrPercent<=100);
 const totalImpressions=eligible.reduce((s,x)=>s+x.impressions,0);
 if(!rows.length||!eligible.length||!totalImpressions)return{value:null,status:'INSUFFICIENT_DATA',observed:eligible.length,expected:rows.length};
 if(eligible.length!==rows.length)return{value:null,status:'PARTIAL',observed:eligible.length,expected:rows.length};
 const totalWeighted=eligible.reduce((s,x)=>s+x.ctrPercent*x.impressions,0);
 return{value:totalWeighted/totalImpressions,status:'AVAILABLE',observed:eligible.length,expected:rows.length};
}
/** A row count alone cannot prove consecutive days: duplicate dates may hide a gap. */
function exactDatedWindowTotal(rows:readonly DatePoint[],days:number):MathResult{
 if(!Number.isSafeInteger(days)||days<1||days>20000||rows.length!==days)
  return{value:null,status:'INSUFFICIENT_DATA',observed:0,expected:days};
 // YouTube daily views cannot be negative; never rank corrupted observations.
 if(rows.some(row=>row.views!==null&&row.views!==undefined&&(!Number.isFinite(row.views)||row.views<0)))
  return{value:null,status:'INSUFFICIENT_DATA',observed:0,expected:days};
 const timestamps=rows.map(row=>calendarDay(row.date));
 if(timestamps.some(time=>!Number.isFinite(time)))
  return{value:null,status:'INSUFFICIENT_DATA',observed:0,expected:days};
 const first=Math.min(...timestamps),last=Math.max(...timestamps);
 if((last-first)/86400000+1!==days)
  return{value:null,status:'INSUFFICIENT_DATA',observed:0,expected:days};
 return calendarMetricTotal(rows,'views',new Date(first).toISOString().slice(0,10),new Date(last).toISOString().slice(0,10));
}
export function compareExactWindows(current:readonly DatePoint[],previous:readonly DatePoint[],days:number):{delta:number|null;percent:number|null;status:MetricStatus}{
 const one=exactDatedWindowTotal(current,days);
 const two=exactDatedWindowTotal(previous,days);
 if(one.status!=='AVAILABLE'||two.status!=='AVAILABLE'||one.value==null||two.value==null)return{delta:null,percent:null,status:'INSUFFICIENT_DATA'};
 if(two.value===0)return{delta:one.value,percent:null,status:'INSUFFICIENT_DATA'};
 return{delta:one.value-two.value,percent:(one.value-two.value)/two.value*100,status:'AVAILABLE'};
}
export function safeVideoId(id:string):boolean{return /^[a-zA-Z0-9_-]{11}$/.test(id)}
export function safeChannelId(id:string):boolean{return /^UC[a-zA-Z0-9_-]{22}$/.test(id)}

/** A complete YouTube day-series range is required before showing its total.
 * Dates omitted by API are unknown here; never silently treat them as zeros. */
export function calendarMetricTotal<T extends {date:string}>(
 rows:readonly T[],
 key:keyof T,
 start:string|null|undefined,
 end:string|null|undefined,
):MathResult{
 const startMs=calendarDay(start);
 const endMs=calendarDay(end);
 const expected=(endMs-startMs)/86400000+1;
 if(!Number.isInteger(expected)||expected<1||expected>20000){
   return{value:null,status:'INSUFFICIENT_DATA',observed:0,expected:0};
 }
 const seen=new Set<number>();let observed=0,total=0;
 for(const row of rows){
   const day=calendarDay(row.date);
   if(!Number.isFinite(day)||day<startMs||day>endMs)continue;
   if(seen.has(day))return{value:null,status:'ERROR',observed,expected};
   seen.add(day);
   const v=row[key];
   if(typeof v!=='number'||!Number.isFinite(v))continue;
   total+=v;observed++;
 }
 if(observed!==expected)return{value:null,status:observed?'PARTIAL':'NOT_YET_COLLECTED',observed,expected};
 return{value:total,status:'AVAILABLE',observed,expected};
}

/** Display-only decimation: preserve both ends and every bucket's extrema.
 * Never mutate/delete source rows. Call independently for each contiguous
 * non-null segment, so chart gaps remain gaps. */
export function decimateExtrema<T extends {v:number}>(points:readonly T[],maxSamples=640):T[]{
 const budget=Math.max(2,Math.floor(maxSamples));
 if(points.length<=budget)return [...points];
 const segments=Math.max(1,Math.floor((budget-2)/2));
 const interior=points.length-2;
 const selected=new Set<number>([0,points.length-1]);
 for(let bucket=0;bucket<segments;bucket++){
  const from=1+Math.floor(bucket*interior/segments);
  const end=1+Math.floor((bucket+1)*interior/segments);
  if(from>=end)continue;
  let min=from,max=from;
  for(let j=from+1;j<end;j++){
   if(points[j].v<points[min].v)min=j;
   if(points[j].v>points[max].v)max=j;
  }
  selected.add(min);selected.add(max);
 }
 return [...selected].sort((a,b)=>a-b).map(i=>points[i]);
}

/** Async results from one YouTube account may never overwrite a newly selected
 * account's UI, even if the older fetch completes later. */
export function acceptSelectedChannelResult(requestChannelId:string,currentChannelId:string|undefined,
 requestSequence:number,latestSequence:number):boolean{
 return Boolean(requestChannelId)&&requestChannelId===currentChannelId&&requestSequence===latestSequence;
}

