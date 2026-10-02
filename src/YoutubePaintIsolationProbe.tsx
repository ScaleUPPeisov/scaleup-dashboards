import React,{Profiler,useEffect,useMemo,useRef,useState} from 'react';
import {api} from './api';
import {enterPerformanceProbeMode,exitPerformanceProbeMode,useApp} from './store';
import type {Channel,VideoJob} from './types';
import {YouTubeCenter} from './YouTubeCenter';
import {YouTubeChannelBar} from './YouTubeChannelBar';
import {PublisherOS} from './PublisherOS';
import {PublisherShell} from './PublisherShell';
import {PublisherVideoPicker} from './PublisherVideoPicker';
import type {PublisherVideoRowFact} from './publisherDerivedRuntime';

type ProfileRow={id:string;phase:'mount'|'update'|'nested-update';actualDuration:number;baseDuration:number;startTime:number;commitTime:number};
type MountMeasurement={raf1:number;raf2:number;raf3:number;profiles:ProfileRow[];census?:DomCensus};
type DomCensus={
 total:number;channelContextTotal:number;channelBarElements:number;publisherShellElements:number;publisherPickerElements:number;
 videoRows:number;buttons:number;inputs:number;selects:number;options:number;images:number
};
type Stage=
 |{kind:'production';paintMinimal?:boolean;avatarMode?:'real'|'fallback'}
 |{kind:'publisher'}
 |{kind:'binary';rows:number;channelBar:boolean;publisherShell:boolean;paintMinimal?:boolean}
 |{kind:'select';selects:number}
 |null;

const frame=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve));
async function frames(n:number){for(let i=0;i<n;i++)await frame()}
const median=(a:number[])=>{const x=[...a].sort((m,n)=>m-n);return x.length?x[Math.floor(x.length/2)]:0};
const p95=(a:number[])=>{const x=[...a].sort((m,n)=>m-n);return x.length?x[Math.min(x.length-1,Math.floor((x.length-1)*.95))]:0};

function syntheticChannels(withAvatar=false):Channel[]{
 return Array.from({length:35},(_,i)=>{
  const n=String(i+1).padStart(2,'0');
  const thumbnail=withAvatar&&i===0?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="20" fill="#39424e"/><text x="48" y="59" text-anchor="middle" font-size="38" fill="white">YT</text></svg>'):undefined;
  return{
   id:'perf-channel-'+n,name:'Performance Channel '+n,slug:'performance-channel-'+n,
   cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',
   minTracks:10,targetDurationMin:120,enabled:true,dailyUploadTarget:20,
   seo:{titlePatterns:['{topic}'],descriptionTemplate:'{title}',tags:['music','performance'],banned:[]},
   stats:{viewCount:100000+i*1000,videoCount:100+i,subscriberCount:1000+i*10,hiddenSubscriberCount:false,updatedAt:'2026-10-01T00:00:00Z',thumbnail}
  };
 })
}
function syntheticJobs(channels:Channel[]):VideoJob[]{
 const statuses:VideoJob['status'][]=['WAITING_MUSIC','READY_RENDER','READY_UPLOAD','SCHEDULED'];
 return Array.from({length:1000},(_,i)=>{
  const c=channels[i%channels.length],n=Math.floor(i/channels.length)+1;
  return{id:'perf-job-'+String(i+1).padStart(4,'0'),channelId:c.id,number:n,folder:'/tmp/vyron-perf/'+c.id+'/VIDEO_'+String(n).padStart(3,'0'),status:statuses[i%statuses.length],createdAt:'2026-09-30T00:00:00Z',publishAt:'2026-10-15T18:00:00+07:00',tracksCount:10,minTracks:10,title:'Performance Video '+(i+1),description:'Synthetic production performance fixture',tags:['music','test']};
 })
}
function clearAvatarCache(channels:Channel[]){for(const c of channels){try{localStorage.removeItem('vyron:channel-avatar:v1:'+(c.youtubeChannelId||c.id))}catch{}}}

const noOp=()=>{};
function HeaderTabs(){
 const tabs=['Публикация','Метаданные','Расписание','Загруженные','Командный центр','План каналов','Статистика','История','Аккаунты'];
 return <><div className="youtubeCenterHead"><div><small>VYRON • YOUTUBE</small><h1>YouTube</h1><p>Публикация, метаданные, расписание и управление каналом в одном рабочем пространстве.</p></div><button className="compact">Квота</button></div><div className="youtubeTabs youtubeMasterTabs">{tabs.map((x,i)=><button key={x} className={i===0?'active':''}>{x}</button>)}</div></>
}
function DiagnosticSelects({channels,count}:{channels:Channel[];count:number}){
 return <section className="youtubeChannelBar channelContextBar"><div className="channelContextControls">{Array.from({length:count},(_,i)=><select key={i} defaultValue={channels[0]?.id}>{channels.map(c=><option key={i+':'+c.id} value={c.id}>{c.name}</option>)}</select>)}</div></section>
}
function makeRowFacts(jobs:VideoJob[]){
 const ids=new Set(jobs.map(j=>j.id)),facts=new Map<string,PublisherVideoRowFact>();
 for(const job of jobs)facts.set(job.id,{state:'NEW',selectable:true});
 return{ids,facts}
}
function countElements(root:ParentNode|null){return root?root.querySelectorAll('*').length:0}
function census(root:HTMLElement):DomCensus{
 const context=root.querySelector('.youtubeChannelContext');
 const bar=root.querySelector('.youtubeChannelBar');
 const shellHead=root.querySelector('.publishMasterHead');
 const shellActions=root.querySelector('.publishDemandActions');
 const picker=root.querySelector('.publishVideoRows');
 return{
  total:root.querySelectorAll('*').length,
  channelContextTotal:countElements(context),
  channelBarElements:countElements(bar)+(bar?1:0),
  publisherShellElements:countElements(shellHead)+(shellHead?1:0)+countElements(shellActions)+(shellActions?1:0),
  publisherPickerElements:countElements(picker)+(picker?1:0),
  videoRows:root.querySelectorAll('.publishVideoRow').length,
  buttons:root.querySelectorAll('button').length,
  inputs:root.querySelectorAll('input').length,
  selects:root.querySelectorAll('select').length,
  options:root.querySelectorAll('option').length,
  images:root.querySelectorAll('img').length
 }
}

function DiagnosticBinary({channels,jobs,rows,channelBar,publisherShell,paintMinimal,onProfile}:{channels:Channel[];jobs:VideoJob[];rows:number;channelBar:boolean;publisherShell:boolean;paintMinimal?:boolean;onProfile:React.ProfilerOnRenderCallback}){
 const pickerJobs=jobs.filter(j=>j.channelId===channels[0]?.id).slice(0,rows),{ids,facts}=makeRowFacts(pickerJobs);
 return <div className={paintMinimal?'ytPaintMinimal':''}>
  <HeaderTabs/>
  {channelBar&&<Profiler id="ChannelBar" onRender={onProfile}><YouTubeChannelBar active/></Profiler>}
  <div className="youtubeChannelContext">
   {publisherShell&&<Profiler id="PublisherShell" onRender={onProfile}><PublisherShell channels={channels} channelId={channels[0]?.id||''} selectedCount={0} newCount={rows} uploadedCount={0} processingCount={0} errorCount={0} folderReady recoveryCount={0} onChannel={noOp} onClear={noOp} onFolders={noOp} onRecovery={noOp} onMetadata={noOp} onThumbs={noOp} onSchedule={noOp} onCleanup={noOp}/></Profiler>}
   <Profiler id="PublisherVideoPicker" onRender={onProfile}><PublisherVideoPicker jobs={pickerJobs} selectedIds={[]} selectableIds={ids} busy={false} rowFacts={facts} recoveryIds={new Set()} windowKey={'diag:'+rows} onToggle={noOp} onRemove={noOp} onClearRemoteMissing={noOp}/></Profiler>
  </div>
 </div>
}

function StageView({stage,token,channels,jobs,onProfile}:{stage:Stage;token:number;channels:Channel[];jobs:VideoJob[];onProfile:React.ProfilerOnRenderCallback}){
 if(!stage)return null;
 if(stage.kind==='production')return <div key={token} className={stage.paintMinimal?'ytPaintMinimal':''}><Profiler id="YouTubeCenter" onRender={onProfile}><YouTubeCenter routeTab="publish" active/></Profiler></div>;
 if(stage.kind==='publisher')return <div key={token} className="youtubeChannelContext"><Profiler id="Publisher" onRender={onProfile}><PublisherOS/></Profiler></div>;
 if(stage.kind==='select')return <div key={token}><HeaderTabs/><DiagnosticSelects channels={channels} count={stage.selects}/></div>;
 return <div key={token}><DiagnosticBinary channels={channels} jobs={jobs} rows={stage.rows} channelBar={stage.channelBar} publisherShell={stage.publisherShell} paintMinimal={stage.paintMinimal} onProfile={onProfile}/></div>
}

export function YoutubePaintIsolationProbe(){
 const [stage,setStage]=useState<Stage>(null),[token,setToken]=useState(0);
 const stageRoot=useRef<HTMLDivElement>(null),profiles=useRef<ProfileRow[]>([]);
 const onProfile=useMemo<React.ProfilerOnRenderCallback>(()=>(id,phase,actualDuration,baseDuration,startTime,commitTime)=>{profiles.current.push({id,phase,actualDuration,baseDuration,startTime,commitTime})},[]);
 const channels=useMemo(()=>syntheticChannels(false),[]),jobs=useMemo(()=>syntheticJobs(channels),[channels]);

 useEffect(()=>{
  let cancelled=false,original:any,probeMode=false;
  const measure=async(next:Stage,avatarMode:'real'|'fallback'='fallback'):Promise<MountMeasurement>=>{
   setStage(null);await frames(4);
   const nextChannels=syntheticChannels(avatarMode==='real');clearAvatarCache(nextChannels);
   useApp.setState({channels:nextChannels,jobs});
   await frames(3);
   profiles.current=[];
   const started=performance.now();setToken(x=>x+1);setStage(next);
   const t1=await frame(),t2=await frame(),t3=await frame();
   await frame();
   return{raf1:t1-started,raf2:t2-t1,raf3:t3-t2,profiles:profiles.current.slice(),census:stageRoot.current?census(stageRoot.current):undefined}
  };
  const sample=async(stage:Stage,n=7,avatarMode:'real'|'fallback'='fallback')=>{
   const rows:MountMeasurement[]=[];for(let i=0;i<n&&!cancelled;i++)rows.push(await measure(stage,avatarMode));return rows
  };
  const summarize=(rows:MountMeasurement[])=>({
   raf1:{median:median(rows.map(x=>x.raf1)),p95:p95(rows.map(x=>x.raf1)),worst:Math.max(...rows.map(x=>x.raf1))},
   raf2:{median:median(rows.map(x=>x.raf2)),p95:p95(rows.map(x=>x.raf2)),worst:Math.max(...rows.map(x=>x.raf2))},
   raf3:{median:median(rows.map(x=>x.raf3)),p95:p95(rows.map(x=>x.raf3)),worst:Math.max(...rows.map(x=>x.raf3))},
   profiles:rows.flatMap(x=>x.profiles),
   census:rows.at(-1)?.census
  });
  void (async()=>{
   try{
    if(!(await api.performanceProbeEnabled()))throw new Error('YOUTUBE_PAINT_DIAG_REQUIRES_ISOLATED_PROBE');
    await api.performanceProbeAssertIsolated();await enterPerformanceProbeMode();probeMode=true;
    const before=useApp.getState();original={channels:before.channels,jobs:before.jobs,page:before.page,settings:before.settings};
    useApp.setState({channels,jobs,page:'youtube'});
    useApp.getState().patchSettings({fpsMonitor:false,autoCheckUpdates:false,autopilotEnabled:false});
    try{localStorage.setItem('vyron:youtube-open-tab:v1','publish');localStorage.setItem('vyron:active-publish-channel',channels[0].id)}catch{}
    await frames(8);

    const production=summarize(await sample({kind:'production'}));
    const publisher=summarize(await sample({kind:'publisher'}));
    const shellOnly=summarize(await sample({kind:'binary',rows:0,channelBar:false,publisherShell:false}));
    const channelBar=summarize(await sample({kind:'binary',rows:0,channelBar:true,publisherShell:false}));
    const publisherShell=summarize(await sample({kind:'binary',rows:0,channelBar:true,publisherShell:true}));
    const picker0=summarize(await sample({kind:'binary',rows:0,channelBar:true,publisherShell:true}));
    const picker6=summarize(await sample({kind:'binary',rows:6,channelBar:true,publisherShell:true}));
    const picker12=summarize(await sample({kind:'binary',rows:12,channelBar:true,publisherShell:true}));
    const picker24=summarize(await sample({kind:'binary',rows:24,channelBar:true,publisherShell:true}));
    const select1=summarize(await sample({kind:'select',selects:1}));
    const select2=summarize(await sample({kind:'select',selects:2}));
    const avatarFallback=summarize(await sample({kind:'binary',rows:0,channelBar:true,publisherShell:false},7,'fallback'));
    const avatarReal=summarize(await sample({kind:'binary',rows:0,channelBar:true,publisherShell:false},7,'real'));
    const cssNormal=summarize(await sample({kind:'production'}));
    const cssMinimal=summarize(await sample({kind:'production',paintMinimal:true}));

    const profileSummary=(rows:ProfileRow[],id:string)=>{
      const x=rows.filter(r=>r.id===id&&r.phase==='mount');
      return{samples:x.length,actualMedian:median(x.map(r=>r.actualDuration)),actualP95:p95(x.map(r=>r.actualDuration)),baseMedian:median(x.map(r=>r.baseDuration)),startMedian:median(x.map(r=>r.startTime)),commitMedian:median(x.map(r=>r.commitTime))}
    };
    const report={
      schemaVersion:1,kind:'YOUTUBE_WKWEBVIEW_PAINT_ISOLATION',releaseCandidateChanged:false,baseHead:'4de188b2cf50d3f58cd7074a6e57ccb67c15e1b2',at:new Date().toISOString(),
      dataset:{channels:35,jobs:1000},
      reactProfiler:{
        YouTubeCenter:profileSummary(production.profiles,'YouTubeCenter'),
        Publisher:profileSummary(publisher.profiles,'Publisher'),
        ChannelBar:profileSummary(channelBar.profiles,'ChannelBar'),
        PublisherShell:profileSummary(publisherShell.profiles,'PublisherShell'),
        PublisherVideoPicker24:profileSummary(picker24.profiles,'PublisherVideoPicker')
      },
      observedProductionRaf:production.raf1,
      domCensus:production.census,
      binary:{shellOnly:shellOnly.raf1,channelBar:channelBar.raf1,publisherShell:publisherShell.raf1,picker0:picker0.raf1,picker6:picker6.raf1,picker12:picker12.raf1,picker24:picker24.raf1},
      selectTest:{one:select1.raf1,two:select2.raf1,deltaMedian:select2.raf1.median-select1.raf1.median},
      avatarTest:{fallback:avatarFallback.raf1,real:avatarReal.raf1,deltaMedian:avatarReal.raf1.median-avatarFallback.raf1.median,raf3Fallback:avatarFallback.raf3,raf3Real:avatarReal.raf3},
      cssPaintTest:{normal:cssNormal.raf1,minimal:cssMinimal.raf1,deltaMedian:cssNormal.raf1.median-cssMinimal.raf1.median,raf3Normal:cssNormal.raf3,raf3Minimal:cssMinimal.raf3},
      raw:{production,publisher,shellOnly,channelBar,publisherShell,picker0,picker6,picker12,picker24,select1,select2,avatarFallback,avatarReal,cssNormal,cssMinimal}
    };
    await api.performanceProbeReport(report);
   }catch(error){await api.performanceProbeReport({schemaVersion:1,kind:'YOUTUBE_WKWEBVIEW_PAINT_ISOLATION',releaseCandidateChanged:false,baseHead:'4de188b2cf50d3f58cd7074a6e57ccb67c15e1b2',error:String(error),at:new Date().toISOString()}).catch(()=>undefined)}
   finally{setStage(null);if(original)useApp.setState(original);if(probeMode){await api.performanceProbeCleanup().catch(()=>undefined);exitPerformanceProbeMode()}}
  })();
  return()=>{cancelled=true}
 },[]);

 return <div className="youtubePaintDiagnosticRoot"><style>{`.ytPaintMinimal,.ytPaintMinimal *{box-shadow:none!important;background-image:none!important;transition:none!important;animation:none!important;filter:none!important;backdrop-filter:none!important}.ytPaintMinimal .channelAvatar{width:38px!important;height:38px!important;min-width:38px!important;min-height:38px!important}`}</style><div ref={stageRoot} className="youtubePaintDiagnosticStage"><StageView stage={stage} token={token} channels={channels} jobs={jobs} onProfile={onProfile}/></div></div>
}
