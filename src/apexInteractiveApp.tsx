import React from 'react';
import {createRoot} from 'react-dom/client';
import {EMPTY_STATE,enterPerformanceProbeMode,useApp} from './store';
import {useLiveInventory,type ChannelInventorySnapshot} from './renderInventoryRuntime';
import {DashboardOS} from './DashboardOS';
import {ChannelsOS} from './ChannelsOS';
import {BatchControl} from './BatchControl';
import {ProductionOS} from './ProductionOS';
import {LiveContentInventory} from './LiveContentInventory';
import {HistoryPage} from './HistoryPage';
import {YouTubeCenter} from './YouTubeCenter';
import {Analytics360Page} from './Analytics360Page';
import {CompetitorsPage} from './CompetitorsPage';
import {AccountsPage} from './AccountsPage';
import {SettingsOS} from './SettingsOS';
import {UiErrorBoundary} from './UiErrorBoundary';
import {NotificationCenter} from './NotificationStack';
import type {Page} from './types';
import type {createApexFixture} from './apexInteractiveFixture';
import './styles.css';
import './v060.css';
import './v070.css';
import './v080.css';
import './v081.css';
import './v090.css';
import './v095.css';
import './production-manager.css';
import './updater-ui.css';
import './v216.css';
import './ui-layout-contract.css';
import './live-inventory.css';
import './v400-celebration.css';
import './youtube-apex.css';
import './apex-tokens.css';
import './apex-interactive.css';
import './apex-reference-shell.css';

const groups:ReadonlyArray<[string,ReadonlyArray<[Page,string]>]>=[
 ['РАБОЧАЯ СРЕДА',[['dashboard','Главная'],['channels','Каналы'],['production','Производство'],['inventory','Запас видео']]],
 ['YOUTUBE',[['publisher','Публикатор'],['batch','Массовая публикация'],['metadata','Метаданные'],['existing','Загруженные']]],
 ['АНАЛИЗ И МАТЕРИАЛЫ',[['analytics','Аналитика 360°'],['competitors','Конкуренты']]],
 ['СИСТЕМА',[['autopilot','Командный центр'],['history','История'],['accounts','Аккаунты'],['settings','Настройки']]]
];
function Screen({page}:{page:Page}){
 switch(page){
 case 'channels':return <ChannelsOS/>;
 case 'batch':return <BatchControl standalone/>;
 case 'production':case 'content':return <ProductionOS/>;
 case 'inventory':return <LiveContentInventory/>;
 case 'history':return <HistoryPage/>;
 case 'youtube':case 'publisher':case 'metadata':case 'existing':return <YouTubeCenter routeTab={page==='metadata'?'metadata':page==='existing'?'uploaded':page==='publisher'?'publish':undefined}/>;
 case 'analytics':return <Analytics360Page/>;
 case 'competitors':return <CompetitorsPage/>;
 case 'accounts':return <AccountsPage/>;
 case 'settings':return <SettingsOS license={{valid:true,type:'development'}}/>;
 case 'autopilot':return <DashboardOS pageOverride="autopilot"/>;
 default:return <DashboardOS pageOverride="dashboard"/>;
 }
}
function FixtureShell(){
 const page=useApp(s=>s.page),setPage=useApp(s=>s.setPage);
 return <div className="appShell apexFixtureShell apexReferenceShell"><aside className="sidebar"><div className="brand apexReferenceBrand"><svg viewBox="0 0 40 40" aria-hidden="true"><path fill="#a78bfa" d="M2 5h10l8 14L28 5h10L20 36 14 25 20 14 12 5Z"/><path fill="#7541d6" d="M14 25 20 36 38 5H28L20 19Z"/></svg><div><b>VYRON</b><small>7.0 APEX</small></div></div><nav>{groups.map(([group,items])=><React.Fragment key={group}><div className="apexNavGroup">{group}</div>{items.map(([id,label])=><button key={id} className={page===id?'active':''} onClick={()=>setPage(id)} aria-current={page===id?'page':undefined}>{label}</button>)}</React.Fragment>)}</nav></aside><div className="main"><header className="apexFixtureBanner">ТЕСТОВЫЙ РЕЖИМ · 33 фиктивных канала · реальные файлы, OAuth и публикация недоступны</header><main className="apexFixtureMain"><UiErrorBoundary key={page} scope={page} onHome={()=>setPage('dashboard')}><Screen page={page}/></UiErrorBoundary></main></div><NotificationCenter/></div>;
}
export async function mountFixture(fixture:ReturnType<typeof createApexFixture>){
 await enterPerformanceProbeMode();
 useApp.getState().hydrate({...EMPTY_STATE,channels:fixture.channels,jobs:fixture.jobs,settings:{...EMPTY_STATE.settings,workspace:'/APEX_FIXTURE_ONLY',autoCheckUpdates:false,autoUploadYoutube:false,autopilotEnabled:false}});
 const snapshots:Record<string,ChannelInventorySnapshot>={};
 for(const c of fixture.channels){snapshots[c.id]={channelId:c.id,channelName:c.name,renderFolderPath:c.renderFolderPath!,folderState:'ONLINE',stale:false,physicalFiles:12,readyVideos:12,uploadingVideos:0,uploadedLocalCopies:0,newCandidates:12,newGenerations:0,knownReady:0,verifyRequired:0,invalid:0,runwayDays:12,level:'SOON',lastScanAt:new Date().toISOString()}}
 useLiveInventory.setState({snapshots,audit:[],globalScanning:false});
 useApp.getState().setPage('dashboard');
 createRoot(document.getElementById('root')!).render(<FixtureShell/>);
}
