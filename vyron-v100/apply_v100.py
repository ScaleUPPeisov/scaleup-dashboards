from __future__ import annotations
from pathlib import Path
import json,re,shutil,sys

ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.vyron-v100')
HERE=Path('vyron-v100')
VERSION='1.0.0'

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
    s=s.replace('VYRON 0.9.9 • macOS Apple Silicon','VYRON 1.0.0 • macOS Apple Silicon').replace('VYRON 0.9.9</span>','VYRON 1.0.0</span>')
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
      'src-tauri/src/youtube.rs':['metadata_needed','chunks(50)','youtube_update_existing_video'],
    }.items():
        text=(ROOT/rel).read_text()
        for mark in marks:
            if mark not in text: fail(f'Missing 1.0 contract {mark} in {rel}')
    print('VYRON 1.0.0 Zero Quota / Production patch applied')

if __name__=='__main__': main()
