#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1])
p=root/'src/AuthRecoveryCenter.tsx'
s=p.read_text()

# Add browser option type and deterministic selection helper.
helper=root/'src/reconnectBrowserChoiceCore.ts'
helper.write_text(r'''export type BrowserOption={id:string;label:string;available:boolean};
export function availableReconnectBrowsers(rows:BrowserOption[]){const a=rows.filter(x=>x.available);return a.length?a:[{id:'default',label:'Браузер по умолчанию',available:true}]}
export function resolveReconnectBrowser(rows:BrowserOption[],preferred?:string,remembered?:string){const a=availableReconnectBrowsers(rows);for(const id of [preferred,remembered,'default'])if(id&&a.some(x=>x.id===id))return id;return a[0]?.id||'default'}
''')

# Import helper.
old="import {buildFinalRecoveryRows,channelsWithoutProfile,nextReconnectProfileId,reconnectFailure,reconnectQueue,type FinalAuthStatus,type RecoveryTransient} from './authRecoveryFinalCore';"
new=old+"\nimport {availableReconnectBrowsers,resolveReconnectBrowser,type BrowserOption} from './reconnectBrowserChoiceCore';"
if old not in s: raise SystemExit('AuthRecoveryCenter import anchor missing')
s=s.replace(old,new,1)

# Add chooser state.
old="const [profiles,setProfiles]=useState<YoutubeProfile[]>([]),[inventory,setInventory]=useState<Inventory>({enumeration_status:'PASS',profiles:[]}),[busy,setBusy]=useState(''),[focus,setFocus]=useState(''),[transient,setTransient]=useState<Record<string,RecoveryTransient>>({}),[loaded,setLoaded]=useState(false);"
new="const [profiles,setProfiles]=useState<YoutubeProfile[]>([]),[inventory,setInventory]=useState<Inventory>({enumeration_status:'PASS',profiles:[]}),[busy,setBusy]=useState(''),[focus,setFocus]=useState(''),[transient,setTransient]=useState<Record<string,RecoveryTransient>>({}),[loaded,setLoaded]=useState(false),[browserOpen,setBrowserOpen]=useState(false),[browsers,setBrowsers]=useState<BrowserOption[]>([]),[selectedBrowser,setSelectedBrowser]=useState('default'),[pendingProfileId,setPendingProfileId]=useState('');"
if old not in s: raise SystemExit('AuthRecoveryCenter state anchor missing')
s=s.replace(old,new,1)

# Reconnect must use the explicitly chosen browser.
old="async function reconnect(profileId:string){if(busy)return;"
new="async function reconnect(profileId:string,browserChoice?:string){if(busy)return;"
if old not in s: raise SystemExit('reconnect signature anchor missing')
s=s.replace(old,new,1)
old="const browser=row.profile?.preferredBrowser||'default';\n   await invoke('youtube_oauth_reconnect_existing',{profileId,browser});"
new="const browser=browserChoice||row.profile?.preferredBrowser||'default';\n   localStorage.setItem('vyron:oauth-browser',browser);\n   await invoke('youtube_oauth_reconnect_existing',{profileId,browser});"
if old not in s: raise SystemExit('browser invoke anchor missing')
s=s.replace(old,new,1)

# Browser chooser, using the same native catalog already used by AccountsPage.
anchor=" const total=initialTotal.current??queue.length,currentNo=Math.min(total,completed.current+1);"
chooser=r''' async function chooseBrowser(profileId:string){
  if(busy)return;
  const row=rows.find(x=>x.profileId===profileId);if(!row)return;
  try{
   const raw=await api.youtubeOauthBrowsers();const available=availableReconnectBrowsers(raw);
   const remembered=localStorage.getItem('vyron:oauth-browser')||'default';
   const initial=resolveReconnectBrowser(available,row.profile?.preferredBrowser,remembered);
   setBrowsers(available);setSelectedBrowser(initial);setPendingProfileId(profileId);setBrowserOpen(true);
  }catch{
   const fallback:BrowserOption[]=[{id:'default',label:'Браузер по умолчанию',available:true}];setBrowsers(fallback);setSelectedBrowser('default');setPendingProfileId(profileId);setBrowserOpen(true);
  }
 }
 async function confirmBrowserReconnect(){const id=pendingProfileId;if(!id)return;const browser=selectedBrowser||'default';setBrowserOpen(false);setPendingProfileId('');await reconnect(id,browser)}
'''
if anchor not in s: raise SystemExit('total anchor missing')
s=s.replace(anchor,chooser+anchor,1)

# All reconnect buttons must ask for the browser first.
s=s.replace("onClick={()=>reconnect(target.profileId)}","onClick={()=>chooseBrowser(target.profileId)}")
s=s.replace("onClick={()=>reconnect(r.profileId)}","onClick={()=>chooseBrowser(r.profileId)}")
s=s.replace("void reconnect(r.profileId)","void chooseBrowser(r.profileId)")

# Insert chooser modal before closing the recovery center section.
anchor="  {unmapped.length>0&&<div className=\"errorBox\"><b>Каналы без существующего OAuthProfile: {unmapped.length}</b><p>Они не включены в автоматическую очередь: новый UUID без явной необходимости не создаётся.</p>{unmapped.map(c=><p key={c.id}>{c.name} • {c.youtubeChannelId||'channel_id отсутствует'} • PROFILE UUID: {c.youtubeProfileId||'NONE'}</p>)}</div>}\n </section>"
modal=r'''  {unmapped.length>0&&<div className="errorBox"><b>Каналы без существующего OAuthProfile: {unmapped.length}</b><p>Они не включены в автоматическую очередь: новый UUID без явной необходимости не создаётся.</p>{unmapped.map(c=><p key={c.id}>{c.name} • {c.youtubeChannelId||'channel_id отсутствует'} • PROFILE UUID: {c.youtubeProfileId||'NONE'}</p>)}</div>}
  {browserOpen&&<div className="modalBackdrop" onMouseDown={()=>{setBrowserOpen(false);setPendingProfileId('')}}><section className="confirmModal browserPicker" onMouseDown={e=>e.stopPropagation()}><small>GOOGLE OAUTH • ВОССТАНОВЛЕНИЕ</small><h2>Через какой браузер открыть этот канал?</h2><p>Выберите браузер, где уже открыт нужный Google/YouTube аккаунт. Выбор действует только для текущего переподключения.</p><div className="browserGrid">{browsers.map(x=><button key={x.id} className={selectedBrowser===x.id?'active':''} onClick={()=>setSelectedBrowser(x.id)}><b>{x.label}</b><small>{x.id==='default'?'Использовать системный браузер':'Открыть OAuth именно здесь'}</small></button>)}</div><footer><button onClick={()=>{setBrowserOpen(false);setPendingProfileId('')}}>Отмена</button><button className="primary" onClick={()=>void confirmBrowserReconnect()}>Продолжить через {browsers.find(x=>x.id===selectedBrowser)?.label||'браузер'}</button></footer></section></div>}
 </section>'''
if anchor not in s: raise SystemExit('modal insertion anchor missing')
s=s.replace(anchor,modal,1)
p.write_text(s)

# Focused browser-choice tests.
(root/'src/reconnectBrowserChoice.test.ts').write_text(r'''import {describe,it,expect} from 'vitest';
import {availableReconnectBrowsers,resolveReconnectBrowser} from './reconnectBrowserChoiceCore';
describe('reconnect browser choice',()=>{
 it('uses the profile preferred browser when installed',()=>{const rows=[{id:'default',label:'Default',available:true},{id:'chrome',label:'Chrome',available:true},{id:'safari',label:'Safari',available:true}];expect(resolveReconnectBrowser(rows,'safari','chrome')).toBe('safari')});
 it('falls back to remembered browser when profile preference is unavailable',()=>{const rows=[{id:'default',label:'Default',available:true},{id:'chrome',label:'Chrome',available:true},{id:'safari',label:'Safari',available:false}];expect(resolveReconnectBrowser(rows,'safari','chrome')).toBe('chrome')});
 it('removes unavailable browsers and always keeps a safe default',()=>{expect(availableReconnectBrowsers([{id:'chrome',label:'Chrome',available:false}])).toEqual([{id:'default',label:'Браузер по умолчанию',available:true}])});
});
''')

print('reconnect browser choice patch applied')
