import { refreshAccessToken } from './oauth.mjs';

// Workers Free caps each invocation at 50 subrequests. Keep private Analytics
// (10 Google profiles per invocation) in DIFFERENT cron minutes from public
// counters, so the 07:00/22:00 counters never share that budget.
// Each profile: refresh + analytics + D1 insert + D1 status = ~4 subrequests.
const ANALYTICS_HOURS=new Set([0,15]);
const ANALYTICS_MINUTES=new Set([5,10,15,20,25]);
const BATCH_SIZE=10;

function isoDay(ms){return new Date(ms).toISOString().slice(0,10);}
function n(value) {
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>=0?parsed:0;
}
export function nextAnalyticsSlot(controller) {
  const date=new Date(controller.scheduledTime ?? Date.now());
  if(!ANALYTICS_HOURS.has(date.getUTCHours())||
    !ANALYTICS_MINUTES.has(date.getUTCMinutes()))return null;
  const krskHour=date.getUTCHours()===0?'07':'22';
  const day=isoDay(date.getTime()+7*3600*1000);
  const minute=String(date.getUTCMinutes()).padStart(2,'0');
  return {slot:`${day}@${krskHour}:${minute}:analytics`,
    offset:(Math.floor(date.getUTCMinutes()/5)-1)*BATCH_SIZE,date};
}
export function parseDailyReport(json,channelId,asOf) {
  if(!json||!Array.isArray(json.columnHeaders))throw new Error('YouTube Analytics invalid response');
  const headers=json.columnHeaders.map(x=>x.name);
  const idx=name=>headers.indexOf(name);
  const required=['day','views','estimatedMinutesWatched','averageViewDuration',
    'averageViewPercentage','subscribersGained','subscribersLost'];
  if(required.some(name=>idx(name)<0))throw new Error('YouTube Analytics missing metrics');
  const rows=(json.rows||[]).slice(-28);
  let views=0,watchMinutes=0,gained=0,lost=0,weightedSeconds=0,weightedPercent=0;
  const daily=rows.flatMap(row=>{
    const date=String(row[idx('day')]||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
    const v=n(row[idx('views')]);
    const w=n(row[idx('estimatedMinutesWatched')]);
    const d=n(row[idx('averageViewDuration')]);
    const p=n(row[idx('averageViewPercentage')]);
    const g=n(row[idx('subscribersGained')]);
    const l=n(row[idx('subscribersLost')]);
    views+=v;watchMinutes+=w;gained+=g;lost+=l;
    weightedSeconds+=v*d;weightedPercent+=v*p;
    return [{date,views:v,watchMinutes:w,subscribersGained:g,subscribersLost:l}];
  });
  return {
    channelId,periodDays:28,views,watchMinutes,avgViewSeconds:views?weightedSeconds/views:null,
    avgViewPercentage:views?weightedPercent/views:null,
    subscribersGained:gained,subscribersLost:lost,impressions:null,impressionCtr:null,
    estimatedRevenue:null,currency:null,daily,
    capturedAt:asOf,source:'GOOGLE_ANALYTICS_API'
  };
}

export async function runAnalyticsBatch(env,controller,fetchImpl=fetch) {
  const details=nextAnalyticsSlot(controller);
  if(!details)return {skipped:true,reason:'not_an_analytics_slot'};
  if(!env.GOOGLE_OAUTH_CLIENT_ID||!env.GOOGLE_OAUTH_CLIENT_SECRET||
    !env.OAUTH_ENCRYPTION_KEY)return {skipped:true,reason:'oauth_not_configured'};
  const db=env.DB,now=details.date.toISOString();
  const claim=await db.prepare(
    "INSERT OR IGNORE INTO cloud_analytics_runs(slot,status,started_at) VALUES (?,'running',?)"
  ).bind(details.slot,now).run();
  if(Number(claim.meta?.changes)!==1)return {skipped:true,reason:'already_attempted'};
  let done=0,errors=0;
  try{
    const result=await db.prepare(`
      SELECT channel_id,refresh_token_cipher FROM google_oauth_profiles
      ORDER BY channel_id LIMIT ? OFFSET ?
    `).bind(BATCH_SIZE,details.offset).all();
    const end=Date.UTC(details.date.getUTCFullYear(),details.date.getUTCMonth(),
      details.date.getUTCDate()-2);
    const start=end-27*86400000;
    for(const profile of result.results||[]) {
      try {
        const token=await refreshAccessToken(profile,env,fetchImpl);
        const params=new URLSearchParams({
          ids:'channel=='+profile.channel_id,
          startDate:isoDay(start),endDate:isoDay(end),
          metrics:'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost',
          dimensions:'day',sort:'day'
        });
        const reply=await fetchImpl('https://youtubeanalytics.googleapis.com/v2/reports?'+params,{
          headers:{Authorization:'Bearer '+token,Accept:'application/json'}
        });
        if(!reply.ok)throw new Error('YouTube Analytics HTTP '+reply.status);
        const snapshot=parseDailyReport(await reply.json(),profile.channel_id,
          new Date().toISOString());
        await db.prepare(`
          INSERT INTO channel_analytics
            (channel_id,period_days,views,watch_minutes,avg_view_seconds,
             avg_view_percentage,subscribers_gained,subscribers_lost,
             impressions,impression_ctr,estimated_revenue,currency,daily_json,
             captured_at,received_at,source)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(channel_id) DO UPDATE SET
            period_days=excluded.period_days,views=excluded.views,
            watch_minutes=excluded.watch_minutes,
            avg_view_seconds=excluded.avg_view_seconds,
            avg_view_percentage=excluded.avg_view_percentage,
            subscribers_gained=excluded.subscribers_gained,
            subscribers_lost=excluded.subscribers_lost,
            impressions=excluded.impressions,impression_ctr=excluded.impression_ctr,
            estimated_revenue=excluded.estimated_revenue,currency=excluded.currency,
            daily_json=excluded.daily_json,captured_at=excluded.captured_at,
            received_at=excluded.received_at,source=excluded.source
        `).bind(
          snapshot.channelId,snapshot.periodDays,snapshot.views,snapshot.watchMinutes,
          snapshot.avgViewSeconds,snapshot.avgViewPercentage,
          snapshot.subscribersGained,snapshot.subscribersLost,
          null,null,null,null,JSON.stringify(snapshot.daily),snapshot.capturedAt,
          new Date().toISOString(),snapshot.source
        ).run();
        await db.prepare(`
          UPDATE google_oauth_profiles SET last_success_at=?,last_error=NULL
          WHERE channel_id=?
        `).bind(new Date().toISOString(),profile.channel_id).run();
        done++;
      }catch(error){
        errors++;
        await db.prepare(`
          UPDATE google_oauth_profiles SET last_error=? WHERE channel_id=?
        `).bind(String(error.message||'Analytics refresh failed').slice(0,160),
          profile.channel_id).run();
      }
    }
    await db.prepare(`
      UPDATE cloud_analytics_runs SET status=?,ended_at=?,
        updated_channels=?,error=? WHERE slot=?
    `).bind(errors?'error':'success',new Date().toISOString(),done,
      errors?`${errors} channel(s) failed`:null,details.slot).run();
    return {skipped:false,updated:done,failed:errors,offset:details.offset};
  }catch(error){
    await db.prepare(`
      UPDATE cloud_analytics_runs SET status='error',ended_at=?,error=? WHERE slot=?
    `).bind(new Date().toISOString(),'Analytics batch failed',details.slot).run();
    throw error;
  }
}
