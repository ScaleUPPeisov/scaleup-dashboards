from pathlib import Path
import json,re,shutil
root=Path('.vyron-v051')

def rep(path,old,new,count=1):
    p=root/path;s=p.read_text();
    if old not in s: raise SystemExit(f'missing pattern in {path}: {old[:120]}')
    s=s.replace(old,new,count);p.write_text(s)

def rx(path,pattern,repl,count=1):
    p=root/path;s=p.read_text();s2,n=re.subn(pattern,repl,s,count=count,flags=re.S|re.M)
    if n!=count: raise SystemExit(f'regex {path}: expected {count}, got {n}: {pattern[:100]}')
    p.write_text(s2)

for name in ['ExistingVideos.tsx','YouTubeCenter.tsx','PublisherOS.tsx','DashboardOS.tsx','ChannelsOS.tsx','ProductionOS.tsx','SettingsOS.tsx','AnalyticsPage.tsx','CompetitorsPage.tsx','youtubeIntelligence.ts','v090.css']:
    shutil.copyfile(f'vyron-v090/{name}',root/'src'/name)

# App: keep legacy functions/routes in source, expose seven-section OS shell.
p=root/'src/App.tsx';s=p.read_text()
anchor="import { refreshYoutubeIntelligence } from './youtubeIntelligence';"
extra="""import { refreshYoutubeIntelligence } from './youtubeIntelligence';
import { DashboardOS } from './DashboardOS';
import { ChannelsOS } from './ChannelsOS';
import { ProductionOS } from './ProductionOS';
import { YouTubeCenter } from './YouTubeCenter';
import { SettingsOS } from './SettingsOS';"""
if anchor not in s: raise SystemExit('App import anchor missing')
s=s.replace(anchor,extra,1)
s,n=re.subn(r"const nav:\{page:Page;icon:string;label:string\}\[]=\[.*?\];",'''const nav:{page:Page;icon:string;label:string}[]=[
  {page:'dashboard',icon:'⌂',label:'Главная'},
  {page:'channels',icon:'▣',label:'Каналы'},
  {page:'production',icon:'◆',label:'Производство'},
  {page:'youtube',icon:'▶',label:'YouTube'},
  {page:'analytics',icon:'⌁',label:'Аналитика'},
  {page:'competitors',icon:'◎',label:'Конкуренты'},
  {page:'settings',icon:'⚙',label:'Настройки'}
];''',s,count=1,flags=re.S)
if n!=1: raise SystemExit('nav replace failed')
old="const screen=page==='dashboard'?<Dashboard/>:page==='autopilot'?<Autopilot/>:page==='accounts'?<AccountsPage/>:page==='channels'?<Channels/>:page==='production'?<Production/>:page==='content'?<Content/>:page==='competitors'?<CompetitorsPage/>:page==='analytics'?<AnalyticsPage/>:page==='metadata'?<MetadataPage/>:page==='existing'?<ExistingVideos/>:page==='publisher'?<Publisher/>:<Settings license={license} setLicense={setLicense}/>;"
new="const screen=page==='dashboard'||page==='autopilot'?<DashboardOS/>:page==='accounts'?<SettingsOS license={license}/>:page==='channels'?<ChannelsOS/>:page==='production'||page==='content'?<ProductionOS/>:page==='youtube'?<YouTubeCenter/>:page==='competitors'?<CompetitorsPage/>:page==='analytics'?<AnalyticsPage/>:page==='metadata'?<YouTubeCenter initialTab='metadata'/>:page==='existing'?<YouTubeCenter initialTab='uploaded'/>:page==='publisher'?<YouTubeCenter initialTab='queue'/>:<SettingsOS license={license}/>;"
if old not in s: raise SystemExit('screen mapping missing')
s=s.replace(old,new,1)
# updater cadence: launch, +30 sec, every 6 h. Keep errors silent in background.
old_eff="useEffect(()=>{if(booted&&settings.autoCheckUpdates){const t=window.setTimeout(()=>api.checkUpdate().then(u=>{if(u?.version)setUpdate(u)}).catch(()=>{}),1800);return()=>window.clearTimeout(t)}},[booted,settings.autoCheckUpdates]);"
new_eff="useEffect(()=>{if(!booted||!settings.autoCheckUpdates)return;let live=true;const run=()=>api.checkUpdate().then(u=>{if(live&&u?.version)setUpdate(u)}).catch(()=>{});void run();const once=window.setTimeout(()=>void run(),30_000);const recurring=window.setInterval(()=>void run(),6*60*60_000);return()=>{live=false;window.clearTimeout(once);window.clearInterval(recurring)}},[booted,settings.autoCheckUpdates]);"
if old_eff not in s: raise SystemExit('update effect missing')
s=s.replace(old_eff,new_eff,1)
s=s.replace('VYRON 0.8.1','VYRON 0.9.0').replace('Версия 0.8.1','Версия 0.9.0').replace('<b>0.8.1</b>','<b>0.9.0</b>')
p.write_text(s)

# Types: backward compatible additions only.
p=root/'src/types.ts';s=p.read_text()
s=s.replace("export type Page='dashboard'|'autopilot'|'accounts'|'channels'|'production'|'content'|'competitors'|'analytics'|'metadata'|'existing'|'publisher'|'settings';","export type Page='dashboard'|'autopilot'|'accounts'|'channels'|'production'|'content'|'youtube'|'competitors'|'analytics'|'metadata'|'existing'|'publisher'|'settings';\nexport type AutopilotMode='off'|'assisted'|'full';",1)
s=s.replace("export type AnalyticsPoint={date:string;views:number;watchMinutes:number;subscribersGained:number;subscribersLost:number};","export type AnalyticsPoint={date:string;views:number;engagedViews?:number;watchMinutes:number;subscribersGained:number;subscribersLost:number;estimatedRevenue?:number};",1)
s=s.replace("export type AnalyticsTopVideo={id:string;title:string;thumbnail?:string;views:number;watchMinutes:number;averageViewDuration:number;averageViewPercentage:number;likes:number;comments:number;shares:number};","export type AnalyticsTopVideo={id:string;title:string;thumbnail?:string;publishedAt?:string;views:number;engagedViews?:number;watchMinutes:number;averageViewDuration:number;averageViewPercentage:number;likes:number;comments:number;shares:number;subscribersGained?:number;estimatedRevenue?:number;rpm?:number};",1)
s=s.replace("export type AnalyticsBreakdown={key:string;views:number;watchMinutes:number};","export type AnalyticsBreakdown={key:string;views:number;watchMinutes:number;estimatedRevenue?:number;rpm?:number};",1)
s=s.replace("export type ChannelAnalytics={periodDays:number;updatedAt:string;views:number;watchMinutes:number;averageViewDuration:number;averageViewPercentage:number;subscribersGained:number;subscribersLost:number;likes:number;comments:number;shares:number;daily:AnalyticsPoint[];topVideos:AnalyticsTopVideo[];trafficSources:AnalyticsBreakdown[];countries:AnalyticsBreakdown[]};","export type ChannelAnalytics={periodDays:number;offsetDays?:number;allTime?:boolean;updatedAt:string;views:number;engagedViews?:number;watchMinutes:number;averageViewDuration:number;averageViewPercentage:number;subscribersGained:number;subscribersLost:number;likes:number;comments:number;shares:number;monetaryAuthorized?:boolean;estimatedRevenue?:number;estimatedAdRevenue?:number;estimatedRedPartnerRevenue?:number;monetizedPlaybacks?:number;adImpressions?:number;cpm?:number;playbackBasedCpm?:number;monetaryError?:string;impressions?:number;impressionCtr?:number;daily:AnalyticsPoint[];topVideos:AnalyticsTopVideo[];trafficSources:AnalyticsBreakdown[];countries:AnalyticsBreakdown[];audience?:AnalyticsBreakdown[];channelPublishedAt?:string;channelCountry?:string;channelLanguage?:string;channelThumbnail?:string;totalVideos?:number};",1)
s=s.replace("autopilotEnabled:boolean; autoCreatePlan:boolean;", "autopilotMode:AutopilotMode; autopilotEnabled:boolean; autoCreatePlan:boolean;",1)
s=s.replace("export type YoutubeProfile={id:string;channelId?:string;channelTitle?:string;connectedAt?:string;clientIdMasked?:string};","export type YoutubeProfile={id:string;channelId?:string;channelTitle?:string;connectedAt?:string;clientIdMasked?:string;scopes?:string[];analyticsAuthorized?:boolean;monetaryAuthorized?:boolean};",1)
s=s.replace("applyState?:'idle'|'saving'|'done'|'error'; error?:string;","applyState?:'idle'|'saving'|'done'|'error'; error?:string; channelId?:string; verified?:boolean;",1)
p.write_text(s)

# Store migration: no destructive schema rewrite.
p=root/'src/store.ts';s=p.read_text()
s=s.replace("workspace:'',endlumePath:'',youtubeApiKey:'',autoCheckUpdates:true,reduceMotion:false,fpsMonitor:true,\n  autopilotEnabled:false,","workspace:'',endlumePath:'',youtubeApiKey:'',autoCheckUpdates:true,reduceMotion:false,fpsMonitor:true,\n  autopilotMode:'off',autopilotEnabled:false,",1)
s=s.replace('export const EMPTY_STATE:AppState={version:6,','export const EMPTY_STATE:AppState={version:7,',1)
s=s.replace('...s,version:6,channels:', '...s,version:7,channels:',1)
s=s.replace('const state:AppState={version:6,','const state:AppState={version:7,',1)
p.write_text(s)

# API contracts.
p=root/'src/api.ts';s=p.read_text()
s=s.replace("export type YoutubeProfileHealth={ok:boolean;status:string;channelId?:string;channelTitle?:string;thumbnail?:string;expiresAt?:number;error?:string};","export type YoutubeProfileHealth={ok:boolean;status:string;channelId?:string;channelTitle?:string;thumbnail?:string;expiresAt?:number;analyticsAuthorized?:boolean;monetaryAuthorized?:boolean;error?:string};\nexport type ExistingVideoSyncResult={channelId?:string;channelTitle?:string;youtubeFound:number;received:number;requested:number;privateCount:number;publicCount:number;scheduledCount:number;complete:boolean;videos:import('./types').YoutubeExistingVideo[]};",1)
s=s.replace("youtubeAnalytics:(profileId:string,days=28)=>invoke<ChannelAnalytics&{publicStats?:any}>('youtube_channel_analytics',{profileId,days}),","youtubeAnalytics:(profileId:string,days=28,offsetDays=0,allTime=false)=>invoke<ChannelAnalytics&{publicStats?:any}>('youtube_channel_analytics',{profileId,days,offsetDays,allTime}),",1)
s=s.replace("youtubeListExisting:(profileId:string,maxResults=30)=>invoke<any>('youtube_list_existing_videos',{profileId,maxResults}),","youtubeListExisting:(profileId:string,maxResults=30)=>invoke<ExistingVideoSyncResult>('youtube_list_existing_videos',{profileId,maxResults}),\n  youtubeBackupExisting:(profileId:string,videos:any[])=>invoke<{path:string;count:number}>('youtube_backup_existing_videos',{profileId,videos}),",1)
s=s.replace("youtubeUpdateExisting:(profileId:string,videoId:string,title:string,description:string,tags:string[],publishAt?:string)=>invoke<any>('youtube_update_existing_video',{profileId,videoId,title,description,tags,publishAt}),","youtubeUpdateExisting:(profileId:string,videoId:string,title:string,description:string,tags:string[],publishAt?:string,privacyStatus?:string)=>invoke<{id:string;verified:boolean}>('youtube_update_existing_video',{profileId,videoId,title,description,tags,publishAt,privacyStatus}),",1)
s=s.replace("if(!update)return {none:true,current:'0.8.1'} as any;","if(!update)return {none:true,current:'0.9.0'} as any;",1)
p.write_text(s)

# CSS imported last.
p=root/'src/main.tsx';s=p.read_text()
if "./v090.css" not in s:
    imports=list(re.finditer(r"import ['\"]\./[^'\"]+\.css['\"];?",s))
    if imports:
        i=imports[-1].end();s=s[:i]+"\nimport './v090.css';"+s[i:]
    else:s="import './v090.css';\n"+s
p.write_text(s)

# Version metadata.
for rel in ['package.json','src-tauri/tauri.conf.json']:
    p=root/rel;d=json.loads(p.read_text());d['version']='0.9.0';
    if rel.endswith('tauri.conf.json'):d.setdefault('bundle',{})['createUpdaterArtifacts']=True
    p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=root/'package-lock.json';d=json.loads(p.read_text());d['version']='0.9.0';d.setdefault('packages',{}).setdefault('',{})['version']='0.9.0';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=root/'src-tauri/Cargo.toml';s=p.read_text();s,n=re.subn(r'^version = "0\.8\.1"$','version = "0.9.0"',s,count=1,flags=re.M);assert n==1;p.write_text(s)
p=root/'src-tauri/Cargo.lock';s=p.read_text().replace('name = "channelflow"\nversion = "0.8.1"','name = "channelflow"\nversion = "0.9.0"',1);p.write_text(s)
print('VYRON 0.9.0 OS frontend wired over 0.8.1')
