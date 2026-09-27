import type {Channel,ChannelStatisticsHistory,ChannelStatisticsSnapshot,ChannelStatisticsSnapshotSource,YoutubeChannelStatistics,YoutubeProfile} from './types';

export type LinkedYoutubeChannel={channel:Channel;profile:YoutubeProfile;youtubeChannelId:string};
export type YoutubeChannelClassification={
  linked:LinkedYoutubeChannel[];
  eligible:LinkedYoutubeChannel[];
  unlinked:Channel[];
  orphans:Channel[];
  mismatched:Channel[];
  duplicates:Array<{youtubeChannelId:string;channelIds:string[];channelNames:string[]}>;
};

function text(v:unknown){return String(v||'').trim()}

export function classifyYoutubeChannels(channels:Channel[],profiles:YoutubeProfile[]):YoutubeChannelClassification{
  const byProfile=new Map(profiles.filter(p=>text(p.id)).map(p=>[p.id,p]));
  const linked:LinkedYoutubeChannel[]=[],unlinked:Channel[]=[],orphans:Channel[]=[],mismatched:Channel[]=[];
  for(const channel of channels){
    const pid=text(channel.youtubeProfileId),cid=text(channel.youtubeChannelId);
    if(!pid||!cid){unlinked.push(channel);continue}
    const profile=byProfile.get(pid);
    if(!profile){orphans.push(channel);continue}
    if(text(profile.channelId)!==cid){mismatched.push(channel);continue}
    linked.push({channel,profile,youtubeChannelId:cid});
  }
  const groups=new Map<string,LinkedYoutubeChannel[]>();
  for(const row of linked){const arr=groups.get(row.youtubeChannelId)||[];arr.push(row);groups.set(row.youtubeChannelId,arr)}
  const duplicates=[...groups.entries()].filter(([,rows])=>rows.length>1).map(([youtubeChannelId,rows])=>({youtubeChannelId,channelIds:rows.map(x=>x.channel.id),channelNames:rows.map(x=>x.channel.name)}));
  const eligible=[...groups.values()].map(rows=>rows.slice().sort((a,b)=>a.channel.id.localeCompare(b.channel.id))[0]);
  return{linked,eligible,unlinked,orphans,mismatched,duplicates};
}

function finite(value:unknown){return typeof value==='number'&&Number.isFinite(value)?value:undefined}
function normalizeSnapshotStats(stats:YoutubeChannelStatistics){
  const hidden=Boolean(stats.hiddenSubscriberCount);
  return{
    subscriberCount:hidden?undefined:finite(stats.subscriberCount??stats.subscribers),
    hiddenSubscriberCount:hidden,
    viewCount:Math.max(0,finite(stats.viewCount??stats.views)??0),
    videoCount:Math.max(0,finite(stats.videoCount??stats.videos)??0),
  };
}
function utcDay(iso:string){const d=new Date(iso);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):''}
function sameValues(a:ChannelStatisticsSnapshot,b:ChannelStatisticsSnapshot){
  return a.subscriberCount===b.subscriberCount&&a.hiddenSubscriberCount===b.hiddenSubscriberCount&&a.viewCount===b.viewCount&&a.videoCount===b.videoCount;
}
export function makeStatisticsSnapshot(channel:Channel,profile:YoutubeProfile,stats:YoutubeChannelStatistics,source:ChannelStatisticsSnapshotSource='LIVE_REFRESH',capturedAt?:string):ChannelStatisticsSnapshot{
  const at=capturedAt||stats.statisticsUpdatedAt||stats.updatedAt||new Date().toISOString(),normalized=normalizeSnapshotStats(stats);
  return{
    snapshotId:source==='MIGRATED_BASELINE'?'baseline:'+channel.id+':'+at:crypto.randomUUID(),
    channelId:channel.id,
    youtubeChannelId:text(channel.youtubeChannelId||stats.channelId),
    profileId:text(channel.youtubeProfileId||profile.id),
    capturedAt:new Date(at).toISOString(),
    ...normalized,
    source,
  };
}
export function normalizeStatisticsHistory(raw:unknown):ChannelStatisticsHistory{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return{};
  const out:ChannelStatisticsHistory={};
  for(const [channelId,value] of Object.entries(raw as Record<string,unknown>)){
    if(!Array.isArray(value))continue;
    const seen=new Set<string>(),rows:ChannelStatisticsSnapshot[]=[];
    for(const x of value as any[]){
      if(!x||typeof x!=='object')continue;
      const capturedAt=text(x.capturedAt),youtubeChannelId=text(x.youtubeChannelId),profileId=text(x.profileId),snapshotId=text(x.snapshotId);
      if(!snapshotId||!capturedAt||!youtubeChannelId||!profileId||!Number.isFinite(Date.parse(capturedAt))||seen.has(snapshotId))continue;
      const hidden=Boolean(x.hiddenSubscriberCount),viewCount=Number(x.viewCount),videoCount=Number(x.videoCount),subscriber=Number(x.subscriberCount);
      rows.push({snapshotId,channelId:text(x.channelId)||channelId,youtubeChannelId,profileId,capturedAt:new Date(capturedAt).toISOString(),subscriberCount:hidden||!Number.isFinite(subscriber)?undefined:Math.max(0,subscriber),hiddenSubscriberCount:hidden,viewCount:Number.isFinite(viewCount)?Math.max(0,viewCount):0,videoCount:Number.isFinite(videoCount)?Math.max(0,videoCount):0,source:x.source==='MIGRATED_BASELINE'?'MIGRATED_BASELINE':'LIVE_REFRESH'});
      seen.add(snapshotId);
    }
    rows.sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
    if(rows.length)out[channelId]=rows.slice(-5000);
  }
  return out;
}
export function appendStatisticsSnapshot(history:ChannelStatisticsHistory,snapshot:ChannelStatisticsSnapshot):ChannelStatisticsHistory{
  const current=(history[snapshot.channelId]||[]).slice().sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
  if(current.some(x=>x.snapshotId===snapshot.snapshotId))return history;
  const last=current.at(-1);
  if(last&&sameValues(last,snapshot)&&utcDay(last.capturedAt)===utcDay(snapshot.capturedAt))return history;
  return{...history,[snapshot.channelId]:[...current,snapshot].slice(-5000)};
}
export function migrateStatisticsBaselines(channels:Channel[],profiles:YoutubeProfile[],history:ChannelStatisticsHistory){
  let next=normalizeStatisticsHistory(history),added=0;
  const profileById=new Map(profiles.map(p=>[p.id,p]));
  for(const channel of channels){
    const stats=channel.stats,at=stats?.statisticsUpdatedAt||stats?.updatedAt,pid=text(channel.youtubeProfileId),cid=text(channel.youtubeChannelId);
    if(!stats||!at||!pid||!cid||!Number.isFinite(Date.parse(at)))continue;
    const profile=profileById.get(pid);
    if(!profile||text(profile.channelId)!==cid)continue;
    const snapshot=makeStatisticsSnapshot(channel,profile,stats,'MIGRATED_BASELINE',at);
    const before=(next[channel.id]||[]).length;
    next=appendStatisticsSnapshot(next,snapshot);
    if((next[channel.id]||[]).length>before)added++;
  }
  return{history:next,added};
}

export type StatisticsDelta={subscriberDelta?:number;viewDelta?:number;videoDelta?:number;baselineAt?:string;insufficient:boolean};
export function snapshotAtOrBefore(rows:ChannelStatisticsSnapshot[],targetMs:number){
  return rows.filter(x=>Date.parse(x.capturedAt)<=targetMs).sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt))[0];
}
export function statisticsDelta(rows:ChannelStatisticsSnapshot[],current:ChannelStatisticsSnapshot,periodMs:number,nowMs=Date.parse(current.capturedAt)):StatisticsDelta{
  const baseline=snapshotAtOrBefore(rows,nowMs-periodMs);
  if(!baseline)return{insufficient:true};
  return{
    subscriberDelta:current.hiddenSubscriberCount||baseline.hiddenSubscriberCount||current.subscriberCount==null||baseline.subscriberCount==null?undefined:current.subscriberCount-baseline.subscriberCount,
    viewDelta:current.viewCount-baseline.viewCount,
    videoDelta:current.videoCount-baseline.videoCount,
    baselineAt:baseline.capturedAt,
    insufficient:false,
  };
}
export function latestStatisticsSnapshot(rows:ChannelStatisticsSnapshot[]){return rows.slice().sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt))[0]}
export function statisticsCoverage(rows:ChannelStatisticsSnapshot[]){const ordered=rows.slice().sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));return ordered.length?{from:ordered[0].capturedAt,to:ordered.at(-1)!.capturedAt}:undefined}

export function monthBounds(year:number,monthIndex:number){
  const from=Date.UTC(year,monthIndex,1,0,0,0,0),to=Date.UTC(year,monthIndex+1,1,0,0,0,0)-1;
  return{from,to};
}
export function monthlyStatisticsSummary(rows:ChannelStatisticsSnapshot[],year:number,monthIndex:number){
  const {from,to}=monthBounds(year,monthIndex),inside=rows.filter(x=>{const t=Date.parse(x.capturedAt);return t>=from&&t<=to}).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
  if(!inside.length)return undefined;
  const first=inside[0],last=inside.at(-1)!;
  return{
    coverageFrom:first.capturedAt,coverageTo:last.capturedAt,
    startSubscribers:first.hiddenSubscriberCount?undefined:first.subscriberCount,
    endSubscribers:last.hiddenSubscriberCount?undefined:last.subscriberCount,
    subscriberChange:first.hiddenSubscriberCount||last.hiddenSubscriberCount||first.subscriberCount==null||last.subscriberCount==null?undefined:last.subscriberCount-first.subscriberCount,
    startViews:first.viewCount,endViews:last.viewCount,viewChange:last.viewCount-first.viewCount,
    startVideos:first.videoCount,endVideos:last.videoCount,videoChange:last.videoCount-first.videoCount,
    completeMonth:Date.parse(first.capturedAt)<=from+24*60*60*1000&&Date.parse(last.capturedAt)>=to-24*60*60*1000,
  };
}

export type StatisticsPeriod='today'|'yesterday'|'7d'|'30d'|'month'|'prevMonth'|'90d'|'all'|'custom';
export function statisticsPeriodRange(period:StatisticsPeriod,now=new Date(),custom?:{from?:string;to?:string}){
  const end=now.getTime(),localStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  if(period==='today')return{from:localStart,to:end};
  if(period==='yesterday')return{from:localStart-86400000,to:localStart-1};
  if(period==='7d')return{from:end-7*86400000,to:end};
  if(period==='30d')return{from:end-30*86400000,to:end};
  if(period==='90d')return{from:end-90*86400000,to:end};
  if(period==='month')return{from:new Date(now.getFullYear(),now.getMonth(),1).getTime(),to:end};
  if(period==='prevMonth')return{from:new Date(now.getFullYear(),now.getMonth()-1,1).getTime(),to:new Date(now.getFullYear(),now.getMonth(),1).getTime()-1};
  if(period==='custom'){const from=custom?.from?new Date(custom.from+'T00:00:00').getTime():0,to=custom?.to?new Date(custom.to+'T23:59:59.999').getTime():end;return{from:Number.isFinite(from)?from:0,to:Number.isFinite(to)?to:end}}
  return{from:0,to:end};
}
export function snapshotsInPeriod(rows:ChannelStatisticsSnapshot[],range:{from:number;to:number}){return rows.filter(x=>{const t=Date.parse(x.capturedAt);return t>=range.from&&t<=range.to}).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt))}
