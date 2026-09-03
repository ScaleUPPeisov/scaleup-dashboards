#!/usr/bin/env python3
from pathlib import Path
import json,re,sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')

def read(p): return (ROOT/p).read_text()
def write(p,s): (ROOT/p).write_text(s)
def rep(p,a,b,count=1):
    s=read(p)
    if a not in s: raise SystemExit(f'v120 core missing anchor {p}: {a[:180]!r}')
    write(p,s.replace(a,b,count))

# ---------- version ----------
version='1.2.0'
p=ROOT/'package.json'; x=json.loads(p.read_text()); x['version']=version; p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
p=ROOT/'src-tauri/tauri.conf.json'; conf=json.loads(p.read_text()); conf['version']=version
# Visible window title only. productName/identifier/updater identity remain untouched.
for win in conf.get('app',{}).get('windows',[]):
    if 'title' in win: win['title']='VYRON YT PEISOV'
p.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n')
p=ROOT/'src-tauri/Cargo.toml'; s=p.read_text(); m=re.search(r'(?ms)^\[package\]\n(.*?)(?=^\[|\Z)',s)
if not m: raise SystemExit('Cargo package section missing')
section=m.group(0); section2=re.sub(r'(?m)^version\s*=\s*"[^"]+"',f'version = "{version}"',section,count=1)
p.write_text(s[:m.start()]+section2+s[m.end():])
if (ROOT/'package-lock.json').exists():
    p=ROOT/'package-lock.json'; x=json.loads(p.read_text()); x['version']=version
    if isinstance(x.get('packages'),dict) and isinstance(x['packages'].get(''),dict): x['packages']['']['version']=version
    p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')

# ---------- types / persistent settings ----------
p='src/types.ts'
rep(p,"  youtubeProfileId?:string; youtubeChannelId?:string;", "  youtubeProfileId?:string; youtubeChannelId?:string;\n  safeDailyUploadLimit?:number; knownUploadLimitState?:'unknown'|'ok'|'limited'; lastDailyLimitError?:string; lastUploadAt?:string;")
rep(p,"  youtubeVideoId?:string; uploadProgress?:number; uploadedAt?:string;", "  youtubeVideoId?:string; uploadProgress?:number; uploadedAt?:string;\n  thumbnailPath?:string; uploadFingerprint?:string; uploadInterruptedAt?:string; endlumeSentAt?:string;")
rep(p,"  youtubeIntelligenceAutoRefresh:boolean; youtubeIntelligenceRefreshMin:number;", "  youtubeIntelligenceAutoRefresh:boolean; youtubeIntelligenceRefreshMin:number; youtubePublishSafeMode:boolean;")
p='src/store.ts'
rep(p,"  youtubeIntelligenceAutoRefresh:false,youtubeIntelligenceRefreshMin:30,", "  youtubeIntelligenceAutoRefresh:false,youtubeIntelligenceRefreshMin:30,youtubePublishSafeMode:true,")

# ---------- build metadata ----------
write('src/buildInfo.ts',"""export const VYRON_PRODUCT_NAME='VYRON YT PEISOV';\nexport const VYRON_PRODUCT_SUBTITLE='YouTube Production OS';\nexport const VYRON_BUILD_DATE=(import.meta.env.VITE_BUILD_DATE||'development').trim();\n""")

# ---------- quota operation accounting ----------
p='src/youtubeQuota.ts'
s=read(p)
s=s.replace("const PLAN_KEY='vyron:youtube-quota-plan:v1';", "const PLAN_KEY='vyron:youtube-quota-plan:v1';\nconst OPERATION_LEDGER_KEY='vyron:youtube-operation-ledger:v1';")
s=s.replace("type Reservation={id:string;createdAt:string;buckets:Record<YoutubeQuotaBucket,number>};", "type Reservation={id:string;createdAt:string;buckets:Record<YoutubeQuotaBucket,number>};\ntype OperationLedgerRow={operationId:string;ptDate:string;updatedAt:string;buckets:Record<YoutubeQuotaBucket,number>;methods:Record<string,{calls:number;cost:number}>};")
old="""export function recordYoutubeApiRequest(event:YoutubeApiRequestEvent){
 const def=youtubeQuotaCosts[event.method as YoutubeApiMethod],x=readLedger(),at=event.at||new Date().toISOString();
 if(!def){x.unpricedAttempts=[...(x.unpricedAttempts||[]),{method:event.method,at}].slice(-100);x.lastAction=`UNPRICED ${event.method}`;saveLedger(x);return x}
 const b=x.buckets[def.bucket];b.used+=def.cost;b.calls+=1;x.lastAction=`${event.method} +${def.cost} ${def.bucket}`;saveLedger(x);if(event.operationId)consumeYoutubeQuotaReservation(event.operationId,event.method as YoutubeApiMethod);return x
}"""
new="""function readOperationRows():OperationLedgerRow[]{try{const x=JSON.parse(lsGet(OPERATION_LEDGER_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
function saveOperationRows(rows:OperationLedgerRow[]){lsSet(OPERATION_LEDGER_KEY,JSON.stringify(rows.slice(-200)))}
function recordOperationRequest(operationId:string,method:string,bucket:YoutubeQuotaBucket,cost:number,at:string){const day=youtubePtDate();let rows=readOperationRows().filter(x=>x.ptDate===day),row=rows.find(x=>x.operationId===operationId);if(!row){row={operationId,ptDate:day,updatedAt:at,buckets:{general:0,videoUploads:0,search:0},methods:{}};rows.push(row)}row.updatedAt=at;row.buckets[bucket]=(row.buckets[bucket]||0)+cost;const m=row.methods[method]||{calls:0,cost:0};m.calls++;m.cost+=cost;row.methods[method]=m;saveOperationRows(rows)}
export function youtubeOperationActualCost(operationId:string){const row=readOperationRows().find(x=>x.operationId===operationId&&x.ptDate===youtubePtDate());return row||{operationId,ptDate:youtubePtDate(),updatedAt:'',buckets:{general:0,videoUploads:0,search:0},methods:{}}}
export function recordYoutubeApiRequest(event:YoutubeApiRequestEvent){
 const def=youtubeQuotaCosts[event.method as YoutubeApiMethod],x=readLedger(),at=event.at||new Date().toISOString();
 if(!def){x.unpricedAttempts=[...(x.unpricedAttempts||[]),{method:event.method,at}].slice(-100);x.lastAction=`UNPRICED ${event.method}`;saveLedger(x);return x}
 const b=x.buckets[def.bucket];b.used+=def.cost;b.calls+=1;x.lastAction=`${event.method} +${def.cost} ${def.bucket}`;saveLedger(x);if(event.operationId){recordOperationRequest(event.operationId,event.method,def.bucket,def.cost,at);consumeYoutubeQuotaReservation(event.operationId,event.method as YoutubeApiMethod)}return x
}"""
if old not in s: raise SystemExit('recordYoutubeApiRequest exact block missing')
s=s.replace(old,new,1)
write(p,s)

# ---------- Topbar / visible branding ----------
p='src/App.tsx'
rep(p,"import {sortChannelsAlphabetically} from './channelSort';", "import {sortChannelsAlphabetically} from './channelSort';\nimport {subscribeYoutubeQuota,subscribeYoutubeQuotaClock,youtubeQuotaClockSnapshot,youtubeQuotaUsage} from './youtubeQuota';")
old="""function Topbar(){const version=useRuntimeVersion();const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),auto=useApp(s=>s.settings.autopilotEnabled);const errors=jobs.filter(j=>j.status==='ERROR').length;return <header className=\"topbar\"><div><span className=\"crumb\">VYRON {version||'…'}</span><b>{new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'2-digit',month:'long'}).format(new Date())}</b></div><div className=\"topStatus\"><span><i className={auto?'ok':'idle'}/> {auto?'автопилот':'ручной режим'}</span><span><i className=\"ok\"/> {channels.length} каналов</span><span className={errors?'warn':''}>{errors?`⚠ ${errors} ошибок`:'✓ система готова'}</span></div></header>}"""
new="""function Topbar(){const version=useRuntimeVersion();const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),auto=useApp(s=>s.settings.autopilotEnabled);const [quota,setQuota]=useState(()=>youtubeQuotaUsage()),[clock,setClock]=useState(()=>youtubeQuotaClockSnapshot());useEffect(()=>{const off=subscribeYoutubeQuota(()=>setQuota(youtubeQuotaUsage())),offClock=subscribeYoutubeQuotaClock(setClock);return()=>{off();offClock()}},[]);const errors=jobs.filter(j=>j.status==='ERROR').length,remaining=Math.max(0,quota.limit-quota.used);return <header className=\"topbar vyronMasterTopbar\"><div className=\"topbarIdentity\"><span className=\"crumb\">VYRON YT PEISOV {version||'…'}</span><b>{new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date())}</b></div><div className=\"topbarQuota\"><span><small>YouTube API</small><b>{remaining.toLocaleString('ru-RU')} / {quota.limit.toLocaleString('ru-RU')}</b></span><span><small>Сброс квоты</small><b>{clock.localTime}</b></span><span className=\"quotaCountdown\"><small>До сброса</small><b>{clock.countdown}</b></span></div><div className=\"topStatus\"><span><i className={auto?'ok':'idle'}/> {auto?'автопилот':'ручной режим'}</span><span><i className=\"ok\"/> {channels.length} каналов</span><span className={errors?'warn':''}>{errors?`⚠ ${errors} ошибок`:'✓ система готова'}</span></div></header>}"""
rep(p,old,new)

# Visible UI branding only; do not touch lower-case persistence identifiers or Rust technical paths.
for fp in (ROOT/'src').glob('*.tsx'):
    text=fp.read_text()
    text=text.replace('VYRON YT PEISOV YT PEISOV','VYRON YT PEISOV')
    text=text.replace('VYRON','VYRON YT PEISOV')
    text=text.replace('VYRON YT PEISOV YT PEISOV','VYRON YT PEISOV')
    fp.write_text(text)
# Visible dialog copy.
p='src/api.ts'; s=read(p).replace("title:'Папка VYRON'","title:'Папка VYRON YT PEISOV'"); write(p,s)
# HTML title if present.
p=ROOT/'index.html'
if p.exists():
    s=p.read_text();s=re.sub(r'<title>.*?</title>','<title>VYRON YT PEISOV</title>',s,count=1,flags=re.S);p.write_text(s)

# ---------- QuotaMeter: shared clock, no second 1-second timer ----------
write('src/QuotaMeter.tsx',r'''import React,{useEffect,useMemo,useState} from 'react';
import {buildYoutubeQuotaPlan,clearYoutubeQuotaGuard,loadYoutubeQuotaPlan,saveYoutubeQuotaPlan,setYoutubeQuotaLimit,subscribeYoutubeQuota,subscribeYoutubeQuotaClock,youtubeQuotaClockSnapshot,youtubeQuotaState,youtubeQuotaUsage} from './youtubeQuota';

export function QuotaMeter({compact=false,defaultChannels=100}:{compact?:boolean;defaultChannels?:number}){
 const [usage,setUsage]=useState(()=>youtubeQuotaUsage()),[guard,setGuard]=useState(()=>youtubeQuotaState()),[clock,setClock]=useState(()=>youtubeQuotaClockSnapshot());
 const initial=loadYoutubeQuotaPlan();const [channels,setChannels]=useState(initial.channels||Math.max(1,defaultChannels)),[videos,setVideos]=useState(initial.videosPerChannel||30);
 useEffect(()=>{const refresh=()=>{setUsage(youtubeQuotaUsage());setGuard(youtubeQuotaState())};const off=subscribeYoutubeQuota(refresh),offClock=subscribeYoutubeQuotaClock(setClock);return()=>{off();offClock()}},[]);
 const plan=useMemo(()=>buildYoutubeQuotaPlan(channels,videos,usage),[channels,videos,usage.ptDate,usage.limit,usage.used]);const pct=Math.min(100,usage.limit?usage.used/usage.limit*100:0),remaining=Math.max(0,usage.limit-usage.used);
 const savePlan=()=>{saveYoutubeQuotaPlan({channels,videosPerChannel:videos});setUsage(youtubeQuotaUsage())};
 return <section className={`quotaMeter ${guard.blocked?'blocked':''} ${compact?'compact':''}`}>
  <div className="quotaMeterHead"><div><small>YOUTUBE API QUOTA</small><h3>{guard.blocked?'Пауза по квоте':'Локальный ledger'}</h3><p>Расход считается по фактически предпринятым API method calls. Countdown локальный и не обращается к YouTube.</p></div><span className={guard.blocked?'bad':'good'}>{guard.blocked?'QUOTA EXCEEDED':'TRACKING'}</span></div>
  <div className="quotaMeterStats"><div><small>Использовано</small><b>{usage.used.toLocaleString('ru-RU')}</b><em>из {usage.limit.toLocaleString('ru-RU')}</em></div><div><small>Осталось</small><b>{remaining.toLocaleString('ru-RU')}</b><em>units</em></div><div><small>Сброс</small><b>{clock.localTime}</b><em>00:00 America/Los_Angeles</em></div><div><small>До сброса</small><b>{clock.countdown}</b><em>{clock.localDate}</em></div></div>
  <div className="quotaMeterBar"><i style={{width:`${pct}%`}}/><span>{pct.toFixed(0)}%</span></div>
  {!compact&&<><div className="quotaPlannerControls"><label>Дневной лимит<input type="number" min="1000" step="1000" value={usage.limit} onChange={e=>setUsage(setYoutubeQuotaLimit(Math.max(1000,+e.target.value||10000)))}/></label><label>Каналов в плане<input type="number" min="1" max="1000" value={channels} onChange={e=>setChannels(Math.max(1,+e.target.value||1))}/></label><label>Видео / канал<input type="number" min="1" max="1000" value={videos} onChange={e=>setVideos(Math.max(1,+e.target.value||1))}/></label><button onClick={savePlan}>Сохранить план</button>{guard.blocked&&<button onClick={()=>{clearYoutubeQuotaGuard();setGuard(youtubeQuotaState());setUsage(youtubeQuotaUsage())}}>Проверить снова</button>}</div><div className="quotaPlannerSummary"><span><small>≈ на канал</small><b>{plan.perChannel.toLocaleString('ru-RU')} units</b></span><span><small>Нужно всего</small><b>{plan.totalUnits.toLocaleString('ru-RU')}</b></span><span><small>Сегодня</small><b>{plan.todayChannels} каналов</b></span><span><small>Оценка</small><b>≈ {plan.days} дн.</b></span></div><p className="quotaFinePrint">Планировщик — предварительная модель. Перед реальной Metadata/Publish операцией VYRON YT PEISOV показывает отдельный request plan и резервирует рассчитанную квоту. Фактический ledger заполняется только реальными API attempts.</p></>}
 </section>
}
''')

# ---------- CSS for new persistent topbar ----------
p='src/styles.css';s=read(p);s+='''\n/* VYRON YT PEISOV 1.2 master topbar */\n.vyronMasterTopbar{gap:18px;align-items:center}.topbarIdentity{min-width:245px}.topbarQuota{display:flex;gap:8px;margin-left:auto}.topbarQuota>span{display:flex;flex-direction:column;min-width:112px;padding:7px 10px;border:1px solid rgba(116,226,255,.14);border-radius:12px;background:rgba(8,20,34,.55)}.topbarQuota small{font-size:9px;letter-spacing:.08em;opacity:.6}.topbarQuota b{font-variant-numeric:tabular-nums;font-size:12px}.topbarQuota .quotaCountdown b{color:#75e6ff}.vyronMasterTopbar .topStatus{margin-left:0}@media(max-width:1180px){.vyronMasterTopbar .topStatus{display:none}}\n''';write(p,s)

print('VYRON YT PEISOV 1.2 core patch applied')
