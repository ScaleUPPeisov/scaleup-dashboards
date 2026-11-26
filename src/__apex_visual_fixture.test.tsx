import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const f=vi.hoisted(()=>{
 const channel=(id:string,name:string)=>({id,name,enabled:true,renderFolderPath:'/Тестовые данные/Видео/'+id,cadenceDays:2,targetBufferDays:60,publishHour:4,publishMinute:0,minTracks:10,targetDurationMin:120,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}});
 const snapshot=(channelId:string,channelName:string,readyVideos:number,level:string)=>({channelId,channelName,renderFolderPath:'/Тестовые данные/Видео/'+channelId,folderState:'ONLINE',stale:false,physicalFiles:readyVideos,readyVideos,uploadingVideos:0,uploadedLocalCopies:0,newCandidates:readyVideos,newGenerations:0,knownReady:0,verifyRequired:0,invalid:0,runwayDays:readyVideos,level,lastScanAt:'2026-11-24T06:00:00Z',lastConfirmedAt:'2026-11-24T06:00:00Z'});
 return {state:{channels:[channel('fixture-a','Северное сияние'),channel('fixture-b','Фон для работы'),channel('fixture-c','Ночной город')],jobs:[],logs:[],uploadHistory:[],projectLifecycle:{},fingerprintCache:{},activityJournal:[{eventId:'fixture-1',eventType:'PRODUCTION_BUILD_COMPLETED',status:'SUCCESS',timestamp:'2026-11-24T06:00:00Z',channelId:'fixture-a'},{eventId:'fixture-2',eventType:'RENDER_COMPLETED',status:'SUCCESS',timestamp:'2026-11-24T05:00:00Z',channelId:'fixture-b'},{eventId:'fixture-3',eventType:'UPLOAD_FAILED',status:'FAILED',timestamp:'2026-11-24T04:00:00Z',channelId:'fixture-c'}],competitors:[{id:'fixture-competitor',channelId:'fixture-a',name:'Музыкальный канал',url:'https://example.invalid/channel',subscribers:18400,views:2170000,videos:125,recentAverageViews:8400,history:[],latestVideos:[]}],settings:{workspace:'/Тестовые данные/Рабочая папка',vyronRootPath:'',projectsRootPath:'',renderRootPath:'',autopilotMode:'off',estimatedRpmUsd:2.5,autoCheckUpdates:false,endlumePath:'',youtubeApiKey:'',youtubeCategoryId:'10'},patchSettings:()=>{},setPage:()=>{},toast:()=>{},addCompetitor:()=>{},removeCompetitor:()=>{},updateChannel:()=>{}},inventory:{snapshots:{'fixture-a':snapshot('fixture-a','Северное сияние',26,'NORMAL'),'fixture-b':snapshot('fixture-b','Фон для работы',8,'SOON'),'fixture-c':snapshot('fixture-c','Ночной город',2,'LOW')},audit:[],globalScanning:false}};
});
vi.mock('./store',()=>({useApp:Object.assign((select:(state:unknown)=>unknown)=>select(f.state),{getState:()=>f.state,subscribe:()=>()=>{}})}));
vi.mock('./api',()=>({api:new Proxy({}, {get:()=>()=>{throw new Error('IPC запрещён в статическом превью')}})}));
vi.mock('./channelRunwayStore',()=>({loadChannelRunwayStore:()=>({channels:{'fixture-a':{channelId:'fixture-a',channelName:'Северное сияние',status:'urgent',runwayDays:9},'fixture-b':{channelId:'fixture-b',channelName:'Фон для работы',status:'prepare',runwayDays:28},'fixture-c':{channelId:'fixture-c',channelName:'Ночной город',status:'large',runwayDays:72}}}),subscribeChannelRunway:()=>()=>{}}));
vi.mock('./productionPrefs',()=>({defaultChannelProductionPrefs:()=>({projectCount:20}),useProductionPrefs:()=>[{byChannel:{},tab:'queue',selectedChannelId:'fixture-a',selectedJobIds:[]},()=>{}],resolveProductionRootFromPrefs:()=>'/Тестовые данные/Проекты',patchChannelProductionPrefs:()=>{}}));
vi.mock('./youtubeQuota',()=>({resetYoutubeUploadQuotaLimit:()=>{},setYoutubeUploadQuotaLimit:()=>{},subscribeYoutubeQuota:()=>()=>{},subscribeYoutubeQuotaClock:()=>()=>{},youtubeQuotaClockSnapshot:()=>({}),youtubeQuotaProjectIdentity:()=>({projectKey:'',label:'нет данных'}),youtubeQuotaTrace:()=>[],youtubeQuotaUsage:()=>({limit:0,used:0}),youtubeUploadQuotaState:()=>({limit:null,limitSource:'unknown',used:0,reserved:0}),youtubePtDate:()=>'2026-11-24',nextYoutubeQuotaResetAt:()=>new Date('2026-11-25T08:00:00Z'),beginManualYoutubeQuotaProbe:()=>false,planYoutubeQuota:()=>({affordable:true,buckets:{general:{required:3,available:100}}})}));
vi.mock('./youtubeIntelligence',()=>({discoverCompetitorsForChannel:()=>{throw new Error('Сеть запрещена')},refreshCompetitor:()=>{throw new Error('Сеть запрещена')},refreshChannelAnalytics:()=>{throw new Error('Сеть запрещена')}}));
vi.mock('./YouTubeChannelBar',()=>({YouTubeChannelBar:()=> <section className="youtubeChannelBar"><b>Северное сияние</b><span> · активный канал (тестовые данные)</span></section>}));
vi.mock('./renderInventoryRuntime',()=>({useLiveInventory:Object.assign((select:(state:unknown)=>unknown)=>select(f.inventory),{getState:()=>f.inventory,subscribe:()=>()=>{}}),inventoryTotals:()=>({ready:36,uploading:0,channels:3,normal:1,soon:1,low:1,empty:0,offline:0}),scanAllInventories:()=>{throw new Error('Сканирование запрещено')},scanInventoryChannel:()=>{throw new Error('Сканирование запрещено')}}));
vi.mock('./uploadQueueRuntime',()=>({uploadQueueSnapshot:()=>({queued:[],running:[],paused:[],recent:[]}),uploadQueueRuntimeFacts:()=>[],subscribeUploadQueue:()=>()=>{}}));
vi.mock('@tauri-apps/api/core',()=>({invoke:(command:string)=>{
 if(command!=='analytics360_winners')throw new Error('IPC запрещён в статическом превью');
 const channelId='UC1234567890123456789012';
 return Promise.resolve({status:'AVAILABLE',source:'fixture',offlineApiRequests:0,videoWinners:Array.from({length:8},(_,i)=>({channelId,videoId:'test-video-'+i,title:['Утро у моря','Тихий вечер','Дорога домой','Тёплый дождь','Ночной город','Свет маяка','Время для отдыха','Летний воздух'][i],classification:'RISING',scoreStatus:'AVAILABLE',winnerScore:96-i*4,current7Views:12000-i*800,previous7Views:8000-i*400,anomalies:[]})),videoAnomalies:[],channels:[],coverage:[{channelId,status:'AVAILABLE'}]});
},convertFileSrc:()=>''}));

const enabled=(globalThis as {process?:{env?:Record<string,string|undefined>}}).process?.env?.APEX_CAPTURE_FIXTURES==='1';
describe('isolated static component previews',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it.skipIf(!enabled)('renders fixture-only HTML without browser scripts or application services',async()=>{
  const memory=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(k:string)=>memory.get(k)||null,setItem:(k:string,v:string)=>memory.set(k,String(v)),removeItem:(k:string)=>memory.delete(k)});
  vi.stubGlobal('fetch',()=>{throw new Error('Сеть запрещена в статическом превью')});
  vi.stubGlobal('navigator',{platform:'MacIntel',userAgent:'Synthetic Mac'});
  const {SettingsOS}=await import('./SettingsOS');
  const {CommandCenter}=await import('./CommandCenter');
  const {HistoryPage}=await import('./HistoryPage');
  const {CompetitorsPage}=await import('./CompetitorsPage');
  const {LiveContentInventory}=await import('./LiveContentInventory');
  const {Analytics360Page}=await import('./Analytics360Page');
  const {AccountsPage}=await import('./AccountsPage');
  const {DashboardOS}=await import('./DashboardOS');
  const {ProductionOS}=await import('./ProductionOS');
  const {ChannelsOS}=await import('./ChannelsOS');
  const {ScheduleOS}=await import('./ScheduleOS');
  const {MaterialsManager}=await import('./MaterialsManager');
  const {Analytics360Winners}=await import('./Analytics360Winners');
  const files=['styles.css','v060.css','v070.css','v080.css','v081.css','v090.css','v095.css','production-manager.css','updater-ui.css','v216.css','ui-layout-contract.css','live-inventory.css','v400-celebration.css','youtube-apex.css','apex-tokens.css','settings-apex.css','command-center-apex.css','history-apex.css','competitors-apex.css','inventory-apex.css','Analytics360.css','analytics360-apex.css','accounts-apex.css','dashboard-workspace-apex.css','production-apex.css','channels-apex.css','scheduleOnly.css','schedule-apex.css','materials-apex.css'];
  const css=files.map(x=>readFileSync(resolve('src',x),'utf8')).join('\n');
  expect(css).not.toMatch(/@import|url\(\s*['"]?(?:https?:|\/\/)/i);
  const output=resolve('../apex-preview');mkdirSync(output,{recursive:true});
  const make=(title:string,body:string)=>`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${title} — тестовые данные</title><style>${css}\nbody{margin:0;padding:28px;background:#121218;color:#f2f0fa;font-family:-apple-system,BlinkMacSystemFont,sans-serif}.fixtureBanner{position:sticky;top:0;z-index:9999;margin-bottom:18px;padding:12px 16px;background:#48366c;color:#fff;border:1px solid #bba6f5;border-radius:10px;font-weight:700}.fixtureBody{max-width:1500px;margin:auto}</style></head><body><div class="fixtureBanner">ТЕСТОВЫЕ ДАННЫЕ · СТАТИЧНЫЙ МАКЕТ · КНОПКИ НЕ РАБОТАЮТ</div><main class="fixtureBody">${body}</main></body></html>`;
  const settings=renderToStaticMarkup(<SettingsOS license={{valid:true,type:'development'} as any}/>);
  const command=renderToStaticMarkup(<CommandCenter/>);
  const history=renderToStaticMarkup(<HistoryPage/>);
  const competitors=renderToStaticMarkup(<CompetitorsPage/>);
  const inventory=renderToStaticMarkup(<LiveContentInventory/>);
  const analytics=renderToStaticMarkup(<Analytics360Page/>);
  const accounts=renderToStaticMarkup(<AccountsPage/>);
  const dashboard=renderToStaticMarkup(<DashboardOS pageOverride="dashboard"/>);
  const production=renderToStaticMarkup(<ProductionOS/>);
  const channels=renderToStaticMarkup(<ChannelsOS/>);
  const schedule=renderToStaticMarkup(<ScheduleOS/>);
  const materials=renderToStaticMarkup(<MaterialsManager/>);
  // Mount only this isolated component with a fake IPC response, then serialize
  // the actual rendered DOM tree. No application is launched and no request is sent.
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  // @ts-expect-error The test renderer has no bundled TypeScript declarations.
  const {act,create}=await import('react-test-renderer');
  let winnerView:any;
  await act(async()=>{winnerView=create(<Analytics360Winners channels={[{id:'winner-fixture',name:'Тестовый канал',youtubeChannelId:'UC1234567890123456789012'} as any]} onOpenVideo={()=>{}}/>);await Promise.resolve()});
  const toElement=(node:any):React.ReactNode=>{if(Array.isArray(node))return node.map(toElement);if(node==null||typeof node==='string'||typeof node==='number')return node;return React.createElement(node.type,node.props,...(node.children||[]).map(toElement))};
  const winners=renderToStaticMarkup(<>{toElement(winnerView.toJSON())}</>);
  await act(async()=>winnerView.unmount());
  expect(settings).toContain('Настройки');expect(command).toContain('КОМАНДНЫЙ ЦЕНТР');
  expect(history).toContain('Сборка проектов завершена');expect(competitors).toContain('Музыкальный канал');expect(inventory).toContain('Запас видео');
  expect(analytics).toContain('Аналитика 360°');expect(accounts).toContain('Аккаунты');
  expect(dashboard).toContain('Главная');expect(production).toContain('Производство');
  expect(channels).toContain('Северное сияние');expect(schedule).toContain('Расписание канала');expect(materials).toContain('Материалы');expect(winners).toContain('Лучшие видео');expect(winners).toContain('Утро у моря');
  writeFileSync(resolve(output,'settings.html'),make('Настройки',settings));
  writeFileSync(resolve(output,'command-center.html'),make('Командный центр',command));
  writeFileSync(resolve(output,'history.html'),make('История',history));
  writeFileSync(resolve(output,'competitors.html'),make('Конкуренты',competitors));
  writeFileSync(resolve(output,'inventory.html'),make('Запас видео',inventory));
  writeFileSync(resolve(output,'analytics-360.html'),make('Аналитика 360°',analytics));
  writeFileSync(resolve(output,'accounts.html'),make('Аккаунты',accounts));
  writeFileSync(resolve(output,'dashboard.html'),make('Главная',dashboard));
  writeFileSync(resolve(output,'production.html'),make('Производство',production));
  writeFileSync(resolve(output,'channels.html'),make('Каналы',channels));
  writeFileSync(resolve(output,'schedule.html'),make('Расписание',schedule));
  writeFileSync(resolve(output,'materials.html'),make('Материалы',materials));
  writeFileSync(resolve(output,'winners.html'),make('Лучшие видео',winners));
 });
});
