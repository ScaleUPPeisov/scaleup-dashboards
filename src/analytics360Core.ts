/** Strict metric math for YouTube Analytics 360. Never infer zeros from missing rows. */
export type MetricStatus='AVAILABLE'|'PARTIAL'|'NOT_AUTHORIZED'|'NOT_PROVIDED_BY_API'|'NOT_YET_COLLECTED'|'INSUFFICIENT_DATA'|'ERROR';
export type DatePoint={date:string;views:number|null;watchMinutes?:number|null;subscribersGained?:number|null;subscribersLost?:number|null};
export type ReachRow={impressions:number|null;ctrPercent:number|null};
export type MathResult={value:number|null;status:MetricStatus;observed:number;expected:number};
export function strictMetricTotal(values:readonly (number|null|undefined)[],expected=values.length):MathResult{
 const present=values.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));
 if(!present.length)return{value:null,status:'NOT_YET_COLLECTED',observed:0,expected};
 if(present.length!==expected)return{value:null,status:'PARTIAL',observed:present.length,expected};
 return{value:present.reduce((a,b)=>a+b,0),status:'AVAILABLE',observed:present.length,expected};
}
export function weightedCtrPercent(rows:readonly ReachRow[]):MathResult{
 const eligible=rows.filter((r):r is {impressions:number;ctrPercent:number}=>r.impressions!==null&&Number.isFinite(r.impressions)&&r.impressions>=0&&r.ctrPercent!==null&&Number.isFinite(r.ctrPercent));
 const totalImpressions=eligible.reduce((s,x)=>s+x.impressions,0);
 if(!rows.length||!eligible.length||!totalImpressions)return{value:null,status:'INSUFFICIENT_DATA',observed:eligible.length,expected:rows.length};
 if(eligible.length!==rows.length)return{value:null,status:'PARTIAL',observed:eligible.length,expected:rows.length};
 const totalWeighted=eligible.reduce((s,x)=>s+x.ctrPercent*x.impressions,0);
 return{value:totalWeighted/totalImpressions,status:'AVAILABLE',observed:eligible.length,expected:rows.length};
}
export function compareExactWindows(current:readonly DatePoint[],previous:readonly DatePoint[],days:number):{delta:number|null;percent:number|null;status:MetricStatus}{
 const one=strictMetricTotal(current.map(x=>x.views),days);
 const two=strictMetricTotal(previous.map(x=>x.views),days);
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
 const startMs=start?Date.parse(start+'T00:00:00Z'):NaN;
 const endMs=end?Date.parse(end+'T00:00:00Z'):NaN;
 const expected=(endMs-startMs)/86400000+1;
 if(!Number.isInteger(expected)||expected<1||expected>20000){
   return{value:null,status:'INSUFFICIENT_DATA',observed:0,expected:0};
 }
 const seen=new Set<number>();let observed=0,total=0;
 for(const row of rows){
   const day=Date.parse(String(row.date||'')+'T00:00:00Z');
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
