export type UploadQueueState='QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED';
export type UploadQueueQuotaOperation={method:'videos.insert'|'videos.list'|'thumbnails.set';count:number;label?:string};

export type ImmutableUploadJob=Readonly<{
  jobId:string;
  batchId:string;
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
  queued:UploadQueueEntry[];
  running:UploadQueueEntry[];
  recent:UploadQueueEntry[];
};

type Executor=(spec:ImmutableUploadJob)=>Promise<void>;
type Listener=(snapshot:UploadQueueSnapshot)=>void;

function cloneSpec(input:ImmutableUploadJob):ImmutableUploadJob{
  return Object.freeze({...input,tags:Object.freeze([...input.tags]),quotaOperations:Object.freeze(input.quotaOperations.map(x=>Object.freeze({...x})))}) as ImmutableUploadJob;
}
function identityKeys(spec:ImmutableUploadJob){return [spec.projectId?`project:${spec.projectId}`:'',spec.fingerprint?`fingerprint:${spec.fingerprint.toLowerCase()}`:''].filter(Boolean)}
function nowIso(){return new Date().toISOString()}

export class MultiChannelUploadQueue{
  private entries:UploadQueueEntry[]=[];
  private listeners=new Set<Listener>();
  private sequence=0;
  private pumping=false;
  constructor(private executor:Executor,private concurrency=2){this.concurrency=Math.max(1,Math.floor(concurrency||1))}

  setConcurrency(value:number){this.concurrency=Math.max(1,Math.floor(value||1));this.emit();void this.pump()}
  getConcurrency(){return this.concurrency}
  subscribe(cb:Listener){this.listeners.add(cb);cb(this.snapshot());return()=>this.listeners.delete(cb)}
  snapshot():UploadQueueSnapshot{
    const queued=this.entries.filter(x=>x.state==='QUEUED').sort((a,b)=>a.submittedSequence-b.submittedSequence);
    const running=this.entries.filter(x=>x.state==='RUNNING').sort((a,b)=>a.submittedSequence-b.submittedSequence);
    const recent=this.entries.filter(x=>x.state==='SUCCEEDED'||x.state==='FAILED').slice(-20).reverse();
    return{concurrency:this.concurrency,queued,running,recent};
  }
  getRuntimeFacts(){return this.entries.filter(x=>x.state==='QUEUED'||x.state==='RUNNING').map(x=>({jobId:x.spec.jobId,channelId:x.spec.channelId,status:x.state==='RUNNING'?'UPLOADING' as const:'QUEUED' as const}))}
  hasDuplicate(spec:ImmutableUploadJob){
    const keys=new Set(identityKeys(spec));
    return this.entries.some(x=>(x.state==='QUEUED'||x.state==='RUNNING')&&identityKeys(x.spec).some(k=>keys.has(k)));
  }
  enqueue(input:ImmutableUploadJob){
    const spec=cloneSpec(input);
    if(this.hasDuplicate(spec))throw new Error('UPLOAD_QUEUE_DUPLICATE: project/fingerprint already queued or running');
    const entry:UploadQueueEntry=Object.freeze({queueId:`uploadq:${++this.sequence}:${spec.jobId}`,spec,state:'QUEUED',submittedSequence:this.sequence});
    this.entries=[...this.entries,entry];this.emit();void this.pump();return entry;
  }
  removeQueued(jobId:string){
    const hit=this.entries.find(x=>x.spec.jobId===jobId&&x.state==='QUEUED');if(!hit)return false;
    this.entries=this.entries.filter(x=>x!==hit);this.emit();return true;
  }
  waitForEntries(queueIds:string[]){
    const wanted=new Set(queueIds.filter(Boolean));
    const collect=()=>this.entries.filter(x=>wanted.has(x.queueId));
    const complete=(rows:UploadQueueEntry[])=>wanted.size>0&&rows.length===wanted.size&&rows.every(x=>x.state==='SUCCEEDED'||x.state==='FAILED');
    const initial=collect();if(complete(initial))return Promise.resolve(initial);
    return new Promise<UploadQueueEntry[]>(resolve=>{
      const listener=()=>{const rows=collect();if(!complete(rows))return;this.listeners.delete(listener);resolve(rows)};
      this.listeners.add(listener);listener();
    });
  }
  private emit(){const snap=this.snapshot();for(const cb of this.listeners)cb(snap)}
  private replace(queueId:string,patch:Partial<UploadQueueEntry>){this.entries=this.entries.map(x=>x.queueId===queueId?Object.freeze({...x,...patch}):x);this.emit()}
  private nextStartable(){
    const activeChannels=new Set(this.entries.filter(x=>x.state==='RUNNING').map(x=>x.spec.channelId));
    return this.entries.filter(x=>x.state==='QUEUED').sort((a,b)=>a.submittedSequence-b.submittedSequence).find(x=>!activeChannels.has(x.spec.channelId));
  }
  private async pump(){
    if(this.pumping)return;this.pumping=true;
    try{
      while(this.entries.filter(x=>x.state==='RUNNING').length<this.concurrency){
        const next=this.nextStartable();if(!next)break;
        this.replace(next.queueId,{state:'RUNNING',startedAt:nowIso()});
        void this.executor(next.spec).then(()=>this.replace(next.queueId,{state:'SUCCEEDED',finishedAt:nowIso()})).catch(error=>this.replace(next.queueId,{state:'FAILED',finishedAt:nowIso(),error:String(error)})).finally(()=>void this.pump());
      }
    }finally{this.pumping=false}
  }
}
