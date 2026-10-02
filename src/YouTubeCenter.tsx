import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {PublisherOS} from './PublisherOS';
import {ExistingVideos} from './ExistingVideos';
import {MetadataTabs} from './MetadataTabs';
import {CommandCenter} from './CommandCenter';
import {ChannelRunway} from './ChannelRunway';
import {AccountsPage} from './AccountsPage';
import {QuotaMeter} from './QuotaMeter';
import {ScheduleWorkspace} from './ScheduleWorkspace';
import {YouTubeChannelBar,resolveYoutubeActiveChannel} from './YouTubeChannelBar';
import {ActivityHistory} from './ActivityHistory';
import {StatisticsCenter} from './StatisticsCenter';
import {loadActivePublishChannel,subscribeActivePublishChannel} from './publishWorkspaceState';
import {UiErrorBoundary} from './UiErrorBoundary';
import {useApp} from './store';
import {beginYoutubeRouteDiagnostics,recordYoutubeRouteEvent} from './youtubeRouteDiagnostics';
import {traceRouteLayoutEffect,traceYoutubeFunctionEntered} from './m1RouteLifecycleTrace';

type Tab='publish'|'uploaded'|'metadata'|'schedule'|'calendar'|'command'|'runway'|'data'|'statistics'|'accounts'|'history'|'queue';
const OPEN_TAB_KEY='vyron:youtube-open-tab:v1';
let requestedGlobalHistory=false;
const CachedPublisher=React.memo(PublisherOS);
const CachedQuotaMeter=React.memo(QuotaMeter);
const CachedYouTubeChannelBar=React.memo(YouTubeChannelBar);
function normalizeTab(tab:Tab):Exclude<Tab,'calendar'|'data'|'queue'>{if(tab==='calendar')return'schedule';if(tab==='data')return'statistics';if(tab==='queue')return'publish';return tab}
function consumeRequestedTab(initial:Tab){try{const raw=localStorage.getItem(OPEN_TAB_KEY) as Tab|null;if(raw){localStorage.removeItem(OPEN_TAB_KEY);requestedGlobalHistory=raw==='history';return normalizeTab(raw)}}catch{}requestedGlobalHistory=false;return normalizeTab(initial)}
export function YouTubeCenter({initialTab='publish',routeTab,active=true}:{initialTab?:Tab;routeTab?:'publish'|'metadata'|'uploaded';active?:boolean}){
 traceYoutubeFunctionEntered();
 const setPage=useApp(s=>s.setPage),routeActiveRef=useRef(active),routeTabRef=useRef<typeof routeTab>(undefined),diagnosticStartedRef=useRef(false);routeActiveRef.current=active;if(active&&!diagnosticStartedRef.current){diagnosticStartedRef.current=true;beginYoutubeRouteDiagnostics()}
 const [tab,setTab]=useState(()=>normalizeTab(routeTab||consumeRequestedTab(initialTab))),[activeChannel,setActiveChannel]=useState(()=>resolveYoutubeActiveChannel(useApp.getState().channels||[],loadActivePublishChannel())),[historyGlobal,setHistoryGlobal]=useState(()=>requestedGlobalHistory),[quotaOpen,setQuotaOpen]=useState(false);
 const activeChannelRef=useRef(activeChannel);activeChannelRef.current=activeChannel;
 useLayoutEffect(()=>{if(active)traceRouteLayoutEffect('youtube','youtube-root')},[active]);
 if(routeTabRef.current!==routeTab){routeTabRef.current=routeTab;if(routeTab&&tab!==routeTab)setTab(routeTab)}
 useEffect(()=>{try{localStorage.setItem(OPEN_TAB_KEY,tab)}catch{}},[tab]);
 useEffect(()=>{if(!active)return;return subscribeActivePublishChannel(id=>{const next=resolveYoutubeActiveChannel(useApp.getState().channels||[],id);if(next===activeChannelRef.current)return;activeChannelRef.current=next;recordYoutubeRouteEvent('YouTubeCenter','state-write:activeChannel');setActiveChannel(next)})},[active]);
 useEffect(()=>{if(!active)return;const openHistory=(event:Event)=>{setHistoryGlobal(Boolean((event as CustomEvent<{global?:boolean}>).detail?.global));setTab('history')},openStatistics=()=>setTab('statistics'),openAccounts=()=>setTab('accounts');window.addEventListener('vyron:youtube-history',openHistory);window.addEventListener('vyron:youtube-statistics',openStatistics);window.addEventListener('vyron:youtube-accounts',openAccounts);return()=>{window.removeEventListener('vyron:youtube-history',openHistory);window.removeEventListener('vyron:youtube-statistics',openStatistics);window.removeEventListener('vyron:youtube-accounts',openAccounts)}},[active]);
 const tabs:[typeof tab,string][]=[['publish','Публикация'],['metadata','Метаданные'],['schedule','Расписание'],['uploaded','Загруженные'],['command','Командный центр'],['runway','План каналов'],['statistics','Статистика'],['history','История'],['accounts','Аккаунты']];
 const content=tab==='publish'?<CachedPublisher activityRef={routeActiveRef}/>:tab==='uploaded'?<ExistingVideos/>:tab==='metadata'?<MetadataTabs active={active}/>:tab==='schedule'?<ScheduleWorkspace/>:tab==='command'?<CommandCenter/>:tab==='runway'?<ChannelRunway/>:tab==='statistics'?<StatisticsCenter/>:tab==='history'?<ActivityHistory globalView={historyGlobal}/>:<AccountsPage/>;
 const tabLabel=tabs.find(([id])=>id===tab)?.[1]||'YouTube';
 return <><div className="youtubeCenterHead"><div><small>VYRON • YOUTUBE</small><h1>YouTube</h1><p>Публикация, метаданные, расписание и управление каналом в одном рабочем пространстве.</p></div><button className="compact" onClick={()=>setQuotaOpen(x=>!x)}>{quotaOpen?'Скрыть квоту':'Квота'}</button></div>{quotaOpen&&active&&<CachedQuotaMeter compact active/>}{active&&<CachedYouTubeChannelBar active/>}<div className="youtubeTabs youtubeMasterTabs">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>{active&&<div key={tab+':'+activeChannel} className="youtubeChannelContext"><UiErrorBoundary scope={tabLabel} onHome={()=>setPage('dashboard')}>{content}</UiErrorBoundary></div>}</>;
}
