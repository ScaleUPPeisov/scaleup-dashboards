use serde::{Deserialize,Serialize};
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
 let body_start=head_end+4;let bytes=buf;if bytes.len()<body_start+len{response(stream,"400 Bad Request",r#"{"ok":false}"#);return}let body=&bytes[body_start..body_start+len];let incoming:Vec<StudioDraft>=match serde_json::from_slice(body){Ok(v)=>v,Err(_)=>{response(stream,"400 Bad Request",r#"{"ok":false,"error":"json"}"#);return}};
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
