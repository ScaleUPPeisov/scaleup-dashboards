// Rolling view difference from real YouTube Data API public-counter snapshots.
// This is approximate, not YouTube Analytics' hourly view metric.
const H=3600000;
export function derivePublic24hSnapshots(rows,now=new Date()){
 const byChannel=new Map();
 for(const row of Array.isArray(rows)?rows:[]){
   const at=Date.parse(row?.observed_at),views=Number(row?.views);
   if(typeof row.channel_id!=='string'||!Number.isFinite(at)||!Number.isSafeInteger(views)||views<0)
     continue;
   if(!byChannel.has(row.channel_id))byChannel.set(row.channel_id,[]);
   byChannel.get(row.channel_id).push({at,views});
 }
 const byChannelResult={},totals={views:0,covered:0,source:'PUBLIC_COUNTER_SNAPSHOT_DIFFERENCE',
   approximate:true,updatedAt:null,window:'roughly_24h',note:
   'Приблизительная разница публичных накопленных просмотров за 24 ч. Это не почасовая YouTube Analytics; при отсутствии сопоставимых снимков показатель недоступен.'};
 for(const [id,items] of byChannel){
   items.sort((a,b)=>b.at-a.at);
   const latest=items[0];
   if(latest.at>now.getTime()+H||now.getTime()-latest.at>3*H)continue;
   const earlier=items.filter(x=>{
     const delta=latest.at-x.at;
     return delta>=22*H&&delta<=26*H;
   }).sort((a,b)=>Math.abs((latest.at-a.at)-24*H)-
     Math.abs((latest.at-b.at)-24*H))[0];
   if(!earlier||latest.views<earlier.views)continue;
   const value=latest.views-earlier.views;
   byChannelResult[id]={views:value,windowHours:Math.round((latest.at-earlier.at)/H*10)/10,
     observedAt:new Date(latest.at).toISOString(),
     previousAt:new Date(earlier.at).toISOString(),source:totals.source,approximate:true};
   totals.views+=value;totals.covered++;
   if(!totals.updatedAt||latest.at>Date.parse(totals.updatedAt))
     totals.updatedAt=new Date(latest.at).toISOString();
 }
 return {byChannel:byChannelResult,summary:{...totals,value:totals.covered?totals.views:null}};
}
