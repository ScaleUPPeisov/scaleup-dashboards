from pathlib import Path
import sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.')

def replace_once(path:Path, old:str, new:str, label:str):
    s=path.read_text()
    if old not in s:
        raise SystemExit(f'{label}: anchor not found in {path}')
    if s.count(old)!=1:
        raise SystemExit(f'{label}: expected one anchor, got {s.count(old)} in {path}')
    path.write_text(s.replace(old,new,1))

# Backend: deterministic request graph: pre-read -> at most one update -> mandatory post-read verify.
yt=root/'src-tauri/src/youtube.rs'
s=yt.read_text()
start=s.index('#[tauri::command]\npub async fn youtube_update_existing_video')
end=s.index('\n#[cfg(test)]\nmod youtube_write_tests', start)
new_fn=r'''#[tauri::command]
pub async fn youtube_update_existing_video(app:AppHandle,profile_id:String,video_id:String,title:String,description:String,tags:Vec<String>,publish_at:Option<String>,privacy_status:Option<String>,operation_id:Option<String>)->Result<Value,String>{
 let (token,profile)=valid_access_token(&app,&profile_id).await?;
 if !profile.scopes.iter().any(|s|s=="https://www.googleapis.com/auth/youtube.force-ssl"||s=="https://www.googleapis.com/auth/youtube"){return Err("YouTube профиль подключён со старыми правами. Переподключи канал.".into())}
 let client=reqwest::Client::new();
 emit_youtube_api_request(&app,"videos.list",operation_id.as_deref());
 let r=client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet,status"),("id",video_id.as_str())]).send().await.map_err(|e|format!("YouTube video read: {e}"))?;
 let st=r.status();let v:Value=r.json().await.map_err(|e|e.to_string())?;if !st.is_success(){return Err(youtube_error(&v,"Не удалось перечитать видео"))}
 let item=v.get("items").and_then(|x|x.as_array()).and_then(|a|a.first()).ok_or_else(||"Видео не найдено".to_string())?;
 let sn=item.get("snippet").cloned().unwrap_or_else(||json!({}));let old_status=item.get("status").cloned().unwrap_or_else(||json!({}));
 if profile.channel_id.as_deref()!=sn.get("channelId").and_then(|x|x.as_str()){return Err(format!("BLOCK {}: video.channelId не совпадает с oauthProfile.channelId",video_id))}
 let wanted_title=youtube_clean_title(&title);if wanted_title.is_empty(){return Err("YouTube title не может быть пустым".into())}
 let wanted_desc=youtube_truncate_utf8_bytes(&description.replace(['<','>']," "),5000);let wanted_tags_vec=youtube_sanitize_tags(tags);let category=sn.get("categoryId").and_then(|x|x.as_str()).unwrap_or("10").to_string();
 let metadata_needed=!youtube_metadata_diff(&sn,&wanted_title,&wanted_desc,&wanted_tags_vec).is_empty();
 let old_privacy=old_status.get("privacyStatus").and_then(|x|x.as_str()).unwrap_or("private");
 let target_privacy=privacy_status.as_deref().filter(|x|matches!(*x,"private"|"public"|"unlisted")).unwrap_or(old_privacy).to_string();
 let publish=publish_at.as_deref().map(str::trim).filter(|x|!x.is_empty());
 let old_publish=old_status.get("publishAt").and_then(|x|x.as_str());
 let publish_changed=!same_publish_time(publish,old_publish);
 let schedule_requested=publish_changed||target_privacy!=old_privacy;
 if let Some(p)=publish{if target_privacy!="private"{return Err("Scheduled publishAt требует privacyStatus=private".into())}match chrono::DateTime::parse_from_rfc3339(p){Ok(dt)=>{if dt.with_timezone(&Utc)<=Utc::now(){return Err("Дата публикации уже в прошлом".into())}},Err(_)=>return Err("Некорректный publishAt: ожидается RFC3339".into())}}
 let schedule_needed=schedule_requested;
 if !metadata_needed&&!schedule_needed{
  return Ok(json!({"id":video_id,"verified":true,"metadataAccepted":true,"metadataVerified":true,"metadataVerifyPending":false,"scheduleRequested":false,"scheduleAccepted":true,"scheduleVerified":true,"scheduleVerifyPending":false,"scheduleError":Value::Null,"verificationError":Value::Null,"mismatches":[],"skipped":true,"appliedTags":wanted_tags_vec.len(),"actual":{"title":sn.get("title"),"description":sn.get("description"),"tags":sn.get("tags"),"publishAt":old_status.get("publishAt"),"privacyStatus":old_status.get("privacyStatus")}}))
 }
 let mut snippet=json!({"title":wanted_title,"description":wanted_desc,"tags":wanted_tags_vec,"categoryId":category});
 if let Some(x)=sn.get("defaultLanguage"){snippet["defaultLanguage"]=x.clone();}
 let desired_status=youtube_status_body(&old_status,&target_privacy,publish);
 let (part,body)=if metadata_needed&&schedule_needed{("snippet,status",json!({"id":video_id,"snippet":snippet,"status":desired_status}))}else if metadata_needed{("snippet",json!({"id":video_id,"snippet":snippet}))}else{("status",json!({"id":video_id,"status":desired_status}))};
 emit_youtube_api_request(&app,"videos.update",operation_id.as_deref());
 let u=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part",part)]).json(&body).send().await.map_err(|e|format!("YouTube update: {e}"))?;
 let ust=u.status();let uv:Value=u.json().await.unwrap_or_else(|_|json!({}));if !ust.is_success(){return Err(youtube_error(&uv,"YouTube не принял изменения"))}
 // Mandatory owner-authorized control read after every successful videos.update.
 emit_youtube_api_request(&app,"videos.list",operation_id.as_deref());
 let q=match client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet,status"),("id",video_id.as_str())]).send().await{
  Ok(x)=>x,
  Err(e)=>return Ok(json!({"id":video_id,"verified":false,"metadataAccepted":true,"metadataVerified":!metadata_needed,"metadataVerifyPending":false,"scheduleRequested":schedule_requested,"scheduleAccepted":true,"scheduleVerified":!schedule_needed,"scheduleVerifyPending":false,"scheduleError":Value::Null,"verificationError":format!("YouTube verify read: {e}"),"mismatches":["verification_read"],"skipped":false,"appliedTags":wanted_tags_vec.len()}))
 };
 let qst=q.status();let qv:Value=q.json().await.unwrap_or_else(|_|json!({}));
 if !qst.is_success(){let err=youtube_error(&qv,"YouTube не подтвердил изменение");if err.to_lowercase().contains("quotaexceeded")||err.to_lowercase().contains("daily limit"){return Err(err)}return Ok(json!({"id":video_id,"verified":false,"metadataAccepted":true,"metadataVerified":!metadata_needed,"metadataVerifyPending":false,"scheduleRequested":schedule_requested,"scheduleAccepted":true,"scheduleVerified":!schedule_needed,"scheduleVerifyPending":false,"scheduleError":Value::Null,"verificationError":err,"mismatches":["verification_read"],"skipped":false,"appliedTags":wanted_tags_vec.len()}))}
 let got=qv.get("items").and_then(|x|x.as_array()).and_then(|a|a.first());
 let Some(g)=got else{return Ok(json!({"id":video_id,"verified":false,"metadataAccepted":true,"metadataVerified":!metadata_needed,"metadataVerifyPending":false,"scheduleRequested":schedule_requested,"scheduleAccepted":true,"scheduleVerified":!schedule_needed,"scheduleVerifyPending":false,"scheduleError":Value::Null,"verificationError":"Видео отсутствует в контрольном videos.list","mismatches":["video_missing"],"skipped":false,"appliedTags":wanted_tags_vec.len()}))};
 let gsn=g.get("snippet").unwrap_or(&Value::Null);let gst=g.get("status").unwrap_or(&Value::Null);
 let metadata_diff=youtube_metadata_diff(gsn,&wanted_title,&wanted_desc,&wanted_tags_vec);let metadata_verified=metadata_diff.is_empty();
 let time_ok=same_publish_time(publish,gst.get("publishAt").and_then(|x|x.as_str()));let privacy_ok=gst.get("privacyStatus").and_then(|x|x.as_str())==Some(target_privacy.as_str());let schedule_verified=!schedule_requested||(time_ok&&privacy_ok);
 let mut mismatches=metadata_diff;if schedule_requested&&!time_ok{mismatches.push("publishAt".into())}if schedule_requested&&!privacy_ok{mismatches.push("privacyStatus".into())}
 let verified=metadata_verified&&schedule_verified;
 Ok(json!({"id":video_id,"verified":verified,"metadataAccepted":true,"metadataVerified":metadata_verified,"metadataVerifyPending":false,"scheduleRequested":schedule_requested,"scheduleAccepted":true,"scheduleVerified":schedule_verified,"scheduleVerifyPending":false,"scheduleError":if schedule_verified{Value::Null}else{json!("YouTube не подтвердил расписание/privacy")},"verificationError":if verified{Value::Null}else{json!(format!("YouTube returned different values: {}",mismatches.join(", ")))},"mismatches":mismatches,"skipped":false,"appliedTags":wanted_tags_vec.len(),"actual":{"title":gsn.get("title"),"description":gsn.get("description"),"tags":gsn.get("tags"),"publishAt":gst.get("publishAt"),"privacyStatus":gst.get("privacyStatus")}}))
}'''
yt.write_text(s[:start]+new_fn+s[end:])

# API result shape: expose exact verified state to both frontend Apply surfaces.
api=root/'src/api.ts'
old="youtubeUpdateExisting:(profileId:string,videoId:string,title:string,description:string,tags:string[],publishAt?:string,privacyStatus?:string,operationId?:string)=>ytInvoke<{id:string;verified:boolean;metadataAccepted?:boolean;metadataVerified:boolean;metadataVerifyPending?:boolean;scheduleRequested:boolean;scheduleAccepted?:boolean;scheduleVerified:boolean;scheduleVerifyPending?:boolean;scheduleError?:string|null;skipped?:boolean;appliedTags?:number}>('youtube_update_existing_video',{profileId,videoId,title,description,tags,publishAt,privacyStatus,operationId}),"
new="youtubeUpdateExisting:(profileId:string,videoId:string,title:string,description:string,tags:string[],publishAt?:string,privacyStatus?:string,operationId?:string)=>ytInvoke<{id:string;verified:boolean;metadataAccepted?:boolean;metadataVerified:boolean;metadataVerifyPending?:boolean;scheduleRequested:boolean;scheduleAccepted?:boolean;scheduleVerified:boolean;scheduleVerifyPending?:boolean;scheduleError?:string|null;verificationError?:string|null;mismatches?:string[];skipped?:boolean;appliedTags?:number;actual?:{title?:string;description?:string;tags?:string[];publishAt?:string|null;privacyStatus?:string}}>('youtube_update_existing_video',{profileId,videoId,title,description,tags,publishAt,privacyStatus,operationId}),"
replace_once(api,old,new,'api result type')

# Quota: one pre-read + one update + one mandatory post-write verify per changed video.
quota=root/'src/youtubeQuota.ts'
replace_once(quota,"if(command==='youtube_update_existing_video'){if(result?.skipped)return 1;return 51}","if(command==='youtube_update_existing_video'){if(result?.skipped)return 1;return 52}",'compat quota cost')
replace_once(quota,"export const ESTIMATED_VIDEO_WRITE_UNITS=youtubeQuotaCosts['videos.list'].cost+youtubeQuotaCosts['videos.update'].cost;","export const ESTIMATED_VIDEO_WRITE_UNITS=youtubeQuotaCosts['videos.list'].cost+youtubeQuotaCosts['videos.update'].cost+youtubeQuotaCosts['videos.list'].cost;",'write units')

# Metadata Hub: include mandatory verify in preflight and never count accepted-but-unverified data as success.
meta=root/'src/MetadataPage.tsx'
replace_once(meta,
"const metadataQuotaPlan=useMemo(()=>planYoutubeQuota([{method:'videos.list',count:selectedYt.length?Math.ceil(selectedYt.length/50):0,label:'Backup выбранных видео'},{method:'videos.list',count:selectedYt.length,label:'Pre-read текущего состояния'},{method:'videos.update',count:selectedYt.length,label:'Title + description + tags + schedule'}]),[selectedYt.length,quotaRevision]);",
"const metadataQuotaPlan=useMemo(()=>planYoutubeQuota([{method:'videos.list',count:selectedYt.length?Math.ceil(selectedYt.length/50):0,label:'Backup выбранных видео'},{method:'videos.list',count:selectedYt.length,label:'Pre-read текущего состояния'},{method:'videos.update',count:selectedYt.length,label:'Title + description + tags + schedule'},{method:'videos.list',count:selectedYt.length,label:'Обязательная проверка после videos.update'}]),[selectedYt.length,quotaRevision]);",
'metadata preflight verify')
old_block="""      if(result.metadataAccepted===false){failed++;issues.push({videoId:v.id,title:v.title,phase:'metadata',error:'YouTube не принял title/description/tags'});continue}metadataOk++;let updated:YoutubeExistingVideo={...v,title,description,tags};
      if(result.scheduleRequested){scheduleTotal++;if(result.scheduleAccepted!==false){scheduleOk++;completedIds.add(v.id);updated={...updated,publishAt}}else{failed++;const err=result.scheduleError||'YouTube не принял расписание';if(isYoutubeQuotaError(err)){markYoutubeQuotaExceeded(err);pausedByQuota=true;issues.push({videoId:v.id,title:v.title,phase:'schedule',error:youtubeQuotaMessage()});cacheUpdates.push(updated);break}issues.push({videoId:v.id,title:v.title,phase:'schedule',error:err})}}
      else completedIds.add(v.id);cacheUpdates.push(updated);"""
new_block="""      const actual=result.actual;let updated:YoutubeExistingVideo=actual?{...v,title:actual.title??v.title,description:actual.description??v.description,tags:actual.tags??v.tags,publishAt:actual.publishAt??undefined,privacyStatus:actual.privacyStatus??v.privacyStatus}:{...v,title,description,tags};
      if(result.metadataAccepted===false||!result.metadataVerified){failed++;issues.push({videoId:v.id,title:v.title,phase:'metadata',error:result.verificationError||`YouTube не подтвердил metadata${result.mismatches?.length?`: ${result.mismatches.join(', ')}`:''}`});cacheUpdates.push(updated);continue}metadataOk++;
      if(result.scheduleRequested){scheduleTotal++;if(result.scheduleAccepted!==false&&result.scheduleVerified){scheduleOk++;completedIds.add(v.id)}else{failed++;const err=result.scheduleError||result.verificationError||`YouTube не подтвердил расписание${result.mismatches?.length?`: ${result.mismatches.join(', ')}`:''}`;if(isYoutubeQuotaError(err)){markYoutubeQuotaExceeded(err);pausedByQuota=true;issues.push({videoId:v.id,title:v.title,phase:'schedule',error:youtubeQuotaMessage()});cacheUpdates.push(updated);break}issues.push({videoId:v.id,title:v.title,phase:'schedule',error:err})}}
      else if(result.verified)completedIds.add(v.id);else{failed++;issues.push({videoId:v.id,title:v.title,phase:'metadata',error:result.verificationError||'YouTube не подтвердил изменение'})}cacheUpdates.push(updated);"""
replace_once(meta,old_block,new_block,'metadata verified gating')
replace_once(meta,"<p className=\"quotaContingency\">Если YouTube отклонит combined update или потребует дополнительную verify-проверку, fallback/retry calls учитываются фактически в operation ledger и показываются после операции. Они не скрываются.</p>","<p className=\"quotaContingency\">План включает backup, pre-read, один videos.update и обязательный post-update videos.list. Скрытых fallback/retry запросов внутри Apply нет.</p>",'metadata quota wording')

# Existing Videos: add deterministic quota preflight/reservation and strict result.verified gate.
ex=root/'src/ExistingVideos.tsx'
replace_once(ex,
"import {isYoutubeQuotaError,markYoutubeQuotaExceeded,youtubeQuotaMessage,youtubeQuotaState} from './youtubeQuota';",
"import {isYoutubeQuotaError,markYoutubeQuotaExceeded,planYoutubeQuota,releaseYoutubeQuotaReservation,reserveYoutubeQuota,youtubeOperationActualCost,youtubeQuotaMessage,youtubeQuotaState,youtubeQuotaUsage} from './youtubeQuota';",
'existing quota imports')
replace_once(ex,
"const changes=useMemo(()=>selected.reduce((a,v)=>{const b=baseline[v.id];if(!b)return a;if(!same(v.title,b.title))a.title++;if(!same(v.description,b.description))a.description++;if(!sameTags(v.tags,b.tags))a.tags++;if(!same(v.publishAt,b.publishAt))a.date++;if(!same(v.privacyStatus,b.privacyStatus))a.privacy++;if(v.privacyStatus==='public')a.public++;return a},{title:0,description:0,tags:0,date:0,privacy:0,public:0}),[selected,baseline]);",
"const changes=useMemo(()=>selected.reduce((a,v)=>{const b=baseline[v.id];if(!b)return a;if(!same(v.title,b.title))a.title++;if(!same(v.description,b.description))a.description++;if(!sameTags(v.tags,b.tags))a.tags++;if(!same(v.publishAt,b.publishAt))a.date++;if(!same(v.privacyStatus,b.privacyStatus))a.privacy++;if(v.privacyStatus==='public')a.public++;return a},{title:0,description:0,tags:0,date:0,privacy:0,public:0}),[selected,baseline]);\n const applyQuotaPlan=useMemo(()=>planYoutubeQuota([{method:'videos.list',count:selected.length?Math.ceil(selected.length/50):0,label:'Backup выбранных видео'},{method:'videos.list',count:selected.length,label:'Pre-read текущего состояния'},{method:'videos.update',count:selected.length,label:'Изменение выбранных видео'},{method:'videos.list',count:selected.length,label:'Обязательная проверка после videos.update'}]),[selected.length]);",
'existing quota plan')
start=ex.read_text().index(' async function apply(){')
end=ex.read_text().index('\n async function undo(){',start)
s=ex.read_text()
new_apply=r''' async function apply(){
  setConfirm(false);if(!selected.length||!profileId)return;if(youtubeQuotaState().blocked){toast(youtubeQuotaMessage());return}
  const plan=planYoutubeQuota([{method:'videos.list',count:Math.ceil(selected.length/50),label:'Backup выбранных видео'},{method:'videos.list',count:selected.length,label:'Pre-read текущего состояния'},{method:'videos.update',count:selected.length,label:'Изменение выбранных видео'},{method:'videos.list',count:selected.length,label:'Обязательная проверка после videos.update'}]);
  if(!plan.affordable){toast(`Недостаточно YouTube API quota: нужно ${plan.buckets.general.required}, доступно ${plan.buckets.general.available}`);return}
  const operationId=`existing-apply:${channelId}:${Date.now()}`;if(!reserveYoutubeQuota(operationId,plan)){toast('Quota reservation не создана. Операция не запущена.');return}
  const backup=selected.map(v=>baseline[v.id]).filter(Boolean).map(v=>({...v,tags:[...v.tags]}));setBusy(true);let ok=0;const verifiedIds=new Set<string>(),touchedIds=new Set<string>();const actualById=new Map<string,YoutubeExistingVideo>();
  try{
   const saved=await api.youtubeBackupExisting(profileId,backup,operationId);setBackupPath(saved.path||'');
   for(let i=0;i<selected.length;i++){const v=selected[i];setVideos(x=>x.map(z=>z.id===v.id?{...z,applyState:'saving',error:undefined}:z));try{
    const result=await api.youtubeUpdateExisting(profileId,v.id,v.title,v.description,v.tags,v.publishAt,v.privacyStatus,operationId);if(!result.skipped)touchedIds.add(v.id);
    const a=result.actual;const actual:YoutubeExistingVideo=a?{...v,title:a.title??v.title,description:a.description??v.description,tags:a.tags??v.tags,publishAt:a.publishAt??undefined,privacyStatus:a.privacyStatus??v.privacyStatus}:v;
    if(result.verified){ok++;verifiedIds.add(v.id);actualById.set(v.id,{...actual,tags:[...actual.tags]});setVideos(x=>x.map(z=>z.id===v.id?{...actual,selected:z.selected,applyState:'done',verified:true,error:undefined}:z));continue}
    const err=result.scheduleError||result.verificationError||`YouTube не подтвердил изменение${result.mismatches?.length?`: ${result.mismatches.join(', ')}`:''}`;
    if(isYoutubeQuotaError(err)){markYoutubeQuotaExceeded(err);const pendingIds=new Set(selected.slice(i).map(x=>x.id));setVideos(x=>x.map(z=>({...z,selected:pendingIds.has(z.id),applyState:z.id===v.id?'error':z.applyState,error:z.id===v.id?youtubeQuotaMessage():z.error})));toast(`⏸ Квота закончилась. Осталось ${pendingIds.size}; выбор сохранён.`);break}
    setVideos(x=>x.map(z=>z.id===v.id?{...actual,selected:z.selected,applyState:'error',verified:false,error:`${v.id}: ${err}`}:z));
   }catch(e){if(isYoutubeQuotaError(e)){markYoutubeQuotaExceeded(e);const pendingIds=new Set(selected.slice(i).map(x=>x.id));setVideos(x=>x.map(z=>({...z,selected:pendingIds.has(z.id),applyState:z.id===v.id?'error':z.applyState,error:z.id===v.id?youtubeQuotaMessage():z.error})));toast(`⏸ Квота закончилась. Осталось ${pendingIds.size}; выбор сохранён.`);break}setVideos(x=>x.map(z=>z.id===v.id?{...z,applyState:'error',verified:false,error:`${v.id}: ${humanizeError(e,'metadata').message}`}:z))}}
   if(touchedIds.size)setLastUndo(backup.filter(v=>touchedIds.has(v.id)));
   if(verifiedIds.size)setBaseline(prev=>{const n={...prev};for(const id of verifiedIds){const a=actualById.get(id);if(a)n[id]={...a,tags:[...a.tags]}}return n});
   if(!youtubeQuotaState().blocked){const actual=youtubeOperationActualCost(operationId),usage=youtubeQuotaUsage(),remaining=Math.max(0,usage.limit-usage.used);toast(ok===selected.length?`✓ ${ok} видео подтверждены YouTube • quota −${actual.buckets.general}, осталось ${remaining}`:`YouTube подтвердил ${ok}/${selected.length} • неподтверждённые строки оставлены с ошибкой`)}
  }catch(e){if(isYoutubeQuotaError(e)){markYoutubeQuotaExceeded(e);toast('⏸ YouTube quota: пачка сохранена для продолжения')}else toast(humanizeError(e,'metadata').message)}finally{releaseYoutubeQuotaReservation(operationId);setBusy(false)}
 }'''
ex.write_text(s[:start]+new_apply+s[end:])
replace_once(ex,
"<button className=\"primary\" disabled={busy||!selected.length||mismatch} onClick={()=>setConfirm(true)}>ОТПРАВИТЬ В YOUTUBE • {selected.length}</button>",
"<button className=\"primary\" disabled={busy||!selected.length||mismatch||!applyQuotaPlan.affordable} onClick={()=>setConfirm(true)}>ОТПРАВИТЬ В YOUTUBE • {selected.length}</button>",
'existing top button quota')
replace_once(ex,
"<p>Перед записью VYRON YT PEISOV сохранит локальный backup. После каждого videos.update будет выполнен videos.list и сравнение фактических данных YouTube.</p><footer>",
"<p>Перед записью VYRON YT PEISOV сохранит локальный backup. После каждого videos.update будет выполнен обязательный videos.list и сравнение фактических данных YouTube.</p><p><b>YouTube API quota:</b> план {applyQuotaPlan.buckets.general.required} units • доступно {applyQuotaPlan.buckets.general.available} • API calls {applyQuotaPlan.operations.reduce((n,x)=>n+x.count,0)}</p><footer>",
'existing confirm quota')
replace_once(ex,
"<button className=\"primary\" disabled={busy||mismatch} onClick={apply}>ОТПРАВИТЬ {selected.length} В YOUTUBE</button>",
"<button className=\"primary\" disabled={busy||mismatch||!applyQuotaPlan.affordable} onClick={apply}>ОТПРАВИТЬ {selected.length} В YOUTUBE</button>",
'existing modal button quota')

# Tests: quota now includes mandatory post-write verification.
qtest=root/'src/youtubeQuotaPlanner.test.ts'
replace_once(qtest,'expect(ESTIMATED_VIDEO_WRITE_UNITS).toBe(51);','expect(ESTIMATED_VIDEO_WRITE_UNITS).toBe(52);','quota test write units')
replace_once(qtest,
"const p=planYoutubeQuota([{method:'videos.list',count:30},{method:'videos.update',count:30}]);\n  expect(p.operations.find(x=>x.method==='videos.update')?.count).toBe(30);\n  expect(p.buckets.general.required).toBe(30+30*50);",
"const p=planYoutubeQuota([{method:'videos.list',count:30,label:'pre-read'},{method:'videos.update',count:30},{method:'videos.list',count:30,label:'post-write verify'}]);\n  expect(p.operations.find(x=>x.method==='videos.update')?.count).toBe(30);\n  expect(p.buckets.general.required).toBe(30+30*50+30);",
'quota test mandatory verify')

# Add source-level contract test for 2.0.10 behavior.
(root/'src/youtubeApplyVerification.test.ts').write_text("""import {describe,it,expect} from 'vitest';
import {ESTIMATED_VIDEO_WRITE_UNITS,planYoutubeQuota} from './youtubeQuota';

describe('VYRON 2.0.10 verified YouTube Apply contract',()=>{
 it('reserves pre-read + one update + mandatory post-write videos.list',()=>{
  const p=planYoutubeQuota([{method:'videos.list',count:1},{method:'videos.update',count:1},{method:'videos.list',count:1}]);
  expect(ESTIMATED_VIDEO_WRITE_UNITS).toBe(52);
  expect(p.buckets.general.required).toBe(52);
 });
});
""")

print('VYRON 2.0.10 verified Apply patch applied')
