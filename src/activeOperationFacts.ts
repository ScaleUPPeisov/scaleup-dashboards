import {factualActiveUploadCount,factualActiveUploadIds} from './uploadTelemetry';
export type FactualActiveOperationCounts={uploads:number;renders:number};
const RENDER_FACT_TTL_MS=20_000;
let renderObservedAtMs:number|undefined;
let renderMonitoringExpected=false;
let renderJobIds=new Set<string>();
const renderFactListeners=new Set<()=>void>();
let expiryTimer:ReturnType<typeof setTimeout>|undefined;
function clearExpiryTimer(){if(expiryTimer!==undefined){clearTimeout(expiryTimer);expiryTimer=undefined}}
function scheduleExpiry(){
 clearExpiryTimer();
 if(!renderFactListeners.size||!renderMonitoringExpected||renderObservedAtMs==null)return;
 const remaining=renderObservedAtMs+RENDER_FACT_TTL_MS+1-Date.now();
 if(remaining>0)expiryTimer=setTimeout(()=>{expiryTimer=undefined;for(const fn of renderFactListeners)fn()},remaining);
}
function notifyRenderFacts(){for(const fn of renderFactListeners)fn();scheduleExpiry()}
/** Subscribe only while an update confirmation is visible. */
export function subscribeRenderFacts(listener:()=>void){
 renderFactListeners.add(listener);scheduleExpiry();
 return()=>{renderFactListeners.delete(listener);scheduleExpiry()}
}
export function replaceFactualActiveRenders(jobIds:Iterable<string>,observedAtMs=Date.now()){renderJobIds=new Set([...jobIds].filter(Boolean));renderObservedAtMs=Number.isFinite(observedAtMs)?observedAtMs:Date.now();notifyRenderFacts()}
export function renderFactsKnown(){return renderObservedAtMs!=null}
export function invalidateRenderFacts(){
 if(renderObservedAtMs===undefined)return;
 renderObservedAtMs=undefined;
 notifyRenderFacts();
}
/** Unknown/stale render state must not be interpreted as an idle renderer. */
export function setRenderMonitoringExpected(expected:boolean){
 if(renderMonitoringExpected===expected)return;
 renderMonitoringExpected=expected;
 renderObservedAtMs=undefined;
 renderJobIds=new Set();
 notifyRenderFacts();
}
export function renderFactsFresh(nowMs=Date.now()){
 return !renderMonitoringExpected||(renderObservedAtMs!=null&&Number.isFinite(nowMs)&&nowMs-renderObservedAtMs<=RENDER_FACT_TTL_MS)
}
export function factualActiveRenderIds(nowMs=Date.now()){if(renderObservedAtMs==null||!Number.isFinite(nowMs)||nowMs-renderObservedAtMs>RENDER_FACT_TTL_MS)return new Set<string>();return new Set(renderJobIds)}
export function factualActiveRenderCount(nowMs=Date.now()){return factualActiveRenderIds(nowMs).size}
export function factualActiveOperationCounts(nowMs=Date.now()):FactualActiveOperationCounts{return{uploads:factualActiveUploadCount(),renders:factualActiveRenderCount(nowMs)}}
export function currentFactualActiveUploadIds(){return factualActiveUploadIds()}
export function resetActiveOperationFactsForTests(){renderObservedAtMs=undefined;renderJobIds=new Set();renderMonitoringExpected=false;notifyRenderFacts()}
