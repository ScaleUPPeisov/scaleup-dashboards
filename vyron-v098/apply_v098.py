from pathlib import Path
import json,re

ROOT=Path('.vyron-v051')
VERSION='0.9.8'
if not ROOT.is_dir(): raise SystemExit('VYRON source root missing')
package=ROOT/'package.json'
data=json.loads(package.read_text())
if data.get('version')!='0.9.7': raise SystemExit(f"Expected VYRON 0.9.7 base, got {data.get('version')}")

# ---------- Rust: schedule acceptance + eventual verification ----------
p=ROOT/'src-tauri/src/youtube.rs'
s=p.read_text()

same='''fn same_publish_time(a:Option<&str>,b:Option<&str>)->bool{match (a,b){(None,None)=>true,(Some(x),Some(y))=>chrono::DateTime::parse_from_rfc3339(x).ok().map(|d|d.timestamp())==chrono::DateTime::parse_from_rfc3339(y).ok().map(|d|d.timestamp()),_=>false}}'''
if same not in s: raise SystemExit('same_publish_time marker missing')
helper= same + '''\nfn youtube_schedule_matches(status:&Value,target_privacy:&str,publish:Option<&str>)->bool{if status.get("privacyStatus").and_then(|x|x.as_str())!=Some(target_privacy){return false}if let Some(w)=publish{return same_publish_time(Some(w),status.get("publishAt").and_then(|x|x.as_str()))}true}\n'''
s=s.replace(same,helper,1)

start=s.find(' let status_body=json!({"id":video_id,"status":youtube_status_body(&current_status,&target_privacy,publish)});')
success=s.find(' Ok(json!({"id":video_id,"verified":true,"metadataAccepted":true',start)
if start<0 or success<0: raise SystemExit('0.9.7 schedule update block not found')
line_end=s.find('\n',success)
if line_end<0: raise SystemExit('schedule success line end missing')
new=''' let status_body=json!({"id":video_id,"status":youtube_status_body(&current_status,&target_privacy,publish)});\n let su=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","status")]).json(&status_body).send().await.map_err(|e|format!("YouTube schedule update: {e}"))?;\n let sst=su.status();let sv:Value=su.json().await.unwrap_or_else(|_|json!({}));\n if !sst.is_success(){return Ok(json!({"id":video_id,"verified":false,"metadataAccepted":true,"metadataVerified":metadata_verified,"metadataVerifyPending":metadata_verify_pending,"scheduleRequested":true,"scheduleAccepted":false,"scheduleVerified":false,"scheduleVerifyPending":false,"scheduleError":youtube_error(&sv,"YouTube не принял расписание/privacy"),"appliedTags":wanted_tags_vec.len()}))}\n // HTTP 2xx from videos.update means YouTube accepted the status change. Verify from the returned resource first.\n let mut schedule_verified=youtube_schedule_matches(sv.get("status").unwrap_or(&Value::Null),&target_privacy,publish);\n // videos.list may lag behind a successful status update. Retry with backoff instead of reporting a false error.\n if !schedule_verified{for delay in [250u64,700,1500,3000,5000]{tokio::time::sleep(std::time::Duration::from_millis(delay)).await;let verify=client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","status"),("id",video_id.as_str())]).send().await.map_err(|e|format!("YouTube schedule verify: {e}"))?;let vst=verify.status();let vv:Value=verify.json().await.unwrap_or_else(|_|json!({}));if !vst.is_success(){continue}let gst=vv.pointer("/items/0/status").cloned().unwrap_or_else(||json!({}));if youtube_schedule_matches(&gst,&target_privacy,publish){schedule_verified=true;break}}}\n let schedule_verify_pending=!schedule_verified;\n Ok(json!({"id":video_id,"verified":schedule_verified,"metadataAccepted":true,"metadataVerified":metadata_verified,"metadataVerifyPending":metadata_verify_pending,"scheduleRequested":true,"scheduleAccepted":true,"scheduleVerified":schedule_verified,"scheduleVerifyPending":schedule_verify_pending,"scheduleError":Value::Null,"appliedTags":wanted_tags_vec.len()}))'''
s=s[:start]+new+s[line_end:]

# Extend existing Rust tests.
test_marker='''mod youtube_write_tests{use super::*;'''
if test_marker not in s: raise SystemExit('youtube_write_tests marker missing')
test_insert='''mod youtube_write_tests{use super::*;#[test]fn schedule_match_accepts_same_instant_with_different_offset(){let st=json!({"privacyStatus":"private","publishAt":"2026-11-07T21:00:00Z"});assert!(youtube_schedule_matches(&st,"private",Some("2026-11-08T04:00:00+07:00")));}'''
s=s.replace(test_marker,test_insert,1)
p.write_text(s)

# ---------- Frontend API type ----------
p=ROOT/'src/api.ts'; s=p.read_text()
old='metadataVerifyPending?:boolean;scheduleRequested:boolean;scheduleVerified:boolean;scheduleError?:string|null;'
new='metadataVerifyPending?:boolean;scheduleRequested:boolean;scheduleAccepted?:boolean;scheduleVerified:boolean;scheduleVerifyPending?:boolean;scheduleError?:string|null;'
if old not in s: raise SystemExit('api result type marker missing')
s=s.replace(old,new,1)
p.write_text(s)

# ---------- Metadata Hub persistent workspace ----------
p=ROOT/'src/MetadataPage.tsx'; s=p.read_text()

anchor='''const local=(iso?:string)=>{if(!iso)return '';const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};'''
if anchor not in s: raise SystemExit('MetadataPage local marker missing')
helpers='''\ntype MetadataWorkspaceDraft={rows:ImportedMetadata[];paste:string;selectedIds:string[];target:Target;order:'oldest'|'newest';limit:number;filter:ExistingFilter;docxStrict:boolean;start:string;cadence:number;sourceName:string;updatedAt:string};\nexport const metadataWorkspaceKey=(channelId:string)=>`vyron:metadata-workspace:v1:${channelId}`;\nfunction readMetadataWorkspace(channelId:string):MetadataWorkspaceDraft|undefined{if(!channelId)return undefined;try{const raw=localStorage.getItem(metadataWorkspaceKey(channelId));return raw?JSON.parse(raw) as MetadataWorkspaceDraft:undefined}catch{return undefined}}\nfunction writeMetadataWorkspace(channelId:string,draft:MetadataWorkspaceDraft){if(!channelId)return;try{localStorage.setItem(metadataWorkspaceKey(channelId),JSON.stringify(draft))}catch{}}\n'''
s=s.replace(anchor,anchor+helpers,1)

state_old="[syncStatus,setSyncStatus]=useState(''),[applyProgress,setApplyProgress]=useState(''),[applyReport,setApplyReport]=useState<ApplyReport|null>(null);const file=useRef<HTMLInputElement>(null);"
state_new="[syncStatus,setSyncStatus]=useState(''),[applyProgress,setApplyProgress]=useState(''),[applyReport,setApplyReport]=useState<ApplyReport|null>(null),[sourceName,setSourceName]=useState(''),[hydratedChannelId,setHydratedChannelId]=useState('');const file=useRef<HTMLInputElement>(null);"
if state_old not in s: raise SystemExit('MetadataPage state marker missing')
s=s.replace(state_old,state_new,1)

reset_old="useEffect(()=>{setCadence(channel?.cadenceDays||2);setYt([]);setRows([]);setDocxStrict(false);setApplyProgress('');setApplyReport(null)},[channelId]);"
reset_new="useEffect(()=>{const d=readMetadataWorkspace(channelId);setCadence(d?.cadence??channel?.cadenceDays??2);setRows(d?.rows||[]);setPaste(d?.paste||'');setTarget(d?.target||'youtube');setOrder(d?.order||'newest');setLimit(d?.limit||1000);setFilter(d?.filter||'private');setDocxStrict(Boolean(d?.docxStrict));if(d?.start)setStart(d.start);setSourceName(d?.sourceName||'');setYt([]);setApplyProgress('');setApplyReport(null);setHydratedChannelId(channelId);if(d?.rows?.length)toast(`Восстановлена рабочая сессия: ${d.rows.length} записей${d.sourceName?` • ${d.sourceName}`:''}`)},[channelId]);"
if reset_old not in s: raise SystemExit('MetadataPage reset effect marker missing')
s=s.replace(reset_old,reset_new,1)

# Remember imported source name.
needle='setRows(out);setDocxStrict(strict);toast(strict?'
if needle not in s: raise SystemExit('readFiles setRows marker missing')
s=s.replace(needle,"setRows(out);setDocxStrict(strict);setSourceName(Array.from(fl).map(f=>f.name).join(', '));toast(strict?",1)

paste_old="function parsePaste(){const out=parseMetadataFile('GPT.txt',paste);setRows(out);setDocxStrict(false);toast("
paste_new="function parsePaste(){const out=parseMetadataFile('GPT.txt',paste);setRows(out);setDocxStrict(false);setSourceName('Вставка GPT');toast("
if paste_old not in s: raise SystemExit('parsePaste marker missing')
s=s.replace(paste_old,paste_new,1)

# Preserve saved selection when YouTube data is reloaded or page is revisited.
load_old="const videos=(r.videos||[]).map(v=>({...v,selected:false}));setYt(videos);"
load_new="const saved=readMetadataWorkspace(channelId)?.selectedIds||[];const selected=new Set([...saved,...yt.filter(v=>v.selected).map(v=>v.id)]);const videos=(r.videos||[]).map(v=>({...v,selected:selected.has(v.id)}));setYt(videos);"
if load_old not in s: raise SystemExit('loadYoutube selection marker missing')
s=s.replace(load_old,load_new,1)

auto='''useEffect(()=>{if(target!=='youtube'||!profileId||yt.length)return;const t=window.setTimeout(()=>void loadYoutube(),350);return()=>window.clearTimeout(t)},[target,profileId,channelId]);'''
if auto not in s: raise SystemExit('auto load effect marker missing')
persist=auto+'''\n useEffect(()=>{if(!channelId||hydratedChannelId!==channelId)return;writeMetadataWorkspace(channelId,{rows,paste,selectedIds:yt.filter(v=>v.selected).map(v=>v.id),target,order,limit,filter,docxStrict,start,cadence,sourceName,updatedAt:new Date().toISOString()})},[channelId,hydratedChannelId,rows,paste,yt,target,order,limit,filter,docxStrict,start,cadence,sourceName]);'''
s=s.replace(auto,persist,1)

# Accepted scheduling is success; verification may remain pending briefly without a red false error.
apply_old="if(result.scheduleRequested){scheduleTotal++;if(result.scheduleVerified)scheduleOk++;else issues.push({videoId:v.id,title:v.title,phase:'schedule',error:result.scheduleError||'YouTube не подтвердил расписание'})}"
apply_new="if(result.scheduleRequested){scheduleTotal++;if(result.scheduleAccepted!==false)scheduleOk++;else issues.push({videoId:v.id,title:v.title,phase:'schedule',error:result.scheduleError||'YouTube не принял расписание'})}"
if apply_old not in s: raise SystemExit('schedule frontend decision marker missing')
s=s.replace(apply_old,apply_new,1)
p.write_text(s)

# Add regression tests for persistence key and keep existing KRAT test.
test=ROOT/'src/MetadataPage.session.test.ts'
test.write_text('''import {describe,it,expect} from 'vitest';\nimport {metadataWorkspaceKey} from './MetadataPage';\ndescribe('Metadata workspace persistence',()=>{it('uses a channel-isolated stable key',()=>{expect(metadataWorkspaceKey('channel-A')).toBe('vyron:metadata-workspace:v1:channel-A');expect(metadataWorkspaceKey('channel-A')).not.toBe(metadataWorkspaceKey('channel-B'))})});\n''')

# ---------- Version bump ----------
for rel in ['package.json','package-lock.json','src-tauri/tauri.conf.json']:
 q=ROOT/rel
 if not q.exists(): continue
 try:
  j=json.loads(q.read_text());j['version']=VERSION
  if rel=='package-lock.json' and isinstance(j.get('packages'),dict) and '' in j['packages']:j['packages']['']['version']=VERSION
  q.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n')
 except Exception: pass
q=ROOT/'src-tauri/Cargo.toml'; t=q.read_text(); t,n=re.subn(r'(?m)^version = "0\.9\.7"$',f'version = "{VERSION}"',t,count=1); q.write_text(t)
for rel in ['src/App.tsx','src/SettingsOS.tsx']:
 q=ROOT/rel
 if q.exists():q.write_text(q.read_text().replace('0.9.7',VERSION))

checks={
 'src-tauri/src/youtube.rs':['scheduleAccepted','scheduleVerifyPending','youtube_schedule_matches','5000'],
 'src/MetadataPage.tsx':['metadataWorkspaceKey','readMetadataWorkspace','writeMetadataWorkspace','scheduleAccepted!==false','Восстановлена рабочая сессия'],
 'src/MetadataPage.session.test.ts':['channel-isolated stable key']
}
for rel,marks in checks.items():
 text=(ROOT/rel).read_text()
 for m in marks:
  if m not in text: raise SystemExit(f'missing 0.9.8 marker {m} in {rel}')
print('VYRON 0.9.8 patch applied: persistent Metadata workspace + schedule acceptance verification')
