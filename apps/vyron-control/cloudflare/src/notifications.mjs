// Owner-only notification preferences, read receipts and delivery diagnostics.
// No push endpoints, tokens or private event payloads returned to the frontend.
export const CATEGORIES=['critical','production','analytics','system','milestones'];
export const DEFAULT_PREFS=Object.freeze(Object.fromEntries(CATEGORIES.map(k=>[k,true])));
export function categoryOfKind(kind){
  if(['render_failed','upload_failed','agent_error','disk_offline','oauth_failed',
      'sync_failed','runway_critical','runway_low'].includes(kind))return 'critical';
  if(['render_started','render_progress','render_completed','upload_queued','upload_started',
      'upload_progress','upload_completed','schedule_changed'].includes(kind))return 'production';
  if(['analytics_failed','analytics_partial','analytics_recovered','quota_warning'].includes(kind))
    return 'analytics';
  if(kind==='subscriber_milestone')return 'milestones';
  return 'system';
}
export function validatePrefs(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(x=>!CATEGORIES.includes(x)))
   throw new Error('INVALID_NOTIFICATION_PREFERENCES');
 const result={...DEFAULT_PREFS};
 for(const name of CATEGORIES){
   if(Object.hasOwn(value,name)){
     if(typeof value[name]!=='boolean')throw new Error('INVALID_NOTIFICATION_PREFERENCES');
     result[name]=value[name];
   }
 }
 return result;
}
export async function readPrefs(db){
 const row=await db.prepare("SELECT categories_json FROM notification_preferences WHERE id='owner'").first();
 if(!row)return {...DEFAULT_PREFS};
 try{return validatePrefs(JSON.parse(row.categories_json));}
 catch{return {...DEFAULT_PREFS};}
}
export async function writePrefs(db,request){
 const raw=await request.text();
 if(raw.length>2048)throw new Error('INVALID_NOTIFICATION_PREFERENCES');
 const value=validatePrefs(JSON.parse(raw));
 const updatedAt=new Date().toISOString();
 await db.prepare("INSERT INTO notification_preferences(id,categories_json,updated_at) "+
   "VALUES('owner',?,?) ON CONFLICT(id) DO UPDATE SET "+
   "categories_json=excluded.categories_json,updated_at=excluded.updated_at")
   .bind(JSON.stringify(value),updatedAt).run();
 return {saved:true,categories:value,updatedAt};
}
export async function markRead(db,request){
 const raw=await request.text();
 if(raw.length>8192)throw new Error('INVALID_NOTIFICATION_READ');
 const data=JSON.parse(raw), ids=data?.eventIds;
 if(!Array.isArray(ids)||ids.length>100||
    ids.some(x=>typeof x!=='string'||x.length>120||x.length===0))
   throw new Error('INVALID_NOTIFICATION_READ');
 const at=new Date().toISOString();
 if(ids.length)await db.prepare(
   "INSERT OR IGNORE INTO notification_reads(event_id,read_at) "+
   "SELECT id,? FROM events WHERE id IN (SELECT value FROM json_each(?))"
 ).bind(at,JSON.stringify([...new Set(ids)])).run();
 return {marked:ids.length,readAt:at};
}
export async function readNotificationCenter(db){
 const [prefs,read,deliveries]=await Promise.all([
   readPrefs(db),
   db.prepare("SELECT event_id FROM notification_reads ORDER BY read_at DESC LIMIT 300").all(),
   db.prepare("SELECT event_id,status,COUNT(*) as n,MAX(updated_at) as last_at "+
     "FROM push_deliveries GROUP BY event_id,status ORDER BY last_at DESC LIMIT 300").all()
 ]);
 const status={};
 for(const row of deliveries.results||[]){
   const item=status[row.event_id]||{sent:0,failed:0,retry:0,sending:0,lastAt:null};
   item[row.status]=(item[row.status]||0)+Number(row.n||0);
   if(!item.lastAt||row.last_at>item.lastAt)item.lastAt=row.last_at;
   status[row.event_id]=item;
 }
 return {categories:prefs,readIds:(read.results||[]).map(x=>x.event_id),
   deliveries:status};
}
