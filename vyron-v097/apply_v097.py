from pathlib import Path
import json,re

ROOT=Path('.vyron-v051')
VERSION='0.9.7'
if not ROOT.is_dir(): raise SystemExit('VYRON source root missing')
package=ROOT/'package.json'
data=json.loads(package.read_text())
if data.get('version')!='0.9.6': raise SystemExit(f"Expected VYRON 0.9.6 base, got {data.get('version')}")

# ---------- Rust YouTube write path ----------
p=ROOT/'src-tauri/src/youtube.rs'
s=p.read_text()

marker='''fn youtube_status_body(old_status:&Value,target_privacy:&str,publish_at:Option<&str>)->Value{'''
if marker not in s: raise SystemExit('youtube status marker missing')
helpers='''fn youtube_norm_text(input:&str)->String{input.replace("\\r\\n","\\n").replace('\\r',"\\n").lines().map(|x|x.trim_end()).collect::<Vec<_>>().join("\\n").trim().to_string()}\nfn youtube_norm_tags(tags:&[String])->Vec<String>{let mut out=tags.iter().map(|x|x.trim().split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()).filter(|x|!x.is_empty()).collect::<Vec<_>>();out.sort();out.dedup();out}\nfn youtube_metadata_diff(sn:&Value,wanted_title:&str,wanted_desc:&str,wanted_tags:&[String])->Vec<String>{let mut diff=Vec::<String>::new();let got_title=sn.get("title").and_then(|x|x.as_str()).unwrap_or("");let got_desc=sn.get("description").and_then(|x|x.as_str()).unwrap_or("");let got_tags=sn.get("tags").and_then(|x|x.as_array()).cloned().unwrap_or_default().into_iter().filter_map(|x|x.as_str().map(str::to_string)).collect::<Vec<_>>();if youtube_norm_text(got_title)!=youtube_norm_text(wanted_title){diff.push("title".to_string())}if youtube_norm_text(got_desc)!=youtube_norm_text(wanted_desc){diff.push("description".to_string())}if youtube_norm_tags(&got_tags)!=youtube_norm_tags(wanted_tags){diff.push("tags".to_string())}diff}\n'''
s=s.replace(marker,helpers+marker,1)

start=s.find('let u=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet")])')
end=s.find('let old_privacy=current_status.get("privacyStatus")',start)
if start<0 or end<0: raise SystemExit('0.9.6 metadata write/verify block not found')
new_block='''let u=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet")]).json(&snippet_body).send().await.map_err(|e|format!("YouTube metadata update: {e}"))?;let ust=u.status();let uv:Value=u.json().await.unwrap_or_else(|_|json!({}));if !ust.is_success(){return Err(format!("METADATA: {}",youtube_error(&uv,"YouTube не принял title/description/tags")))}\n // A successful videos.update is the authoritative acceptance signal. The response itself contains the updated snippet.\n let wanted_tags_vec=snippet_body.pointer("/snippet/tags").and_then(|x|x.as_array()).cloned().unwrap_or_default().into_iter().filter_map(|x|x.as_str().map(str::to_string)).collect::<Vec<_>>();\n let mut metadata_verified=youtube_metadata_diff(uv.get("snippet").unwrap_or(&Value::Null),&wanted_title,&wanted_desc,&wanted_tags_vec).is_empty();\n let mut current_status=old_status.clone();\n // YouTube read-after-write may lag. Retry videos.list, but never roll back/skip scheduling after a successful PUT.\n if !metadata_verified{for delay in [250u64,700,1500,3000]{tokio::time::sleep(std::time::Duration::from_millis(delay)).await;let check=client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet,status"),("id",video_id.as_str())]).send().await.map_err(|e|format!("YouTube metadata verify: {e}"))?;let cst=check.status();let cv:Value=check.json().await.unwrap_or_else(|_|json!({}));if !cst.is_success(){continue}if let Some(got)=cv.get("items").and_then(|x|x.as_array()).and_then(|a|a.first()){let gsn=got.get("snippet").cloned().unwrap_or_else(||json!({}));current_status=got.get("status").cloned().unwrap_or_else(||current_status.clone());if youtube_metadata_diff(&gsn,&wanted_title,&wanted_desc,&wanted_tags_vec).is_empty(){metadata_verified=true;break}}}}\n let metadata_verify_pending=!metadata_verified;\n'''
s=s[:start]+new_block+s[end:]

# Every successful response JSON must expose accepted/pending state, while scheduling continues regardless of verify lag.
s=s.replace('"metadataVerified":true,"scheduleRequested":false', '"metadataAccepted":true,"metadataVerified":metadata_verified,"metadataVerifyPending":metadata_verify_pending,"scheduleRequested":false')
s=s.replace('"metadataVerified":true,"scheduleRequested":true', '"metadataAccepted":true,"metadataVerified":metadata_verified,"metadataVerifyPending":metadata_verify_pending,"scheduleRequested":true')
# appliedTags used the shadowed wanted_tags previously; use stable vec length.
s=s.replace('"appliedTags":wanted_tags.len()', '"appliedTags":wanted_tags_vec.len()')

# Add tests to existing write test module.
test_old='''#[cfg(test)]\nmod youtube_write_tests{use super::*;'''
if test_old not in s: raise SystemExit('youtube_write_tests marker missing')
test_new='''#[cfg(test)]\nmod youtube_write_tests{use super::*;#[test]fn metadata_verify_ignores_tag_order_and_line_endings(){let sn=json!({"title":"  Hello  ","description":"A\\r\\nB","tags":["Paris Night","Deep House"]});let wanted=vec!["deep house".to_string(),"paris night".to_string()];assert!(youtube_metadata_diff(&sn,"Hello","A\\nB",&wanted).is_empty());}'''
s=s.replace(test_old,test_new,1)
p.write_text(s)

# ---------- Frontend API type ----------
p=ROOT/'src/api.ts'; s=p.read_text()
s=s.replace('metadataVerified:boolean;scheduleRequested:boolean', 'metadataAccepted?:boolean;metadataVerified:boolean;metadataVerifyPending?:boolean;scheduleRequested:boolean')
p.write_text(s)

# ---------- Metadata Hub: KRAT schedule + accepted semantics ----------
p=ROOT/'src/MetadataPage.tsx'; s=p.read_text()
anchor='''type ApplyReport={metadataOk:number;total:number;scheduleOk:number;scheduleTotal:number;failed:number;issues:ApplyIssue[]};'''
if anchor not in s: raise SystemExit('MetadataPage ApplyReport marker missing')
helper='''\nfunction resolveKratPublishAt(raw:string|undefined,base:string|undefined){const v=(raw||'').trim();if(/^\\d{4}-\\d{2}-\\d{2}T/.test(v))return v;if(!base)return undefined;const m=v.match(/(?:^|\\s)(\\d{1,2}):(\\d{2})(?:\\s*(?:KRAT|UTC\\+?7))?/i);if(!m)return base;const d=new Date(base);if(Number.isNaN(d.getTime()))return base;const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const get=(t:string)=>parts.find(x=>x.type===t)?.value||'';const hh=String(Math.max(0,Math.min(23,Number(m[1])))).padStart(2,'0');const mm=String(Math.max(0,Math.min(59,Number(m[2])))).padStart(2,'0');return `${get('year')}-${get('month')}-${get('day')}T${hh}:${mm}:00+07:00`}\n'''
s=s.replace(anchor,anchor+helper,1)
old="const publishAt=v.privacyStatus==='private'?(r.publishAt||scheduleById.get(v.id)||v.publishAt):v.publishAt;const result=await api.youtubeUpdateExisting(profileId,v.id,r.title||v.title,r.description||v.description,r.tags?.length?r.tags:v.tags,publishAt,v.privacyStatus);if(result.metadataVerified)metadataOk++;else{failed++;issues.push({videoId:v.id,title:v.title,phase:'metadata',error:'YouTube не подтвердил title/description/tags'});continue}if(result.scheduleRequested){scheduleTotal++;if(result.scheduleVerified)scheduleOk++;else issues.push({videoId:v.id,title:v.title,phase:'schedule',error:result.scheduleError||'YouTube не подтвердил расписание'})}"
new="const basePublishAt=scheduleById.get(v.id)||v.publishAt;const publishAt=v.privacyStatus==='private'?resolveKratPublishAt(r.publishAt,basePublishAt):v.publishAt;const result=await api.youtubeUpdateExisting(profileId,v.id,r.title||v.title,r.description||v.description,r.tags?.length?r.tags:v.tags,publishAt,v.privacyStatus);if(result.metadataAccepted!==false)metadataOk++;else{failed++;issues.push({videoId:v.id,title:v.title,phase:'metadata',error:'YouTube не принял title/description/tags'});continue}if(result.scheduleRequested){scheduleTotal++;if(result.scheduleVerified)scheduleOk++;else issues.push({videoId:v.id,title:v.title,phase:'schedule',error:result.scheduleError||'YouTube не подтвердил расписание'})}"
if old not in s: raise SystemExit('0.9.6 applyYoutube decision block not found')
s=s.replace(old,new,1)
p.write_text(s)

# ---------- Version bump ----------
for rel in ['package.json','package-lock.json','src-tauri/tauri.conf.json']:
 p=ROOT/rel
 if not p.exists(): continue
 try:
  j=json.loads(p.read_text());j['version']=VERSION
  if rel=='package-lock.json' and isinstance(j.get('packages'),dict) and '' in j['packages']:j['packages']['']['version']=VERSION
  p.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n')
 except Exception: pass
p=ROOT/'src-tauri/Cargo.toml'; t=p.read_text(); t,n=re.subn(r'(?m)^version = "0\.9\.6"$',f'version = "{VERSION}"',t,count=1); p.write_text(t)
for rel in ['src/App.tsx','src/SettingsOS.tsx']:
 p=ROOT/rel
 if p.exists(): p.write_text(p.read_text().replace('0.9.6',VERSION))

# ---------- Contract checks ----------
checks={
 'src-tauri/src/youtube.rs':['metadata_verify_pending','youtube_metadata_diff','tokio::time::sleep','metadataAccepted'],
 'src/MetadataPage.tsx':['resolveKratPublishAt','Asia/Krasnoyarsk','metadataAccepted!==false'],
}
for rel,marks in checks.items():
 text=(ROOT/rel).read_text()
 for m in marks:
  if m not in text: raise SystemExit(f'missing 0.9.7 marker {m} in {rel}')
print('VYRON 0.9.7 patch applied: eventual metadata verify + KRAT scheduling')
