import React,{useEffect} from 'react';
import {api} from './api';
import {useApp} from './store';
import type {Channel,Page,VideoJob} from './types';
import type {MetadataQueueInput} from './metadataQueue';

type FpsMetrics={fps:number;p50:number;p95:number;p99:number;worst:number;dropped:number;long50:number;long100:number};
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
function syntheticMetadata():MetadataQueueInput[]{
  return Array.from({length:5000},(_,i)=>({
    sourceNumber:i+1,title:'SEO Performance Title '+String(i+1).padStart(4,'0'),
    description:'Persistent metadata queue performance fixture '+(i+1),
    tags:['music','ambient','queue'],publishAt:'2026-11-01T18:00:00+07:00',
    publishTime:'18:00',publishTimezone:'Asia/Krasnoyarsk',publishUtcOffsetMinutes:420
  }));
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
async function runNavigationRound(round:number){
  const route:Page[]=['dashboard','channels','production','youtube','analytics','settings'];
  for(let i=0;i<30;i++){
    const page=route[i%route.length];
    useApp.getState().setPage(page);
    await frames(3);
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
        await api.metadataQueueImport(channels[0].id,channels[0].name,'m1-perf-5000.json','vyron-610-m1-perf-5000-v1',syntheticMetadata());
        await sleep(1400);
        const rounds:FpsMetrics[]=[];
        for(let round=0;round<3&&!cancelled;round++){
          latest=null;window.dispatchEvent(new CustomEvent('vyron:fps-reset'));await sleep(850);
          await runNavigationRound(round);
          if(!latest)throw new Error('PERFORMANCE_METRICS_NOT_EMITTED');
          rounds.push({...latest});
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
          dataset:{channels:35,jobs:1000,metadataRecords:5000,navigationSwitchesPerRound:30,rounds:3},
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
