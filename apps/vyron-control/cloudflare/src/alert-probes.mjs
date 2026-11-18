// Deduplicated offline transition: one alert per last-good heartbeat, not a cron spam loop.
export async function detectOfflineMac(env,now=new Date()){
 const rows=await env.DB.prepare(
   "SELECT id,last_seen_at FROM devices WHERE last_seen_at IS NOT NULL LIMIT 20").all();
 const nowMs=now.getTime();
 let flagged=0;
 for(const row of rows.results||[]){
   const at=Date.parse(row.last_seen_at);
   if(!Number.isFinite(at)||at>nowMs||nowMs-at<5*60000||nowMs-at>7*86400000)continue;
   const key=new TextEncoder().encode(row.id+':'+row.last_seen_at);
   const digest=await crypto.subtle.digest('SHA-256',key);
   const id='mac_offline_'+[...new Uint8Array(digest)].slice(0,16)
      .map(x=>x.toString(16).padStart(2,'0')).join('');
   const receivedAt=now.toISOString();
   const result=await env.DB.prepare(
     "INSERT OR IGNORE INTO events(id,kind,channel_id,title,payload_json,occurred_at,received_at) "+
     "VALUES(?,'mac_offline',NULL,?,'{}',?,?)"
   ).bind(id,'Mac Bridge: нет сигнала более 5 минут',receivedAt,receivedAt).run();
   flagged+=Number(result.meta?.changes||0);
 }
 return {created:flagged};
}
