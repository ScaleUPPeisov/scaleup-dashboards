const CHANNEL_ID=/^UC[A-Za-z0-9_-]{22}$/;
const safeNum=(v,max=1e16)=>{
  if(v==null)return null;
  const n=Number(v);
  return Number.isFinite(n)&&n>=0&&n<=max?n:null;
};
export function sanitizedAnalytics(raw) {
  if (!raw||typeof raw!=='object'||!CHANNEL_ID.test(raw.channelId||''))
    throw new Error('Invalid analytics channel ID');
  const capturedAt=new Date(raw.capturedAt);
  if (!Number.isFinite(capturedAt.getTime()))throw new Error('Invalid analytics timestamp');
  const periodDays=Number(raw.periodDays);
  if(!Number.isSafeInteger(periodDays)||periodDays<1||periodDays>365)throw new Error('Unsupported analytics period');
  const daily=Array.isArray(raw.daily) ? raw.daily.slice(-90).flatMap(row=>{
    const date=typeof row.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      ?row.date:null;
    if(!date)return [];
    return [{
      date,views:safeNum(row.views),watchMinutes:safeNum(row.watchMinutes),
      subscribersGained:safeNum(row.subscribersGained),
      subscribersLost:safeNum(row.subscribersLost)
    }];
  }):[];
  return {
    channelId:raw.channelId,periodDays,
    views:safeNum(raw.views),watchMinutes:safeNum(raw.watchMinutes),
    avgViewSeconds:safeNum(raw.avgViewSeconds),
    avgViewPercentage:safeNum(raw.avgViewPercentage,100),
    subscribersGained:safeNum(raw.subscribersGained),
    subscribersLost:safeNum(raw.subscribersLost),
    impressions:safeNum(raw.impressions),
    impressionCtr:safeNum(raw.impressionCtr,100),
    estimatedRevenue:raw.monetaryAuthorized===true?safeNum(raw.estimatedRevenue):null,
    currency:raw.monetaryAuthorized===true&&/^[A-Z]{3}$/.test(raw.currency||'')
      ?raw.currency:null,
    daily,capturedAt:capturedAt.toISOString()
  };
}
export async function saveAnalytics(env,request) {
  const body=await request.text();
  if(body.length>250000)throw new Error('Analytics payload too large');
  const raw=JSON.parse(body);
  if(!Array.isArray(raw)||raw.length>100)throw new Error('Analytics payload must be an array');
  const rows=raw.map(sanitizedAnalytics);
  const seen=new Set();
  for(const row of rows){
    if(seen.has(row.channelId))throw new Error('Duplicate analytics channel');
    seen.add(row.channelId);
  }
  const receivedAt=new Date().toISOString();
  for(let i=0;i<rows.length;i+=25){
    const chunk=rows.slice(i,i+25).map(row=>({
      ...row,dailyJson:JSON.stringify(row.daily),receivedAt
    }));
    await env.DB.prepare(`
      INSERT INTO channel_analytics
        (channel_id,period_days,views,watch_minutes,avg_view_seconds,
        avg_view_percentage,subscribers_gained,subscribers_lost,
        impressions,impression_ctr,estimated_revenue,currency,daily_json,
        captured_at,received_at,source)
      SELECT json_extract(value,'$.channelId'),
        json_extract(value,'$.periodDays'),json_extract(value,'$.views'),
        json_extract(value,'$.watchMinutes'),json_extract(value,'$.avgViewSeconds'),
        json_extract(value,'$.avgViewPercentage'),json_extract(value,'$.subscribersGained'),
        json_extract(value,'$.subscribersLost'),json_extract(value,'$.impressions'),
        json_extract(value,'$.impressionCtr'),json_extract(value,'$.estimatedRevenue'),
        json_extract(value,'$.currency'),json_extract(value,'$.dailyJson'),
        json_extract(value,'$.capturedAt'),json_extract(value,'$.receivedAt'),'VYRON_MAC_CACHE'
      FROM json_each(?) WHERE 1
      ON CONFLICT(channel_id) DO UPDATE SET
        period_days=excluded.period_days,
        views=excluded.views,watch_minutes=excluded.watch_minutes,
        avg_view_seconds=excluded.avg_view_seconds,
        avg_view_percentage=excluded.avg_view_percentage,
        subscribers_gained=excluded.subscribers_gained,
        subscribers_lost=excluded.subscribers_lost,
        impressions=excluded.impressions,
        impression_ctr=excluded.impression_ctr,
        estimated_revenue=excluded.estimated_revenue,currency=excluded.currency,
        daily_json=excluded.daily_json,captured_at=excluded.captured_at,
        received_at=excluded.received_at,source=excluded.source
      WHERE excluded.captured_at >= channel_analytics.captured_at
        AND channel_analytics.source <> 'GOOGLE_ANALYTICS_API'
    `).bind(JSON.stringify(chunk)).run();
  }
  return {accepted:rows.length,source:'VYRON_MAC_CACHE'};
}
