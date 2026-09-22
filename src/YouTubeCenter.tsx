import React,{useEffect,useState} from 'react';
import {PublisherOS} from './PublisherOS';
import {ExistingVideos} from './ExistingVideos';
import {MetadataTabs} from './MetadataTabs';
import {CommandCenter} from './CommandCenter';
import {ChannelRunway} from './ChannelRunway';
import {AccountsPage} from './AccountsPage';
import {QuotaMeter} from './QuotaMeter';
import {ScheduleWorkspace} from './ScheduleWorkspace';
import {YouTubeChannelBar} from './YouTubeChannelBar';
import {ActivityHistory} from './ActivityHistory';
import {StatisticsCenter} from './StatisticsCenter';
import {loadActivePublishChannel,subscribeActivePublishChannel} from './publishWorkspaceState';

type Tab='publish'|'uploaded'|'metadata'|'schedule'|'calendar'|'command'|'runway'|'data'|'statistics'|'accounts'|'history'|'queue';
const OPEN_TAB_KEY='vyron:youtube-open-tab:v1';
function normalizeTab(tab:Tab):Exclude<Tab,'calendar'|'data'|'queue'>{if(tab==='calendar')return'schedule';if(tab==='data')return'statistics';if(tab==='queue')return'publish';return tab}
function consumeRequestedTab(initial:Tab){try{const raw=localStorage.getItem(OPEN_TAB_KEY) as Tab|null;if(raw){localStorage.removeItem(OPEN_TAB_KEY);return normalizeTab(raw)}}catch{}return normalizeTab(initial)}
export function YouTubeCenter({initialTab='publish'}:{initialTab?:Tab}){
 const [tab,setTab]=useState(()=>consumeRequestedTab(initialTab)),[activeChannel,setActiveChannel]=useState(()=>loadActivePublishChannel());
 useEffect(()=>subscribeActivePublishChannel(setActiveChannel),[]);
 useEffect(()=>{const openHistory=()=>setTab('history'),openStatistics=()=>setTab('statistics'),openAccounts=()=>setTab('accounts');window.addEventListener('vyron:youtube-history',openHistory);window.addEventListener('vyron:youtube-statistics',openStatistics);window.addEventListener('vyron:youtube-accounts',openAccounts);return()=>{window.removeEventListener('vyron:youtube-history',openHistory);window.removeEventListener('vyron:youtube-statistics',openStatistics);window.removeEventListener('vyron:youtube-accounts',openAccounts)}},[]);
 const tabs:[typeof tab,string][]=[['publish','Публикация'],['metadata','Метаданные'],['schedule','Расписание'],['uploaded','Загруженные'],['command','Командный центр'],['runway','План каналов'],['statistics','Статистика'],['history','История'],['accounts','Аккаунты']];
 const content=tab==='publish'?<PublisherOS/>:tab==='uploaded'?<ExistingVideos/>:tab==='metadata'?<MetadataTabs/>:tab==='schedule'?<ScheduleWorkspace/>:tab==='command'?<CommandCenter/>:tab==='runway'?<ChannelRunway/>:tab==='statistics'?<StatisticsCenter/>:tab==='history'?<ActivityHistory/>:<AccountsPage/>;
 return <><div className="youtubeCenterHead"><div><small>VYRON • YOUTUBE</small><h1>YouTube</h1><p>Публикация, метаданные, расписание и управление каналом в одном рабочем пространстве.</p></div><QuotaMeter compact/></div><YouTubeChannelBar/><div className="youtubeTabs youtubeMasterTabs">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div><div key={tab+':'+activeChannel} className="youtubeChannelContext">{content}</div></>;
}
