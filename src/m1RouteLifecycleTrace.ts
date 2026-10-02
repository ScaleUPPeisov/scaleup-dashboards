type RouteName='dashboard'|'channels'|'production'|'youtube'|'analytics'|'settings'|string;
type PhaseKey='t0'|'t1'|'t2'|'t3'|'t4'|'t5'|'t6'|'t7'|'t8';

type ElementSnapshot={tag:string;className:string};
type ScrollSnapshot={windowX:number;windowY:number;pageWrapTop:number;pageWrapLeft:number};
type TraceRecord={
  id:number;
  route:RouteName;
  t0:number;
  t1?:number;t2?:number;t3?:number;t4?:number;t5?:number;t6?:number;t7?:number;t8?:number;
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
  incompleteReason?:string;
};

const TRACE_ENABLED=typeof window!=='undefined'&&(import.meta as any).env?.VITE_M1_ROUTE_TRACE==='1';
const records:TraceRecord[]=[];
let active:TraceRecord|undefined;
let nextId=1;
let installed=false;
let nativeRaf:typeof window.requestAnimationFrame|undefined;
let mutationObserver:MutationObserver|undefined;
let resizeObserver:ResizeObserver|undefined;
let intersectionObserver:IntersectionObserver|undefined;
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
    }
    active.t6=now();
    active.visibilityAtT6=document.visibilityState;
    active.windowAtT6=[window.innerWidth,window.innerHeight];
    active.scrollAtT6=scrollSnapshot();
    active.activeElementAtT6=activeElementSnapshot();
  }else if(active.t7===undefined)active.t7=now();
  else if(active.t8===undefined){active.t8=now();records.push(active);active=undefined;rafFrameTimestamps=[]}
}
function installPassiveSensors(){
  if(!TRACE_ENABLED||installed)return;
  installed=true;
  try{
    mutationObserver=new MutationObserver(list=>{
      if(!active||active.t6!==undefined)return;
      active.mutationObserverCallbacks++;
      active.mutationRecords+=list.length;
    });
    mutationObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
  }catch{}
  try{
    resizeObserver=new ResizeObserver(()=>{
      if(active&&active.t6===undefined)active.resizeObserverCallbacks++;
    });
  }catch{}
  try{
    intersectionObserver=new IntersectionObserver(()=>{
      if(active&&active.t6===undefined)active.intersectionObserverCallbacks++;
    });
  }catch{}
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

export function traceRouteSetPageRequested(page:string){
  if(!TRACE_ENABLED)return;
  installPassiveSensors();
  if(active){
    if(active.t8===undefined){active.incompleteReason='superseded-by-next-navigation';records.push(active)}
    active=undefined;rafFrameTimestamps=[];
  }
  const route=canonicalRoute(page);
  active={
    id:nextId++,route,t0:now(),
    visibilityStart:document.visibilityState,
    windowStart:[window.innerWidth,window.innerHeight],
    scrollStart:scrollSnapshot(),
    activeElementStart:activeElementSnapshot(),
    mutationObserverCallbacks:0,mutationRecords:0,resizeObserverCallbacks:0,intersectionObserverCallbacks:0,
    rafScheduledT0T6:0,rafCallbacksObservedT0T6:0,getComputedStyleReads:0,getBoundingClientRectReads:0,getClientRectsReads:0
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
  active.t5=now();observeRouteContainers();
}
function pct(rows:number[],p:number){
  if(!rows.length)return null;
  const sorted=[...rows].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];
}
function intervalRows(route:string,a:PhaseKey,b:PhaseKey){
  return records.filter(r=>r.route===route&&!r.incompleteReason&&r[a]!==undefined&&r[b]!==undefined).map(r=>(r[b] as number)-(r[a] as number));
}
function intervalSummary(route:string,a:PhaseKey,b:PhaseKey){
  const rows=intervalRows(route,a,b);
  return{count:rows.length,median:pct(rows,.5),p95:pct(rows,.95)};
}
export function routeLifecycleTraceSnapshot(){
  if(active&&active.t8!==undefined){records.push(active);active=undefined}
  const routes=['youtube','dashboard','channels','production','settings','analytics'];
  const summaries:Record<string,unknown>={};
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
  }
  return{enabled:TRACE_ENABLED,records:[...records],summaries};
}
installPassiveSensors();
