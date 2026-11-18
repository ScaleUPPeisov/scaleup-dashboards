// Read-only YouTube Data API scheduling: status.publishAt belongs to the owner.
// Incomplete paginated inventories never count as confirmed whole-channel runway.
import {refreshAccessToken} from './oauth.mjs';
const CHANNEL=/^UC[A-Za-z0-9_-]{22}$/;
const VIDEO=/^[A-Za-z0-9_-]{11}$/;
const LIMIT_PAGES=3;
const HOUR=3600000;
function dateAt(value){const n=Date.parse(value);return Number.isFinite(n)?n:NaN;}
async function youtubeGet(path,params,token,fetchImpl){
 const url='https://www.googleapis.com/youtube/v3/'+path+'?'+
   new URLSearchParams(params).toString();
 const result=await fetchImpl(url,{headers:{
   Authorization:'Bearer '+token,Accept:'application/json'
 }});
 if(!result.ok)throw new Error('SCHEDULE_API_HTTP_'+result.status);
 return result.json();
}
export async function discoverScheduledVideos(token,channelId,fetchImpl=fetch,now=new Date()){
 if(!CHANNEL.test(channelId)||typeof token!=='string'||token.length<8)
   throw new Error('INVALID_SCHEDULE_REQUEST');
 const mine=await youtubeGet('channels',{part:'contentDetails',mine:'true',maxResults:'50'},token,fetchImpl);
 const channel=(mine.items||[]).find(item=>item.id===channelId);
 if(!channel)return {status:'NOT_AUTHORIZED',complete:false,scanned:0,videos:[]};
 const playlistId=channel.contentDetails?.relatedPlaylists?.uploads;
 if(typeof playlistId!=='string'||!playlistId)
   return {status:'UPLOADS_NOT_AVAILABLE',complete:false,scanned:0,videos:[]};
 let pageToken='',scanned=0,hasMore=false,unavailableVideos=0;
 const found=new Map();
 for(let page=0;page<LIMIT_PAGES;page++){
   const query={part:'contentDetails',playlistId,maxResults:'50'};
   if(pageToken)query.pageToken=pageToken;
   const playlist=await youtubeGet('playlistItems',query,token,fetchImpl);
   const ids=[...new Set((playlist.items||[])
     .map(x=>x?.contentDetails?.videoId).filter(id=>VIDEO.test(id)))];
   scanned+=ids.length;
   if(ids.length){
     const response=await youtubeGet('videos',{
       part:'status,snippet',id:ids.join(','),maxResults:'50'
     },token,fetchImpl);
     const returned=new Set((response.items||[]).map(item=>item.id));
     unavailableVideos+=ids.filter(id=>!returned.has(id)).length;
     for(const video of response.items||[]){
       if(!ids.includes(video.id)||video.snippet?.channelId!==channelId ||
          video.status?.privacyStatus!=='private')continue;
       const at=dateAt(video.status?.publishAt);
       if(!Number.isFinite(at)||at<=now.getTime())continue;
       found.set(video.id,{videoId:video.id,publishAt:new Date(at).toISOString()});
     }
   }
   pageToken=typeof playlist.nextPageToken==='string'?playlist.nextPageToken:'';
   hasMore=Boolean(pageToken);
   if(!hasMore)break;
 }
 const complete=!hasMore&&unavailableVideos===0, videos=[...found.values()].sort((a,b)=>
   a.publishAt.localeCompare(b.publishAt));
 return {status:complete?'COMPLETE':'PARTIAL',complete,scanned,videos};
}
function slot(now){return new Date(now.getTime()+12*HOUR).toISOString();}
function reason(error){
 const raw=String(error?.message||'');
 if(/^SCHEDULE_API_HTTP_(401|403)$/.test(raw))return 'GOOGLE_ACCESS_DENIED';
 if(/^SCHEDULE_API_HTTP_429$/.test(raw))return 'GOOGLE_RATE_LIMITED';
 if(/^SCHEDULE_API_HTTP_5\d\d$/.test(raw))return 'GOOGLE_UNAVAILABLE';
 if(/^SCHEDULE_API_HTTP_/.test(raw))return 'GOOGLE_REQUEST_FAILED';
 return 'SCHEDULE_REFRESH_FAILED';
}
export async function refreshDueYouTubeSchedules(env,scheduledAt=new Date(),fetchImpl=fetch){
 if(!/^[a-fA-F0-9]{64}$/.test(String(env.OAUTH_ENCRYPTION_KEY||'')))
   return {skipped:true,reason:'oauth_not_configured'};
 const now=scheduledAt.toISOString();
 // One channel per 5-minute worker invocation: ~3 hours to refresh 33 channels.
 const row=await env.DB.prepare(
   "SELECT p.channel_id,p.channel_name,p.refresh_token_cipher,"+
   "c.client_id_cipher,c.client_secret_cipher "+
   "FROM google_oauth_profiles p LEFT JOIN google_oauth_client_credentials c "+
   "ON c.channel_id=p.channel_id LEFT JOIN channel_schedule s ON s.channel_id=p.channel_id "+
   "WHERE s.next_refresh_at IS NULL OR s.next_refresh_at<=? "+
   "ORDER BY COALESCE(s.next_refresh_at,'') ASC,p.channel_id LIMIT 1"
 ).bind(now).first();
 if(!row)return {skipped:true,reason:'all_channel_schedules_fresh'};
 const claimed=await env.DB.prepare(
   "INSERT INTO channel_schedule(channel_id,status,next_refresh_at,updated_at) "+
   "VALUES(?,'REFRESHING',?,?) ON CONFLICT(channel_id) DO UPDATE SET "+
   "status='REFRESHING',next_refresh_at=excluded.next_refresh_at,updated_at=excluded.updated_at "+
   "WHERE channel_schedule.next_refresh_at IS NULL OR channel_schedule.next_refresh_at<=?"
 ).bind(row.channel_id,new Date(scheduledAt.getTime()+5*60000).toISOString(),now,now).run();
 if(Number(claimed.meta?.changes)!==1)return {skipped:true,reason:'concurrent_schedule_refresh'};
 try{
   const token=await refreshAccessToken(row,env,fetchImpl);
   const schedule=await discoverScheduledVideos(token,row.channel_id,fetchImpl,scheduledAt);
   await env.DB.prepare(
     "UPDATE channel_schedule SET status=?,confirmed_json=?,scanned_count=?,complete=?,"+
     "captured_at=?,last_error=NULL,next_refresh_at=?,updated_at=? WHERE channel_id=?"
   ).bind(schedule.status,JSON.stringify(schedule.videos),schedule.scanned,
     schedule.complete?1:0,now,slot(scheduledAt),now,row.channel_id).run();
   return {channelId:row.channel_id,status:schedule.status,
     complete:schedule.complete,confirmedVideos:schedule.videos.length,
     nextRefreshAt:slot(scheduledAt)};
 }catch(error){
   const errorCode=reason(error);
   await env.DB.prepare(
     "UPDATE channel_schedule SET status='ERROR',last_error=?,next_refresh_at=?,"+
     "updated_at=? WHERE channel_id=?"
   ).bind(errorCode,new Date(scheduledAt.getTime()+HOUR).toISOString(),now,row.channel_id).run();
   return {channelId:row.channel_id,status:'ERROR',errorCode};
 }
}
export function scheduledContentDays(snapshot,now=new Date()){
 if(!snapshot||snapshot.status!=='COMPLETE'||snapshot.complete!==true ||
   !Number.isFinite(dateAt(snapshot.capturedAt))||
   Math.abs(now.getTime()-dateAt(snapshot.capturedAt))>24*HOUR)
   return null;
 // A complete owner-authorized uploads playlist scan confirms zero future publications as 0.
 const future=(snapshot.videos||[]).map(x=>dateAt(x.publishAt))
   .filter(n=>Number.isFinite(n)&&n>now.getTime());
 if(!future.length)return 0;
 const days=n=>{
   const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',
     year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(n));
   const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
   return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day));
 };
 return Math.max(0,Math.round((days(Math.max(...future))-days(now.getTime()))/(24*HOUR)));
}
