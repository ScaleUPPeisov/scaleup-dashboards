import React,{useEffect,useMemo,useState} from 'react';
import {flushSync} from 'react-dom';
import {api} from './api';
import {ChannelAvatar} from './ChannelAvatar';
import {PublisherShell} from './PublisherShell';
import {PublisherVideoPicker} from './PublisherVideoPicker';
import {YouTubeCenter} from './YouTubeCenter';
import {YouTubeChannelBar} from './YouTubeChannelBar';
import {EMPTY_PUBLISHER_DERIVED,usePublisherDerived,type PublisherVideoRowFact} from './publisherDerivedRuntime';
import {enterPerformanceProbeMode,exitPerformanceProbeMode,useApp} from './store';
import {saveActivePublishChannel} from './publishWorkspaceState';
import type {Channel,VideoJob} from './types';
import {resetYoutubePaintProfiler,youtubePaintProfilerSnapshot,type PaintProfilerEntry} from './youtubePaintDiagnosticRuntime';

type FrameSample={raf1:number;raf2:number;raf3:number};
type VariantName='production'|'shell'|'channelbar'|'publisher-shell'|'picker-0'|'picker-6'|'picker-12'|'picker-24'|'select-1'|'select-2'|'avatar-real'|'avatar-fallback'|'paint-minimal';
type Spec={name:VariantName;token:number};
type Summary={median:number;p95:number;worst:number;values:number[]};

const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function frames(n:number){for(let i=0;i<n;i++)await frame()}
function percentile(values:number[],q:number){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor((a.length-1)*q))]}
function summarize(values:number[]):Summary{return{median:percentile(values,.5),p95:percentile(values,.95),worst:values.length?Math.max(...values):0,values}}
function summarizeFrames(samples:FrameSample[]){return{raf1:summarize(samples.map(x=>x.raf1)),raf2:summarize(samples.map(x=>x.raf2)),raf3:summarize(samples.map(x=>x.raf3))}}
function summarizeProfiler(entries:PaintProfilerEntry[]){
 const ids=['YouTubeCenter','YouTubeChannelBar','PublisherOS','PublisherShell','PublisherVideoPicker'];
 const out:Record<string,unknown>={};
 for(const id of ids){
  const mounts=entries.filter(x=>x.id===id&&x.phase==='mount');
  out[id]={
   samples:mounts.length,
   actualDuration:summarize(mounts.map(x=>x.actualDuration)),
   baseDuration:summarize(mounts.map(x=>x.baseDuration)),
   startTime:mounts.map(x=>x.startTime),
   commitTime:mounts.map(x=>x.commitTime)
  }
 }
 return out
}

function syntheticChannels():Channel[]{
 return Array.from({length:35},(_,i)=>({
  id:'perf-channel-'+String(i+1).padStart(2,'0'),
  name:'Performance Channel '+String(i+1).padStart(2,'0'),
  slug:'performance-channel-'+String(i+1).padStart(2,'0'),
  cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',
  minTracks:10,targetDurationMin:120,enabled:true,dailyUploadTarget:20,
  seo:{titlePatterns:['{topic}'],descriptionTemplate:'{title}',tags:['music','performance'],banned:[]},
  stats:{viewCount:100000+i*1000,videoCount:100+i,subscriberCount:1000+i*10,hiddenSubscriberCount:false,updatedAt:'2026-10-01T00:00:00Z'}
 }))
}
function syntheticJobs(channels:Channel[]):VideoJob[]{
 const statuses:VideoJob['status'][]=['WAITING_MUSIC','READY_RENDER','READY_UPLOAD','SCHEDULED'];
 return Array.from({length:1000},(_,i)=>{
  const c=channels[i%channels.length],n=Math.floor(i/channels.length)+1;
  return{id:'perf-job-'+String(i+1).padStart(4,'0'),channelId:c.id,number:n,folder:'/tmp/vyron-perf/'+c.id+'/VIDEO_'+String(n).padStart(3,'0'),status:statuses[i%statuses.length],createdAt:'2026-09-30T00:00:00Z',publishAt:'2026-10-15T18:00:00+07:00',tracksCount:10,minTracks:10,title:'Performance Video '+(i+1),description:'Synthetic production performance fixture',tags:['music','test']};
 })
}

function YoutubeHeaderTabs(){
 const tabs=['Публикация','Метаданные','Расписание','Загруженные','Командный центр','План каналов','Статистика','История','Аккаунты'];
 return <><div className="youtubeCenterHead"><div><small>VYRON • YOUTUBE</small><h1>YouTube</h1><p>Публикация, метаданные, расписание и управление каналом в одном рабочем пространстве.</p></div><button className="compact">Квота</button></div><div className="youtubeTabs youtubeMasterTabs">{tabs.map((x,i)=><button key={x} className={i===0?'active':''}>{x}</button>)}</div></>
}

function NativeSelector({channels}:{channels:Channel[]}){
 return <select defaultValue={channels[0]?.id||''}>{channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
}

function DiagnosticVariant({spec}:{spec:Spec}){
 const channels=useApp(s=>s.channels),channelId=channels[0]?.id||'',channel=channels[0];
 const derived=usePublisherDerived(s=>s.byChannel[channelId]||EMPTY_PUBLISHER_DERIVED);
 const empty=useMemo(()=>new Set<string>(),[]);
 const shell=<PublisherShell channels={channels} channelId={channelId} selectedCount={0} newCount={derived.counts.NEW} uploadedCount={derived.counts.ON_YOUTUBE} processingCount={derived.counts.PROCESSING} errorCount={derived.counts.ERRORS} folderReady={false} recoveryCount={0} onChannel={()=>{}} onClear={()=>{}} onFolders={()=>{}} onRecovery={()=>{}} onMetadata={()=>{}} onThumbs={()=>{}} onSchedule={()=>{}} onCleanup={()=>{}}/>;
 if(spec.name==='production'||spec.name==='paint-minimal')return <div className={spec.name==='paint-minimal'?'youtubePaintDiagStage ytPaintDiagMinimal':'youtubePaintDiagStage'}><YouTubeCenter routeTab="publish" active/></div>;
 if(spec.name==='shell')return <div className="youtubePaintDiagStage"><YoutubeHeaderTabs/></div>;
 if(spec.name==='channelbar')return <div className="youtubePaintDiagStage"><YoutubeHeaderTabs/><YouTubeChannelBar active/></div>;
 if(spec.name==='publisher-shell')return <div className="youtubePaintDiagStage"><YoutubeHeaderTabs/><YouTubeChannelBar active/><div className="youtubeChannelContext">{shell}</div></div>;
 if(spec.name.startsWith('picker-')){
  const count=Number(spec.name.split('-')[1])||0,jobs=derived.jobs.slice(0,count),facts=new Map<string,PublisherVideoRowFact>();
  for(const job of jobs)facts.set(job.id,{state:'NEW',selectable:true});
  return <div className="youtubePaintDiagStage"><YoutubeHeaderTabs/><YouTubeChannelBar active/><div className="youtubeChannelContext">{shell}<PublisherVideoPicker jobs={jobs} selectedIds={[]} selectableIds={new Set(jobs.map(j=>j.id))} busy={false} rowFacts={facts} recoveryIds={empty} windowKey={spec.name} onToggle={()=>{}} onRemove={()=>{}} onClearRemoteMissing={()=>{}}/></div></div>
 }
 if(spec.name==='select-1'||spec.name==='select-2')return <div className="youtubePaintDiagStage"><YoutubeHeaderTabs/><div className="youtubeChannelContext diagnosticSelectIsolation"><NativeSelector channels={channels}/>{spec.name==='select-2'&&<NativeSelector channels={channels}/>}</div></div>;
 if(spec.name==='avatar-real'||spec.name==='avatar-fallback'){
  if(!channel)return null;
  const imageChannel:Channel={...channel,stats:{...channel.stats,thumbnail:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22128%22 height=%22128%22%3E%3Crect width=%22128%22 height=%22128%22 fill=%22%2322262f%22/%3E%3Ccircle cx=%2264%22 cy=%2264%22 r=%2238%22 fill=%22%23fff%22/%3E%3C/svg%3E'}};
  return <div className="youtubePaintDiagStage"><YoutubeHeaderTabs/><section className="youtubeChannelBar channelContextBar"><div className="channelContextIdentity">{spec.name==='avatar-real'?<ChannelAvatar channel={imageChannel} size="lg"/>:<span className="channelAvatar channelAvatar-lg channelAvatarFallback">P</span>}<div><small>АКТИВНЫЙ КАНАЛ</small><b>{channel.name}</b><span>{channel.id}</span></div></div></section></div>
 }
 return null
}

function census(){
 const root=document.querySelector('.youtubePaintDiagStage');
 const context=root?.querySelector('.youtubeChannelContext');
 const shellRoots=[root?.querySelector('.publishMasterHead'),root?.querySelector('.publishDemandActions')].filter(Boolean) as Element[];
 const picker=root?.querySelector('.publishVideoRows');
 const shellElements=new Set<Element>();
 for(const x of shellRoots){shellElements.add(x);x.querySelectorAll('*').forEach(el=>shellElements.add(el))}
 return{
  totalInsideYoutubeChannelContext:context?.querySelectorAll('*').length||0,
  publisherShellElements:shellElements.size,
  publisherVideoPickerElements:picker?(picker.querySelectorAll('*').length+1):0,
  videoRows:root?.querySelectorAll('.publishVideoRow').length||0,
  buttons:root?.querySelectorAll('button').length||0,
  inputs:root?.querySelectorAll('input').length||0,
  selects:root?.querySelectorAll('select').length||0,
  options:root?.querySelectorAll('option').length||0,
  images:root?.querySelectorAll('img').length||0
 }
}

export function YouTubePaintIsolationProbe(){
 const [spec,setSpec]=useState<Spec|null>(null),[status,setStatus]=useState('Preparing diagnostic');
 useEffect(()=>{
  let cancelled=false,original:any,probeMode=false,token=0;
  const run=async()=>{
   try{
    if(!(await api.performanceProbeEnabled()))throw new Error('DIAGNOSTIC_BACKEND_DISABLED');
    await api.performanceProbeAssertIsolated();
    await enterPerformanceProbeMode();probeMode=true;
    const before=useApp.getState();
    original={channels:before.channels,jobs:before.jobs,competitors:before.competitors,settings:before.settings,logs:before.logs,uploadHistory:before.uploadHistory,activityJournal:before.activityJournal,statisticsHistory:before.statisticsHistory,fingerprintCache:before.fingerprintCache,projectLifecycle:before.projectLifecycle,page:before.page};
    const channels=syntheticChannels(),jobs=syntheticJobs(channels);
    useApp.setState({channels,jobs,uploadHistory:[]});
    useApp.getState().patchSettings({fpsMonitor:false,autoCheckUpdates:false,autopilotEnabled:false});
    saveActivePublishChannel(channels[0].id);
    try{localStorage.setItem('vyron:youtube-open-tab:v1','publish')}catch{}
    await frames(4);

    const measure=async(name:VariantName,samples=12)=>{
      const frameSamples:FrameSample[]=[],profiles:PaintProfilerEntry[]=[];
      for(let i=0;i<samples&&!cancelled;i++){
       flushSync(()=>setSpec(null));await frames(2);resetYoutubePaintProfiler();
       const started=performance.now();flushSync(()=>setSpec({name,token:++token}));
       let last=started;const deltas:number[]=[];
       for(let r=0;r<3;r++){await frame();const now=performance.now();deltas.push(now-last);last=now}
       await frame();
       frameSamples.push({raf1:deltas[0],raf2:deltas[1],raf3:deltas[2]});
       profiles.push(...youtubePaintProfilerSnapshot());
      }
      return{frames:summarizeFrames(frameSamples),profiler:summarizeProfiler(profiles)}
    };

    setStatus('React profiler + production census');
    const production=await measure('production',12);
    flushSync(()=>setSpec(null));await frames(2);flushSync(()=>setSpec({name:'production',token:++token}));await frames(4);
    const domCensus=census();

    setStatus('Binary isolation A-G');
    const binary:Record<string,unknown>={};
    for(const name of ['shell','channelbar','publisher-shell','picker-0','picker-6','picker-12','picker-24'] as VariantName[])binary[name]=await measure(name,12);

    setStatus('Native select isolation');
    const select1=await measure('select-1',12),select2=await measure('select-2',12);

    setStatus('Avatar decode isolation');
    const avatarReal=await measure('avatar-real',12),avatarFallback=await measure('avatar-fallback',12);

    setStatus('CSS paint isolation');
    const paintMinimal=await measure('paint-minimal',12);

    const top=((production.profiler as any).YouTubeCenter?.actualDuration?.median||0) as number;
    const raf1=(production.frames as any).raf1.median as number;
    const conclusion=top>=25?'REACT':top<=15&&raf1>=30?'LAYOUT_PAINT':'MIXED';
    const report={
     schemaVersion:1,diagnosticOnly:true,baseHead:'4de188b2cf50d3f58cd7074a6e57ccb67c15e1b2',at:new Date().toISOString(),
     dataset:{channels:35,jobs:1000,samplesPerVariant:12},
     reactProfiler:production.profiler,
     observedProductionFrames:production.frames,
     conclusion,
     domCensus,
     binaryIsolation:binary,
     selectIsolation:{oneSelect35Options:select1,twoSelect70Options:select2},
     avatarIsolation:{realImage:avatarReal,fallback:avatarFallback},
     cssPaintIsolation:{normal:production,paintMinimal},
     runtime:{userAgent:navigator.userAgent,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,screen:[screen.width,screen.height,devicePixelRatio]}
    };
    await api.performanceProbeReport(report);
    setStatus('Diagnostic complete');
   }catch(error){
    await api.performanceProbeReport({schemaVersion:1,diagnosticOnly:true,baseHead:'4de188b2cf50d3f58cd7074a6e57ccb67c15e1b2',at:new Date().toISOString(),error:String(error)}).catch(()=>undefined);
    setStatus('Diagnostic failed: '+String(error));
   }finally{
    if(original)useApp.setState(original);
    if(probeMode){await api.performanceProbeCleanup().catch(()=>undefined);exitPerformanceProbeMode()}
   }
  };
  void run();
  return()=>{cancelled=true}
 },[]);
 return <div className="pageWrap youtubePaintDiagHost"><div className="diagnosticBanner"><small>NON-GATE • YOUTUBE WKWEBVIEW PAINT ISOLATION</small><b>{status}</b></div>{spec&&<DiagnosticVariant key={spec.token} spec={spec}/>}</div>
}
