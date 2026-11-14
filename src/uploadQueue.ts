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
export type UploadQueueDuplicateKind='job_identity'|'project_video_identity'|'channel_fingerprint';
export type UploadQueueDuplicateMatch={kind:UploadQueueDuplicateKind;entry:UploadQueueEntry};
type UploadQueueIdentityKey={kind:UploadQueueDuplicateKind;value:string};
function identityKeys(spec:ImmutableUploadJob):UploadQueueIdentityKey[]{
  return[
    {kind:'job_identity',value:`job:${spec.jobId}`},
    {kind:'project_video_identity',value:`project-video:${JSON.stringify([spec.projectId||null,spec.localVideoIdentity])}`},
    {kind:'channel_fingerprint',value:`channel-fingerprint:${JSON.stringify([spec.channelId,spec.fingerprint.trim().toLowerCase()])}`}
  ];
}
function duplicateIdentity(left:ImmutableUploadJob,right:ImmutableUploadJob):UploadQueueDuplicateKind|undefined{
  const rightKeys=new Set(identityKeys(right).map(x=>x.value));
  return identityKeys(left).find(x=>rightKeys.has(x.value))?.kind;
}
const duplicateLabels:Record<UploadQueueDuplicateKind,string>={
  job_identity:'совпал jobId — это же задание уже находится в очереди',
  project_video_identity:'совпали projectId + localVideoIdentity — это же видео проекта уже находится в очереди',
  channel_fingerprint:'совпал fingerprint в рамках этого канала; SHA-256 скрыт'
};
export function uploadQueueDuplicateError(kind:UploadQueueDuplicateKind){
  return new Error(`UPLOAD_QUEUE_DUPLICATE: matched=${kind}; ${duplicateLabels[kind]}`);
}
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
  findDuplicate(spec:ImmutableUploadJob,excludeQueueId?:string):UploadQueueDuplicateMatch|undefined{
    for(const entry of this.entries){
      if(entry.queueId===excludeQueueId||!(entry.state==='PAUSED'||entry.state==='QUEUED'||entry.state==='RUNNING'))continue;
      const kind=duplicateIdentity(spec,entry.spec);
      if(kind)return{kind,entry};
    }
    return undefined;
  }
  hasDuplicate(spec:ImmutableUploadJob){return Boolean(this.findDuplicate(spec))}
  enqueue(input:ImmutableUploadJob){
    assertSpecIntegrity(input);
    const spec=cloneSpec(input);
    const duplicate=this.findDuplicate(spec);
    if(duplicate)throw uploadQueueDuplicateError(duplicate.kind);
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
    const duplicate=this.findDuplicate(hit.spec,hit.queueId);
    if(duplicate){this.replace(hit.queueId,{error:`RECOVERED_DUPLICATE_CONFLICT: matched=${duplicate.kind}; conflictingQueueId=${duplicate.entry.queueId}`});return false}
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
    const entries=value.entries.map(restoredEntry).filter((x):x is UploadQueueEntry=>Boolean(x));
    const conflicts=new Map<number,string[]>();
    for(let i=0;i<entries.length;i++){
      for(let j=0;j<i;j++){
        const kind=duplicateIdentity(entries[i].spec,entries[j].spec);
        if(!kind)continue;
        const left=conflicts.get(i)||[];left.push(`RECOVERED_DUPLICATE_CONFLICT: matched=${kind}; conflictingQueueId=${entries[j].queueId}`);conflicts.set(i,left);
        const right=conflicts.get(j)||[];right.push(`RECOVERED_DUPLICATE_CONFLICT: matched=${kind}; conflictingQueueId=${entries[i].queueId}`);conflicts.set(j,right);
      }
    }
    this.entries=entries.map((row,index)=>{
      const conflict=conflicts.get(index);
      return conflict?Object.freeze({...row,error:`${row.error||'RECOVERED_AFTER_RESTART'} • ${conflict.join(' • ')}`}):row;
    });
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
