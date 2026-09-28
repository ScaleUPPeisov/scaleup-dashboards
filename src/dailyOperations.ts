import type {Channel,UploadHistoryRecord} from './types';
import type {ChannelInventorySnapshot} from './renderInventoryRuntime';

export type DailyChannelOperation={
  channelId:string;channelName:string;uploadedToday:number;processedToday:boolean;dailyTarget?:number;
  targetComplete:boolean;targetRemaining?:number;lastUploadAt?:string;localReady?:number;runwayDays?:number;
  folderState:'NOT_CONFIGURED'|'AVAILABLE'|'UNAVAILABLE'|'ERROR'|'UNKNOWN';nextAction:string;
  events:UploadHistoryRecord[];
};
export type DailyOperationsSummary={
  uploadedToday:number;processedChannels:number;unprocessedChannels:number;localReady:number;emptyChannels:number;errors:number;lastUploadAt?:string;rows:DailyChannelOperation[];
};

function sameLocalDay(iso:string|undefined,now:Date){
  if(!iso)return false;const d=new Date(iso);return !Number.isNaN(d.getTime())&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()
}
function successfulToday(rows:UploadHistoryRecord[],now:Date){
  const seen=new Set<string>();const out:UploadHistoryRecord[]=[];
  for(const row of rows){
    if(row.status!=='UPLOADED'||!row.youtubeVideoId||!sameLocalDay(row.uploadedAt,now))continue;
    const key=row.youtubeVideoId||row.uploadOperationId||row.jobId;
    if(seen.has(key))continue;seen.add(key);out.push(row)
  }
  return out.sort((a,b)=>Date.parse(a.uploadedAt)-Date.parse(b.uploadedAt))
}
function folderState(channel:Channel,snapshot?:ChannelInventorySnapshot):DailyChannelOperation['folderState']{
  if(!String(channel.renderFolderPath||'').trim())return'NOT_CONFIGURED';
  if(!snapshot)return'UNKNOWN';
  if(snapshot.folderState==='ONLINE')return'AVAILABLE';
  if(snapshot.folderState==='ERROR')return'ERROR';
  return'UNAVAILABLE'
}
function nextAction(channel:Channel,snapshot:ChannelInventorySnapshot|undefined,uploadedToday:number,target:number|undefined,state:DailyChannelOperation['folderState']){
  if(state==='NOT_CONFIGURED')return'Выбрать папку Render';
  if(state==='UNAVAILABLE')return'Подключить диск / проверить Render';
  if(state==='ERROR')return'Проверить ошибку папки';
  if(state==='UNKNOWN')return'Проверить Render';
  const ready=snapshot?.readyVideos??0;
  if(ready<=0)return'Добавить видео в Render';
  if(target!==undefined){
    const left=Math.max(0,target-uploadedToday);
    if(left===0)return'Не требуется';
    return left===1?'Загрузить ещё 1 видео':`Загрузить ещё ${left} видео`
  }
  return uploadedToday>0?'Не требуется':'Загрузить сегодняшние видео'
}

export function buildDailyOperations(channels:Channel[],history:UploadHistoryRecord[],snapshots:Record<string,ChannelInventorySnapshot>,now=new Date()):DailyOperationsSummary{
  const enabled=channels.filter(c=>c.enabled!==false),today=successfulToday(history,now);
  const byChannel=new Map<string,UploadHistoryRecord[]>();
  for(const event of today){const rows=byChannel.get(event.channelId)||[];rows.push(event);byChannel.set(event.channelId,rows)}
  const rows=enabled.map(channel=>{
    const events=byChannel.get(channel.id)||[],uploadedToday=events.length,snapshot=snapshots[channel.id];
    const raw=(channel as Channel&{dailyUploadTarget?:number|null}).dailyUploadTarget;
    const dailyTarget=Number.isFinite(Number(raw))&&Number(raw)>0?Math.floor(Number(raw)):undefined;
    const state=folderState(channel,snapshot);
    return{
      channelId:channel.id,channelName:channel.name,uploadedToday,processedToday:uploadedToday>0,dailyTarget,
      targetComplete:dailyTarget!==undefined?uploadedToday>=dailyTarget:uploadedToday>0,
      targetRemaining:dailyTarget!==undefined?Math.max(0,dailyTarget-uploadedToday):undefined,
      lastUploadAt:events.at(-1)?.uploadedAt,localReady:snapshot?.readyVideos,runwayDays:snapshot?.runwayDays,
      folderState:state,nextAction:nextAction(channel,snapshot,uploadedToday,dailyTarget,state),events
    } satisfies DailyChannelOperation
  });
  const last=today.slice().sort((a,b)=>Date.parse(b.uploadedAt)-Date.parse(a.uploadedAt))[0]?.uploadedAt;
  return{
    uploadedToday:today.length,
    processedChannels:rows.filter(x=>x.processedToday).length,
    unprocessedChannels:rows.filter(x=>!x.processedToday).length,
    localReady:rows.reduce((n,x)=>n+(x.localReady||0),0),
    emptyChannels:rows.filter(x=>x.folderState==='AVAILABLE'&&x.localReady===0).length,
    errors:rows.filter(x=>x.folderState==='ERROR'||x.folderState==='UNAVAILABLE').length,
    lastUploadAt:last,rows
  }
}
