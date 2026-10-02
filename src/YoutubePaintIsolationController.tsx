import React,{useEffect} from 'react';
import {api} from './api';
import {enterPerformanceProbeMode,exitPerformanceProbeMode,useApp} from './store';
import type {Channel,VideoJob} from './types';
import {saveActivePublishChannel} from './publishWorkspaceState';
import {
 clearYoutubePaintProfiles,setYoutubePaintVariant,youtubePaintDiagnosticEnabled,youtubePaintProfiles,
 type YoutubePaintProfileRow,type YoutubePaintVariant
} from './youtubePaintDiagnosticRuntime';

type Census={total:number;channelContextTotal:number;channelBarElements:number;publisherShellElements:number;publisherPickerElements:number;videoRows:number;buttons:number;inputs:number;selects:number;options:number;images:number};
type Measurement={raf1:number;raf2:number;raf3:number;profiles:YoutubePaintProfileRow[];census:Census};
const frame=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve));
async function frames(n:number){for(let i=0;i<n;i++)await frame()}
const median=(a:number[])=>{const x=[...a].sort((m,n)=>m-n);return x.length?x[Math.floor(x.length/2)]:0};
const p95=(a:number[])=>{const x=[...a].sort((m,n)=>m-n);return x.length?x[Math.min(x.length-1,Math.floor((x.length-1)*.95))]:0};
function syntheticChannels(withAvatar=false):Channel[]{
 return Array.from({length:35},(_,i)=>{
  const n=String(i+1).padStart(2,'0');
  const thumbnail=withAvatar&&i===0?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="20" fill="#39424e"/><text x="48" y="59" text-anchor="middle" font-size="38" fill="white">YT</text></svg>'):undefined;
  return{id:'perf-channel-'+n,name:'Performance Channel '+n,slug:'performance-channel-'+n,cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,dailyUploadTarget:20,seo:{titlePatterns:['{topic}'],descriptionTemplate:'{title}',tags:['music','performance'],banned:[]},stats:{viewCount:100000+i*1000,videoCount:100+i,subscriberCount:1000+i*10,hiddenSubscriberCount:false,updatedAt:'2026-10-01T00:00:00Z',thumbnail}};
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
function count(root:ParentNode|null){return root?root.querySelectorAll('*').length:0}
function census():Census{
 const root=document.querySelector<HTMLElement>('.pageWrap'),context=root?.querySelector('.youtubeChannelContext')||null,bar=root?.querySelector('.youtubeChannelBar')||null,head=root?.querySelector('.publishMasterHead')||null,actions=root?.querySelector('.publishDemandActions')||null,picker=root?.querySelector('.publishVideoRows')||null;
 return{total:count(root),channelContextTotal:count(context),channelBarElements:count(bar)+(bar?1:0),publisherShellElements:count(head)+(head?1:0)+count(actions)+(actions?1:0),publisherPickerElements:count(picker)+(picker?1:0),videoRows:root?.querySelectorAll('.publishVideoRow').length||0,buttons:root?.querySelectorAll('button').length||0,inputs:root?.querySelectorAll('input').length||0,selects:root?.querySelectorAll('select').length||0,options:root?.querySelectorAll('option').length||0,images:root?.querySelectorAll('img').length||0}
}
function summarize(rows:Measurement[]){
 return{raf1:{median:median(rows.map(x=>x.raf1)),p95:p95(rows.map(x=>x.raf1)),worst:Math.max(...rows.map(x=>x.raf1))},raf2:{median:median(rows.map(x=>x.raf2)),p95:p95(rows.map(x=>x.raf2)),worst:Math.max(...rows.map(x=>x.raf2))},raf3:{median:median(rows.map(x=>x.raf3)),p95:p95(rows.map(x=>x.raf3)),worst:Math.max(...rows.map(x=>x.raf3))},profiles:rows.flatMap(x=>x.profiles),census:rows.at(-1)?.census}
}
function profileSummary(rows:YoutubePaintProfileRow[],id:string){
 const mounts=rows.filter(x=>x.id===id&&x.phase==='mount');
 return{samples:mounts.length,actualMedian:median(mounts.map(x=>x.actualDuration)),actualP95:p95(mounts.map(x=>x.actualDuration)),baseMedian:median(mounts.map(x=>x.baseDuration)),startMedian:median(mounts.map(x=>x.startTime)),commitMedian:median(mounts.map(x=>x.commitTime))}
}

export function YoutubePaintIsolationController(){
 useEffect(()=>{
  if(!youtubePaintDiagnosticEnabled())return;
  let cancelled=false,probeMode=false,original:any;
  const measure=async(variant:YoutubePaintVariant,avatar:'fallback'|'real'='fallback'):Promise<Measurement>=>{
   useApp.getState().setPage('dashboard');await frames(5);
   const channels=syntheticChannels(avatar==='real');clearAvatarCache(channels);useApp.setState({channels});
   saveActivePublishChannel(channels[0].id);setYoutubePaintVariant(variant);clearYoutubePaintProfiles();await frames(3);
   const started=performance.now();useApp.getState().setPage('youtube');
   const t1=await frame(),t2=await frame(),t3=await frame();await frame();
   const result={raf1:t1-started,raf2:t2-t1,raf3:t3-t2,profiles:youtubePaintProfiles(),census:census()};
   useApp.getState().setPage('dashboard');await frames(5);
   return result
  };
  const sample=async(v:YoutubePaintVariant,n=12,avatar:'fallback'|'real'='fallback')=>{const out:Measurement[]=[];for(let i=0;i<n&&!cancelled;i++)out.push(await measure(v,avatar));return out};
  void (async()=>{
   try{
    if(!(await api.performanceProbeEnabled()))throw new Error('YOUTUBE_PAINT_DIAG_REQUIRES_ISOLATED_PROBE');
    await api.performanceProbeAssertIsolated();await enterPerformanceProbeMode();probeMode=true;
    const before=useApp.getState();original={channels:before.channels,jobs:before.jobs,settings:before.settings,page:before.page};
    const channels=syntheticChannels(false),jobs=syntheticJobs(channels);
    useApp.setState({channels,jobs,page:'dashboard'});useApp.getState().patchSettings({fpsMonitor:false,autoCheckUpdates:false,autopilotEnabled:false});
    saveActivePublishChannel(channels[0].id);await frames(10);

    const production=summarize(await sample('production'));
    const shell=summarize(await sample('shell'));
    const bar=summarize(await sample('channelbar'));
    const pubShell=summarize(await sample('publisher-shell'));
    const picker0=summarize(await sample('picker0'));
    const picker6=summarize(await sample('picker6'));
    const picker12=summarize(await sample('picker12'));
    const picker24=summarize(await sample('picker24'));
    const select1=summarize(await sample('select1'));
    const select2=summarize(await sample('select2'));
    const avatarFallback=summarize(await sample('channelbar',12,'fallback'));
    const avatarReal=summarize(await sample('channelbar',12,'real'));
    const cssNormal=summarize(await sample('production'));
    const cssMinimal=summarize(await sample('production-minimal'));

    const report={
     schemaVersion:2,kind:'YOUTUBE_WKWEBVIEW_PAINT_ISOLATION_APP_SHELL',releaseCandidateChanged:false,baseHead:'4de188b2cf50d3f58cd7074a6e57ccb67c15e1b2',at:new Date().toISOString(),dataset:{channels:35,jobs:1000,samplesPerVariant:12},
     reactProfiler:{YouTubeCenter:profileSummary(production.profiles,'YouTubeCenter'),ChannelBar:profileSummary(production.profiles,'ChannelBar'),Publisher:profileSummary(production.profiles,'Publisher'),PublisherShell:profileSummary(production.profiles,'PublisherShell'),PublisherVideoPicker:profileSummary(production.profiles,'PublisherVideoPicker'),combinedInclusive:profileSummary(production.profiles,'YouTubeCenter')},
     observedProduction:{raf1:production.raf1,raf2:production.raf2,raf3:production.raf3,domCensus:production.census},
     binary:{shellOnly:shell.raf1,channelBar:bar.raf1,publisherShell:pubShell.raf1,picker0:picker0.raf1,picker6:picker6.raf1,picker12:picker12.raf1,picker24:picker24.raf1},
     selectTest:{one:select1.raf1,two:select2.raf1,deltaMedian:select2.raf1.median-select1.raf1.median,currentProductionSelects:production.census?.selects,currentProductionOptions:production.census?.options},
     avatarTest:{fallback:avatarFallback.raf1,real:avatarReal.raf1,deltaMedian:avatarReal.raf1.median-avatarFallback.raf1.median,raf3Fallback:avatarFallback.raf3,raf3Real:avatarReal.raf3},
     cssPaintTest:{normal:cssNormal.raf1,minimal:cssMinimal.raf1,deltaMedian:cssNormal.raf1.median-cssMinimal.raf1.median,raf3Normal:cssNormal.raf3,raf3Minimal:cssMinimal.raf3}
    };
    await api.performanceProbeReport(report)
   }catch(error){await api.performanceProbeReport({schemaVersion:2,kind:'YOUTUBE_WKWEBVIEW_PAINT_ISOLATION_APP_SHELL',releaseCandidateChanged:false,baseHead:'4de188b2cf50d3f58cd7074a6e57ccb67c15e1b2',error:String(error),at:new Date().toISOString()}).catch(()=>undefined)}
   finally{if(original)useApp.setState(original);if(probeMode){await api.performanceProbeCleanup().catch(()=>undefined);exitPerformanceProbeMode()}}
  })();
  return()=>{cancelled=true}
 },[]);
 return <style>{`.ytPaintMinimal,.ytPaintMinimal *{box-shadow:none!important;background-image:none!important;transition:none!important;animation:none!important;filter:none!important;backdrop-filter:none!important}.ytPaintMinimal .channelAvatar{width:38px!important;height:38px!important;min-width:38px!important;min-height:38px!important}`}</style>
}
