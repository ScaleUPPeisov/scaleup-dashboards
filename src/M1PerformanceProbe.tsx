import React,{useEffect} from 'react';
import {api} from './api';
import {useApp} from './store';
import type {Channel,Page,VideoJob} from './types';
import type {MetadataQueueInput} from './metadataQueue';

type FpsMetrics={fps:number;p50:number;p95:number;p99:number;worst:number;dropped:number;long50:number;long100:number};
type RouteTiming={page:Page;samples:number[]};
const sleep=(ms:number)=>new Promise<void>(r=>window.setTimeout(r,ms));
const frame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()));
async function frames(n:number){for(let i=0;i<n;i++)await frame()}
function median(values:number[]){const a=[...values].sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:0}
function syntheticChannels():Channel[]{
  return Array.from({length:35},(_,i)=>({
    id:'perf-channel-'+String(i+1).padStart(2,'0'),
    name:'Performance Channel '+String(i+1).padStart(2,'0'),
    slug:'performance-channel-'+String(i+1).padStart(2,'0'),
    cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',
    minTracks:10,targetDurationMin:120,enabled:true,dailyUploadTarget:20,
    seo:{titlePatterns:['{topic}'],descriptionTemplate:'{title}',tags:['music','performance'],banned:[]},
    stats:{viewCount:100000+i*1000,videoCount:100+i,subscriberCount:1000+i*10,hiddenSubscriberCount:false,updatedAt:'2026-10-01T00:00:00Z'}
  }));
}
function syntheticJobs(channels:Channel[]):VideoJob[]{
  const statuses:VideoJob['status'][]=['WAITING_MUSIC','READY_RENDER','READY_UPLOAD','SCHEDULED'];
  return Array.from({length:1000},(_,i)=>{
    const c=channels[i%channels.length],n=Math.floor(i/channels.length)+1;
    return {
      id:'perf-job-'+String(i+1).padStart(4,'0'),channelId:c.id,number:n,
      folder:'/tmp/vyron-perf/'+c.id+'/VIDEO_'+String(n).padStart(3,'0'),
      status:statuses[i%statuses.length],createdAt:'2026-09-30T00:00:00Z',
      publishAt:'2026-10-15T18:00:00+07:00',tracksCount:10,minTracks:10,
      title:'Performance Video '+(i+1),description:'Synthetic production performance fixture',tags:['music','test']
    };
  });
}
function syntheticMetadata(start:number,count:number):MetadataQueueInput[]{
  return Array.from({length:count},(_,i)=>{
    const n=start+i;
    return {
      sourceNumber:n,title:'SEO Performance Title '+String(n).padStart(4,'0'),
      description:'Persistent metadata queue performance fixture '+n,
      tags:['music','ambient','queue'],publishAt:'2026-11-01T18:00:00+07:00',
      publishTime:'18:00',publishTimezone:'Asia/Krasnoyarsk',publishUtcOffsetMinutes:420
    }
  });
}
function clickButton(text:string){
  const needle=text.toLocaleLowerCase('ru-RU');
  const el=[...document.querySelectorAll<HTMLButtonElement>('button')].find(x=>(x.textContent||'').toLocaleLowerCase('ru-RU').includes(needle));
  el?.click();
}
async function scrollHotContainers(){
  const roots=[document.querySelector<HTMLElement>('.pageWrap'),document.querySelector<HTMLElement>('.metadataQueueRows')].filter(Boolean) as HTMLElement[];
  for(const el of roots){
    el.scrollTop=el.scrollHeight;await frames(2);
    el.scrollTop=0;await frames(2);
  }
}
async function runNavigationRound(round:number,routeTimings:Map<Page,number[]>){
  const route:Page[]=['dashboard','channels','production','youtube','analytics','settings'];
  for(let i=0;i<30;i++){
    const page=route[i%route.length],started=performance.now();
    useApp.getState().setPage(page);
    await frames(3);
    const elapsed=performance.now()-started;
    const bucket=routeTimings.get(page)||[];bucket.push(elapsed);routeTimings.set(page,bucket);
    if(page==='production'&&i%12===2){clickButton('Материалы');await frames(3);clickButton('Builder');await frames(3)}
    if(i%6===5)await scrollHotContainers();
  }
  useApp.getState().setPage('metadata');await frames(12);await scrollHotContainers();
  window.dispatchEvent(new CustomEvent('vyron:open-error-center'));await frames(5);
  const close=[...document.querySelectorAll<HTMLButtonElement>('.errorCenterModal button')].find(x=>(x.textContent||'').trim()==='Закрыть');
  close?.click();await frames(4);
  useApp.getState().setPage('dashboard');await frames(8);
  await sleep(900+round*100);
}

export function M1PerformanceProbe(){
  useEffect(()=>{
    let cancelled=false;
    let latest:FpsMetrics|null=null;
    const onMetrics=(event:Event)=>{latest=(event as CustomEvent<FpsMetrics>).detail};
    window.addEventListener('vyron:fps-metrics',onMetrics);
    void (async()=>{
      try{
        if(!(await api.performanceProbeEnabled()))return;
        const channels=syntheticChannels(),jobs=syntheticJobs(channels);
        useApp.setState({channels,jobs});
        useApp.getState().patchSettings({fpsMonitor:true,autoCheckUpdates:false,autopilotEnabled:false});
        // 5000 records TOTAL across the same 35 channels that own the 1000 jobs.
        // The previous probe imported all 5000 only into channel[0], so exactly 29
        // jobs (1000 / 35 rounded up) were correctly assigned and the probe falsely
        // reported a queue failure before FPS measurement even started.
        let metadataOffset=1;
        for(let i=0;i<channels.length;i++){
          const count=142+(i<30?1:0); // 30*143 + 5*142 = 5000
          const rows=syntheticMetadata(metadataOffset,count);
          await api.metadataQueueImport(
            channels[i].id,channels[i].name,
            'm1-perf-5000-part-'+String(i+1).padStart(2,'0')+'.json',
            'vyron-610-m1-perf-5000-v2-'+String(i+1).padStart(2,'0'),
            rows
          );
          metadataOffset+=count;
        }
        if(metadataOffset!==5001)throw new Error('METADATA_FIXTURE_TOTAL_MISMATCH:'+String(metadataOffset-1));
        const assignmentStarted=performance.now();
        // Measure the durable batch allocator itself without adding 1000 synthetic
        // metadata.json sidecar writes to the UI frame-pacing benchmark. Production
        // sidecar behavior remains covered by queue/backend tests and real Publisher.
        const queuePatches:Array<{id:string;patch:Partial<VideoJob>}>=[],reservedIds=new Set<string>();
        for(const channel of channels){
          const candidates=jobs.filter(j=>j.channelId===channel.id).sort((a,b)=>a.number-b.number);
          const reserved=await api.metadataQueueReserveBatch(channel.id,channel.name,candidates.map(j=>({
            jobId:j.id,videoNumber:j.number
          })));
          for(const result of reserved){
            if(!result.record)continue;
            reservedIds.add(result.jobId);
            const current=candidates.find(j=>j.id===result.jobId);
            if(!current)continue;
            queuePatches.push({id:current.id,patch:{
              title:result.record.title??current.title,
              description:result.record.description??current.description,
              tags:result.record.tags?.length?[...result.record.tags]:current.tags,
              publishAt:result.record.publishAt||current.publishAt,
              metadataSource:'queue',
              metadataLocked:true,
              error:undefined
            }});
          }
        }
        useApp.getState().patchJobsBatch(queuePatches);
        const assignedJobs=reservedIds.size;
        if(assignedJobs!==1000)throw new Error('METADATA_BATCH_ASSIGNMENT_INCOMPLETE:'+assignedJobs);
        const assignmentMs=performance.now()-assignmentStarted;
        await sleep(1000);
        const rounds:FpsMetrics[]=[],routeTimings=new Map<Page,number[]>();
        for(let round=0;round<3&&!cancelled;round++){
          latest=null;window.dispatchEvent(new CustomEvent('vyron:fps-reset'));await sleep(850);
          await runNavigationRound(round,routeTimings);
          if(!latest)throw new Error('PERFORMANCE_METRICS_NOT_EMITTED');
          rounds.push({...latest as FpsMetrics});
        }
        if(cancelled||rounds.length!==3)return;
        const aggregate={
          fps:median(rounds.map(x=>x.fps)),
          p50:median(rounds.map(x=>x.p50)),
          p95:median(rounds.map(x=>x.p95)),
          p99:median(rounds.map(x=>x.p99)),
          worst:Math.max(...rounds.map(x=>x.worst)),
          dropped:median(rounds.map(x=>x.dropped)),
          long50:Math.max(...rounds.map(x=>x.long50)),
          long100:Math.max(...rounds.map(x=>x.long100)),
        };
        const target={fps:60,p50:16.7,p95:20,p99:33,dropped:2,long50:0};
        const pass=aggregate.fps>=57&&aggregate.p50<=17.5&&aggregate.p95<=20.5&&aggregate.p99<=33.5&&aggregate.dropped<2&&aggregate.long50===0;
        await api.performanceProbeReport({
          schemaVersion:1,version:'6.1.0',at:new Date().toISOString(),pass,target,aggregate,rounds,
          dataset:{channels:35,jobs:1000,metadataRecords:5000,assignedJobs,assignmentMs,navigationSwitchesPerRound:30,rounds:3},
          routeTimings:Object.fromEntries([...routeTimings.entries()].map(([page,samples])=>[page,{samples:samples.length,median:median(samples),p95:[...samples].sort((a,b)=>a-b)[Math.min(samples.length-1,Math.floor((samples.length-1)*.95))],worst:Math.max(...samples)}])),
          runtime:{userAgent:navigator.userAgent,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,screen:[screen.width,screen.height,devicePixelRatio]},
          scenarios:['Главная→Каналы→Производство→YouTube→Аналитика→Настройки × 30','Production Materials/Builder','YouTube Metadata + 5000-record queue','modal open/close','long scroll']
        });
      }catch(error){
        if(await api.performanceProbeEnabled().catch(()=>false))await api.performanceProbeReport({schemaVersion:1,version:'6.1.0',pass:false,error:String(error),at:new Date().toISOString()}).catch(()=>undefined);
      }
    })();
    return()=>{cancelled=true;window.removeEventListener('vyron:fps-metrics',onMetrics)};
  },[]);
  return null;
}
