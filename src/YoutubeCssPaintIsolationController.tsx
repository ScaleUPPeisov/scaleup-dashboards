import {useEffect} from 'react';
import {api} from './api';
import {enterPerformanceProbeMode,exitPerformanceProbeMode,useApp} from './store';
import type {Channel,VideoJob} from './types';
import {saveActivePublishChannel} from './publishWorkspaceState';

type Variant='base'|'shadows'|'gradients'|'transitions'|'filters'|'opaque'|'pseudo';
type FrameStats={median:number;p95:number;worst:number};
type VariantReport={raf1:FrameStats;raf2:FrameStats;raf3:FrameStats;values:{raf1:number[];raf2:number[];raf3:number[]}};
type SelectorCount={selector:string;count:number};
type CensusEntry={count:number;selectors:SelectorCount[]};
type StyleCensus={
 totalVisible:number;
 boxShadow:CensusEntry;textShadow:CensusEntry;gradients:CensusEntry;transparentBackgrounds:CensusEntry;
 filter:CensusEntry;backdropFilter:CensusEntry;transition:CensusEntry;animation:CensusEntry;transform:CensusEntry;
 positionFixed:CensusEntry;positionSticky:CensusEntry;pseudoDecorations:CensusEntry;largeRadiusClipping:CensusEntry;
 focus:Record<string,{count:number;boxShadow:number;gradient:number;transition:number;filter:number;transparentBackground:number;pseudo:number}>;
 globalInteraction:Record<string,Record<string,string>>;
 opaqueRules:string[];
 pseudoRules:string[];
};

const ROOTS=['.youtubeCenterHead','.youtubeChannelBar','.youtubeMasterTabs','.youtubeChannelContext'];
const TARGET=ROOTS.flatMap(r=>[r,r+' *']).join(',');
const frame=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve));
async function frames(n:number){for(let i=0;i<n;i++)await frame()}
const median=(a:number[])=>{const x=[...a].sort((m,n)=>m-n);return x.length?x[Math.floor(x.length/2)]:0};
const p95=(a:number[])=>{const x=[...a].sort((m,n)=>m-n);return x.length?x[Math.min(x.length-1,Math.floor((x.length-1)*.95))]:0};
const stats=(a:number[]):FrameStats=>({median:median(a),p95:p95(a),worst:a.length?Math.max(...a):0});
const durationPositive=(raw:string)=>raw.split(',').some(x=>parseFloat(x)>0);
const alphaFromColor=(raw:string)=>{const m=raw.match(/rgba?\(([^)]+)\)/i);if(!m)return 1;const p=m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);return p.length>=4&&Number.isFinite(p[3])?p[3]:1};
const opaqueColor=(raw:string)=>{const m=raw.match(/rgba?\(([^)]+)\)/i);if(!m)return 'rgb(8,20,32)';const p=m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);const a=p.length>=4&&Number.isFinite(p[3])?Math.max(0,Math.min(1,p[3])):1,b=[7,18,30];return 'rgb('+[0,1,2].map(i=>Math.round((p[i]||0)*a+b[i]*(1-a))).join(',')+')'};
const visible=(el:Element)=>{const cs=getComputedStyle(el),r=(el as HTMLElement).getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0&&r.width>0&&r.height>0};
function syntheticChannels():Channel[]{return Array.from({length:35},(_,i)=>{const n=String(i+1).padStart(2,'0');return{id:'perf-channel-'+n,name:'Performance Channel '+n,slug:'performance-channel-'+n,cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,dailyUploadTarget:20,seo:{titlePatterns:['{topic}'],descriptionTemplate:'{title}',tags:['music','performance'],banned:[]},stats:{viewCount:100000+i*1000,videoCount:100+i,subscriberCount:1000+i*10,hiddenSubscriberCount:false,updatedAt:'2026-10-01T00:00:00Z'}}})}
function syntheticJobs(channels:Channel[]):VideoJob[]{const statuses:VideoJob['status'][]=['WAITING_MUSIC','READY_RENDER','READY_UPLOAD','SCHEDULED'];return Array.from({length:1000},(_,i)=>{const c=channels[i%channels.length],n=Math.floor(i/channels.length)+1;return{id:'perf-job-'+String(i+1).padStart(4,'0'),channelId:c.id,number:n,folder:'/tmp/vyron-perf/'+c.id+'/VIDEO_'+String(n).padStart(3,'0'),status:statuses[i%statuses.length],createdAt:'2026-09-30T00:00:00Z',publishAt:'2026-10-15T18:00:00+07:00',tracksCount:10,minTracks:10,title:'Performance Video '+(i+1),description:'Synthetic production performance fixture',tags:['music','test']}})}

function styleElement(){let el=document.getElementById('vyron-yt-css-paint-diag') as HTMLStyleElement|null;if(!el){el=document.createElement('style');el.id='vyron-yt-css-paint-diag';document.head.appendChild(el)}return el}
function cssFor(v:Variant,census?:StyleCensus){
 if(v==='base')return '';
 if(v==='shadows')return TARGET+'{box-shadow:none!important;text-shadow:none!important}';
 if(v==='gradients')return TARGET+'{background-image:none!important}';
 if(v==='transitions')return TARGET+'{transition:none!important;animation:none!important}';
 if(v==='filters')return TARGET+'{filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
 if(v==='opaque')return census?.opaqueRules.join('\n')||'';
 if(v==='pseudo')return census?.pseudoRules.join('\n')||'';
 return ''
}
function setVariant(v:Variant,census?:StyleCensus){styleElement().textContent=cssFor(v,census)}
function classSelector(el:Element){
 const tag=el.tagName.toLowerCase(),classes=[...el.classList].map(c=>'.'+CSS.escape(c)).join('');
 return '.pageWrap '+tag+classes
}
function allRules():CSSStyleRule[]{
 const out:CSSStyleRule[]=[];
 const walk=(rules:CSSRuleList)=>{for(const r of Array.from(rules)){if(r instanceof CSSStyleRule)out.push(r);else if('cssRules'in r){try{walk((r as CSSGroupingRule).cssRules)}catch{}}}};
 for(const s of Array.from(document.styleSheets)){try{walk(s.cssRules)}catch{}}
 return out
}
function responsibleSelectors(el:Element,props:string[],rules:CSSStyleRule[]){
 const out:string[]=[];
 for(const rule of rules){
  const raw=rule.selectorText;if(!raw||raw.includes('::'))continue;
  for(const sel of raw.split(',')){const q=sel.trim();try{if(el.matches(q)&&props.some(p=>rule.style.getPropertyValue(p)))out.push(q)}catch{}}
 }
 return out
}
function pseudoSelectors(el:Element,rules:CSSStyleRule[]){
 const out:string[]=[];
 for(const rule of rules){const raw=rule.selectorText;if(!raw||(!raw.includes('::before')&&!raw.includes('::after')))continue;for(const sel of raw.split(',')){const q=sel.trim(),base=q.replace(/::(before|after).*/,'').trim();if(!base)continue;try{if(el.matches(base))out.push(q)}catch{}}}
 return out
}
function topSelectors(entries:Map<string,number>){return[...entries.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([selector,count])=>({selector,count}))}
function censusEntry(elements:Element[],predicate:(el:Element,cs:CSSStyleDeclaration)=>boolean,props:string[],rules:CSSStyleRule[]):CensusEntry{
 const counts=new Map<string,number>(),hits=elements.filter(el=>{const cs=getComputedStyle(el);if(!predicate(el,cs))return false;for(const s of responsibleSelectors(el,props,rules))counts.set(s,(counts.get(s)||0)+1);return true});
 return{count:hits.length,selectors:topSelectors(counts)}
}
function buildCensus():StyleCensus{
 const roots=ROOTS.flatMap(s=>Array.from(document.querySelectorAll(s))),elements=[...new Set(roots.flatMap(r=>[r,...Array.from(r.querySelectorAll('*'))]))].filter(visible),rules=allRules();
 const focusSelectors=['.panel','.primary','.channelContextBar','.youtubeTabs','.publishStep','.publishToolbar','.youtubeCenterHead','.publishMasterHead','button'];
 const focus:StyleCensus['focus']={};
 for(const q of focusSelectors){const xs=elements.filter(el=>{try{return el.matches(q)}catch{return false}});focus[q]={count:xs.length,boxShadow:xs.filter(e=>getComputedStyle(e).boxShadow!=='none').length,gradient:xs.filter(e=>getComputedStyle(e).backgroundImage.includes('gradient')).length,transition:xs.filter(e=>durationPositive(getComputedStyle(e).transitionDuration)).length,filter:xs.filter(e=>getComputedStyle(e).filter!=='none'||getComputedStyle(e).getPropertyValue('backdrop-filter')!=='none').length,transparentBackground:xs.filter(e=>{const a=alphaFromColor(getComputedStyle(e).backgroundColor);return a>0&&a<1}).length,pseudo:xs.filter(e=>{const b=getComputedStyle(e,'::before'),a=getComputedStyle(e,'::after');return(b.content&&b.content!=='none')||(a.content&&a.content!=='none')}).length}}
 const opaqueRules=[...new Map(elements.filter(e=>{const a=alphaFromColor(getComputedStyle(e).backgroundColor);return a>0&&a<1}).map(e=>[classSelector(e),classSelector(e)+'{background-color:'+opaqueColor(getComputedStyle(e).backgroundColor)+'!important}'])).values()];
 const pseudoRules:string[]=[];const seen=new Set<string>();
 for(const e of elements){for(const which of ['before','after'] as const){const p=getComputedStyle(e,'::'+which);if(!p.content||p.content==='none'||p.display==='none')continue;const sel=classSelector(e)+'::'+which;if(!seen.has(sel)){seen.add(sel);pseudoRules.push(sel+'{content:none!important;display:none!important}')}}}
 const globalInteraction:StyleCensus['globalInteraction']={};
 for(const q of ['.appShell','.bgGlow.a','.bgGlow.b','.pageWrap','.topbar','.sidebar']){const e=document.querySelector(q);if(!e)continue;const c=getComputedStyle(e);globalInteraction[q]={background:c.background,backgroundImage:c.backgroundImage,backgroundColor:c.backgroundColor,boxShadow:c.boxShadow,filter:c.filter,backdropFilter:c.getPropertyValue('backdrop-filter'),animation:c.animation,position:c.position}}
 return{
  totalVisible:elements.length,
  boxShadow:censusEntry(elements,(_,c)=>c.boxShadow!=='none',['box-shadow'],rules),
  textShadow:censusEntry(elements,(_,c)=>c.textShadow!=='none',['text-shadow'],rules),
  gradients:censusEntry(elements,(_,c)=>c.backgroundImage.includes('gradient'),['background','background-image'],rules),
  transparentBackgrounds:censusEntry(elements,(_,c)=>{const a=alphaFromColor(c.backgroundColor);return a>0&&a<1},['background','background-color'],rules),
  filter:censusEntry(elements,(_,c)=>c.filter!=='none',['filter'],rules),
  backdropFilter:censusEntry(elements,(_,c)=>{const x=c.getPropertyValue('backdrop-filter')||c.getPropertyValue('-webkit-backdrop-filter');return Boolean(x&&x!=='none')},['backdrop-filter','-webkit-backdrop-filter'],rules),
  transition:censusEntry(elements,(_,c)=>durationPositive(c.transitionDuration),['transition','transition-duration'],rules),
  animation:censusEntry(elements,(_,c)=>c.animationName!=='none'&&durationPositive(c.animationDuration),['animation','animation-name','animation-duration'],rules),
  transform:censusEntry(elements,(_,c)=>c.transform!=='none',['transform'],rules),
  positionFixed:censusEntry(elements,(_,c)=>c.position==='fixed',['position'],rules),
  positionSticky:censusEntry(elements,(_,c)=>c.position==='sticky',['position'],rules),
  pseudoDecorations:(()=>{const counts=new Map<string,number>();let n=0;for(const e of elements){const b=getComputedStyle(e,'::before'),a=getComputedStyle(e,'::after');if((b.content&&b.content!=='none')||(a.content&&a.content!=='none')){n++;for(const s of pseudoSelectors(e,rules))counts.set(s,(counts.get(s)||0)+1)}}return{count:n,selectors:topSelectors(counts)}})(),
  largeRadiusClipping:censusEntry(elements,(_,c)=>parseFloat(c.borderTopLeftRadius)>=12&&['hidden','clip','auto','scroll'].includes(c.overflow),['border-radius','overflow'],rules),
  focus,globalInteraction,opaqueRules,pseudoRules
 }
}
async function navigatePrefix(){useApp.getState().setPage('dashboard');await frames(3);useApp.getState().setPage('channels');await frames(3);useApp.getState().setPage('production');await frames(3)}
async function measureOne(v:Variant,census:StyleCensus){setVariant(v,census);await navigatePrefix();const start=performance.now();useApp.getState().setPage('youtube');const a=await frame(),b=await frame(),c=await frame();await frame();return{raf1:a-start,raf2:b-a,raf3:c-b}}
async function sample(v:Variant,census:StyleCensus,n=20){const out={raf1:[] as number[],raf2:[] as number[],raf3:[] as number[]};for(let i=0;i<n;i++){const m=await measureOne(v,census);out.raf1.push(m.raf1);out.raf2.push(m.raf2);out.raf3.push(m.raf3)}return{raf1:stats(out.raf1),raf2:stats(out.raf2),raf3:stats(out.raf3),values:out}}
function combinedCss(a:Variant,b:Variant,census:StyleCensus){return cssFor(a,census)+'\n'+cssFor(b,census)}
export function YoutubeCssPaintIsolationController(){
 useEffect(()=>{let cancelled=false,probe=false,original:any;void(async()=>{try{
  if(!(await api.performanceProbeEnabled()))throw new Error('CSS_PAINT_DIAG_REQUIRES_ISOLATED_PROBE');
  await api.performanceProbeAssertIsolated();await enterPerformanceProbeMode();probe=true;
  const before=useApp.getState();original={channels:before.channels,jobs:before.jobs,page:before.page,settings:before.settings};
  const channels=syntheticChannels(),jobs=syntheticJobs(channels);useApp.setState({channels,jobs,page:'dashboard'});useApp.getState().patchSettings({fpsMonitor:false,autoCheckUpdates:false,autopilotEnabled:false});saveActivePublishChannel(channels[0].id);await frames(8);
  setVariant('base');await navigatePrefix();useApp.getState().setPage('youtube');await frames(6);const census=buildCensus();useApp.getState().setPage('dashboard');await frames(4);
  const base=await sample('base',census),shadows=await sample('shadows',census),gradients=await sample('gradients',census),transitions=await sample('transitions',census),filters=await sample('filters',census),opaque=await sample('opaque',census),pseudo=await sample('pseudo',census);
  const reports:Record<Variant,VariantReport>={base,shadows,gradients,transitions,filters,opaque,pseudo};
  const ranked=(Object.keys(reports) as Variant[]).filter(x=>x!=='base').map(v=>({variant:v,delta:base.raf1.p95-reports[v].raf1.p95})).sort((a,b)=>b.delta-a.delta);
  const proven=ranked.filter(x=>x.delta>=3);let combination:any=null;
  if(proven.length>=2){const [a,b]=proven;styleElement().textContent=combinedCss(a.variant,b.variant,census);const out={raf1:[] as number[],raf2:[] as number[],raf3:[] as number[]};for(let i=0;i<20&&!cancelled;i++){await navigatePrefix();const start=performance.now();useApp.getState().setPage('youtube');const x=await frame(),y=await frame(),z=await frame();out.raf1.push(x-start);out.raf2.push(y-x);out.raf3.push(z-y);await frame()}combination={variants:[a.variant,b.variant],raf1:stats(out.raf1),raf2:stats(out.raf2),raf3:stats(out.raf3),values:out}}
  await api.performanceProbeReport({schemaVersion:1,kind:'YOUTUBE_WKWEBVIEW_CSS_PAINT_ISOLATION',releaseCandidateChanged:false,baseHead:'4de188b2cf50d3f58cd7074a6e57ccb67c15e1b2',at:new Date().toISOString(),dataset:{channels:35,jobs:1000,samplesPerVariant:20,routeOrder:['dashboard','channels','production','youtube']},census,variants:reports,ranked,proven,combination,m1ProbeChanged:false,thresholdsChanged:false})
 }catch(error){await api.performanceProbeReport({schemaVersion:1,kind:'YOUTUBE_WKWEBVIEW_CSS_PAINT_ISOLATION',releaseCandidateChanged:false,baseHead:'4de188b2cf50d3f58cd7074a6e57ccb67c15e1b2',error:String(error),at:new Date().toISOString()}).catch(()=>undefined)}
 finally{setVariant('base');if(original)useApp.setState(original);if(probe){await api.performanceProbeCleanup().catch(()=>undefined);exitPerformanceProbeMode()}}})();return()=>{cancelled=true}},[]);
 return null
}
