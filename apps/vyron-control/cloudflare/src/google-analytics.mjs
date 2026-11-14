import { refreshAccessToken } from './oauth.mjs';

// Keep each Worker invocation below the Free-plan 50-subrequest ceiling.
// One profile uses: token refresh + up to 12 Analytics reports + one D1 batch.
// Three profiles plus the run claim/read/finalize remain below the limit.
const ANALYTICS_HOURS=new Set([0,15]);
const ANALYTICS_MINUTES=new Set([5,10,15,20,25,30,35,40,45,50,55]);
const BATCH_SIZE=3;
const PERIOD_DAYS=90;

function isoDay(ms){return new Date(ms).toISOString().slice(0,10);}
function n(value) {
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>=0?parsed:0;
}
function headerIndex(headers,name){return headers.indexOf(name);}
function columnHeaders(json) {
  if(!json||!Array.isArray(json.columnHeaders))throw new Error('YouTube Analytics invalid response');
  return json.columnHeaders.map(x=>typeof x==='string'?x:x?.name);
}

export function nextAnalyticsSlot(controller) {
  const date=new Date(controller.scheduledTime ?? Date.now());
  const minute=date.getUTCMinutes();
  if(!ANALYTICS_HOURS.has(date.getUTCHours())||!ANALYTICS_MINUTES.has(minute))return null;
  const krskHour=date.getUTCHours()===0?'07':'22';
  const day=isoDay(date.getTime()+7*3600*1000);
  const minuteText=String(minute).padStart(2,'0');
  return {
    slot:day+'@'+krskHour+':'+minuteText+':analytics',
    offset:(Math.floor(minute/5)-1)*BATCH_SIZE,
    date
  };
}

export function parseDailyReport(json,channelId,asOf,periodDays=PERIOD_DAYS) {
  const headers=columnHeaders(json);
  const idx=name=>headerIndex(headers,name);
  const required=['day','views','engagedViews','estimatedMinutesWatched','averageViewDuration',
    'averageViewPercentage','subscribersGained','subscribersLost','dislikes'];
  if(required.some(name=>idx(name)<0))throw new Error('YouTube Analytics missing metrics');
  const rows=(json.rows||[]).slice(-periodDays);
  let views=0,engagedViews=0,dislikes=0,watchMinutes=0,gained=0,lost=0,likes=0,comments=0,shares=0;
  let redViews=0,redWatchMinutes=0,playlistAdds=0,playlistRemoves=0,uniqueViewersSum=0,uniqueDays=0;
  let weightedSeconds=0,weightedPercent=0;
  const daily=rows.flatMap(row=>{
    const date=String(row[idx('day')]||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
    const v=n(row[idx('views')]);
    const engaged=n(row[idx('engagedViews')]);
    const dislikeCount=n(row[idx('dislikes')]);
    const w=n(row[idx('estimatedMinutesWatched')]);
    const d=n(row[idx('averageViewDuration')]);
    const p=n(row[idx('averageViewPercentage')]);
    const g=n(row[idx('subscribersGained')]);
    const l=n(row[idx('subscribersLost')]);
    const likeValue=idx('likes')<0?null:n(row[idx('likes')]);
    const commentValue=idx('comments')<0?null:n(row[idx('comments')]);
    const shareValue=idx('shares')<0?null:n(row[idx('shares')]);
    const uniqueValue=idx('uniques')<0?null:n(row[idx('uniques')]);
    const redViewValue=idx('redViews')<0?null:n(row[idx('redViews')]);
    const redMinutesValue=idx('estimatedRedMinutesWatched')<0?null:n(row[idx('estimatedRedMinutesWatched')]);
    const playlistAddValue=idx('videosAddedToPlaylists')<0?null:n(row[idx('videosAddedToPlaylists')]);
    const playlistRemoveValue=idx('videosRemovedFromPlaylists')<0?null:n(row[idx('videosRemovedFromPlaylists')]);
    views+=v;engagedViews+=engaged;dislikes+=dislikeCount;watchMinutes+=w;gained+=g;lost+=l;
    if(uniqueValue!==null){uniqueViewersSum+=uniqueValue;uniqueDays++;}
    if(redViewValue!==null)redViews+=redViewValue;
    if(redMinutesValue!==null)redWatchMinutes+=redMinutesValue;
    if(playlistAddValue!==null)playlistAdds+=playlistAddValue;
    if(playlistRemoveValue!==null)playlistRemoves+=playlistRemoveValue;
    if(likeValue!==null)likes+=likeValue;
    if(commentValue!==null)comments+=commentValue;
    if(shareValue!==null)shares+=shareValue;
    weightedSeconds+=v*d;weightedPercent+=v*p;
    return [{
      date,views:v,engagedViews:engaged,dislikes:dislikeCount,
      watchMinutes:w,averageViewDuration:d,
      averageViewPercentage:p,subscribersGained:g,subscribersLost:l,
      likes:likeValue,comments:commentValue,shares:shareValue,
      uniqueViewers:uniqueValue,redViews:redViewValue,redWatchMinutes:redMinutesValue,
      playlistAdds:playlistAddValue,playlistRemoves:playlistRemoveValue
    }];
  });
  return {
    channelId,periodDays,views,engagedViews,dislikes,watchMinutes,
    avgViewSeconds:views?weightedSeconds/views:null,
    avgViewPercentage:views?weightedPercent/views:null,
    subscribersGained:gained,subscribersLost:lost,
    uniqueViewersDailyAverage:uniqueDays?uniqueViewersSum/uniqueDays:null,
    redViews:idx('redViews')<0?null:redViews,
    redWatchMinutes:idx('estimatedRedMinutesWatched')<0?null:redWatchMinutes,
    playlistAdds:idx('videosAddedToPlaylists')<0?null:playlistAdds,
    playlistRemoves:idx('videosRemovedFromPlaylists')<0?null:playlistRemoves,
    likes:idx('likes')<0?null:likes,
    comments:idx('comments')<0?null:comments,
    shares:idx('shares')<0?null:shares,
    impressions:null,impressionCtr:null,estimatedRevenue:null,currency:null,
    daily,capturedAt:asOf,source:'GOOGLE_ANALYTICS_API'
  };
}

export function parseDimensionReport(json,dimensions,metrics) {
  const headers=columnHeaders(json);
  const dimensionNames=(Array.isArray(dimensions)?dimensions:String(dimensions).split(','))
    .map(name=>String(name).trim()).filter(Boolean);
  const metricNames=(Array.isArray(metrics)?metrics:String(metrics).split(','))
    .map(name=>String(name).trim()).filter(Boolean);
  if(dimensionNames.some(name=>headerIndex(headers,name)<0))
    throw new Error('YouTube Analytics missing report dimensions');
  if(metricNames.some(name=>headerIndex(headers,name)<0))
    throw new Error('YouTube Analytics missing report metrics');
  return (json.rows||[]).map(row=>{
    const out={};
    for(const name of dimensionNames)out[name]=String(row[headerIndex(headers,name)]??'');
    for(const name of metricNames) {
      const value=Number(row[headerIndex(headers,name)]);
      out[name]=Number.isFinite(value)
        ?(name==='relativeRetentionPerformance'?value:Math.max(0,value)):0;
    }
    return out;
  });
}

function reportParams(startDate,endDate,dimensions,metrics,sort,maxResults,filters) {
  const params=new URLSearchParams({
    ids:'channel==MINE',startDate,endDate,dimensions,metrics
  });
  if(sort)params.set('sort',sort);
  if(maxResults)params.set('maxResults',String(maxResults));
  if(filters)params.set('filters',filters);
  return params;
}
async function requestReport(token,params,fetchImpl,retryTransient=false) {
  const url='https://youtubeanalytics.googleapis.com/v2/reports?'+params;
  let response=await fetchImpl(url,{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'}
  });
  if(retryTransient&&!response.ok&&(response.status===429||response.status>=500)) {
    await new Promise(resolve=>setTimeout(resolve,250));
    response=await fetchImpl(url,{
      headers:{Authorization:'Bearer '+token,Accept:'application/json'}
    });
  }
  if(!response.ok)throw new Error('YouTube Analytics HTTP '+response.status);
  return response.json();
}
async function optionalReport(token,startDate,endDate,dimensions,metrics,fetchImpl,sort,maxResults,filters) {
  try {
    const params=reportParams(startDate,endDate,dimensions,metrics,sort,maxResults,filters);
    const json=await requestReport(token,params,fetchImpl,false);
    return {rows:parseDimensionReport(json,dimensions,metrics),error:null};
  } catch(error) {
    const match=String(error?.message||'').match(/HTTP (\d{3})/);
    return {rows:[],error:match?'HTTP '+match[1]:'REPORT_UNAVAILABLE'};
  }
}
function analyticsConfigured(env) {
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID&&env.GOOGLE_OAUTH_CLIENT_SECRET&&
    env.OAUTH_ENCRYPTION_KEY);
}

async function processBatch(env,details,fetchImpl=fetch) {
  const db=env.DB,now=details.date.toISOString();
  const claim=await db.prepare(
    "INSERT OR IGNORE INTO cloud_analytics_runs(slot,status,started_at) VALUES (?,'running',?)"
  ).bind(details.slot,now).run();
  if(Number(claim.meta?.changes)!==1)
    return {skipped:true,reason:'already_attempted',offset:details.offset};

  let done=0,errors=0,partial=0;
  try {
    const result=await db.prepare(
      "SELECT p.channel_id,p.refresh_token_cipher,c.client_id_cipher,c.client_secret_cipher " +
      "FROM google_oauth_profiles p LEFT JOIN google_oauth_client_credentials c " +
      "ON c.channel_id=p.channel_id ORDER BY p.channel_id LIMIT ? OFFSET ?"
    ).bind(BATCH_SIZE,details.offset).all();
    const end=Date.UTC(details.date.getUTCFullYear(),details.date.getUTCMonth(),
      details.date.getUTCDate()-2);
    const start=end-(PERIOD_DAYS-1)*86400000;
    const startDate=isoDay(start),endDate=isoDay(end);

    for(const profile of result.results||[]) {
      try {
        const token=await refreshAccessToken(profile,env,fetchImpl);
        const dailyParams=reportParams(startDate,endDate,'day',
          'views,engagedViews,redViews,estimatedMinutesWatched,estimatedRedMinutesWatched,'+
          'averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,'+
          'likes,dislikes,comments,shares,uniques,videosAddedToPlaylists,videosRemovedFromPlaylists','day');
        const dailyJson=await requestReport(token,dailyParams,fetchImpl,true);
        const snapshot=parseDailyReport(dailyJson,profile.channel_id,
          new Date().toISOString(),PERIOD_DAYS);

        const [topVideos,trafficSources,devices,countries,demographics,sharingServices,
          playbackLocations,operatingSystems,liveOrOnDemand,subscribedStatus]=await Promise.all([
          optionalReport(token,startDate,endDate,'video,creatorContentType',
            'views,engagedViews,redViews,estimatedMinutesWatched,estimatedRedMinutesWatched,'+
            'averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares,'+
            'videosAddedToPlaylists,videosRemovedFromPlaylists',
            fetchImpl,'-views',10),
          optionalReport(token,startDate,endDate,'insightTrafficSourceType',
            'views,estimatedMinutesWatched',fetchImpl,null,20),
          optionalReport(token,startDate,endDate,'deviceType',
            'views,estimatedMinutesWatched',fetchImpl,null,10),
          optionalReport(token,startDate,endDate,'country',
            'views,estimatedMinutesWatched',fetchImpl,null,10),
          optionalReport(token,startDate,endDate,'ageGroup,gender',
            'viewerPercentage',fetchImpl,null,20),
          optionalReport(token,startDate,endDate,'sharingService',
            'shares',fetchImpl,null,20),
          optionalReport(token,startDate,endDate,'insightPlaybackLocationType',
            'views,estimatedMinutesWatched',fetchImpl,null,20),
          optionalReport(token,startDate,endDate,'operatingSystem',
            'views,estimatedMinutesWatched',fetchImpl,null,20),
          optionalReport(token,startDate,endDate,'liveOrOnDemand',
            'views,engagedViews,estimatedMinutesWatched,averageViewDuration',fetchImpl,null,10),
          optionalReport(token,startDate,endDate,'subscribedStatus',
            'views,engagedViews,estimatedMinutesWatched,averageViewDuration',fetchImpl,null,10)
        ]);
        const topVideoId=String(topVideos.rows[0]?.video||'');
        const audienceRetention=topVideoId
          ?await optionalReport(token,startDate,endDate,'elapsedVideoTimeRatio',
            'audienceWatchRatio,relativeRetentionPerformance',fetchImpl,null,200,
            'video=='+topVideoId)
          :{rows:[],error:null};
        const reportErrors={};
        for(const [key,value] of Object.entries({
          topVideos,trafficSources,devices,countries,demographics,sharingServices,
          playbackLocations,operatingSystems,liveOrOnDemand,subscribedStatus,audienceRetention
        }))if(value.error)reportErrors[key]=value.error;
        if(Object.keys(reportErrors).length)partial++;
        const reports={
          topVideos:topVideos.rows.map(row=>({
            videoId:row.video,creatorContentType:row.creatorContentType||null,
            views:row.views,engagedViews:row.engagedViews??null,redViews:row.redViews??null,
            watchMinutes:row.estimatedMinutesWatched,
            redWatchMinutes:row.estimatedRedMinutesWatched??null,
            averageViewDuration:row.averageViewDuration??null,
            averageViewPercentage:row.averageViewPercentage??null,
            likes:row.likes??null,dislikes:row.dislikes??null,
            comments:row.comments??null,shares:row.shares??null,
            playlistAdds:row.videosAddedToPlaylists??null,
            playlistRemoves:row.videosRemovedFromPlaylists??null
          })),
          trafficSources:trafficSources.rows.map(row=>({
            source:row.insightTrafficSourceType,views:row.views,
            watchMinutes:row.estimatedMinutesWatched
          })),
          devices:devices.rows.map(row=>({
            deviceType:row.deviceType,views:row.views,
            watchMinutes:row.estimatedMinutesWatched
          })),
          countries:countries.rows.map(row=>({
            country:row.country,views:row.views,
            watchMinutes:row.estimatedMinutesWatched
          })),
          demographics:demographics.rows.map(row=>({
            ageGroup:row.ageGroup,gender:row.gender,
            viewerPercentage:row.viewerPercentage
          })),
          sharingServices:sharingServices.rows.map(row=>({
            sharingService:row.sharingService,shares:row.shares
          })),
          playbackLocations:playbackLocations.rows.map(row=>({
            playbackLocation:row.insightPlaybackLocationType,views:row.views,
            watchMinutes:row.estimatedMinutesWatched
          })),
          operatingSystems:operatingSystems.rows.map(row=>({
            operatingSystem:row.operatingSystem,views:row.views,
            watchMinutes:row.estimatedMinutesWatched
          })),
          liveOrOnDemand:liveOrOnDemand.rows.map(row=>({
            liveOrOnDemand:row.liveOrOnDemand,views:row.views,
            engagedViews:row.engagedViews,watchMinutes:row.estimatedMinutesWatched,
            averageViewDuration:row.averageViewDuration
          })),
          subscribedStatus:subscribedStatus.rows.map(row=>({
            subscribedStatus:row.subscribedStatus,views:row.views,
            engagedViews:row.engagedViews,watchMinutes:row.estimatedMinutesWatched,
            averageViewDuration:row.averageViewDuration
          })),
          audienceRetention:audienceRetention.rows.map(row=>({
            elapsedVideoTimeRatio:Number(row.elapsedVideoTimeRatio),
            audienceWatchRatio:row.audienceWatchRatio,
            relativeRetentionPerformance:row.relativeRetentionPerformance
          })),
          errors:reportErrors,
          periodDays:PERIOD_DAYS,capturedAt:snapshot.capturedAt
        };
        const receivedAt=new Date().toISOString();
        await db.batch([
          db.prepare(
            "INSERT INTO channel_analytics (channel_id,period_days,views,watch_minutes,"+
            "avg_view_seconds,avg_view_percentage,subscribers_gained,subscribers_lost,"+
            "impressions,impression_ctr,estimated_revenue,currency,daily_json,captured_at,"+
            "received_at,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "+
            "ON CONFLICT(channel_id) DO UPDATE SET period_days=excluded.period_days,"+
            "views=excluded.views,watch_minutes=excluded.watch_minutes,"+
            "avg_view_seconds=excluded.avg_view_seconds,"+
            "avg_view_percentage=excluded.avg_view_percentage,"+
            "subscribers_gained=excluded.subscribers_gained,"+
            "subscribers_lost=excluded.subscribers_lost,impressions=excluded.impressions,"+
            "impression_ctr=excluded.impression_ctr,estimated_revenue=excluded.estimated_revenue,"+
            "currency=excluded.currency,daily_json=excluded.daily_json,"+
            "captured_at=excluded.captured_at,received_at=excluded.received_at,"+
            "source=excluded.source"
          ).bind(
            snapshot.channelId,snapshot.periodDays,snapshot.views,snapshot.watchMinutes,
            snapshot.avgViewSeconds,snapshot.avgViewPercentage,snapshot.subscribersGained,
            snapshot.subscribersLost,null,null,null,null,JSON.stringify(snapshot.daily),
            snapshot.capturedAt,receivedAt,snapshot.source
          ),
          db.prepare(
            "INSERT INTO channel_analytics_reports(channel_id,reports_json,captured_at,received_at) "+
            "VALUES (?,?,?,?) ON CONFLICT(channel_id) DO UPDATE SET "+
            "reports_json=excluded.reports_json,captured_at=excluded.captured_at,"+
            "received_at=excluded.received_at"
          ).bind(profile.channel_id,JSON.stringify(reports),snapshot.capturedAt,receivedAt),
          db.prepare(
            "UPDATE google_oauth_profiles SET last_success_at=?,last_error=? WHERE channel_id=?"
          ).bind(snapshot.capturedAt,Object.keys(reportErrors).length?
            'Some Analytics breakdowns unavailable: '+Object.keys(reportErrors).join(', '):null,
            profile.channel_id)
        ]);
        done++;
      } catch(error) {
        errors++;
        await db.prepare(
          "UPDATE google_oauth_profiles SET last_error=? WHERE channel_id=?"
        ).bind(String(error.message||'Analytics refresh failed').slice(0,160),
          profile.channel_id).run();
      }
    }
    await db.prepare(
      "UPDATE cloud_analytics_runs SET status=?,ended_at=?,updated_channels=?,error=? WHERE slot=?"
    ).bind(errors?'error':'success',new Date().toISOString(),done,
      errors?errors+' channel(s) failed':partial?partial+' channel(s) have partial breakdowns':null,
      details.slot).run();
    return {
      skipped:false,updated:done,failed:errors,partial,offset:details.offset,
      batchSize:BATCH_SIZE,periodDays:PERIOD_DAYS
    };
  } catch(error) {
    await db.prepare(
      "UPDATE cloud_analytics_runs SET status='error',ended_at=?,error=? WHERE slot=?"
    ).bind(new Date().toISOString(),'Analytics batch failed',details.slot).run();
    throw error;
  }
}

export async function runAnalyticsBatch(env,controller,fetchImpl=fetch) {
  const details=nextAnalyticsSlot(controller);
  if(!details)return {skipped:true,reason:'not_an_analytics_slot'};
  if(!analyticsConfigured(env))return {skipped:true,reason:'oauth_not_configured'};
  return processBatch(env,details,fetchImpl);
}

export async function runManualAnalyticsBatch(env,requestBody={},fetchImpl=fetch) {
  const {offset,requestId}=requestBody||{};
  if(!analyticsConfigured(env))
    return {skipped:true,reason:'oauth_not_configured',updated:0,failed:0};
  const batchOffset=Number(offset);
  const request=String(requestId||'');
  if(!Number.isSafeInteger(batchOffset)||batchOffset<0||batchOffset>500||
    batchOffset%BATCH_SIZE!==0||!/^[A-Za-z0-9_-]{12,100}$/.test(request))
    throw new Error('Invalid manual Analytics batch request');
  return processBatch(env,{
    slot:'manual-analytics:'+request+':'+batchOffset,
    offset:batchOffset,date:new Date()
  },fetchImpl);
}
