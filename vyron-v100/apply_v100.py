from __future__ import annotations
from pathlib import Path
import json,re,shutil,sys

ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.vyron-v100')
HERE=Path('vyron-v100')
VERSION='1.0.1'

def fail(msg:str): raise SystemExit(msg)
def replace(path:Path,old:str,new:str,count:int=1):
    s=path.read_text()
    if old not in s: fail(f'marker missing in {path}: {old[:120]}')
    path.write_text(s.replace(old,new,count))

def copy(name:str):
    src=HERE/name; dst=ROOT/'src'/name
    if not src.exists(): fail(f'override missing: {src}')
    shutil.copyfile(src,dst)

def main():
    if not (ROOT/'package.json').exists(): fail('VYRON source root missing')
    pkg=json.loads((ROOT/'package.json').read_text())
    if pkg.get('version')!='0.9.9': fail(f"Expected VYRON 0.9.9, got {pkg.get('version')}")

    # Full UI overrides. Backend commands/OAuth/writer remain untouched.
    for name in ['ChannelsOS.tsx','AnalyticsPage.tsx','CompetitorsPage.tsx','SettingsOS.tsx','YouTubeCenter.tsx','YouTubeDataTools.tsx','ProductionWorkspace.tsx']:
        copy(name)

    # App: remove all global/background YouTube intelligence + quota UI. Local autopilot remains.
    app=ROOT/'src/App.tsx'
    s=app.read_text()
    s=s.replace("import { refreshYoutubeIntelligence } from './youtubeIntelligence';\n",'')
    s=s.replace("import {clearYoutubeQuotaGuard,subscribeYoutubeQuota,youtubeQuotaMessage,youtubeQuotaState} from './youtubeQuota';\n",'')
    s=s.replace(",[quota,setQuota]=useState(()=>youtubeQuotaState())",'')
    s=re.sub(r"\n  useEffect\(\(\)=>\{if\(!booted\|\|!settings\.youtubeIntelligenceAutoRefresh\).*?\},\[booted,settings\.youtubeIntelligenceAutoRefresh,settings\.youtubeIntelligenceRefreshMin\]\);",'',s,flags=re.S)
    s=re.sub(r"\n  useEffect\(\(\)=>\{const refresh=\(\)=>setQuota\(youtubeQuotaState\(\)\);.*?\},\[\]\);",'',s,flags=re.S)
    s=re.sub(r"\{quota\.blocked&&<div className=\"quotaGuardBanner\">.*?</div>\}","",s,flags=re.S)
    s=s.replace('VYRON 0.9.9 • macOS Apple Silicon',f'VYRON {VERSION} • macOS Apple Silicon').replace('VYRON 0.9.9</span>',f'VYRON {VERSION}</span>')
    app.write_text(s)

    # Local-only autopilot: physical removal of YouTube upload path.
    auto=ROOT/'src/autopilotRuntime.ts'; s=auto.read_text()
    s=re.sub(r"\nasync function uploadOne\(summary:AutopilotSummary\)\{.*?\n\}\n\nexport async function runAutopilotCycle",'\nexport async function runAutopilotCycle',s,flags=re.S)
    s=s.replace('    await uploadOne(summary);\n','')
    s=s.replace('summary.tracksMoved+summary.imagesMoved+summary.renderQueued+summary.uploads+summary.metadataGenerated+summary.prepared','summary.tracksMoved+summary.imagesMoved+summary.renderQueued+summary.metadataGenerated+summary.prepared')
    s=s.replace(', YouTube ${summary.uploads}','')
    auto.write_text(s)

    # Persisted settings are migrated safely: old FULL/autorefresh flags cannot trigger YouTube calls.
    store=ROOT/'src/store.ts'; s=store.read_text()
    s=s.replace('youtubeIntelligenceAutoRefresh:true,youtubeIntelligenceRefreshMin:30,','youtubeIntelligenceAutoRefresh:false,youtubeIntelligenceRefreshMin:30,')
    old="settings:{...DEFAULT_SETTINGS,...s.settings},logs:s.logs||[],booted:true"
    new="settings:{...DEFAULT_SETTINGS,...s.settings,autoUploadYoutube:false,youtubeIntelligenceAutoRefresh:false},logs:s.logs||[],booted:true"
    if old not in s: fail('store hydrate marker missing')
    s=s.replace(old,new,1); store.write_text(s)

    # Dashboard FULL is now FULL LOCAL, never YouTube write.
    dash=ROOT/'src/DashboardOS.tsx'; s=dash.read_text()
    s=s.replace("else patch({autopilotMode:m,autopilotEnabled:true,autoUploadYoutube:true})","else patch({autopilotMode:m,autopilotEnabled:true,autoUploadYoutube:false})")
    s=s.replace("'Производственный pipeline и публикация работают автоматически по настроенным правилам.'","'Локальный Production pipeline и ENDLUME работают автоматически. YouTube запускается только вручную.'")
    dash.write_text(s)

    # Production: keep existing filesystem/ENDLUME workflow, add persistent local workspace and fix status filter.
    prod=ROOT/'src/ProductionOS.tsx'; s=prod.read_text()
    if "import {ProductionWorkspace}" not in s:
        s=s.replace("import type {Channel,JobStatus} from './types';","import type {Channel,JobStatus} from './types';\nimport {ProductionWorkspace} from './ProductionWorkspace';")
    s=s.replace("const filtered=jobs.filter(j=>filter==='all'||j.channelId===filter).sort((a,b)=>a.number-b.number);","const filtered=jobs.filter(j=>filter==='all'||j.channelId===filter||j.status===filter).sort((a,b)=>a.number-b.number);")
    marker='<div className="pageHeader"><div><small>PRODUCTION PIPELINE</small>'
    if marker not in s: fail('Production header marker missing')
    end='</div></div>\n  <div className="youtubeTabs productionTabs">'
    if end not in s: fail('Production insertion marker missing')
    s=s.replace(end,'</div></div>\n  <ProductionWorkspace/>\n  <div className="youtubeTabs productionTabs">',1)
    prod.write_text(s)

    # Existing videos: no automatic sync on mount/return. Persist working table/selection/undo locally.
    ev=ROOT/'src/ExistingVideos.tsx'; s=ev.read_text()
    helper="""
type ExistingCache={version:1;updatedAt:string;videos:YoutubeExistingVideo[];baseline:Record<string,YoutubeExistingVideo>;lastUndo:YoutubeExistingVideo[];syncInfo:ExistingVideoSyncResult|null};
const existingCacheKey=(channelId:string)=>`vyron:existing-cache:v1:${channelId}`;
function readExistingCache(channelId:string):ExistingCache|undefined{if(!channelId)return;try{const x=JSON.parse(localStorage.getItem(existingCacheKey(channelId))||'null');return x?.version===1?x:undefined}catch{return}}
function writeExistingCache(channelId:string,x:ExistingCache){if(!channelId)return;try{localStorage.setItem(existingCacheKey(channelId),JSON.stringify(x))}catch{}}
"""
    anchor="const same=(a?:string,b?:string)=>(a||'')===(b||'');\n"
    if helper.strip() not in s:
        if anchor not in s: fail('Existing cache anchor missing')
        s=s.replace(anchor,anchor+helper,1)
    old="useEffect(()=>{const c=channels.find(x=>x.id===channelId);setProfileId(c?.youtubeProfileId||'');if(c)setCadence(c.cadenceDays||2);setVideos([]);setBaseline({});setLastUndo([]);setSyncInfo(null);setThumbs({});setMeta([]);setSelectedOnly(false);},[channelId,channels.find(x=>x.id===channelId)?.youtubeProfileId]);"
    new="useEffect(()=>{const c=channels.find(x=>x.id===channelId),cached=readExistingCache(channelId);setProfileId(c?.youtubeProfileId||'');if(c)setCadence(c.cadenceDays||2);setVideos(cached?.videos||[]);setBaseline(cached?.baseline||{});setLastUndo(cached?.lastUndo||[]);setSyncInfo(cached?.syncInfo||null);setThumbs({});setMeta([]);setSelectedOnly(false);},[channelId,channels.find(x=>x.id===channelId)?.youtubeProfileId]);"
    if old not in s: fail('Existing channel effect marker missing')
    s=s.replace(old,new,1)
    s=re.sub(r"\n useEffect\(\(\)=>\{if\(!profileId\|\|videos\.length\|\|busy\)return;const t=window\.setTimeout\(\(\)=>void sync\(\),350\);return\(\)=>window\.clearTimeout\(t\)\},\[profileId,channelId,limit\]\);",'',s)
    syncmark="setSyncInfo(r);toast(`YouTube: получено ${r.received}/${Math.min(r.youtubeFound||r.received,r.requested||limit)} видео`)"
    syncrepl="setSyncInfo(r);writeExistingCache(channelId,{version:1,updatedAt:new Date().toISOString(),videos:next,baseline:Object.fromEntries(next.map(v=>[v.id,{...v,tags:[...v.tags]}])),lastUndo:[],syncInfo:r});toast(`YouTube: получено ${r.received}/${Math.min(r.youtubeFound||r.received,r.requested||limit)} видео`)"
    if syncmark not in s: fail('Existing sync cache marker missing')
    s=s.replace(syncmark,syncrepl,1)
    insertion="\n useEffect(()=>{if(!channelId)return;const t=window.setTimeout(()=>writeExistingCache(channelId,{version:1,updatedAt:new Date().toISOString(),videos,baseline,lastUndo,syncInfo}),220);return()=>window.clearTimeout(t)},[channelId,videos,baseline,lastUndo,syncInfo]);"
    channel_effect_end=new+'\n'
    s=s.replace(channel_effect_end,channel_effect_end+insertion+'\n',1)
    ev.write_text(s)

    # Metadata draft already persistent; only remove hidden initial YouTube sync.
    meta=ROOT/'src/MetadataPage.tsx'; s=meta.read_text()
    s=re.sub(r"\n useEffect\(\(\)=>\{if\(target!==\'youtube\'\|\|!profileId\|\|yt\.length\)return;const t=window\.setTimeout\(\(\)=>void loadYoutube\(\),350\);return\(\)=>window\.clearTimeout\(t\)\},\[target,profileId,channelId\]\);",'',s)
    meta.write_text(s)

    # Account data/config may load locally, but API health check is explicit button-only.
    accounts=ROOT/'src/AccountsPage.tsx'; s=accounts.read_text()
    s=s.replace(" useEffect(()=>{if(profiles.length)void checkAll()},[profiles.length]);\n",'')
    accounts.write_text(s)

    # Quota reset: calculate the next 00:00 America/Los_Angeles and display it in the user's system timezone.
    quota=ROOT/'src/youtubeQuota.ts'; qs=quota.read_text()
    pt_anchor="const ptDate=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=(t:string)=>parts.find(x=>x.type===t)?.value||'';return `${g('year')}-${g('month')}-${g('day')}`};\n"
    local_helper="""export function nextYoutubeQuotaResetAt(now=new Date()){
 const tz='America/Los_Angeles';
 const dp=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=(p:Intl.DateTimeFormatPart[],t:string)=>Number(p.find(x=>x.type===t)?.value||0);
 const base=new Date(Date.UTC(get(dp,'year'),get(dp,'month')-1,get(dp,'day')+1));
 const y=base.getUTCFullYear(),m=base.getUTCMonth()+1,d=base.getUTCDate();
 const targetWall=Date.UTC(y,m-1,d,0,0,0);let guess=targetWall;
 const wallFmt=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<4;i++){const p=wallFmt.formatToParts(new Date(guess));const wall=Date.UTC(get(p,'year'),get(p,'month')-1,get(p,'day'),get(p,'hour'),get(p,'minute'),get(p,'second'));const delta=targetWall-wall;if(!delta)break;guess+=delta}
 return new Date(guess);
}
export function youtubeQuotaResetLocalInfo(now=new Date()){
 const at=nextYoutubeQuotaResetAt(now);const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'local';
 const time=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',hour12:false}).format(at);
 const date=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit'}).format(at);
 return{at,time,date,timeZone,label:`${time} • ${date}`};
}
"""
    if pt_anchor not in qs: fail('youtubeQuota ptDate marker missing')
    qs=qs.replace(pt_anchor,pt_anchor+local_helper,1)
    old_msg="export function youtubeQuotaMessage(){return 'Квота YouTube Data API исчерпана. VYRON поставил YouTube-запросы на паузу до следующего сброса дневной квоты (00:00 PT). Черновики и незавершённые пачки сохранены.'}"
    new_msg="export function youtubeQuotaMessage(){const r=youtubeQuotaResetLocalInfo();return `Квота YouTube Data API исчерпана. VYRON поставил YouTube-запросы на паузу до ${r.time} (${r.date}) по вашему местному времени. Базовый сброс Google: 00:00 Pacific Time. Черновики и незавершённые пачки сохранены.`}"
    if old_msg not in qs: fail('youtubeQuota message marker missing')
    qs=qs.replace(old_msg,new_msg,1);quota.write_text(qs)

    qm=ROOT/'src/QuotaMeter.tsx'; qms=qm.read_text()
    qms=qms.replace('youtubeQuotaState,youtubeQuotaUsage','youtubeQuotaResetLocalInfo,youtubeQuotaState,youtubeQuotaUsage')
    rem=" const remaining=Math.max(0,usage.limit-usage.used);\n"
    if rem not in qms: fail('QuotaMeter remaining marker missing')
    qms=qms.replace(rem,rem+" const reset=youtubeQuotaResetLocalInfo();\n",1)
    old_reset='<div><small>Сброс</small><b>00:00 PT</b><em>дневной пул</em></div>'
    new_reset='<div><small>Сброс по вашему времени</small><b>{reset.time}</b><em>{reset.date} • 00:00 PT</em></div>'
    if old_reset not in qms: fail('QuotaMeter reset marker missing')
    qms=qms.replace(old_reset,new_reset,1);qm.write_text(qms)

    # Premium additive CSS, no animated blur/shadow.
    css=ROOT/'src/styles.css'; extra=(HERE/'v100.css').read_text()
    if 'VYRON 1.0 — Premium Zero Quota UI' not in css.read_text(): css.write_text(css.read_text()+extra)

    # Version bump only. Keep identifier, updater pubkey/endpoint and storage architecture unchanged.
    pkg=json.loads((ROOT/'package.json').read_text());pkg['version']=VERSION;(ROOT/'package.json').write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')
    conf_path=ROOT/'src-tauri/tauri.conf.json';conf=json.loads(conf_path.read_text());conf['version']=VERSION;conf_path.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n')
    cargo=ROOT/'src-tauri/Cargo.toml';cs=cargo.read_text();cs=re.sub(r'(?m)^version = "0\.9\.9"$',f'version = "{VERSION}"',cs,count=1);cargo.write_text(cs)

    # Strong contract assertions before CI even starts.
    checks_absent={
      'src/App.tsx':['refreshYoutubeIntelligence','quotaGuardBanner','subscribeYoutubeQuota'],
      'src/autopilotRuntime.ts':['youtubeUpload(','uploadOne('],
      'src/ChannelsOS.tsx':['youtubeProfileHealth','refreshChannelAnalytics','youtubeStats('],
      'src/AnalyticsPage.tsx':['refreshChannelAnalytics','youtubeAnalytics('],
      'src/CompetitorsPage.tsx':['youtubeDiscoverCompetitors','refreshCompetitor('],
      'src/SettingsOS.tsx':['QuotaMeter','youtubeProfileHealth','youtubeAnalytics(','youtubeDiscoverCompetitors'],
    }
    for rel,marks in checks_absent.items():
        text=(ROOT/rel).read_text()
        for mark in marks:
            if mark in text: fail(f'Zero Quota violation {mark} in {rel}')
    for rel,marks in {
      'src/YouTubeCenter.tsx':['QuotaMeter','YouTubeDataTools','AccountsPage'],
      'src/YouTubeDataTools.tsx':['youtubeDiscoverCompetitors','refreshChannelAnalytics','refreshCompetitor'],
      'src/ProductionOS.tsx':['ProductionWorkspace'],
      'src/MetadataPage.tsx':['metadata-draft:v1'],
      'src/ExistingVideos.tsx':['existing-cache:v1'],
      'src/QuotaMeter.tsx':['Сброс по вашему времени','youtubeQuotaResetLocalInfo'],
      'src/youtubeQuota.ts':['nextYoutubeQuotaResetAt','youtubeQuotaResetLocalInfo','America/Los_Angeles'],
      'src-tauri/src/youtube.rs':['metadata_needed','chunks(50)','youtube_update_existing_video'],
    }.items():
        text=(ROOT/rel).read_text()
        for mark in marks:
            if mark not in text: fail(f'Missing 1.0.1 contract {mark} in {rel}')
    print('VYRON 1.0.1 local quota reset / Zero Quota patch applied')

if __name__=='__main__': main()
