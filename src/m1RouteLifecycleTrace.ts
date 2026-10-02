type RouteName='dashboard'|'channels'|'production'|'youtube'|'analytics'|'settings'|string;
type PhaseKey='t0'|'t1'|'t2'|'t3'|'t4'|'t5'|'t6'|'t7'|'t8';

type ElementSnapshot={tag:string;className:string};
type ScrollSnapshot={windowX:number;windowY:number;pageWrapTop:number;pageWrapLeft:number};
type MutationTargetStat={tag:string;className:string;attributeName:string;count:number};
type TraceRecord={
  id:number;
  route:RouteName;
  t0:number;
  t1?:number;t2?:number;t3?:number;t4?:number;t5?:number;t6?:number;t7?:number;t8?:number;
  microtaskAt?:number;
  messageChannelAt?:number;
  timeout0At?:number;
  nativeRaf1?:number;
  nativeRaf2?:number;
  nativeRaf3?:number;
  nativeRafCaptured?:boolean;
  visibilityStart:string;
  visibilityAtT6?:string;
  windowStart:[number,number];
  windowAtT6?:[number,number];
  scrollStart:ScrollSnapshot;
  scrollAtT6?:ScrollSnapshot;
  activeElementStart:ElementSnapshot;
  activeElementAtT6?:ElementSnapshot;
  mutationObserverCallbacks:number;
  mutationRecords:number;
  resizeObserverCallbacks:number;
  intersectionObserverCallbacks:number;
  rafScheduledT0T6:number;
  rafCallbacksObservedT0T6:number;
  getComputedStyleReads:number;
  getBoundingClientRectReads:number;
  getClientRectsReads:number;
  postCommitMutations:{childList:number;attributes:number;characterData:number};
  postCommitMutationTargets:Record<string,MutationTargetStat>;
  resizeCallbackMsFromT5:number[];
  intersectionCallbackMsFromT5:number[];
  incompleteReason?:string;
};

const TRACE_ENABLED=typeof window!=='undefined'&&(import.meta as any).env?.VITE_M1_ROUTE_TRACE==='1';
const records:TraceRecord[]=[];
const longTasks:Array<{startTime:number;duration:number}>=[];
let longTaskSupport:'SUPPORTED'|'UNSUPPORTED'='UNSUPPORTED';
let active:TraceRecord|undefined;
let postCommitActive:TraceRecord|undefined;
let nextId=1;
let installed=false;
let nativeRaf:typeof window.requestAnimationFrame|undefined;
let mutationObserver:MutationObserver|undefined;
let resizeObserver:ResizeObserver|undefined;
let intersectionObserver:IntersectionObserver|undefined;
let longTaskObserver:PerformanceObserver|undefined;
const observedResize=new WeakSet<Element>();
const observedIntersection=new WeakSet<Element>();
let rafFrameTimestamps:number[]=[];

function now(){return performance.now()}
function canonicalRoute(page:string):RouteName{
  if(page==='autopilot')return'dashboard';
  if(page==='metadata'||page==='existing'||page==='publisher')return'youtube';
  if(page==='content')return'production';
  if(page==='accounts')return'settings';
  return page;
}
function activeElementSnapshot():ElementSnapshot{
  const el=document.activeElement as HTMLElement|null;
  return{tag:el?.tagName||'',className:typeof el?.className==='string'?el.className:''};
}
function scrollSnapshot():ScrollSnapshot{
  const p=document.querySelector<HTMLElement>('.pageWrap');
  return{windowX:window.scrollX,windowY:window.scrollY,pageWrapTop:p?.scrollTop||0,pageWrapLeft:p?.scrollLeft||0};
}
function observeRouteContainers(){
  if(!TRACE_ENABLED)return;
  const nodes=[document.documentElement,document.querySelector('.pageWrap'),document.querySelector('.youtubeCenterHead'),document.querySelector('.youtubeChannelContext')].filter(Boolean) as Element[];
  for(const node of nodes){
    if(resizeObserver&&!observedResize.has(node)){observedResize.add(node);resizeObserver.observe(node)}
    if(intersectionObserver&&!observedIntersection.has(node)){observedIntersection.add(node);intersectionObserver.observe(node)}
  }
}
function mutationSignature(record:MutationRecord):MutationTargetStat{
  const target=record.target;
  if(target instanceof Element){
    const tag=target.tagName.toLowerCase();
    const className=(target.getAttribute('class')||'').trim().replace(/\s+/g,' ').slice(0,160);
    return{tag,className,attributeName:record.attributeName||'',count:0};
  }
  return{tag:String(target.nodeName||'node').toLowerCase(),className:'',attributeName:record.attributeName||'',count:0};
}
function attributePostCommitMutations(record:TraceRecord,list:MutationRecord[]){
  if(record.t5===undefined||record.nativeRaf1!==undefined)return;
  for(const item of list){
    if(item.type==='childList')record.postCommitMutations.childList++;
    else if(item.type==='attributes')record.postCommitMutations.attributes++;
    else if(item.type==='characterData')record.postCommitMutations.characterData++;
    const sig=mutationSignature(item);
    const key=sig.tag+'|'+sig.className+'|'+sig.attributeName;
    const existing=record.postCommitMutationTargets[key];
    if(existing)existing.count++;
    else record.postCommitMutationTargets[key]={...sig,count:1};
  }
}
function recordRafFrame(ts:number){
  if(!active||active.t5===undefined||active.t8!==undefined)return;
  if(active.t6===undefined)active.rafCallbacksObservedT0T6++;
  const last=rafFrameTimestamps[rafFrameTimestamps.length-1];
  if(last!==undefined&&Math.abs(last-ts)<0.01)return;
  rafFrameTimestamps.push(ts);
  if(active.t6===undefined){
    if(mutationObserver){
      const pending=mutationObserver.takeRecords();
      active.mutationRecords+=pending.length;
      if(postCommitActive===active)attributePostCommitMutations(active,pending);
    }
    active.t6=now();
    active.visibilityAtT6=document.visibilityState;
    active.windowAtT6=[window.innerWidth,window.innerHeight];
    active.scrollAtT6=scrollSnapshot();
    active.activeElementAtT6=activeElementSnapshot();
  }else if(active.t7===undefined)active.t7=now();
  else if(active.t8===undefined){active.t8=now();records.push(active);active=undefined;rafFrameTimestamps=[]}
}
function appendLongTasks(entries:PerformanceEntry[]){
  for(const entry of entries)longTasks.push({startTime:entry.startTime,duration:entry.duration});
}
function installPassiveSensors(){
  if(!TRACE_ENABLED||installed)return;
  installed=true;
  try{
    mutationObserver=new MutationObserver(list=>{
      if(active&&active.t6===undefined){
        active.mutationObserverCallbacks++;
        active.mutationRecords+=list.length;
      }
      if(postCommitActive)attributePostCommitMutations(postCommitActive,list);
    });
    mutationObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
  }catch{}
  try{
    resizeObserver=new ResizeObserver(()=>{
      const at=now();
      if(active&&active.t6===undefined)active.resizeObserverCallbacks++;
      const record=postCommitActive;
      if(record?.t5!==undefined&&record.nativeRaf3===undefined)record.resizeCallbackMsFromT5.push(at-record.t5);
    });
  }catch{}
  try{
    intersectionObserver=new IntersectionObserver(()=>{
      const at=now();
      if(active&&active.t6===undefined)active.intersectionObserverCallbacks++;
      const record=postCommitActive;
      if(record?.t5!==undefined&&record.nativeRaf3===undefined)record.intersectionCallbackMsFromT5.push(at-record.t5);
    });
  }catch{}
  try{
    const supported=Array.isArray((PerformanceObserver as any).supportedEntryTypes)&&(PerformanceObserver as any).supportedEntryTypes.includes('longtask');
    if(supported){
      longTaskObserver=new PerformanceObserver(list=>appendLongTasks(list.getEntries()));
      longTaskObserver.observe({entryTypes:['longtask']});
      longTaskSupport='SUPPORTED';
    }
  }catch{longTaskSupport='UNSUPPORTED'}
  observeRouteContainers();
  try{
    nativeRaf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=((cb:FrameRequestCallback)=>{
      if(active&&active.t6===undefined)active.rafScheduledT0T6++;
      return nativeRaf!((ts:number)=>{recordRafFrame(ts);cb(ts)});
    }) as typeof window.requestAnimationFrame;
  }catch{}
  try{
    const native=window.getComputedStyle.bind(window);
    (window as any).getComputedStyle=(...args:any[])=>{
      if(active&&active.t6===undefined)active.getComputedStyleReads++;
      return (native as any)(...args);
    };
  }catch{}
  try{
    const native=Element.prototype.getBoundingClientRect;
    (Element.prototype as any).getBoundingClientRect=function(...args:any[]){
      if(active&&active.t6===undefined)active.getBoundingClientRectReads++;
      return (native as any).apply(this,args);
    };
  }catch{}
  try{
    const native=Element.prototype.getClientRects;
    (Element.prototype as any).getClientRects=function(...args:any[]){
      if(active&&active.t6===undefined)active.getClientRectsReads++;
      return (native as any).apply(this,args);
    };
  }catch{}
}
function schedulePostCommitProbes(record:TraceRecord){
  if(record.t5===undefined)return;
  postCommitActive=record;
  if(mutationObserver)mutationObserver.takeRecords();
  record.nativeRafCaptured=Boolean(nativeRaf);

  queueMicrotask(()=>{record.microtaskAt=now()});

  try{
    const channel=new MessageChannel();
    channel.port1.onmessage=()=>{
      record.messageChannelAt=now();
      channel.port1.close();
      channel.port2.close();
    };
    channel.port2.postMessage(0);
  }catch{}

  window.setTimeout(()=>{record.timeout0At=now()},0);

  const raf=nativeRaf;
  if(!raf)return;
  raf(()=>{
    if(mutationObserver){
      const pending=mutationObserver.takeRecords();
      if(active===record&&record.t6===undefined)record.mutationRecords+=pending.length;
      attributePostCommitMutations(record,pending);
    }
    record.nativeRaf1=now();
    raf(()=>{
      record.nativeRaf2=now();
      raf(()=>{
        record.nativeRaf3=now();
        if(postCommitActive===record)postCommitActive=undefined;
      });
    });
  });
}

export function traceRouteSetPageRequested(page:string){
  if(!TRACE_ENABLED)return;
  installPassiveSensors();
  if(active){
    if(active.t8===undefined){active.incompleteReason='superseded-by-next-navigation';records.push(active)}
    active=undefined;rafFrameTimestamps=[];
  }
  if(postCommitActive&&postCommitActive.nativeRaf3===undefined){
    postCommitActive.incompleteReason=postCommitActive.incompleteReason||'native-raf-chain-superseded';
    postCommitActive=undefined;
  }
  const route=canonicalRoute(page);
  active={
    id:nextId++,route,t0:now(),
    visibilityStart:document.visibilityState,
    windowStart:[window.innerWidth,window.innerHeight],
    scrollStart:scrollSnapshot(),
    activeElementStart:activeElementSnapshot(),
    mutationObserverCallbacks:0,mutationRecords:0,resizeObserverCallbacks:0,intersectionObserverCallbacks:0,
    rafScheduledT0T6:0,rafCallbacksObservedT0T6:0,getComputedStyleReads:0,getBoundingClientRectReads:0,getClientRectsReads:0,
    postCommitMutations:{childList:0,attributes:0,characterData:0},
    postCommitMutationTargets:{},
    resizeCallbackMsFromT5:[],
    intersectionCallbackMsFromT5:[]
  };
  observeRouteContainers();
}
export function traceRouteStoreUpdated(page:string){
  if(!TRACE_ENABLED||!active||active.route!==canonicalRoute(page)||active.t1!==undefined)return;
  active.t1=now();
}
export function traceRouteRouterRender(page:string){
  if(!TRACE_ENABLED||!active||active.route!==canonicalRoute(page)||active.t2!==undefined)return;
  active.t2=now();observeRouteContainers();
}
export function traceYoutubeFunctionEntered(){
  if(!TRACE_ENABLED||!active||active.route!=='youtube'||active.t3!==undefined)return;
  active.t3=now();observeRouteContainers();
}
export function traceRouteCommitPhase(page:string){
  if(!TRACE_ENABLED||!active||active.route!==canonicalRoute(page)||active.t4!==undefined)return;
  active.t4=now();observeRouteContainers();
}
export function traceRouteLayoutEffect(page:string,source:'router'|'youtube-root'){
  if(!TRACE_ENABLED||!active||active.route!==canonicalRoute(page)||active.t5!==undefined)return;
  if(active.route==='youtube'&&source!=='youtube-root')return;
  active.t5=now();observeRouteContainers();schedulePostCommitProbes(active);
}
function pct(rows:number[],p:number){
  if(!rows.length)return null;
  const sorted=[...rows].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];
}
function summarize(rows:number[]){
  return{count:rows.length,median:pct(rows,.5),p95:pct(rows,.95)};
}
function intervalRows(route:string,a:PhaseKey,b:PhaseKey){
  return records.filter(r=>r.route===route&&!r.incompleteReason&&r[a]!==undefined&&r[b]!==undefined).map(r=>(r[b] as number)-(r[a] as number));
}
function intervalSummary(route:string,a:PhaseKey,b:PhaseKey){return summarize(intervalRows(route,a,b))}
function postRows(route:string,kind:'microtask'|'message'|'timeout'|'raf1'|'raf12'|'raf23'){
  return records.filter(r=>r.route===route&&!r.incompleteReason&&r.t5!==undefined).flatMap(r=>{
    if(kind==='microtask'&&r.microtaskAt!==undefined)return[r.microtaskAt-r.t5!];
    if(kind==='message'&&r.messageChannelAt!==undefined)return[r.messageChannelAt-r.t5!];
    if(kind==='timeout'&&r.timeout0At!==undefined)return[r.timeout0At-r.t5!];
    if(kind==='raf1'&&r.nativeRaf1!==undefined)return[r.nativeRaf1-r.t5!];
    if(kind==='raf12'&&r.nativeRaf1!==undefined&&r.nativeRaf2!==undefined)return[r.nativeRaf2-r.nativeRaf1];
    if(kind==='raf23'&&r.nativeRaf2!==undefined&&r.nativeRaf3!==undefined)return[r.nativeRaf3-r.nativeRaf2];
    return[];
  });
}
function postSummary(route:string,kind:'microtask'|'message'|'timeout'|'raf1'|'raf12'|'raf23'){return summarize(postRows(route,kind))}
function observerTiming(route:string,key:'resizeCallbackMsFromT5'|'intersectionCallbackMsFromT5'){
  const values:number[]=[];
  const buckets={beforeRAF1:0,raf1ToRaf2:0,raf2ToRaf3:0,afterRAF3:0};
  for(const r of records){
    if(r.route!==route||r.incompleteReason||r.t5===undefined)continue;
    const r1=r.nativeRaf1!==undefined?r.nativeRaf1-r.t5:Infinity;
    const r2=r.nativeRaf2!==undefined?r.nativeRaf2-r.t5:Infinity;
    const r3=r.nativeRaf3!==undefined?r.nativeRaf3-r.t5:Infinity;
    for(const value of r[key]){
      values.push(value);
      if(value<=r1)buckets.beforeRAF1++;
      else if(value<=r2)buckets.raf1ToRaf2++;
      else if(value<=r3)buckets.raf2ToRaf3++;
      else buckets.afterRAF3++;
    }
  }
  return{...summarize(values),buckets};
}
function mutationAggregate(route:string){
  const counts={childList:0,attributes:0,characterData:0};
  const targets=new Map<string,MutationTargetStat>();
  for(const r of records){
    if(r.route!==route||r.incompleteReason)continue;
    counts.childList+=r.postCommitMutations.childList;
    counts.attributes+=r.postCommitMutations.attributes;
    counts.characterData+=r.postCommitMutations.characterData;
    for(const [key,value] of Object.entries(r.postCommitMutationTargets)){
      const current=targets.get(key);
      if(current)current.count+=value.count;
      else targets.set(key,{...value});
    }
  }
  const topTargets=[...targets.values()].sort((a,b)=>b.count-a.count).slice(0,10);
  return{...counts,topTargets};
}
function flushLongTasks(){
  try{if(longTaskObserver)appendLongTasks(longTaskObserver.takeRecords())}catch{}
}
function longTaskEvidence(route:string){
  flushLongTasks();
  let overlappingCount=0,maxDuration=0,t4ToRaf1=0,raf1ToRaf3=0;
  for(const r of records){
    if(r.route!==route||r.incompleteReason||r.t4===undefined||r.nativeRaf1===undefined||r.nativeRaf3===undefined)continue;
    for(const task of longTasks){
      const start=task.startTime,end=task.startTime+task.duration;
      const overlapA=start<r.nativeRaf1&&end>r.t4;
      const overlapB=start<r.nativeRaf3&&end>r.nativeRaf1;
      if(overlapA||overlapB){overlappingCount++;maxDuration=Math.max(maxDuration,task.duration)}
      if(overlapA)t4ToRaf1++;
      if(overlapB)raf1ToRaf3++;
    }
  }
  return{support:longTaskSupport,overlappingCount,maxDuration,t4ToRaf1,raf1ToRaf3};
}
export function routeLifecycleTraceSnapshot(){
  if(active&&active.t8!==undefined){records.push(active);active=undefined}
  const routes=['youtube','dashboard','channels','production','settings','analytics'];
  const summaries:Record<string,unknown>={};
  const postCommit:Record<string,unknown>={};
  for(const route of routes){
    summaries[route]={
      t0_t1:intervalSummary(route,'t0','t1'),
      t1_t2:intervalSummary(route,'t1','t2'),
      t2_t3:intervalSummary(route,'t2','t3'),
      t3_t4:intervalSummary(route,'t3','t4'),
      t4_t5:intervalSummary(route,'t4','t5'),
      t5_t6:intervalSummary(route,'t5','t6'),
      t6_t7:intervalSummary(route,'t6','t7'),
      t7_t8:intervalSummary(route,'t7','t8'),
      t0_t4:intervalSummary(route,'t0','t4'),
      t4_t6:intervalSummary(route,'t4','t6'),
      t6_t8:intervalSummary(route,'t6','t8'),
      t0_t6:intervalSummary(route,'t0','t6')
    };
    postCommit[route]={
      t5_microtask:postSummary(route,'microtask'),
      t5_messageChannel:postSummary(route,'message'),
      t5_timeout0:postSummary(route,'timeout'),
      t5_nativeRaf1:postSummary(route,'raf1'),
      nativeRaf1_nativeRaf2:postSummary(route,'raf12'),
      nativeRaf2_nativeRaf3:postSummary(route,'raf23'),
      resizeObserver:observerTiming(route,'resizeCallbackMsFromT5'),
      intersectionObserver:observerTiming(route,'intersectionCallbackMsFromT5')
    };
  }
  return{
    enabled:TRACE_ENABLED,
    nativeRafCaptured:Boolean(nativeRaf),
    records:[...records],
    summaries,
    postCommit,
    longTask:longTaskEvidence('youtube'),
    youtubeMutationsT5ToNativeRaf1:mutationAggregate('youtube')
  };
}
installPassiveSensors();
