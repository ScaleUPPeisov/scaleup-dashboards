#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1])

sec=root/'src-tauri/src/security.rs'
s=sec.read_text()
marker='// VYRON_GLOBAL_OAUTH_INVENTORY_V1'
if marker not in s:
    s += r'''

// VYRON_GLOBAL_OAUTH_INVENTORY_V1
fn inventory_oauth_account_parts(account:&str)->Option<(String,&'static str)>{
 let rest=account.strip_prefix("oauth.")?;
 for (suffix,kind) in [(".refresh_token","refresh_token"),(".access_token","access_token"),(".client_secret","client_secret")]{
  if let Some(id)=rest.strip_suffix(suffix){if !id.trim().is_empty(){return Some((id.to_string(),kind))}}
 }
 None
}
fn inventory_osstatus(detail:&str)->Option<i32>{
 for marker in ["osstatus=","OSStatus "]{
  if let Some(i)=detail.find(marker){
   let tail=&detail[i+marker.len()..];
   let token:String=tail.chars().take_while(|c|c.is_ascii_digit()||*c=='-').collect();
   if let Ok(v)=token.parse::<i32>(){return Some(v)}
  }
 }
 None
}
fn inventory_read_status(account:&str)->(String,Option<i32>,Option<String>){
 match get_secret(account){
  Ok(Some(_))=>("PASS".into(),Some(0),None),
  Ok(None)=>("READ_FAILED".into(),Some(-25300),Some("Keychain account was enumerated but returned item-not-found during read".into())),
  Err(e)=>{
   let code=inventory_osstatus(&e);
   let denied=e.contains("KEYCHAIN_ACCESS_DENIED")||e.contains("KEYCHAIN_AUTH_FAILED")||e.contains("KEYCHAIN_INTERACTION_REQUIRED")||matches!(code,Some(-25293|-25308|-34018|-128));
   (if denied{"ACCESS_DENIED".into()}else{"READ_FAILED".into()},code,Some(e))
  }
 }
}
#[tauri::command]
pub fn security_oauth_inventory(app:tauri::AppHandle)->Result<serde_json::Value,String>{
 use std::collections::{BTreeMap,BTreeSet};
 use tauri::Manager;
 let service=SERVICE.to_string();
 let data_dir=app.path().app_data_dir().map_err(|e|format!("APP_DATA_DIR_FAILED: {e}"))?;
 let json_path=data_dir.join("youtube-oauth.json");
 let mut json_status="NOT_FOUND".to_string();
 let mut json_profiles=0usize;
 let mut json_refresh_tokens=0usize;
 let mut current_ids=BTreeSet::<String>::new();
 let mut json_error:Option<String>=None;
 if json_path.exists(){
  match fs::read(&json_path){
   Ok(bytes)=>match serde_json::from_slice::<serde_json::Value>(&bytes){
    Ok(v)=>{
     json_status="FOUND".into();
     if let Some(ps)=v.get("profiles").and_then(|x|x.as_array()){
      json_profiles=ps.len();
      for p in ps{
       if let Some(id)=p.get("id").and_then(|x|x.as_str()).filter(|x|!x.trim().is_empty()){current_ids.insert(id.to_string());}
       if p.get("refresh_token").and_then(|x|x.as_str()).map(|x|!x.trim().is_empty()).unwrap_or(false){json_refresh_tokens+=1;}
      }
     }
    }
    Err(e)=>{json_status="READ_FAILED".into();json_error=Some(format!("JSON_PARSE_FAILED: {e}"));}
   },
   Err(e)=>{json_status="READ_FAILED".into();json_error=Some(format!("JSON_READ_FAILED: {e}"));}
  }
 }
 let accounts=match list_secret_accounts(""){
  Ok(v)=>v,
  Err(e)=>return Ok(serde_json::json!({
   "app_version":env!("CARGO_PKG_VERSION"),"bundle_id":"studio.channelflow.desktop","service":service,
   "enumeration_status":"FAIL","osstatus":inventory_osstatus(&e),"enumeration_error":e,
   "total_service_accounts":0,"refresh_token_accounts":0,"access_token_accounts":0,"client_secret_accounts":0,"unique_oauth_profile_uuids":0,
   "profiles":[],"current_channel_profiles":current_ids.len(),"current_uuid_with_refresh_token":0,"current_uuid_without_refresh_token":current_ids.len(),
   "keychain_uuid_not_present_in_current_database":0,"orphan_profile_uuid_count":0,"readable_orphan_refresh_tokens":0,"denied_orphan_refresh_tokens":0,"failed_orphan_refresh_tokens":0,
   "historical_json":{"exact_path":json_path.display().to_string(),"file":json_status,"profiles_in_json":json_profiles,"profiles_with_refresh_token":json_refresh_tokens,"error":json_error}
  })),
 };
 let mut by_id:BTreeMap<String,BTreeSet<String>>=BTreeMap::new();
 let mut refresh_count=0usize;let mut access_count=0usize;let mut secret_count=0usize;
 for account in &accounts{
  if let Some((id,kind))=inventory_oauth_account_parts(account){
   match kind{"refresh_token"=>refresh_count+=1,"access_token"=>access_count+=1,"client_secret"=>secret_count+=1,_=>{}}
   by_id.entry(id).or_default().insert(kind.to_string());
  }
 }
 let mut all_ids:BTreeSet<String>=by_id.keys().cloned().collect();
 all_ids.extend(current_ids.iter().cloned());
 let mut rows=Vec::<serde_json::Value>::new();
 let mut current_with=0usize;let mut orphan_count=0usize;let mut orphan_readable=0usize;let mut orphan_denied=0usize;let mut orphan_failed=0usize;
 for id in all_ids{
  let kinds=by_id.get(&id).cloned().unwrap_or_default();
  let refresh_present=kinds.contains("refresh_token");
  let is_current=current_ids.contains(&id);let is_orphan=!is_current&&by_id.contains_key(&id);
  if is_current&&refresh_present{current_with+=1}
  if is_orphan{orphan_count+=1}
  let (read_status,read_osstatus,read_error)=if refresh_present{inventory_read_status(&format!("oauth.{id}.refresh_token"))}else{("NOT_RUN".into(),None,None)};
  if is_orphan&&refresh_present{match read_status.as_str(){"PASS"=>orphan_readable+=1,"ACCESS_DENIED"=>orphan_denied+=1,_=>orphan_failed+=1}}
  rows.push(serde_json::json!({
   "profile_uuid":id,"is_current":is_current,"is_orphan":is_orphan,
   "refresh_token_account":if refresh_present{"PRESENT"}else{"ABSENT"},
   "access_token_account":if kinds.contains("access_token"){"PRESENT"}else{"ABSENT"},
   "client_secret_account":if kinds.contains("client_secret"){"PRESENT"}else{"ABSENT"},
   "refresh_token_read":read_status,"refresh_read_osstatus":read_osstatus,"refresh_read_error":read_error
  }));
 }
 Ok(serde_json::json!({
  "app_version":env!("CARGO_PKG_VERSION"),"bundle_id":"studio.channelflow.desktop","service":service,
  "enumeration_status":"PASS","osstatus":0,"enumeration_error":serde_json::Value::Null,
  "total_service_accounts":accounts.len(),"refresh_token_accounts":refresh_count,"access_token_accounts":access_count,"client_secret_accounts":secret_count,"unique_oauth_profile_uuids":by_id.len(),
  "profiles":rows,"current_channel_profiles":current_ids.len(),"current_uuid_with_refresh_token":current_with,"current_uuid_without_refresh_token":current_ids.len().saturating_sub(current_with),
  "keychain_uuid_not_present_in_current_database":orphan_count,"orphan_profile_uuid_count":orphan_count,
  "readable_orphan_refresh_tokens":orphan_readable,"denied_orphan_refresh_tokens":orphan_denied,"failed_orphan_refresh_tokens":orphan_failed,
  "historical_json":{"exact_path":json_path.display().to_string(),"file":json_status,"profiles_in_json":json_profiles,"profiles_with_refresh_token":json_refresh_tokens,"error":json_error}
 }))
}
'''
    sec.write_text(s)

lib=root/'src-tauri/src/lib.rs'
s=lib.read_text()
if 'security::security_oauth_inventory' not in s:
    s=s.replace('security::security_keychain_diagnostics,','security::security_keychain_diagnostics,security::security_oauth_inventory,')
    if 'security::security_oauth_inventory' not in s: raise SystemExit('lib.rs invoke anchor not found')
    lib.write_text(s)

api=root/'src/api.ts'
s=api.read_text()
if 'export type OAuthLocalInventory=' not in s:
    anchor='export type KeychainDiagnostic={ok:boolean;status:string;service?:string};'
    insert=anchor+"\n"+'''export type OAuthInventoryProfile={profile_uuid:string;is_current:boolean;is_orphan:boolean;refresh_token_account:'PRESENT'|'ABSENT';access_token_account:'PRESENT'|'ABSENT';client_secret_account:'PRESENT'|'ABSENT';refresh_token_read:'PASS'|'ACCESS_DENIED'|'READ_FAILED'|'NOT_RUN';refresh_read_osstatus?:number|null;refresh_read_error?:string|null};\nexport type OAuthLocalInventory={app_version:string;bundle_id:string;service:string;enumeration_status:'PASS'|'FAIL';osstatus?:number|null;enumeration_error?:string|null;total_service_accounts:number;refresh_token_accounts:number;access_token_accounts:number;client_secret_accounts:number;unique_oauth_profile_uuids:number;profiles:OAuthInventoryProfile[];current_channel_profiles:number;current_uuid_with_refresh_token:number;current_uuid_without_refresh_token:number;keychain_uuid_not_present_in_current_database:number;orphan_profile_uuid_count:number;readable_orphan_refresh_tokens:number;denied_orphan_refresh_tokens:number;failed_orphan_refresh_tokens:number;historical_json:{exact_path:string;file:'FOUND'|'NOT_FOUND'|'READ_FAILED';profiles_in_json:number;profiles_with_refresh_token:number;error?:string|null}};'''
    if anchor not in s: raise SystemExit('api type anchor not found')
    s=s.replace(anchor,insert)
if 'securityOauthInventory:' not in s:
    anchor="  securityKeychainDiagnostics:()=>invoke<KeychainDiagnostic>('security_keychain_diagnostics'),"
    insert=anchor+"\n  securityOauthInventory:()=>invoke<OAuthLocalInventory>('security_oauth_inventory'),"
    if anchor not in s: raise SystemExit('api invoke anchor not found')
    s=s.replace(anchor,insert)
api.write_text(s)

panel=root/'src/OAuthInventoryPanel.tsx'
panel.write_text(r'''import React,{useMemo,useState} from 'react';
import {api,type OAuthLocalInventory} from './api';
import {notifyError,notifySuccess} from './notificationCenter';

function safeReport(r:OAuthLocalInventory){
 const out:string[]=[];
 out.push('VYRON LOCAL OAUTH CREDENTIAL INVENTORY');
 out.push(`APP VERSION: ${r.app_version}`);out.push(`BUNDLE ID: ${r.bundle_id}`);out.push(`KEYCHAIN SERVICE: ${r.service}`);out.push('');
 out.push(`KEYCHAIN ENUMERATION: ${r.enumeration_status}`);out.push(`OSSTATUS: ${r.osstatus??'N/A'}`);out.push(`TOTAL SERVICE ACCOUNTS: ${r.total_service_accounts}`);
 out.push(`REFRESH TOKEN ACCOUNTS: ${r.refresh_token_accounts}`);out.push(`ACCESS TOKEN ACCOUNTS: ${r.access_token_accounts}`);out.push(`CLIENT SECRET ACCOUNTS: ${r.client_secret_accounts}`);out.push(`UNIQUE OAUTH PROFILE UUIDs: ${r.unique_oauth_profile_uuids}`);out.push('');
 out.push(`CURRENT CHANNEL PROFILES: ${r.current_channel_profiles}`);out.push(`CURRENT UUID WITH REFRESH TOKEN: ${r.current_uuid_with_refresh_token}`);out.push(`CURRENT UUID WITHOUT REFRESH TOKEN: ${r.current_uuid_without_refresh_token}`);out.push(`KEYCHAIN UUID NOT PRESENT IN CURRENT DATABASE: ${r.keychain_uuid_not_present_in_current_database}`);out.push('');
 out.push(`ORPHAN PROFILE UUID COUNT: ${r.orphan_profile_uuid_count}`);out.push(`READABLE ORPHAN REFRESH TOKENS: ${r.readable_orphan_refresh_tokens}`);out.push(`DENIED ORPHAN REFRESH TOKENS: ${r.denied_orphan_refresh_tokens}`);out.push(`FAILED ORPHAN REFRESH TOKENS: ${r.failed_orphan_refresh_tokens}`);out.push('');
 out.push(`V2.0.8 JSON EXACT PATH: ${r.historical_json.exact_path}`);out.push(`V2.0.8 JSON FILE: ${r.historical_json.file}`);out.push(`JSON PROFILES: ${r.historical_json.profiles_in_json}`);out.push(`JSON REFRESH TOKENS: ${r.historical_json.profiles_with_refresh_token}`);if(r.historical_json.error)out.push(`JSON ERROR: ${r.historical_json.error}`);if(r.enumeration_error)out.push(`ENUMERATION ERROR: ${r.enumeration_error}`);out.push('');
 for(const p of r.profiles){out.push(`PROFILE UUID: ${p.profile_uuid}`);out.push(`  CURRENT: ${p.is_current?'YES':'NO'} | ORPHAN: ${p.is_orphan?'YES':'NO'}`);out.push(`  REFRESH TOKEN ACCOUNT: ${p.refresh_token_account}`);out.push(`  ACCESS TOKEN ACCOUNT: ${p.access_token_account}`);out.push(`  CLIENT SECRET ACCOUNT: ${p.client_secret_account}`);out.push(`  REFRESH TOKEN READ: ${p.refresh_token_read}${p.refresh_read_osstatus!=null?` | OSSTATUS ${p.refresh_read_osstatus}`:''}`);if(p.refresh_read_error)out.push(`  READ ERROR: ${p.refresh_read_error}`);}
 out.push('');out.push('SECRET VALUES ARE NOT INCLUDED. NO YOUTUBE/GOOGLE API CALLS WERE PERFORMED.');return out.join('\n');
}
async function copyText(text:string){try{await navigator.clipboard.writeText(text);return}catch{}const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}
export function OAuthInventoryPanel(){const [busy,setBusy]=useState(false),[r,setR]=useState<OAuthLocalInventory|undefined>();const report=useMemo(()=>r?safeReport(r):'',[r]);async function scan(){setBusy(true);try{const next=await api.securityOauthInventory();setR(next);if(next.enumeration_status==='PASS')notifySuccess('Локальные OAuth credentials просканированы',`${next.refresh_token_accounts} refresh-token account(s), ${next.orphan_profile_uuid_count} orphan UUID.`);else notifyError('Keychain enumeration failed',next.enumeration_error||`OSStatus ${next.osstatus??'unknown'}`)}catch(e){notifyError('OAuth inventory failed',String(e))}finally{setBusy(false)}}async function copy(){if(!report)return;await copyText(report);notifySuccess('Безопасный отчёт скопирован','Token/client_secret values в отчёт не включаются.')}
 return <div className="settingsStack"><section className="settingsCard"><div className="panelHead"><div><small>LOCAL MAC • NO YOUTUBE API</small><h3>OAuth Diagnostics</h3><p>Native Security.framework inventory для service com.scaleup.vyron.security. Google refresh и channel identity не вызываются.</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="primary" disabled={busy} onClick={scan}>{busy?'Сканирую…':'Сканировать локальные credentials'}</button><button className="settingsAction" disabled={!r} onClick={copy}>Скопировать безопасный отчёт</button></div></div>{r&&<><div className="settingsInfoGrid"><span><small>Enumeration</small><b>{r.enumeration_status} • OSStatus {r.osstatus??'—'}</b></span><span><small>Service accounts</small><b>{r.total_service_accounts}</b></span><span><small>Refresh token accounts</small><b>{r.refresh_token_accounts}</b></span><span><small>Current profiles</small><b>{r.current_channel_profiles}</b></span><span><small>Current with token</small><b>{r.current_uuid_with_refresh_token}</b></span><span><small>Orphan UUID</small><b>{r.orphan_profile_uuid_count}</b></span><span><small>Readable orphan</small><b>{r.readable_orphan_refresh_tokens}</b></span><span><small>Denied orphan</small><b>{r.denied_orphan_refresh_tokens}</b></span><span><small>JSON profiles / tokens</small><b>{r.historical_json.profiles_in_json} / {r.historical_json.profiles_with_refresh_token}</b></span></div><details open><summary>Безопасный inventory report</summary><pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word',maxHeight:520,overflow:'auto',userSelect:'text'}}>{report}</pre></details></>}</section></div>}
''')

settings=root/'src/SettingsOS.tsx'
s=settings.read_text()
if "./OAuthInventoryPanel" not in s:
    anchor="import {VYRON_RELEASE_HISTORY} from './releaseHistory';"
    if anchor not in s: raise SystemExit('settings import anchor not found')
    s=s.replace(anchor,anchor+"\nimport {OAuthInventoryPanel} from './OAuthInventoryPanel';")
if "'oauthdiag'" not in s:
    old="type Tab='general'|'youtube'|'endlume'|'updates'|'license'|'about'|'diagnostics';"
    if old not in s: raise SystemExit('settings tab type anchor not found')
    s=s.replace(old,"type Tab='general'|'youtube'|'endlume'|'updates'|'license'|'about'|'oauthdiag'|'diagnostics';")
if "['oauthdiag','OAuth Diagnostics']" not in s:
    old="['about','О программе'],['diagnostics','Диагностика']"
    if old not in s: raise SystemExit('settings tabs anchor not found')
    s=s.replace(old,"['about','О программе'],['oauthdiag','OAuth Diagnostics'],['diagnostics','Диагностика']")
if "tab==='oauthdiag'" not in s:
    anchor=" {tab==='diagnostics'&&"
    if anchor not in s: raise SystemExit('settings diagnostics render anchor not found')
    s=s.replace(anchor," {tab==='oauthdiag'&&<OAuthInventoryPanel/>}\n"+anchor,1)
settings.write_text(s)
print('global oauth inventory patch applied')
