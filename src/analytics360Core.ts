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
