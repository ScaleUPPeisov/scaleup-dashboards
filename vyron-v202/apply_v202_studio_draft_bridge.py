#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def read(p): return (ROOT/p).read_text()
def write(p,s): (ROOT/p).parent.mkdir(parents=True,exist_ok=True); (ROOT/p).write_text(s)
def replace(p,a,b,count=1):
 s=read(p)
 if a not in s: raise SystemExit(f'v202 missing anchor {p}: {a[:140]!r}')
 write(p,s.replace(a,b,count))

# Local-only bridge. No cookies, OAuth tokens or private Studio endpoints are used.
rust=r'''use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::{io::{Read,Write},net::{TcpListener,TcpStream},sync::{Mutex,OnceLock,atomic::{AtomicBool,Ordering}},thread,time::{SystemTime,UNIX_EPOCH}};

const PORT:u16=19470;
const TOKEN:&str="vyron-studio-drafts-v1";
const MAX_BODY:usize=128*1024;
const TTL_MS:u64=15*60*1000;
static STARTED:AtomicBool=AtomicBool::new(false);
static DRAFTS:OnceLock<Mutex<Vec<StudioDraft>>>=OnceLock::new();

#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct StudioDraft{pub studio_key:String,pub title:String,pub edit_url:Option<String>,pub video_id:Option<String>,pub channel_id:Option<String>,pub seen_at_ms:u64}
fn store()->&'static Mutex<Vec<StudioDraft>>{DRAFTS.get_or_init(||Mutex::new(Vec::new()))}
fn now_ms()->u64{SystemTime::now().duration_since(UNIX_EPOCH).map(|x|x.as_millis() as u64).unwrap_or(0)}
fn prune(v:&mut Vec<StudioDraft>){let now=now_ms();v.retain(|d|now.saturating_sub(d.seen_at_ms)<=TTL_MS)}
fn response(mut s:TcpStream,code:&str,body:&str){let out=format!("HTTP/1.1 {code}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-Vyron-Bridge\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.as_bytes().len(),body);let _=s.write_all(out.as_bytes());}
fn handle(mut stream:TcpStream){
 let _=stream.set_read_timeout(Some(std::time::Duration::from_secs(2)));let mut buf=vec![0u8;MAX_BODY];let n=match stream.read(&mut buf){Ok(n)=>n,Err(_)=>return};if n==0{return}buf.truncate(n);let text=String::from_utf8_lossy(&buf);let head_end=match text.find("\r\n\r\n"){Some(x)=>x,None=>{response(stream,"400 Bad Request",r#"{"ok":false}"#);return}};let head=&text[..head_end];let first=head.lines().next().unwrap_or("");
 if first.starts_with("OPTIONS "){response(stream,"204 No Content","");return}
 if !first.starts_with("POST /v1/drafts "){response(stream,"404 Not Found",r#"{"ok":false}"#);return}
 let token_ok=head.lines().any(|l|l.to_ascii_lowercase().starts_with("x-vyron-bridge:")&&l.split_once(':').map(|x|x.1.trim()==TOKEN).unwrap_or(false));if !token_ok{response(stream,"403 Forbidden",r#"{"ok":false,"error":"bridge token"}"#);return}
 let len=head.lines().find_map(|l|{let (k,v)=l.split_once(':')?;if k.eq_ignore_ascii_case("content-length"){v.trim().parse::<usize>().ok()}else{None}}).unwrap_or(0);if len>MAX_BODY{response(stream,"413 Payload Too Large",r#"{"ok":false}"#);return}
 let body_start=head_end+4;let mut bytes=buf;if bytes.len()<body_start+len{response(stream,"400 Bad Request",r#"{"ok":false}"#);return}let body=&bytes[body_start..body_start+len];let incoming:Vec<StudioDraft>=match serde_json::from_slice(body){Ok(v)=>v,Err(_)=>{response(stream,"400 Bad Request",r#"{"ok":false,"error":"json"}"#);return}};
 let mut g=store().lock().unwrap();prune(&mut g);for mut d in incoming{d.title=d.title.trim().chars().take(300).collect();d.studio_key=d.studio_key.trim().chars().take(240).collect();if d.studio_key.is_empty()||d.title.is_empty(){continue}if d.seen_at_ms==0{d.seen_at_ms=now_ms()}if let Some(old)=g.iter_mut().find(|x|x.studio_key==d.studio_key){*old=d}else{g.push(d)}};response(stream,"200 OK",&json!({"ok":true,"count":g.len()}).to_string());
}
fn start_server()->Result<(),String>{if STARTED.swap(true,Ordering::SeqCst){return Ok(())}let listener=match TcpListener::bind(("127.0.0.1",PORT)){Ok(x)=>x,Err(e)=>{STARTED.store(false,Ordering::SeqCst);return Err(format!("Studio Draft Bridge port {PORT}: {e}"))}};thread::spawn(move||{for stream in listener.incoming(){match stream{Ok(s)=>handle(s),Err(_)=>break}}STARTED.store(false,Ordering::SeqCst);});Ok(())}
#[tauri::command]
pub fn studio_drafts_start_bridge()->Result<Value,String>{start_server()?;Ok(json!({"ok":true,"port":PORT,"ttlMs":TTL_MS}))}
#[tauri::command]
pub fn studio_drafts_list()->Result<Value,String>{let mut g=store().lock().map_err(|_|"Studio drafts lock".to_string())?;prune(&mut g);Ok(json!({"drafts":g.clone(),"port":PORT,"running":STARTED.load(Ordering::SeqCst)}))}
#[tauri::command]
pub fn studio_drafts_clear()->Result<Value,String>{store().lock().map_err(|_|"Studio drafts lock".to_string())?.clear();Ok(json!({"ok":true}))}

#[cfg(test)] mod tests{use super::*;#[test]fn stale_drafts_are_pruned(){let mut v=vec![StudioDraft{studio_key:"a".into(),title:"x".into(),edit_url:None,video_id:None,channel_id:None,seen_at_ms:1}];prune(&mut v);assert!(v.is_empty())}#[test]fn loopback_port_is_fixed(){assert_eq!(PORT,19470);assert!(!TOKEN.is_empty())}}
'''
write('src-tauri/src/studio_drafts.rs',rust)

p='src-tauri/src/lib.rs';s=read(p)
if 'mod studio_drafts;' not in s:
 anchor='mod youtube;'
 if anchor not in s: raise SystemExit('v202 lib.rs missing mod youtube')
 s=s.replace(anchor,anchor+'\nmod studio_drafts;',1)
if 'studio_drafts::studio_drafts_start_bridge' not in s:
 anchor='tauri::generate_handler!['
 if anchor not in s: raise SystemExit('v202 lib.rs missing generate_handler')
 s=s.replace(anchor,anchor+'studio_drafts::studio_drafts_start_bridge,studio_drafts::studio_drafts_list,studio_drafts::studio_drafts_clear,',1)
write(p,s)

# Typed frontend API.
p='src/api.ts';s=read(p)
if 'StudioDraftBridgeItem' not in s:
 s='export type StudioDraftBridgeItem={studioKey:string;title:string;editUrl?:string;videoId?:string;channelId?:string;seenAtMs:number};\n'+s
if 'studioDraftsStartBridge:' not in s:
 anchor='export const api={'
 if anchor not in s: raise SystemExit('v202 api object anchor missing')
 methods="\n  studioDraftsStartBridge:()=>invoke<{ok:boolean;port:number;ttlMs:number}>('studio_drafts_start_bridge'),\n  studioDraftsList:()=>invoke<{drafts:StudioDraftBridgeItem[];port:number;running:boolean}>('studio_drafts_list'),\n  studioDraftsClear:()=>invoke<{ok:boolean}>('studio_drafts_clear'),"
 s=s.replace(anchor,anchor+methods,1)
write(p,s)

# Metadata page: keep official API sync untouched; show Studio drafts separately.
p='src/MetadataPage.tsx';s=read(p)
s=s.replace("import {api} from './api';","import {api,type StudioDraftBridgeItem} from './api';",1)
state_anchor="[draftSavedAt,setDraftSavedAt]=useState('');const file=useRef<HTMLInputElement>(null),restoring=useRef(false);"
if state_anchor not in s: raise SystemExit('v202 MetadataPage state anchor missing')
s=s.replace(state_anchor,"[draftSavedAt,setDraftSavedAt]=useState(''),[studioDrafts,setStudioDrafts]=useState<StudioDraftBridgeItem[]>([]),[studioBridge,setStudioBridge]=useState<'starting'|'on'|'off'>('starting');const file=useRef<HTMLInputElement>(null),restoring=useRef(false);",1)
channel_anchor=" const channel=channels.find(c=>c.id===channelId),profileId=channel?.youtubeProfileId||'';"
if channel_anchor not in s: raise SystemExit('v202 MetadataPage channel anchor missing')
effect=r'''
 useEffect(()=>{let live=true;async function refresh(){try{await api.studioDraftsStartBridge();const r=await api.studioDraftsList();if(live){setStudioDrafts(r.drafts||[]);setStudioBridge(r.running?'on':'off')}}catch{if(live)setStudioBridge('off')}}void refresh();const t=window.setInterval(()=>void refresh(),2000);return()=>{live=false;window.clearInterval(t)}},[]);
'''
s=s.replace(channel_anchor,channel_anchor+'\n'+effect,1)
# After a real API sync, refresh draft bridge and report both counts.
old="setSyncStatus(r.complete?`✓ ${r.received}/${r.youtubeFound} получено точно`:`⚠ ${r.received}/${Math.min(r.youtubeFound,r.requested)} — синхронизация неполная`);"
new="const bridge=await api.studioDraftsList().catch(()=>({drafts:[] as StudioDraftBridgeItem[],port:19470,running:false}));setStudioDrafts(bridge.drafts||[]);setSyncStatus(r.complete?`✓ ${r.received}/${r.youtubeFound} API-видео • ${(bridge.drafts||[]).length} Studio Drafts`:`⚠ ${r.received}/${Math.min(r.youtubeFound,r.requested)} API • ${(bridge.drafts||[]).length} Studio Drafts`);"
if old not in s: raise SystemExit('v202 MetadataPage sync status anchor missing')
s=s.replace(old,new,1)
# Add status to target card.
old="<div className=\"metadataTargetInfo\"><strong>{selectedYt.length}</strong><span>выбрано из {yt.length}</span><small>{syncStatus||'YouTube будет загружен автоматически'}</small></div>"
new="<div className=\"metadataTargetInfo\"><strong>{selectedYt.length}</strong><span>выбрано из {yt.length} API • Studio Drafts: {studioDrafts.length}</span><small>{syncStatus||'YouTube будет загружен автоматически'} • Bridge {studioBridge==='on'?'ON':'OFF'}</small></div>"
if old not in s: raise SystemExit('v202 target info anchor missing')
s=s.replace(old,new,1)
# Separate, honest Studio Draft section. These are visible before the unfinished Studio draft becomes an API resource.
picker="  {target==='youtube'&&yt.length>0&&<section className=\"panel metadataVideoPicker\">"
if picker not in s: raise SystemExit('v202 picker anchor missing')
studio=r'''  {target==='youtube'&&<section className="panel metadataVideoPicker"><div className="panelHead"><div><small>STUDIO DRAFT BRIDGE • LOCAL</small><h3>Черновики Studio • {studioDrafts.length}</h3><p>Считываются только из уже открытой YouTube Studio через локальное расширение. Cookies, OAuth-токены и скрытые Studio API не используются.</p></div><span className={studioBridge==='on'?'good':'warn'}>{studioBridge==='on'?'Bridge ON':'Bridge OFF'}</span></div>{studioDrafts.length===0?<div className="empty"><b>Черновики Studio пока не переданы</b><p>Установи VYRON Studio Draft Bridge и оставь страницу «Контент» YouTube Studio открытой. Данные появятся автоматически.</p></div>:<div className="metadataVideoRows">{studioDrafts.slice(0,200).map(d=><button key={d.studioKey} disabled title="Незавершённый Studio Draft ещё не является обычным YouTube Data API video resource"><i>SD</i><span><b>{d.title}</b><small>STUDIO DRAFT{d.videoId?` • candidate ${d.videoId}`:''}</small></span></button>)}</div>}<small>Как только YouTube создаёт обычный API video resource, он появляется ниже в PRIVATE/SCHEDULED и становится доступен для DOCX.</small></section>}
'''
s=s.replace(picker,studio+picker,1)
write(p,s)

# Browser extension: rendered UI only, no private endpoints or credentials.
ext=ROOT/'studio-draft-bridge';ext.mkdir(parents=True,exist_ok=True)
(ext/'manifest.json').write_text(r'''{"manifest_version":3,"name":"VYRON Studio Draft Bridge","version":"2.0.2","description":"Передаёт видимые черновики из YouTube Studio локально в VYRON.","permissions":[],"host_permissions":["http://127.0.0.1:19470/*"],"content_scripts":[{"matches":["https://studio.youtube.com/*"],"js":["content.js"],"run_at":"document_idle"}]}''')
(ext/'content.js').write_text(r'''(()=>{const ENDPOINT='http://127.0.0.1:19470/v1/drafts';const TOKEN='vyron-studio-drafts-v1';const text=n=>(n?.textContent||'').replace(/\s+/g,' ').trim();function channelId(){return location.pathname.match(/\/channel\/([^/]+)/)?.[1]}function scan(){const out=[];const seen=new Set();for(const node of document.querySelectorAll('ytcp-video-row,ytd-video-row,[role="row"],tr')){const t=text(node);if(!/(Черновик|Draft)/i.test(t))continue;const links=[...node.querySelectorAll('a[href]')];const edit=links.find(a=>/\/video\//.test(a.getAttribute('href')||''))||links[0];const href=edit?.href||'';const vid=href.match(/\/video\/([^/?#]+)/)?.[1]||href.match(/[?&]v=([^&#]+)/)?.[1];const titleNode=node.querySelector('#video-title,[id*="video-title"],a[href*="/video/"]');let title=text(titleNode);if(!title){title=t.replace(/Черновик|Draft|Редактировать черновик|Edit draft/ig,' ').replace(/\s+/g,' ').trim().slice(0,300)}const key=vid||href||title;if(!key||seen.has(key))continue;seen.add(key);out.push({studioKey:key,title:title||'Черновик Studio',editUrl:href||undefined,videoId:vid||undefined,channelId:channelId(),seenAtMs:Date.now()})}return out}async function push(){const drafts=scan();if(!drafts.length)return;try{await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Vyron-Bridge':TOKEN},body:JSON.stringify(drafts),cache:'no-store'})}catch{}}let timer=0;const kick=()=>{clearTimeout(timer);timer=setTimeout(push,350)};new MutationObserver(kick).observe(document.documentElement,{subtree:true,childList:true,characterData:true});setInterval(push,2500);kick()})();''')
(ext/'README.md').write_text('''# VYRON Studio Draft Bridge 2.0.2\n\nЛокальный bridge для видимых строк YouTube Studio → VYRON.\n\n1. Chrome → `chrome://extensions`.\n2. Включить «Режим разработчика».\n3. «Загрузить распакованное расширение» и выбрать эту папку.\n4. Открыть YouTube Studio → Контент.\n5. VYRON должен быть запущен. Bridge работает только через `127.0.0.1:19470`.\n\nРасширение не читает cookies, OAuth-токены и не вызывает скрытые YouTube Studio API.\n''')
print('VYRON 2.0.2 Studio Draft Bridge applied')
