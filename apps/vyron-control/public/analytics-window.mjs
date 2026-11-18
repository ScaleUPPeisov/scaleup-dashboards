// YouTube Analytics daily reports normally trail wall clock; never pretend today is complete.
const D=86400000;
const fmt=ms=>new Date(ms).toISOString().slice(0,10);
export function analyticsDateWindow(days,now=new Date()){
 if(![7,28,90].includes(Number(days)))throw Error('INVALID_ANALYTICS_WINDOW');
 const target=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-2);
 return {start:fmt(target-(days-1)*D),end:fmt(target),days,
   source:'YOUTUBE_ANALYTICS_API_DAILY',reportDelayDays:2};
}
export function analyticsWindowCoverage(channels,window){
 let complete=0,withRows=0;
 for(const channel of Array.isArray(channels)?channels:[]){
   if(channel?.analytics?.source!=='GOOGLE_ANALYTICS_API')continue;
   const dates=new Set((channel.analytics.daily||[])
     .filter(x=>typeof x?.date==='string'&&x.date>=window.start&&x.date<=window.end)
     .map(x=>x.date));
   if(dates.size)withRows++;
   if(dates.size===window.days)complete++;
 }
 return {complete,withRows,total:(channels||[]).filter(c=>
   c?.analytics?.source==='GOOGLE_ANALYTICS_API').length};
}
