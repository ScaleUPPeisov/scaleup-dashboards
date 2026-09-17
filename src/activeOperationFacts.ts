import {factualActiveUploadCount,factualActiveUploadIds} from './uploadTelemetry';
export type FactualActiveOperationCounts={uploads:number;renders:number};
const RENDER_FACT_TTL_MS=20_000;
let renderObservedAtMs:number|undefined;
let renderJobIds=new Set<string>();
export function replaceFactualActiveRenders(jobIds:Iterable<string>,observedAtMs=Date.now()){renderJobIds=new Set([...jobIds].filter(Boolean));renderObservedAtMs=Number.isFinite(observedAtMs)?observedAtMs:Date.now()}
export function renderFactsKnown(){return renderObservedAtMs!=null}
export function factualActiveRenderIds(nowMs=Date.now()){if(renderObservedAtMs==null||!Number.isFinite(nowMs)||nowMs-renderObservedAtMs>RENDER_FACT_TTL_MS)return new Set<string>();return new Set(renderJobIds)}
export function factualActiveRenderCount(nowMs=Date.now()){return factualActiveRenderIds(nowMs).size}
export function factualActiveOperationCounts(nowMs=Date.now()):FactualActiveOperationCounts{return{uploads:factualActiveUploadCount(),renders:factualActiveRenderCount(nowMs)}}
export function currentFactualActiveUploadIds(){return factualActiveUploadIds()}
export function resetActiveOperationFactsForTests(){renderObservedAtMs=undefined;renderJobIds=new Set()}
