// Authenticated Mac -> D1 production mirror. Local plans are not verified YouTube schedules.
const CHANNEL=/^UC[A-Za-z0-9_-]{22}$/, ID=/^job_[a-f0-9]{32}$/, DEVICE=/^[A-Za-z0-9_-]{3,50}$/;
const STATUS=new Set(['NEED_IMAGE','WAITING_MUSIC','READY_RENDER','RENDERING','READY_UPLOAD','UPLOADING','SCHEDULED','ERROR']);
function validIso(value){
 if(value==null)return true;
 if(typeof value!=='string'||value.length>40)return false;
 const at=Date.parse(value);return Number.isFinite(at)&&new Date(at).toISOString()===value;
}
export function validatedProductionSnapshot(raw){
 if(!raw||raw.source!=='VYRON_MAC'||!Array.isArray(raw.items)||
    raw.items.length>300||!validIso(raw.generatedAt)||raw.generatedAt==null||
    raw.truncated===true)throw new Error('INVALID_PRODUCTION_SNAPSHOT');
 const ids=new Set();
 const items=raw.items.map(item=>{
   if(!ID.test(item?.id)||!CHANNEL.test(item.channelId)||
      !STATUS.has(item.status)||typeof item.title!=='string'||item.title.length>120||
      item.scheduleSource!=='MAC_LOCAL_UNVERIFIED'||
      (item.progress!=null&&(!Number.isSafeInteger(item.progress)||item.progress<0||item.progress>100))||
      !validIso(item.plannedPublishAt)||!validIso(item.createdAt)||ids.has(item.id))
     throw new Error('INVALID_PRODUCTION_JOB');
   ids.add(item.id);
   return {id:item.id,channelId:item.channelId,status:item.status,
      title:item.title.replace(/[\u0000-\u001f\u007f]/g,' ').trim()||'Видео без названия',
      progress:item.progress??null,plannedPublishAt:item.plannedPublishAt??null,
      createdAt:item.createdAt??null,scheduleSource:'MAC_LOCAL_UNVERIFIED'};
 });
 if(Math.abs(Date.now()-Date.parse(raw.generatedAt))>86400000)
   throw new Error('PRODUCTION_SNAPSHOT_CLOCK_DRIFT');
 return {items,generatedAt:raw.generatedAt,source:'VYRON_MAC'};
}
export async function receiveProduction(env,request){
 const raw=await request.text();
 if(raw.length>160000)throw new Error('INVALID_PRODUCTION_SNAPSHOT_SIZE');
 const incoming=JSON.parse(raw);
 const deviceId=String(incoming?.deviceId||'');
 if(!DEVICE.test(deviceId))throw new Error('INVALID_PRODUCTION_DEVICE');
 const data=validatedProductionSnapshot(incoming), now=new Date().toISOString(),
   generation=crypto.randomUUID();
 const known=await env.DB.prepare('SELECT id FROM channels').all();
 const recognized=new Set((known.results||[]).map(row=>row.id));
 const items=data.items.filter(item=>recognized.has(item.channelId));
 if(items.length!==data.items.length)throw new Error('PRODUCTION_UNKNOWN_CHANNEL_IDS');
 // One JSON1 bulk UPSERT rather than 300 D1 subrequests on Workers Free.
 // WHERE 1 disambiguates SQLite's INSERT ... SELECT ... ON CONFLICT grammar.
 if(items.length){
   await env.DB.prepare(
     "INSERT INTO production_jobs(device_id,id,channel_id,status,title,progress,"+
     "planned_publish_at,created_at,schedule_source,active,generation,received_at) "+
     "SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.channelId'),"+
     "json_extract(value,'$.status'),json_extract(value,'$.title'),"+
     "json_extract(value,'$.progress'),json_extract(value,'$.plannedPublishAt'),"+
     "json_extract(value,'$.createdAt'),json_extract(value,'$.scheduleSource'),"+
     "1,?,? FROM json_each(?) WHERE 1 "+
     "ON CONFLICT(device_id,id) DO UPDATE SET "+
     "channel_id=excluded.channel_id,status=excluded.status,title=excluded.title,"+
     "progress=excluded.progress,planned_publish_at=excluded.planned_publish_at,"+
     "created_at=excluded.created_at,schedule_source=excluded.schedule_source,"+
     "active=1,generation=excluded.generation,received_at=excluded.received_at"
   ).bind(deviceId,generation,now,JSON.stringify(items)).run();
 }
 await env.DB.batch([
   env.DB.prepare("INSERT INTO production_sync(device_id,source,generation,captured_at,received_at,item_count) "+
     "VALUES(?,?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET "+
     "source=excluded.source,generation=excluded.generation,captured_at=excluded.captured_at,"+
     "received_at=excluded.received_at,item_count=excluded.item_count")
     .bind(deviceId,'VYRON_MAC',generation,data.generatedAt,now,items.length),
   env.DB.prepare("UPDATE production_jobs SET active=0 "+
     "WHERE device_id=? AND generation<>? AND active=1").bind(deviceId,generation)
 ]);
 return {accepted:items.length,unknownChannelIds:data.items.length-items.length,
   confirmedYouTubeSchedule:false,receivedAt:now};
}
export async function getProductionStatus(db){
 const [jobs,sync]=await Promise.all([
   db.prepare("SELECT device_id,id,channel_id,status,title,progress,planned_publish_at,"+
     "created_at,schedule_source,received_at FROM production_jobs WHERE active=1 "+
     "ORDER BY CASE status WHEN 'ERROR' THEN 0 WHEN 'UPLOADING' THEN 1 "+
     "WHEN 'RENDERING' THEN 2 ELSE 3 END,created_at DESC LIMIT 300").all(),
   db.prepare("SELECT device_id,source,captured_at,received_at,item_count FROM production_sync "+
     "ORDER BY received_at DESC LIMIT 20").all()
 ]);
 return {source:'VYRON_MAC',
   items:(jobs.results||[]).map(row=>({id:row.id,deviceId:row.device_id,
     channelId:row.channel_id,status:row.status,title:row.title,progress:row.progress,
     plannedPublishAt:row.planned_publish_at,createdAt:row.created_at,
     scheduleSource:'MAC_LOCAL_UNVERIFIED',updatedAt:row.received_at})),
   lastSyncAt:sync.results?.[0]?.received_at||null,
   devices:(sync.results||[]).map(row=>({id:row.device_id,capturedAt:row.captured_at,
     receivedAt:row.received_at,itemCount:row.item_count})),
   confirmedYouTubeSchedule:false};
}
