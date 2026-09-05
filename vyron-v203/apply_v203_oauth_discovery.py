#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def r(p): return (ROOT/p).read_text()
def w(p,s): (ROOT/p).write_text(s)

# VYRON 2.0.3: Browser-independent discovery. The connected OAuth profile is
# authoritative. Keep the uploads playlist as the cheap/full-history source,
# but preserve playlist-item rows that videos.list does not expose yet and add
# exactly one recent forMine search page as an official-API supplement.
p='src-tauri/src/youtube.rs';s=r(p)
start=s.find('#[tauri::command]\npub async fn youtube_list_existing_videos')
end=s.find('#[tauri::command]\npub async fn youtube_backup_existing_videos',start)
if start<0 or end<0: raise SystemExit('v203 youtube_list_existing_videos anchors missing')
fn=r'''#[tauri::command]
pub async fn youtube_list_existing_videos(app:AppHandle,profile_id:String,max_results:Option<u32>)->Result<Value,String>{
 let (token,profile)=valid_access_token(&app,&profile_id).await?;let limit=max_results.unwrap_or(1000).clamp(1,5000) as usize;let client=reqwest::Client::new();
 let r=client.get("https://www.googleapis.com/youtube/v3/channels").bearer_auth(&token).query(&[("part","contentDetails"),("mine","true")]).send().await.map_err(|e|format!("YouTube channel: {e}"))?;let st=r.status();let cv:Value=r.json().await.map_err(|e|e.to_string())?;if !st.is_success(){return Err(youtube_error(&cv,"Не удалось получить канал YouTube"))}let uploads=cv.pointer("/items/0/contentDetails/relatedPlaylists/uploads").and_then(|x|x.as_str()).ok_or_else(||"YouTube не вернул playlist загрузок".to_string())?;
 let mut ids=Vec::<String>::new();let mut page:Option<String>=None;let mut playlist_found:usize=0;let mut playlist_meta=std::collections::HashMap::<String,Value>::new();let mut playlist_calls=0usize;
 while ids.len()<limit{
  let mut q=client.get("https://www.googleapis.com/youtube/v3/playlistItems").bearer_auth(&token).query(&[("part","snippet,contentDetails,status"),("playlistId",uploads),("maxResults","50")]);if let Some(ref t)=page{q=q.query(&[("pageToken",t.as_str())]);}
  playlist_calls+=1;let rr=q.send().await.map_err(|e|format!("YouTube uploads: {e}"))?;let st=rr.status();let v:Value=rr.json().await.map_err(|e|e.to_string())?;if !st.is_success(){return Err(youtube_error(&v,"Не удалось получить список загрузок"))}
  if playlist_found==0{playlist_found=v.pointer("/pageInfo/totalResults").and_then(|x|x.as_u64()).unwrap_or(0) as usize;}
  if let Some(items)=v.get("items").and_then(|x|x.as_array()){for item in items{if ids.len()>=limit{break}if let Some(id)=item.pointer("/contentDetails/videoId").and_then(|x|x.as_str()).or_else(||item.pointer("/snippet/resourceId/videoId").and_then(|x|x.as_str())){if !ids.iter().any(|x|x==id){ids.push(id.to_string())}playlist_meta.insert(id.to_string(),item.clone());}}}
  page=v.get("nextPageToken").and_then(|x|x.as_str()).map(str::to_string);if page.is_none(){break}
 }
 if playlist_found==0{playlist_found=ids.len()}

 // One official OAuth account-search page supplements uploads-playlist discovery.
 // It is deliberately not paginated: the uploads playlist remains the full-history
 // source, while forMine only catches newest owned resources that Studio/API may
 // not have surfaced in the playlist response yet.
 let mut search_meta=std::collections::HashMap::<String,Value>::new();let mut search_used=false;let mut search_supplement=0usize;
 let sr=client.get("https://www.googleapis.com/youtube/v3/search").bearer_auth(&token).query(&[("part","snippet"),("forMine","true"),("type","video"),("order","date"),("maxResults","50")]).send().await;
 if let Ok(resp)=sr{if resp.status().is_success(){let sv:Value=resp.json().await.unwrap_or_else(|_|json!({}));search_used=true;let mut extra=Vec::<String>::new();for item in sv.get("items").and_then(|x|x.as_array()).cloned().unwrap_or_default(){if let Some(id)=item.pointer("/id/videoId").and_then(|x|x.as_str()){let same_channel=profile.channel_id.as_deref().map(|c|item.pointer("/snippet/channelId").and_then(|x|x.as_str()).map(|x|x==c).unwrap_or(true)).unwrap_or(true);if same_channel{search_meta.insert(id.to_string(),item.clone());if !ids.iter().any(|x|x==id)&&!extra.iter().any(|x|x==id){extra.push(id.to_string())}}}}search_supplement=extra.len();for id in extra.into_iter().rev(){if ids.len()<limit{ids.insert(0,id)}}}}

 let mut by_id=std::collections::HashMap::<String,Value>::new();let mut video_calls=0usize;for chunk in ids.chunks(50){if chunk.is_empty(){continue}let joined=chunk.join(",");video_calls+=1;let rr=client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet,status,contentDetails,statistics"),("id",joined.as_str())]).send().await.map_err(|e|format!("YouTube videos: {e}"))?;let st=rr.status();let v:Value=rr.json().await.map_err(|e|e.to_string())?;if !st.is_success(){return Err(youtube_error(&v,"Не удалось получить данные видео"))}for item in v.get("items").and_then(|x|x.as_array()).cloned().unwrap_or_default(){if let Some(id)=item.get("id").and_then(|x|x.as_str()){by_id.insert(id.to_string(),item);}}}
 let mut out=Vec::new();let mut fallback_count=0usize;for (position,id) in ids.iter().enumerate(){
  if let Some(item)=by_id.get(id){let sn=item.get("snippet").cloned().unwrap_or_else(||json!({}));let st=item.get("status").cloned().unwrap_or_else(||json!({}));out.push(json!({"id":id,"channelId":sn.get("channelId").and_then(|x|x.as_str()),"position":position,"title":sn.get("title").and_then(|x|x.as_str()).unwrap_or(""),"description":sn.get("description").and_then(|x|x.as_str()).unwrap_or(""),"tags":sn.get("tags").cloned().unwrap_or_else(||json!([])),"categoryId":sn.get("categoryId").and_then(|x|x.as_str()).unwrap_or("10"),"publishedAt":sn.get("publishedAt").and_then(|x|x.as_str()),"privacyStatus":st.get("privacyStatus").and_then(|x|x.as_str()).unwrap_or("unknown"),"publishAt":st.get("publishAt").and_then(|x|x.as_str()),"thumbnail":sn.pointer("/thumbnails/maxres/url").or_else(||sn.pointer("/thumbnails/standard/url")).or_else(||sn.pointer("/thumbnails/high/url")).or_else(||sn.pointer("/thumbnails/medium/url")).or_else(||sn.pointer("/thumbnails/default/url")).and_then(|x|x.as_str()),"duration":item.pointer("/contentDetails/duration").and_then(|x|x.as_str()),"views":item.pointer("/statistics/viewCount").and_then(|x|x.as_str()).and_then(|x|x.parse::<u64>().ok()),"likes":item.pointer("/statistics/likeCount").and_then(|x|x.as_str()).and_then(|x|x.parse::<u64>().ok()),"comments":item.pointer("/statistics/commentCount").and_then(|x|x.as_str()).and_then(|x|x.parse::<u64>().ok()),"selected":false,"discoverySource":"videos.list","draftCandidate":false}));continue
  }
  // Do not throw away an owned row merely because videos.list has not exposed it
  // yet. This is the important Studio-draft compatibility path.
  if let Some(pi)=playlist_meta.get(id){let sn=pi.get("snippet").cloned().unwrap_or_else(||json!({}));let st=pi.get("status").cloned().unwrap_or_else(||json!({}));let privacy=st.get("privacyStatus").and_then(|x|x.as_str()).unwrap_or("private");fallback_count+=1;out.push(json!({"id":id,"channelId":sn.get("channelId").and_then(|x|x.as_str()).or(profile.channel_id.as_deref()),"position":position,"title":sn.get("title").and_then(|x|x.as_str()).unwrap_or("Черновик YouTube"),"description":sn.get("description").and_then(|x|x.as_str()).unwrap_or(""),"tags":[],"categoryId":"10","publishedAt":sn.get("publishedAt").and_then(|x|x.as_str()),"privacyStatus":privacy,"publishAt":Value::Null,"thumbnail":sn.pointer("/thumbnails/high/url").or_else(||sn.pointer("/thumbnails/medium/url")).or_else(||sn.pointer("/thumbnails/default/url")).and_then(|x|x.as_str()),"selected":false,"discoverySource":"uploads-playlist","draftCandidate":true}));continue}
  if let Some(si)=search_meta.get(id){let sn=si.get("snippet").cloned().unwrap_or_else(||json!({}));fallback_count+=1;out.push(json!({"id":id,"channelId":sn.get("channelId").and_then(|x|x.as_str()).or(profile.channel_id.as_deref()),"position":position,"title":sn.get("title").and_then(|x|x.as_str()).unwrap_or("Черновик YouTube"),"description":sn.get("description").and_then(|x|x.as_str()).unwrap_or(""),"tags":[],"categoryId":"10","publishedAt":sn.get("publishedAt").and_then(|x|x.as_str()),"privacyStatus":"private","publishAt":Value::Null,"thumbnail":sn.pointer("/thumbnails/high/url").or_else(||sn.pointer("/thumbnails/medium/url")).or_else(||sn.pointer("/thumbnails/default/url")).and_then(|x|x.as_str()),"selected":false,"discoverySource":"oauth-forMine","draftCandidate":true}));}
 }
 let scheduled_count=out.iter().filter(|x|x.get("privacyStatus").and_then(|v|v.as_str())==Some("private")&&x.get("publishAt").and_then(|v|v.as_str()).is_some()).count();let private_count=out.iter().filter(|x|x.get("privacyStatus").and_then(|v|v.as_str())==Some("private")&&x.get("publishAt").and_then(|v|v.as_str()).is_none()).count();let public_count=out.iter().filter(|x|x.get("privacyStatus").and_then(|v|v.as_str())==Some("public")).count();let unlisted_count=out.iter().filter(|x|x.get("privacyStatus").and_then(|v|v.as_str())==Some("unlisted")).count();let youtube_found=std::cmp::max(playlist_found,ids.len());let expected=std::cmp::min(youtube_found,limit);let complete=out.len()==expected;
 Ok(json!({"channelId":profile.channel_id,"channelTitle":profile.channel_title,"youtubeFound":youtube_found,"playlistFound":playlist_found,"received":out.len(),"requested":limit,"privateCount":private_count,"publicCount":public_count,"scheduledCount":scheduled_count,"unlistedCount":unlisted_count,"draftCandidateCount":fallback_count,"searchSupplementCount":search_supplement,"searchUsed":search_used,"playlistCalls":playlist_calls,"videoCalls":video_calls,"complete":complete,"videos":out}))
}

'''
s=s[:start]+fn+s[end:]
w(p,s)

# 2.0.2 browser bridge is no longer part of the Metadata workflow. Keep its
# backend files harmless for backward compatibility, but remove all mandatory UI
# and polling from MetadataPage so any browser can be used for OAuth/Studio.
p='src/MetadataPage.tsx';s=r(p)
s=s.replace("import {api,type StudioDraftBridgeItem} from './api';","import {api} from './api';")
s=s.replace(",[studioDrafts,setStudioDrafts]=useState<StudioDraftBridgeItem[]>([]),[studioBridge,setStudioBridge]=useState<'starting'|'on'|'off'>('starting')","")
effect='''\n useEffect(()=>{let live=true;async function refresh(){try{await api.studioDraftsStartBridge();const r=await api.studioDraftsList();if(live){setStudioDrafts(r.drafts||[]);setStudioBridge(r.running?'on':'off')}}catch{if(live)setStudioBridge('off')}}void refresh();const t=window.setInterval(()=>void refresh(),2000);return()=>{live=false;window.clearInterval(t)}},[]);\n'''
s=s.replace(effect,'\n')
s=s.replace("const bridge=await api.studioDraftsList().catch(()=>({drafts:[] as StudioDraftBridgeItem[],port:19470,running:false}));setStudioDrafts(bridge.drafts||[]);setSyncStatus(r.complete?`✓ ${r.received}/${r.youtubeFound} API-видео • ${(bridge.drafts||[]).length} Studio Drafts`:`⚠ ${r.received}/${Math.min(r.youtubeFound,r.requested)} API • ${(bridge.drafts||[]).length} Studio Drafts`);","setSyncStatus(r.complete?`✓ ${r.received}/${r.youtubeFound} видео получено${r.draftCandidateCount?` • черновиков: ${r.draftCandidateCount}`:''}`:`⚠ ${r.received}/${Math.min(r.youtubeFound,r.requested)} — синхронизация неполная`);")
s=s.replace("<div className=\"metadataTargetInfo\"><strong>{selectedYt.length}</strong><span>выбрано из {yt.length} API • Studio Drafts: {studioDrafts.length}</span><small>{syncStatus||'YouTube будет загружен автоматически'} • Bridge {studioBridge==='on'?'ON':'OFF'}</small></div>","<div className=\"metadataTargetInfo\"><strong>{selectedYt.length}</strong><span>выбрано из {yt.length}</span><small>{syncStatus||'YouTube будет загружен автоматически'}</small></div>")
# Remove the exact Studio Draft section inserted by 2.0.2.
a=s.find('  {target===\'youtube\'&&<section className="panel metadataVideoPicker"><div className="panelHead"><div><small>STUDIO DRAFT BRIDGE')
b=s.find('  {target===\'youtube\'&&yt.length>0&&<section className="panel metadataVideoPicker">',a)
if a>=0 and b>a:s=s[:a]+s[b:]
w(p,s)

# Add result fields to the API result type if it is explicitly declared.
p='src/api.ts';s=r(p)
if 'draftCandidateCount?:number' not in s and 'ExistingVideoSyncResult' in s:
 s=s.replace('complete:boolean;videos:', 'complete:boolean;draftCandidateCount?:number;searchSupplementCount?:number;searchUsed?:boolean;playlistFound?:number;videos:',1)
w(p,s)

# Regression contract: no browser extension is needed for video discovery.
w('src/youtubeOAuthDiscovery.test.ts',r'''import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
describe('VYRON 2.0.3 browser-independent YouTube discovery',()=>{
 it('Metadata does not require Studio browser bridge',()=>{const s=readFileSync('src/MetadataPage.tsx','utf8');expect(s).not.toContain('STUDIO DRAFT BRIDGE');expect(s).not.toContain('studioDraftsStartBridge')});
 it('backend uses connected OAuth plus official discovery sources',()=>{const s=readFileSync('src-tauri/src/youtube.rs','utf8');expect(s).toContain('snippet,contentDetails,status');expect(s).toContain('(\"forMine\",\"true\")');expect(s).toContain('draftCandidate')});
});
''')
print('VYRON 2.0.3 OAuth-only video discovery applied')
