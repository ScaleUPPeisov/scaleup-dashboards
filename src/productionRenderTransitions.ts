/** Persistent transition ledger. Initial reads seed state without inventing an event. */
export type RenderPhase='NOT_READY'|'RENDERED'|'SAFE_TO_CLEAN';
export type RenderObservation={batchId:string;projectId:string;rootPath:string;jobId?:string|null;startedAt?:string|null;handoffSentAt?:string|null;handoffCount?:number|null;outputFile?:string|null;phase:RenderPhase};
type Entry={phase:RenderPhase;jobId?:string;startedAt?:string;handoffSentAt?:string;handoffCount?:number;outputFile?:string;emittedRendered:boolean;emittedSafe:boolean};
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
const KEY='vyron:production-render-transitions:v1';
const MAX_ENTRIES=20000;
const keyFor=(x:RenderObservation)=>JSON.stringify([x.rootPath,x.batchId,x.projectId]);
const batchKey=(rootPath:string,batchId:string)=>JSON.stringify([rootPath,batchId]);
const text=(s:string|null|undefined)=>s||undefined;
const phaseRank:Record<RenderPhase,number>={NOT_READY:0,RENDERED:1,SAFE_TO_CLEAN:2};
// ENDLUME handoff counts are monotonic for a project within a batch. Two
// independent async observers may finish out of order; do not let an older
// generation reset the persisted completion markers of a newer one.
function staleGeneration(old:Entry,x:RenderObservation){
  if(old.handoffCount!=null&&x.handoffCount!=null&&old.handoffCount!==x.handoffCount)
    return x.handoffCount<old.handoffCount;
  for(const [current,incoming] of [[old.startedAt,x.startedAt],[old.handoffSentAt,x.handoffSentAt]]){
    if(!current||!incoming||current===incoming)continue;
    const a=Date.parse(current),b=Date.parse(incoming);
    if(Number.isFinite(a)&&Number.isFinite(b)&&a!==b)return b<a;
  }
  return false;
}
function generationChanged(old:Entry,x:RenderObservation){
  // Missing metadata is unknown, not a new generation. Compare only facts
  // present on both observations; a changed value starts a fresh baseline.
  return Boolean((old.jobId&&x.jobId&&old.jobId!==x.jobId)
    ||(old.startedAt&&x.startedAt&&old.startedAt!==x.startedAt)
    ||(old.handoffSentAt&&x.handoffSentAt&&old.handoffSentAt!==x.handoffSentAt)
    ||(old.handoffCount!=null&&x.handoffCount!=null&&old.handoffCount!==x.handoffCount)
    ||(old.outputFile&&x.outputFile&&old.outputFile!==x.outputFile));
}
export function createProductionRenderLedger(storage?:StorageLike){
 let entries:Record<string,Entry>={};
 try{const raw=storage?.getItem(KEY);const parsed=raw?JSON.parse(raw):null;if(parsed&&parsed.version===1&&parsed.entries&&typeof parsed.entries==='object'&&!Array.isArray(parsed.entries))entries=parsed.entries}catch{}
 const pendingBatches=new Map<string,number>();
 const pendingChange=(key:string,delta:number)=>{
  try{const parsed=JSON.parse(key);if(!Array.isArray(parsed)||parsed.length!==3)return;
   const batch=batchKey(parsed[0],parsed[1]),count=(pendingBatches.get(batch)||0)+delta;
   if(count>0)pendingBatches.set(batch,count);else pendingBatches.delete(batch)
  }catch{}
 };
 for(const [key,value] of Object.entries(entries))if(value?.phase==='NOT_READY')pendingChange(key,1);
 return {
  hasPendingBatch(rootPath:string,batchId:string){return(pendingBatches.get(batchKey(rootPath,batchId))||0)>0},
  observe(rows:RenderObservation[]){
   const safe:RenderObservation[]=[],rendered:RenderObservation[]=[];
   let changed=false;
   for(const x of rows){
    const key=keyFor(x),old=entries[key];
    if(old&&staleGeneration(old,x))continue;
    // A queued/rendering observation may acquire its job or start time while
    // running. That is still the same pending transition, not a replay.
    const fresh=!old||(old.phase!=='NOT_READY'&&generationChanged(old,x));
    // Already-completed work on a first read is historical. Persist its final
    // state silently, including both completion markers, to avoid replay.
    const entry:Entry=fresh?{phase:x.phase,emittedRendered:x.phase!=='NOT_READY',emittedSafe:x.phase==='SAFE_TO_CLEAN'}:{...old};
    if(!fresh){
     if(old.phase==='NOT_READY'&&x.phase!=='NOT_READY'&&!old.emittedRendered){entry.emittedRendered=true;rendered.push(x)}
     if(old.phase!=='SAFE_TO_CLEAN'&&x.phase==='SAFE_TO_CLEAN'&&!old.emittedSafe){entry.emittedSafe=true;safe.push(x)}
     // Different observers know different amounts: the background scan can
     // confirm RENDERED while the production page has already confirmed
     // SAFE_TO_CLEAN. Do not regress the same generation on a partial poll.
     if(phaseRank[x.phase]>phaseRank[old.phase])entry.phase=x.phase;
    }
    entry.jobId=text(x.jobId)||entry.jobId;
    entry.startedAt=text(x.startedAt)||entry.startedAt;
    entry.handoffSentAt=text(x.handoffSentAt)||entry.handoffSentAt;
    entry.handoffCount=x.handoffCount??entry.handoffCount;
    entry.outputFile=text(x.outputFile)||entry.outputFile;
    if(!old||JSON.stringify(old)!==JSON.stringify(entry)){
     if(old?.phase==='NOT_READY')pendingChange(key,-1);
     if(entry.phase==='NOT_READY')pendingChange(key,1);
     entries[key]=entry;changed=true
    }
   }
   if(!changed)return{rendered:[],safe:[]};
   const keys=Object.keys(entries);if(keys.length>MAX_ENTRIES)for(const key of keys.slice(0,keys.length-MAX_ENTRIES)){if(entries[key]?.phase==='NOT_READY')pendingChange(key,-1);delete entries[key]}
   // Persist before emitting. If persistence fails, suppress the alert rather
   // than replaying it after restart; in-memory state still prevents a storm.
   let persisted=false;
   try{if(storage){storage.setItem(KEY,JSON.stringify({version:1,entries}));persisted=true}}catch{}
   return persisted?{rendered,safe}:{rendered:[],safe:[]};
  }
 };
}
let singleton:ReturnType<typeof createProductionRenderLedger>|undefined;
export function productionRenderLedger(){
 if(!singleton){let storage:StorageLike|undefined;try{storage=localStorage}catch{}singleton=createProductionRenderLedger(storage)}
 return singleton;
}
