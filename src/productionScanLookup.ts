import {MAX_EVENTS} from './activityJournalCore';
import type {ActivityEvent, VideoJob} from './types';

type ScanState = {jobs: VideoJob[]; activityJournal: ActivityEvent[]};
type JobPatch = {id:string;patch:Partial<VideoJob>};

/** One synchronous scan keeps an evolving local view before publishing changes. */
export function createProductionScanLookup(state:ScanState){
 let jobsById:Map<string,VideoJob>|undefined;
 const jobs=()=>{
  if(!jobsById){jobsById=new Map();for(const job of state.jobs)if(!jobsById.has(job.id))jobsById.set(job.id,job)}
  return jobsById;
 };
 const updates=new Map<string,Partial<VideoJob>>();
 const pending:ActivityEvent[]=[];
 const proposals:Array<{rawId:string;create:()=>ActivityEvent}>=[];
 // Model first-match replacement and oldest-event eviction, including legacy
 // duplicate IDs, without rescanning and copying a 20,000-event journal.
 let queue:string[]|undefined,counts:Map<string,number>|undefined;
 const journal=()=>{
  if(!queue||!counts){queue=state.activityJournal.map(event=>event.eventId);counts=new Map();for(const id of queue)counts.set(id,(counts.get(id)||0)+1)}
  return {queue,counts};
 };
 let head=0;
 const hasEvent=(id:string)=>(journal().counts.get(id)||0)>0;
 const addEvent=(event:ActivityEvent)=>{
  const {queue,counts}=journal();
  pending.push(event);
  if(!counts.has(event.eventId)){queue.push(event.eventId);counts.set(event.eventId,1)}
  while(queue.length-head>MAX_EVENTS){
   const id=queue[head++],remaining=(counts.get(id)||0)-1;
   if(remaining>0)counts.set(id,remaining);else counts.delete(id);
  }
 };
 const considerEvent=(rawId:string,create:()=>ActivityEvent)=>{
  proposals.push({rawId,create});
  if(!hasEvent(rawId))addEvent(create());
 };
 return {
  job(id:string){return jobs().get(id)},
  patchJob(id:string,patch:Partial<VideoJob>){
   const current=jobs(),job=current.get(id);if(!job)return;
   current.set(id,{...job,...patch});updates.set(id,{...updates.get(id),...patch});
  },
  hasEvent,considerEvent,
  patches():JobPatch[]{return [...updates].map(([id,patch])=>({id,patch}))},
  events(currentJournal=state.activityJournal):ActivityEvent[]{
   // A synchronous store subscriber can update the journal while the jobs
   // batch is published. Reevaluate every observation against that state.
   if(currentJournal===state.activityJournal)return pending;
   const latest=createProductionScanLookup({jobs:[],activityJournal:currentJournal});
   for(const item of proposals)latest.considerEvent(item.rawId,item.create);
   return latest.events();
  },
 };
}
