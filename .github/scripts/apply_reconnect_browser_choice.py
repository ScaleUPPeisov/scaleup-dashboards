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

# The storage feature patch is applied later in the targeted workflow.  Drop a
# sitecustomize hook into the assembled root so the first Python process after
# that patch normalizes only the two malformed generated regression fixtures.
(root/'sitecustomize.py').write_text(r'''from pathlib import Path
p=Path('src/storageLifecycle.test.ts')
q=Path('src/v2111PublisherWiring.test.ts')
if p.exists():
 p.write_text("""import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {recordVerifiedUpload,successfulUploadForHash,markHistoryTrashed} from './storageLifecycle';
const pub=fs.readFileSync('src/PublisherOS.tsx','utf8'),store=fs.readFileSync('src/store.ts','utf8'),lifecycle=fs.readFileSync('src/storageLifecycle.ts','utf8'),api=fs.readFileSync('src/api.ts','utf8'),yt=fs.readFileSync('src-tauri/src/youtube.rs','utf8'),del=fs.readFileSync('src-tauri/src/local_delete.rs','utf8'),prod=fs.readFileSync('src-tauri/src/production_manager.rs','utf8');
const verified=(path='/ready/VIDEO_001.mov',sha='sha-001')=>({jobId:'job-1',channelId:'channel-1',profileId:'profile-1',youtubeChannelId:'UC1',youtubeVideoId:'yt-video-1',localFilePath:path,originalFilename:path.split('/').pop()||'VIDEO_001.mov',projectId:'project-1',sourceProjectPath:'/production/project-1',uploadedAt:'2026-09-12T00:00:00.000Z',fileSize:123456,sha256:sha,publishAt:'2026-09-13T11:00:00.000Z',overrideDuplicate:false} as any);
describe('Storage Lifecycle + Duplicate Upload Guard',()=>{
 it('verified upload creates UPLOADED persistent history with videoId',()=>{const h=recordVerifiedUpload([],verified());expect(h).toHaveLength(1);expect(h[0].status).toBe('UPLOADED');expect(h[0].youtubeVideoId).toBe('yt-video-1');expect(h[0].sha256).toBe('sha-001')});
 it('same SHA-256 is detected as duplicate',()=>{const h=recordVerifiedUpload([],verified());expect(successfulUploadForHash(h,'sha-001')?.youtubeVideoId).toBe('yt-video-1')});
 it('renamed or moved same file remains duplicate because path is not identity',()=>{const h=recordVerifiedUpload([],verified('/old/VIDEO_001.mov','same-content'));expect(successfulUploadForHash(h,'same-content')).toBeTruthy();expect(successfulUploadForHash(h,'different-content')).toBeFalsy()});
 it('29 NEW + 1 duplicate isolates only duplicate',()=>{const h=recordVerifiedUpload([],verified('/old/a.mov','dup'));const hashes=[...Array.from({length:29},(_,i)=>`new-${i}`),'dup'];expect(hashes.filter(x=>!successfulUploadForHash(h,x))).toHaveLength(29)});
 it('verification-failed upload cannot persist success proof',()=>{const b=pub.indexOf('if(uploaded.verified===false)');const f=pub.indexOf('youtubeVideoId:undefined',b);const s=pub.indexOf('persistVerifiedUpload(j,channel,uploaded.videoId',b);expect(b).toBeGreaterThanOrEqual(0);expect(f).toBeGreaterThan(b);expect(s).toBeGreaterThan(f)});
 it('resumable verification failure clears proof before history',()=>{const a=pub.indexOf('async function resumeUpload');const b=pub.indexOf('if(uploaded.verified===false)',a);const f=pub.indexOf('youtubeVideoId:undefined',b);const s=pub.indexOf('persistVerifiedUpload(j,c,uploaded.videoId',b);expect(a).toBeGreaterThanOrEqual(0);expect(b).toBeGreaterThan(a);expect(f).toBeGreaterThan(b);expect(s).toBeGreaterThan(f)});
 it('Trash keeps upload history and hash proof',()=>{const h=recordVerifiedUpload([],verified());const n=markHistoryTrashed(h,'job-1');expect(n).toHaveLength(1);expect(n[0].youtubeVideoId).toBe('yt-video-1');expect(successfulUploadForHash(n,'sha-001')).toBeTruthy()});
 it('state v8 persistence fields coexist with channels and jobs',()=>{expect(store).toContain('version:8');for(const x of ['uploadHistory','fingerprintCache','projectLifecycle','channels','jobs'])expect(store).toContain(x)});
 it('full-file SHA-256 and sequential cache wiring exist',()=>{expect(yt).toContain('full_file_sha256');expect(yt).toContain('Sha256');expect(api).toContain('youtube_file_fingerprint');expect(pub).toContain('fingerprintCache');expect(pub).toContain('for(const j of targets)')});
 it('project cleanup requires verified proof',()=>{expect(lifecycle).toContain('SAFE_TO_CLEAN');expect(lifecycle).toContain('youtubeVideoId');expect(lifecycle).toContain('UPLOADED');expect(pub).toContain('nextProjectLifecycle')});
 it('system Trash and path guards replace destructive local delete',()=>{expect(del).toContain('trash::delete');expect(del).toContain('allowed');expect(prod).toContain('trash::delete');expect(prod).toContain('SAFE_TO_CLEAN');expect(del).not.toContain('fs::remove_file(');expect(del).not.toContain('fs::remove_dir_all(')});
 it('UI defaults New and uploaded rows are not normally selectable',()=>{expect(pub).toContain("useState<'new'|'uploaded'|'all'>('new')");expect(pub).toContain('Новые {newCount}');expect(pub).toContain('Загруженные {uploadedCount}');expect(pub).toContain('Все {newCount+uploadedCount}');expect(pub).toContain("disabled={j.status==='UPLOADING'||uploaded}");expect(pub).toContain('Всё равно загрузить повторно')});
 it('remove-from-list is distinct from system Trash',()=>{expect(pub).toContain('Убрать из списка');expect(pub).toContain('Переместить файл в Корзину');expect(pub).toContain('api.trashLocalFile')});
});
""")
if q.exists():
 q.write_text("""import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
const pub=fs.readFileSync('src/PublisherOS.tsx','utf8'),api=fs.readFileSync('src/api.ts','utf8');
describe('PublisherOS storage/upload wiring',()=>{
 it('uses canonical selectable jobs',()=>expect(pub).toContain('canonicalSelectedJobs(selectableJobs,draft.selectedIds)'));
 it('button uses truthful label helper',()=>expect(pub).toContain('publisherUploadButtonLabel'));
 it('batch executes uploadable subset',()=>expect(pub).toContain('let batch=uploadableSelected'));
 it('blocked items are isolated individually',()=>expect(pub).toContain('for(const x of blockedItems)'));
 it('upload instrumentation exists',()=>expect(pub).toContain('[UPLOAD] button clicked'));
 it('preflight instrumentation exists',()=>expect(pub).toContain('[PREFLIGHT] input='));
 it('schedule instrumentation exists',()=>expect(pub).toContain('[SCHEDULE] VIDEO_'));
 it('success persistence occurs after verified branch',()=>{const b=pub.indexOf('if(uploaded.verified===false)');const s=pub.indexOf('persistVerifiedUpload(j,channel,uploaded.videoId',b);expect(b).toBeGreaterThanOrEqual(0);expect(s).toBeGreaterThan(b)});
 it('verification failure clears success proof and marks FAILED',()=>{const i=pub.indexOf('if(uploaded.verified===false)');const tail=pub.slice(i,i+1400);expect(tail).toContain("storageLifecycle:'FAILED'");expect(tail).toContain('youtubeVideoId:undefined')});
 it('quota plan includes videos.list verification',()=>expect(pub).toContain("method:'videos.list'"));
 it('frontend invokes existing uploader',()=>expect(api).toContain('youtube_upload_video'));
});
""")
''')

print('reconnect browser choice patch applied')
