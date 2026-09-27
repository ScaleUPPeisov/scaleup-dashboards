import type {ActivityEvent,ActivityEventType,UploadHistoryRecord,YoutubeProcessingState} from './types';
import type {UploadProgressFact} from './uploadTelemetry';
import {activityEvent,legacyMetadataJournal,legacyUploadJournal} from './activityJournalCore';
import {loadMetadataHistory} from './metadataWorkspaceState';
import {useApp} from './store';

export function journal(input:Parameters<typeof activityEvent>[0]){const e=activityEvent(input);useApp.getState().appendActivity(e);return e}
export function journalMany(events:ActivityEvent[]){if(events.length)useApp.getState().appendActivities(events)}

export function ensureLegacyJournal(){
 const s=useApp.getState();
 const uploadEvents=legacyUploadJournal(s.uploadHistory,s.channels,s.activityJournal);
 const after=[...s.activityJournal,...uploadEvents];
 const metadataEvents=s.channels.flatMap(c=>legacyMetadataJournal(loadMetadataHistory(c.id) as any,after));
 journalMany([...uploadEvents,...metadataEvents]);
 return{uploadEvents:uploadEvents.length,metadataEvents:metadataEvents.length};
}

const progressMilestones=new Map<string,Set<number>>();
export function journalUploadProgressMilestone(fact:UploadProgressFact){
 if(fact.active===false)return;
 const total=Number(fact.totalBytes||0),bytes=Number(fact.bytesUploaded||0);
 if(!(total>0&&bytes>=0))return;
 const pct=Math.max(0,Math.min(100,bytes/total*100));
 const hit=[25,50,75,100].filter(x=>pct>=x);
 if(!hit.length)return;
 const done=progressMilestones.get(fact.jobId)||new Set<number>();progressMilestones.set(fact.jobId,done);
 const state=useApp.getState(),job=state.jobs.find(x=>x.id===fact.jobId),channel=job&&state.channels.find(c=>c.id===job.channelId),history=state.uploadHistory.slice().reverse().find(x=>x.jobId===fact.jobId);
 for(const milestone of hit){
  if(done.has(milestone))continue;done.add(milestone);
  journal({
   eventId:'live:upload-progress:'+fact.jobId+':'+milestone,
   eventType:'UPLOAD_PROGRESS',status:'INFO',source:'LIVE_OPERATION',timestamp:fact.timestamp||new Date().toISOString(),
   operationId:history?.batchId?history.batchId+':'+fact.jobId:undefined,batchId:history?.batchId,channelId:fact.channelId||job?.channelId,channelName:channel?.name,
   profileId:fact.profileId||history?.profileId,jobId:fact.jobId,youtubeVideoId:history?.youtubeVideoId,localSourcePath:fact.filePath||job?.finalPath,
   details:{milestone,bytesUploaded:Math.round(bytes),totalBytes:Math.round(total)}
  });
 }
}
export function clearProgressJournalState(jobId:string){progressMilestones.delete(jobId)}

export function journalProcessingState(row:UploadHistoryRecord,previous:YoutubeProcessingState|undefined,next:YoutubeProcessingState,at:string,error?:string){
 if(previous===next&&next!=='READY'&&next!=='PROCESSING_FAILED'&&next!=='REJECTED')return;
 let eventType:ActivityEventType='YOUTUBE_PROCESSING';let status:'SUCCESS'|'FAILED'|'INFO'='INFO';
 if(next==='READY'){eventType='YOUTUBE_READY';status='SUCCESS'}
 else if(next==='PROCESSING_FAILED'||next==='REJECTED'){eventType='UPLOAD_FAILED';status='FAILED'}
 journal({
  eventId:'processing:'+row.id+':'+next+':'+at,eventType,status,source:'LIVE_OPERATION',timestamp:at,
  batchId:row.batchId,channelId:row.channelId,profileId:row.profileId,jobId:row.jobId,youtubeVideoId:row.youtubeVideoId,localSourcePath:row.localFilePath,
  details:{previous:previous||'UNKNOWN',processingState:next,error:error||''},errorCode:error&&next!=='READY'?next:undefined
 });
}
