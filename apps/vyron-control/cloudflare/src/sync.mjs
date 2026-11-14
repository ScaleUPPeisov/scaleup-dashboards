import {
  baselineMilestone, chunk, crossedMilestones, pacificDay, publicCount, cronSlot, VIDEO_ID_PREFIX
} from './core.mjs';

function claimChanges(result) { return Number(result?.meta?.changes || 0); }

function getQuotaBudget(env) {
  const n = Number(env.QUOTA_DAILY_BUDGET || 200);
  if (!Number.isSafeInteger(n) || n < 1 || n > 10000) throw new Error('Invalid local quota budget');
  return n;
}

export async function reserveQuota(db, date, budget) {
  const day = pacificDay(date);
  await db.prepare('INSERT OR IGNORE INTO quota_buckets(day_pt,spent) VALUES (?,0)').bind(day).run();
  const updated = await db.prepare(
    'UPDATE quota_buckets SET spent = spent + 1 WHERE day_pt = ? AND spent < ?'
  ).bind(day,budget).run();
  if (claimChanges(updated) !== 1) throw new Error('Local YouTube quota budget exhausted');
  return day;
}

export async function runCountersSync(env, { source, slot, date = new Date(), fetchImpl = fetch, channelIds = null }) {
  const db = env.DB;
  if (!db) throw new Error('D1 binding missing');
  if (!env.YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY secret not configured');

  const now = date.toISOString();
  const claimed = await db.prepare(
    'INSERT OR IGNORE INTO sync_runs(slot,status,source,started_at) VALUES (?,\'running\',?,?)'
  ).bind(slot,source,now).run();
  if (claimChanges(claimed) !== 1) {
    const previous=await db.prepare(
      'SELECT status,source,started_at FROM sync_runs WHERE slot=?'
    ).bind(slot).first();
    const failedAt=Date.parse(previous?.started_at||'');
    const retryReady=source==='manual'&&previous?.source==='manual'&&
      previous?.status==='error'&&Number.isFinite(failedAt)&&date.getTime()-failedAt>=120000;
    if(!retryReady)return {skipped:true,reason:'slot_already_attempted'};
    const retry=await db.prepare(
      "UPDATE sync_runs SET status='running',started_at=?,ended_at=NULL,error=NULL,updated_channels=0 WHERE slot=? AND status='error'"
    ).bind(now,slot).run();
    if(claimChanges(retry)!==1)return {skipped:true,reason:'slot_already_attempted'};
  }

  let updatedChannels = 0;
  const missingChannelIds = [];
  try {
    const requestedIds=Array.isArray(channelIds)?[...new Set(channelIds)]:null;
    if(requestedIds&&(!requestedIds.length||requestedIds.length>100||
      requestedIds.some(id=>!VIDEO_ID_PREFIX.test(String(id)))))
      throw new Error('Invalid channel refresh selection');
    const knownQuery=requestedIds
      ?db.prepare('SELECT id,name,subscribers,max_milestone FROM channels WHERE id IN ('+
        requestedIds.map(()=>'?').join(',')+') ORDER BY id').bind(...requestedIds)
      :db.prepare('SELECT id,name,subscribers,max_milestone FROM channels ORDER BY id');
    const {results:known}=await knownQuery.all();
    if(!known?.length)throw new Error('No channels enrolled');
    if(requestedIds&&known.length!==requestedIds.length)
      throw new Error('Requested channel refresh selection is incomplete');
    const baselineById = new Map(known.map(ch => [ch.id,ch]));
    for (const group of chunk(known)) {
      // Reserve before sending: HTTP errors can still consume upstream quota.
      await reserveQuota(db,date,getQuotaBudget(env));
      const query = new URLSearchParams({
        part: 'snippet,statistics',
        id: group.map(ch => ch.id).join(','),
        maxResults: '50',
        key: env.YOUTUBE_API_KEY
      });
      const response = await fetchImpl('https://www.googleapis.com/youtube/v3/channels?' + query,
        { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('YouTube channels.list HTTP ' + response.status);
      const body = await response.json();
      if (!Array.isArray(body.items)) throw new Error('YouTube response missing items');
      const allowed = new Set(group.map(ch => ch.id));
      const rows = [], notices = [];
      const observedAt = new Date().toISOString();
      for (const item of body.items) {
        if (!allowed.has(item.id)) continue;
        const previous = baselineById.get(item.id);
        const statistics = item.statistics || {};
        const hidden = statistics.hiddenSubscriberCount === true;
        const subscribers = hidden ? null : publicCount(statistics.subscriberCount);
        const milestone = baselineMilestone(subscribers);
        const priorMax = previous.max_milestone == null ? null : Number(previous.max_milestone);
        const maxMilestone = milestone == null ? priorMax :
          Math.max(milestone, priorMax ?? milestone);
        const deltaMilestones = crossedMilestones(priorMax, subscribers);
        const name = String(item.snippet?.title || previous.name || item.id).slice(0,120);
        for (const m of deltaMilestones) {
          notices.push({
            id: item.id + ':' + m,
            kind: 'subscriber_milestone',
            channel_id: item.id,
            title: name + ': ' + m + ' подписчиков',
            payload_json: JSON.stringify({ milestone:m, approximate:true }),
            occurred_at: observedAt,
            received_at: observedAt
          });
        }
        rows.push({
          id: item.id, name, subscribers, views:publicCount(statistics.viewCount),
          videos:publicCount(statistics.videoCount),
          hidden_subscribers: hidden ? 1 : 0,
          max_milestone: maxMilestone,
          previous_subscribers: previous.subscribers,
          updated_at: observedAt
        });
      }
      const returnedIds=new Set(rows.map(row=>row.id));
      for(const expected of group)if(!returnedIds.has(expected.id))missingChannelIds.push(expected.id);
      if (rows.length) {
        const rowsJson = JSON.stringify(rows);
        const stmts = [
          db.prepare(`
            INSERT INTO channels (id,name,subscribers,views,videos,hidden_subscribers,
              max_milestone,previous_subscribers,updated_at)
            SELECT
              json_extract(value,'$.id'), json_extract(value,'$.name'),
              json_extract(value,'$.subscribers'), json_extract(value,'$.views'),
              json_extract(value,'$.videos'), json_extract(value,'$.hidden_subscribers'),
              json_extract(value,'$.max_milestone'),
              json_extract(value,'$.previous_subscribers'),
              json_extract(value,'$.updated_at')
            FROM json_each(?) WHERE 1
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name,subscribers=excluded.subscribers,
              views=excluded.views,videos=excluded.videos,
              hidden_subscribers=excluded.hidden_subscribers,
              max_milestone=excluded.max_milestone,
              previous_subscribers=excluded.previous_subscribers,
              updated_at=excluded.updated_at
          `).bind(rowsJson),
          db.prepare(`
            INSERT OR IGNORE INTO channel_snapshots
              (channel_id,observed_at,subscribers,views,videos)
            SELECT json_extract(value,'$.id'),json_extract(value,'$.updated_at'),
              json_extract(value,'$.subscribers'),
              json_extract(value,'$.views'),
              json_extract(value,'$.videos')
            FROM json_each(?)
          `).bind(rowsJson)
        ];
        if (notices.length) {
          stmts.push(db.prepare(`
            INSERT OR IGNORE INTO events
              (id,kind,channel_id,title,payload_json,occurred_at,received_at)
            SELECT json_extract(value,'$.id'),json_extract(value,'$.kind'),
              json_extract(value,'$.channel_id'),json_extract(value,'$.title'),
              json_extract(value,'$.payload_json'),
              json_extract(value,'$.occurred_at'),json_extract(value,'$.received_at')
            FROM json_each(?)
          `).bind(JSON.stringify(notices)));
        }
        await db.batch(stmts);
        updatedChannels += rows.length;
      }
    }
    if(missingChannelIds.length) {
      // Retry omitted IDs once as a narrow request before reporting incomplete coverage.
      const retryIds=[...new Set(missingChannelIds)];
      const stillMissing=[];
      for(const retryGroup of chunk(retryIds)) {
        await reserveQuota(db,date,getQuotaBudget(env));
        const retryQuery=new URLSearchParams({
          part:'snippet,statistics',id:retryGroup.join(','),maxResults:'50',key:env.YOUTUBE_API_KEY
        });
        const retryResponse=await fetchImpl(
          'https://www.googleapis.com/youtube/v3/channels?'+retryQuery,
          {headers:{Accept:'application/json'}}
        );
        if(!retryResponse.ok)throw new Error('YouTube channels.list HTTP '+retryResponse.status);
        const retryBody=await retryResponse.json();
        if(!Array.isArray(retryBody.items))throw new Error('YouTube response missing items');
        const allowed=new Set(retryGroup),rows=[],notices=[];
        const observedAt=new Date().toISOString();
        for(const item of retryBody.items) {
          if(!allowed.has(item.id))continue;
          const previous=baselineById.get(item.id);
          const statistics=item.statistics||{};
          const hidden=statistics.hiddenSubscriberCount===true;
          const subscribers=hidden?null:publicCount(statistics.subscriberCount);
          const milestone=baselineMilestone(subscribers);
          const priorMax=previous.max_milestone==null?null:Number(previous.max_milestone);
          const maxMilestone=milestone==null?priorMax:Math.max(milestone,priorMax??milestone);
          const name=String(item.snippet?.title||previous.name||item.id).slice(0,120);
          for(const m of crossedMilestones(priorMax,subscribers))notices.push({
            id:item.id+':'+m,kind:'subscriber_milestone',channel_id:item.id,
            title:name+': '+m+' подписчиков',
            payload_json:JSON.stringify({milestone:m,approximate:true}),
            occurred_at:observedAt,received_at:observedAt
          });
          rows.push({
            id:item.id,name,subscribers,views:publicCount(statistics.viewCount),
            videos:publicCount(statistics.videoCount),hidden_subscribers:hidden?1:0,
            max_milestone:maxMilestone,previous_subscribers:previous.subscribers,
            updated_at:observedAt
          });
        }
        if(rows.length) {
          const rowsJson=JSON.stringify(rows);
          const stmts=[
            db.prepare(`
              INSERT INTO channels (id,name,subscribers,views,videos,hidden_subscribers,
                max_milestone,previous_subscribers,updated_at)
              SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),
                json_extract(value,'$.subscribers'),json_extract(value,'$.views'),
                json_extract(value,'$.videos'),json_extract(value,'$.hidden_subscribers'),
                json_extract(value,'$.max_milestone'),json_extract(value,'$.previous_subscribers'),
                json_extract(value,'$.updated_at')
              FROM json_each(?) WHERE 1
              ON CONFLICT(id) DO UPDATE SET name=excluded.name,subscribers=excluded.subscribers,
                views=excluded.views,videos=excluded.videos,
                hidden_subscribers=excluded.hidden_subscribers,max_milestone=excluded.max_milestone,
                previous_subscribers=excluded.previous_subscribers,updated_at=excluded.updated_at
            `).bind(rowsJson),
            db.prepare(`
              INSERT OR IGNORE INTO channel_snapshots
                (channel_id,observed_at,subscribers,views,videos)
              SELECT json_extract(value,'$.id'),json_extract(value,'$.updated_at'),
                json_extract(value,'$.subscribers'),json_extract(value,'$.views'),
                json_extract(value,'$.videos') FROM json_each(?)
            `).bind(rowsJson)
          ];
          if(notices.length)stmts.push(db.prepare(`
            INSERT OR IGNORE INTO events
              (id,kind,channel_id,title,payload_json,occurred_at,received_at)
            SELECT json_extract(value,'$.id'),json_extract(value,'$.kind'),
              json_extract(value,'$.channel_id'),json_extract(value,'$.title'),
              json_extract(value,'$.payload_json'),json_extract(value,'$.occurred_at'),
              json_extract(value,'$.received_at') FROM json_each(?)
          `).bind(JSON.stringify(notices)));
          await db.batch(stmts);
          updatedChannels+=rows.length;
        }
        const returned=new Set(rows.map(row=>row.id));
        for(const id of retryGroup)if(!returned.has(id))stillMissing.push(id);
      }
      missingChannelIds.splice(0,missingChannelIds.length,...stillMissing);
    }
    if(missingChannelIds.length) {
      throw new Error('YOUTUBE_CHANNELS_INCOMPLETE: updated '+updatedChannels+'/'+known.length+
        '; missing '+missingChannelIds.length+': '+missingChannelIds.join(', '));
    }
    await db.prepare(
      "UPDATE sync_runs SET status='success', ended_at=?, updated_channels=? WHERE slot=?"
    ).bind(new Date().toISOString(),updatedChannels,slot).run();
    return { skipped:false, updatedChannels, requestedChannels:known.length, complete:true };
  } catch (error) {
    await db.prepare(
      "UPDATE sync_runs SET status='error',ended_at=?,error=?,updated_channels=? WHERE slot=?"
    ).bind(new Date().toISOString(),String(error.message).slice(0,350),updatedChannels,slot).run();
    throw error;
  }
}

export async function scheduledSync(controller, env, fetchImpl = fetch) {
  const now=new Date(controller.scheduledTime??Date.now());
  if(controller.cron==='0 * * * *') {
    // Preserve the named 07:00/22:00 Krasnoyarsk slots while using one hourly
    // Cloudflare cron trigger for the complete public-counter schedule.
    const dailyCron=now.getUTCHours()===0?'0 0 * * *':
      now.getUTCHours()===15?'0 15 * * *':null;
    const dailySlot=dailyCron?cronSlot(dailyCron,now):null;
    if(dailySlot)return runCountersSync(env,{source:'schedule',slot:dailySlot,date:now,fetchImpl});
    const slot=now.toISOString().slice(0,13)+'@hourly';
    return runCountersSync(env,{source:'hourly',slot,date:now,fetchImpl});
  }
  const slot=cronSlot(controller.cron,now);
  if(!slot)return {skipped:true,reason:'invalid_cron_or_time'};
  return runCountersSync(env,{source:'schedule',slot,date:now,fetchImpl});
}

export function manualSlot(date = new Date()) {
  // Prevent multiple manual calls inside the same 5-minute window.
  // The actual scheduled 07:00 and 22:00 slots remain independent.
  return 'manual:' + Math.floor(date.getTime() / 300000);
}
