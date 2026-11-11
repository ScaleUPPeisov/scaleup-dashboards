import {publisherIntegrityError,validateImmutableUploadSpec} from './publisherIntegrity';

export type UploadQueueState='PAUSED'|'QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED';
export type UploadQueueQuotaOperation={method:'videos.insert'|'videos.list'|'thumbnails.set';count:number;label?:string};

export type ImmutableUploadJob=Readonly<{
  jobId:string;
  batchId?:string;
  projectId?:string;
  localVideoIdentity:string;
  videoNumber:number;
  channelId:string;
  channelName:string;
  profileId:string;
  youtubeChannelId?:string;
  filePath:string;
  fingerprint:string;
  fileSize:number;
  modifiedAt:number;
  publishAt:string;
  title:string;
  description:string;
  tags:readonly string[];
  categoryId:string;
  thumbnailPath?:string;
  metadataSource?:string;
  quotaProjectKey?:string;
  quotaOperations:readonly UploadQueueQuotaOperation[];
  allowDuplicate:boolean;
  submittedAt:string;
}>;

export type UploadQueueEntry=Readonly<{
  queueId:string;
  spec:ImmutableUploadJob;
  state:UploadQueueState;
  submittedSequence:number;
  startedAt?:string;
  finishedAt?:string;
  error?:string;
}>;

export type UploadQueueSnapshot={
  concurrency:number;
  perChannelConcurrency:number;
  paused:UploadQueueEntry[];
  queued:UploadQueueEntry[];
  running:UploadQueueEntry[];
  recent:UploadQueueEntry[];
};

export type UploadQueuePersistence={load:()=>unknown;save:(value:unknown)=>void};
export type UploadQueueOptions={persistence?:UploadQueuePersistence;pauseOnError?:(error:unknown,spec:ImmutableUploadJob)=>boolean};

type Executor=(spec:ImmutableUploadJob)=>Promise<void>;
type Listener=(snapshot:UploadQueueSnapshot)=>void;

function assertSpecIntegrity(spec:ImmutableUploadJob){const result=validateImmutableUploadSpec(spec,true);if(!result.valid)throw publisherIntegrityError(spec.videoNumber,result.issues)}
function cloneSpec(input:ImmutableUploadJob):ImmutableUploadJob{
  return Object.freeze({...input,tags:Object.freeze([...input.tags]),quotaOperations:Object.freeze(input.quotaOperations.map(x=>Object.freeze({...x})))}) as ImmutableUploadJob;
}
function identityKeys(spec:ImmutableUploadJob){return [spec.projectId?`project:${spec.projectId}`:'',spec.fingerprint?`fingerprint:${spec.channelId}:${spec.fingerprint.toLowerCase()}`:''].filter(Boolean)}
function nowIso(){return new Date().toISOString()}
function restoredEntry(value:unknown):UploadQueueEntry|undefined{
  if(!value||typeof value!=='object')return;
  const row=value as Partial<UploadQueueEntry>,spec=row.spec as ImmutableUploadJob|undefined;
  if(!spec||typeof row.queueId!=='string'||!Number.isFinite(row.submittedSequence))return;
  try{assertSpecIntegrity(spec)}catch{return}
  // A process death invalidates in-memory ownership. Restore fail-closed so an
  // owner must verify the channel/source/quota before another videos.insert.
  return Object.freeze({queueId:row.queueId,spec:cloneSpec(spec),state:'PAUSED',submittedSequence:Number(row.submittedSequence),startedAt:row.startedAt,error:'RECOVERED_AFTER_RESTART: verify channel, source and quota, then resume explicitly'});
}

export class MultiChannelUploadQueue{
  private entries:UploadQueueEntry[]=[];
  private listeners=new Set<Listener>();
  private sequence=0;
  private pumping=false;
  constructor(private executor:Executor,private concurrency=2,private perChannelConcurrency=1,private options:UploadQueueOptions={}){this.concurrency=Math.max(1,Math.floor(concurrency||1));this.perChannelConcurrency=Math.max(1,Math.floor(perChannelConcurrency||1));this.restore()}

  setConcurrency(value:number){this.concurrency=Math.max(1,Math.floor(value||1));this.emit();void this.pump()}
  setPerChannelConcurrency(value:number){this.perChannelConcurrency=Math.max(1,Math.floor(value||1));this.emit();void this.pump()}
  getConcurrency(){return this.concurrency}
  getPerChannelConcurrency(){return this.perChannelConcurrency}
  subscribe(cb:Listener){this.listeners.add(cb);cb(this.snapshot());return()=>this.listeners.delete(cb)}
  snapshot():UploadQueueSnapshot{
    const paused=this.entries.filter(x=>x.state==='PAUSED').sort((a,b)=>a.submittedSequence-b.submittedSequence);
    const queued=this.entries.filter(x=>x.state==='QUEUED').sort((a,b)=>a.submittedSequence-b.submittedSequence);
    const running=this.entries.filter(x=>x.state==='RUNNING').sort((a,b)=>a.submittedSequence-b.submittedSequence);
    const recent=this.entries.filter(x=>x.state==='SUCCEEDED'||x.state==='FAILED').slice(-20).reverse();
    return{concurrency:this.concurrency,perChannelConcurrency:this.perChannelConcurrency,paused,queued,running,recent};
  }
  getRuntimeFacts(){return this.entries.filter(x=>x.state==='PAUSED'||x.state==='QUEUED'||x.state==='RUNNING').map(x=>({jobId:x.spec.jobId,channelId:x.spec.channelId,status:x.state==='RUNNING'?'UPLOADING' as const:'QUEUED' as const}))}
  hasDuplicate(spec:ImmutableUploadJob){
    const keys=new Set(identityKeys(spec));
    return this.entries.some(x=>(x.state==='PAUSED'||x.state==='QUEUED'||x.state==='RUNNING')&&identityKeys(x.spec).some(k=>keys.has(k)));
  }
  enqueue(input:ImmutableUploadJob){
    assertSpecIntegrity(input);
    const spec=cloneSpec(input);
    if(this.hasDuplicate(spec))throw new Error('UPLOAD_QUEUE_DUPLICATE: project/fingerprint already queued or running');
    const entry:UploadQueueEntry=Object.freeze({queueId:`uploadq:${++this.sequence}:${spec.jobId}`,spec,state:'QUEUED',submittedSequence:this.sequence});
    const previous=this.entries;this.entries=[...this.entries,entry];
    if(!this.persist()){this.entries=previous;throw new Error('UPLOAD_QUEUE_PERSIST_FAILED: durable queue state was not written')}
    this.emit();void this.pump();return entry;
  }
  removeQueued(jobId:string){
    const hit=this.entries.find(x=>x.spec.jobId===jobId&&(x.state==='QUEUED'||x.state==='PAUSED'));if(!hit)return false;
    const previous=this.entries;this.entries=this.entries.filter(x=>x!==hit);if(!this.persist()){this.entries=previous;return false}this.emit();return true;
  }
  resumePaused(jobId:string){
    const hit=this.entries.find(x=>x.spec.jobId===jobId&&x.state==='PAUSED');if(!hit)return false;
    const previous=this.entries;this.entries=this.entries.map(x=>x.queueId===hit.queueId?Object.freeze({...x,state:'QUEUED' as const,startedAt:undefined,finishedAt:undefined,error:undefined}):x);
    if(!this.persist()){this.entries=previous;return false}this.emit();void this.pump();return true
  }
  waitForEntries(queueIds:string[]){
    const wanted=new Set(queueIds.filter(Boolean));
    const collect=()=>this.entries.filter(x=>wanted.has(x.queueId));
    // PAUSED is terminal for the submitting UI promise: the durable queue owns
    // the job until an explicit later resume and must not leave the batch UI hung.
    const complete=(rows:UploadQueueEntry[])=>wanted.size>0&&rows.length===wanted.size&&rows.every(x=>x.state==='PAUSED'||x.state==='SUCCEEDED'||x.state==='FAILED');
    const initial=collect();if(complete(initial))return Promise.resolve(initial);
    return new Promise<UploadQueueEntry[]>(resolve=>{
      const listener=()=>{const rows=collect();if(!complete(rows))return;this.listeners.delete(listener);resolve(rows)};
      this.listeners.add(listener);listener();
    });
  }
  private emit(){const snap=this.snapshot();for(const cb of this.listeners)cb(snap)}
  private replace(queueId:string,patch:Partial<UploadQueueEntry>){this.entries=this.entries.map(x=>x.queueId===queueId?Object.freeze({...x,...patch}):x);this.persist();this.emit()}
  private restore(){
    let raw:unknown;try{raw=this.options.persistence?.load()}catch{return}
    if(!raw||typeof raw!=='object')return;
    const value=raw as {version?:unknown;entries?:unknown};if(value.version!==1||!Array.isArray(value.entries))return;
    const entries=value.entries.map(restoredEntry).filter((x):x is UploadQueueEntry=>Boolean(x)),identities=new Set<string>();
    this.entries=entries.filter(row=>{const keys=identityKeys(row.spec);if(keys.some(k=>identities.has(k)))return false;keys.forEach(k=>identities.add(k));return true});
    this.sequence=this.entries.reduce((max,row)=>Math.max(max,row.submittedSequence),0);this.persist();
  }
  private persist(){if(!this.options.persistence)return true;const entries=this.entries.filter(x=>x.state==='PAUSED'||x.state==='QUEUED'||x.state==='RUNNING');try{this.options.persistence.save({version:1,savedAt:nowIso(),entries});return true}catch{return false}}
  private nextStartable(){
    const running=this.entries.filter(x=>x.state==='RUNNING'),counts=new Map<string,number>();
    for(const row of running)counts.set(row.spec.channelId,(counts.get(row.spec.channelId)||0)+1);
    return this.entries.filter(x=>x.state==='QUEUED').sort((a,b)=>a.submittedSequence-b.submittedSequence).find(x=>(counts.get(x.spec.channelId)||0)<this.perChannelConcurrency);
  }
  private async pump(){
    if(this.pumping)return;this.pumping=true;
    try{
      while(this.entries.filter(x=>x.state==='RUNNING').length<this.concurrency){
        const next=this.nextStartable();if(!next)break;
        try{assertSpecIntegrity(next.spec)}catch(error){this.replace(next.queueId,{state:'FAILED',finishedAt:nowIso(),error:String(error)});continue}
        this.replace(next.queueId,{state:'RUNNING',startedAt:nowIso()});
        void this.executor(next.spec).then(()=>this.replace(next.queueId,{state:'SUCCEEDED',finishedAt:nowIso()})).catch(error=>{if(this.options.pauseOnError?.(error,next.spec))this.replace(next.queueId,{state:'PAUSED',startedAt:undefined,finishedAt:undefined,error:String(error)});else this.replace(next.queueId,{state:'FAILED',finishedAt:nowIso(),error:String(error)})}).finally(()=>void this.pump());
      }
    }finally{this.pumping=false}
  }
}
