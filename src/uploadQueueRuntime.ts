import {api} from './api';
import {appendErrorHistory} from './errorHistory';
import {humanizeError} from './errorCenter';
import {notifyWarning} from './notificationCenter';
import {baseName} from './publishCenterCore';
import {recordVerifiedUpload,nextProjectLifecycle,successfulUploadForHash,updateUploadProcessing} from './storageLifecycle';
import {useApp} from './store';
import {acquireChannelUploadLock,beginPublishAttempt,completePublishAttempt,failPublishAttempt,isChannelUploadLocked,isYoutubeDailyUploadLimitError,releaseChannelUploadLock,safeDailyStatus} from './youtubePublishSafety';
import {isYoutubeQuotaError,releaseYoutubeQuotaReservation,reserveYoutubeQuotaAtomic,type YoutubeQuotaOperation} from './youtubeQuota';
import {MultiChannelUploadQueue,type ImmutableUploadJob,type UploadQueueSnapshot} from './uploadQueue';
import {journal,journalProcessingState} from './activityJournalRuntime';

async function executeUpload(spec:ImmutableUploadJob){
 const operationId=`upload-queue:${spec.jobId}:${Date.now()}`,batchId=spec.batchId||`upload-batch:${spec.channelId}:${spec.submittedAt}`;
 let lock:string|null=null,attempt:ReturnType<typeof beginPublishAttempt>|undefined,quotaReserved=false;
 let phase:'PRECHECK'|'QUOTA_RESERVED'|'TRANSFER_STARTED'|'VIDEO_ID_RECEIVED'|'REMOTE_VERIFY'|'PROCESSING_CHECK'|'THUMBNAIL'|'COMPLETE'='PRECHECK',videoIdReceivedThisAttempt=false;
 try{
  const state=useApp.getState(),job=state.jobs.find(x=>x.id===spec.jobId),channel=state.channels.find(x=>x.id===spec.channelId);
  if(!job||!channel)throw new Error('UPLOAD_QUEUE_SOURCE_MISSING: project/channel no longer exists');
  if(job.channelId!==spec.channelId||job.finalPath!==spec.filePath)throw new Error('UPLOAD_QUEUE_IDENTITY_CHANGED: local video identity changed after submission');
  if(job.youtubeVideoId&&!spec.allowDuplicate)throw new Error(`UPLOAD_ALREADY_HAS_VIDEO_ID: ${job.youtubeVideoId}; verify existing YouTube state before explicit duplicate re-upload`);
  if(Date.parse(spec.publishAt)<=Date.now())throw new Error('UPLOAD_QUEUE_PUBLISH_AT_EXPIRED: publishAt is no longer in the future');
  if(successfulUploadForHash(state.uploadHistory,spec.fingerprint,spec.channelId,spec.fileSize))throw new Error('UPLOAD_QUEUE_DUPLICATE_VERIFIED: fingerprint already uploaded for this channel');
  const daily=safeDailyStatus(spec.channelId,channel.safeDailyUploadLimit);if(daily.remaining!=null&&daily.remaining<=0)throw new Error('UPLOAD_QUEUE_CHANNEL_DAILY_LIMIT: safe rolling limit reached');
  const quota=reserveYoutubeQuotaAtomic(operationId,spec.quotaOperations as YoutubeQuotaOperation[],spec.quotaProjectKey||undefined);
  if(!quota.reserved)throw new Error('UPLOAD_QUEUE_QUOTA_RECHECK_FAILED: quota changed before start');
  quotaReserved=true;phase='QUOTA_RESERVED';
  if(isChannelUploadLocked(spec.channelId))throw new Error('UPLOAD_QUEUE_CHANNEL_BUSY: another factual upload owns the channel');
  lock=acquireChannelUploadLock(spec.channelId);if(!lock)throw new Error('UPLOAD_QUEUE_CHANNEL_BUSY: another factual upload owns the channel');
  attempt=beginPublishAttempt({channelId:spec.channelId,jobId:spec.jobId,filePath:spec.filePath,fingerprint:spec.fingerprint,fileSize:spec.fileSize});
  const startedAt=new Date().toISOString();
  useApp.getState().patchJob(spec.jobId,{status:'UPLOADING',storageLifecycle:'UPLOADING',uploadProgress:0,error:undefined,uploadFingerprint:spec.fingerprint,currentSourceFingerprint:spec.fingerprint,currentSourceFileSize:spec.fileSize,currentSourceModifiedAt:spec.modifiedAt,sourceGenerationKey:`${spec.channelId}:${spec.fingerprint}:${spec.fileSize}`,title:spec.title,description:spec.description,tags:[...spec.tags],publishAt:spec.publishAt});
  journal({eventType:'UPLOAD_STARTED',status:'STARTED',source:'LIVE_OPERATION',timestamp:startedAt,operationId,batchId,channelId:spec.channelId,channelName:spec.channelName,profileId:spec.profileId,jobId:spec.jobId,localSourcePath:spec.filePath,details:{filename:baseName(spec.filePath),fileSize:spec.fileSize,title:spec.title,publishAt:spec.publishAt}});
  if(job.folder)await api.writeJobMetadata(job.folder,spec.title,spec.description,[...spec.tags],spec.publishAt,spec.metadataSource||job.metadataSource||'template');
  phase='TRANSFER_STARTED';
  const uploaded=await api.youtubeUpload(spec.profileId,spec.jobId,spec.filePath,spec.title,spec.description,[...spec.tags],spec.publishAt,spec.categoryId,operationId,{channelId:spec.channelId,projectId:spec.projectId,totalBytes:spec.fileSize,startedAt:new Date().toISOString()});
  if(!uploaded.videoId)throw new Error('UPLOAD_NEEDS_VERIFICATION: YouTube did not return video ID');
  videoIdReceivedThisAttempt=true;phase='VIDEO_ID_RECEIVED';
  const acceptedAt=new Date().toISOString();
  journal({eventType:'UPLOAD_ACCEPTED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:acceptedAt,operationId,batchId,channelId:spec.channelId,channelName:spec.channelName,profileId:spec.profileId,jobId:spec.jobId,youtubeVideoId:uploaded.videoId,localSourcePath:spec.filePath,details:{filename:baseName(spec.filePath),fileSize:spec.fileSize,title:spec.title,publishAt:spec.publishAt}});
  // Persist the returned videoId immediately. If verification is temporarily unavailable,
  // retry must never blindly create a duplicate.
  useApp.getState().patchJob(spec.jobId,{youtubeVideoId:uploaded.videoId,uploadProgress:100,uploadedAt:acceptedAt,uploadAcceptedAt:acceptedAt,storageLifecycle:'UPLOADED',processingState:'UPLOAD_ACCEPTED'});
  const acceptedState=useApp.getState(),acceptedProject=Object.entries(acceptedState.projectLifecycle).find(([,x])=>x.jobId===spec.jobId);
  if(uploaded.verified===false){
    phase='REMOTE_VERIFY';
    const uncertainHistory=recordVerifiedUpload(acceptedState.uploadHistory,{jobId:spec.jobId,channelId:spec.channelId,profileId:spec.profileId,youtubeChannelId:spec.youtubeChannelId,youtubeVideoId:uploaded.videoId,localFilePath:spec.filePath,originalFilename:baseName(spec.filePath),projectId:spec.projectId||acceptedProject?.[1].projectId,sourceProjectPath:acceptedProject?.[1].projectPath,batchId,titleAtUpload:spec.title,uploadedAt:acceptedAt,fileSize:spec.fileSize,sha256:spec.fingerprint,publishAt:spec.publishAt,overrideDuplicate:spec.allowDuplicate,sourceLifecycle:'PRESENT',processingState:'PROCESSING_UNKNOWN',processingCheckedAt:acceptedAt,processingError:uploaded.verificationError});
    useApp.getState().replaceUploadHistory(uncertainHistory);
    throw new Error(uploaded.verificationError||`UPLOAD_VERIFY_FAILED: videoId=${uploaded.videoId}; videos.list verification failed`)
  }
  completePublishAttempt(attempt.id,uploaded.videoId);
  const fresh=useApp.getState(),projectEntry=Object.entries(fresh.projectLifecycle).find(([,x])=>x.jobId===spec.jobId);
  let nextHistory=recordVerifiedUpload(fresh.uploadHistory,{jobId:spec.jobId,channelId:spec.channelId,profileId:spec.profileId,youtubeChannelId:spec.youtubeChannelId,youtubeVideoId:uploaded.videoId,localFilePath:spec.filePath,originalFilename:baseName(spec.filePath),projectId:spec.projectId||projectEntry?.[1].projectId,sourceProjectPath:projectEntry?.[1].projectPath,batchId,titleAtUpload:spec.title,uploadedAt:acceptedAt,fileSize:spec.fileSize,sha256:spec.fingerprint,publishAt:spec.publishAt,overrideDuplicate:spec.allowDuplicate,sourceLifecycle:'PRESENT',processingState:'UPLOAD_ACCEPTED',identityVerifiedAt:acceptedAt});
  useApp.getState().replaceUploadHistory(nextHistory);
  let processingState:'UPLOAD_ACCEPTED'|'YOUTUBE_PROCESSING'|'READY'|'PROCESSING_FAILED'|'PROCESSING_UNKNOWN'='UPLOAD_ACCEPTED',processingCheckedAt:string|undefined,processingError:string|undefined;
  try{
    phase='PROCESSING_CHECK';
    const processing=await api.youtubeVideoProcessingStatus(spec.profileId,uploaded.videoId,`${operationId}:processing`);
    processingState=processing.processingState;
    processingCheckedAt=processing.processingCheckedAt;
    processingError=processing.processingFailureReason||processing.rejectionReason||undefined;
    const beforeRow=useApp.getState().uploadHistory.slice().reverse().find(x=>x.jobId===spec.jobId);
    nextHistory=updateUploadProcessing(useApp.getState().uploadHistory,spec.jobId,{processingState,processingCheckedAt,processingStatus:processing.processingStatus,processingError,readyAt:processingState==='READY'?processingCheckedAt:undefined,identityVerifiedAt:processingCheckedAt});
    useApp.getState().replaceUploadHistory(nextHistory);
    if(beforeRow&&processingCheckedAt)journalProcessingState(beforeRow,beforeRow.processingState,processingState,processingCheckedAt,processingError);
  }catch(error){
    processingState='PROCESSING_UNKNOWN';
    processingCheckedAt=new Date().toISOString();
    processingError=humanizeError(error,'youtube').message;
    nextHistory=updateUploadProcessing(useApp.getState().uploadHistory,spec.jobId,{processingState,processingCheckedAt,processingError});
    useApp.getState().replaceUploadHistory(nextHistory);
  }
  if(projectEntry)useApp.getState().patchProjectLifecycle(projectEntry[0],nextProjectLifecycle(projectEntry[1],nextHistory));
  let thumbError='';if(spec.thumbnailPath){phase='THUMBNAIL';try{await api.youtubeSetThumbnail(spec.profileId,uploaded.videoId,spec.thumbnailPath,operationId);useApp.getState().patchJob(spec.jobId,{thumbnailPath:spec.thumbnailPath});journal({eventType:'THUMBNAIL_UPDATED',status:'SUCCESS',source:'LIVE_OPERATION',operationId,batchId,channelId:spec.channelId,channelName:spec.channelName,profileId:spec.profileId,jobId:spec.jobId,youtubeVideoId:uploaded.videoId,details:{filename:baseName(spec.thumbnailPath)}})}catch(error){thumbError=humanizeError(error,'thumbnail').message}}
  useApp.getState().patchJob(spec.jobId,{status:'SCHEDULED',storageLifecycle:'UPLOADED',youtubeVideoId:uploaded.videoId,uploadProgress:100,uploadedAt:acceptedAt,uploadAcceptedAt:acceptedAt,processingState,processingCheckedAt,processingError,uploadInterruptedAt:undefined,error:thumbError||undefined});
  useApp.getState().updateChannel(spec.channelId,{lastUploadAt:acceptedAt,knownUploadLimitState:'ok',lastDailyLimitError:undefined});phase='COMPLETE';
 }catch(error){
  const pending=await api.youtubeUploadSessions().catch(()=>[]),recoverable=pending.some(x=>x.jobId===spec.jobId);
  const current=useApp.getState().jobs.find(x=>x.id===spec.jobId),acceptedVideoId=current?.youtubeVideoId,duplicateGuard=String(error).includes('UPLOAD_ALREADY_HAS_VIDEO_ID');
  if(duplicateGuard){
   const h=humanizeError(error,'upload');
   journal({eventType:'UPLOAD_BLOCKED_DUPLICATE_GUARD',status:'INFO',source:'LIVE_OPERATION',operationId,batchId,channelId:spec.channelId,channelName:spec.channelName,profileId:spec.profileId,jobId:spec.jobId,youtubeVideoId:acceptedVideoId,localSourcePath:spec.filePath,errorCode:'LOCAL_DUPLICATE_GUARD',details:{filename:baseName(spec.filePath),youtubeRequestSent:false,videosInsertSent:false,videoIdReceivedThisAttempt:false,phase:'PRECHECK'}});
   appendErrorHistory(h.title,`VIDEO_${String(spec.videoNumber).padStart(3,'0')}: ${h.message}`,h.detail,{errorCode:'LOCAL_DUPLICATE_GUARD',videoId:acceptedVideoId||spec.jobId,filePath:spec.filePath,stage:'reconciliation',channelId:spec.channelId,profileId:spec.profileId,operationId:batchId,rootIssueKey:`${batchId}:LOCAL_DUPLICATE_GUARD`,youtubeRequestSent:false,videosInsertSent:false,videoIdReceivedThisAttempt:false,operationPhase:'PRECHECK'});
  }else if(recoverable&&!acceptedVideoId){useApp.getState().patchJob(spec.jobId,{status:'ERROR',storageLifecycle:'UPLOADING',error:'Загрузка прервана — доступно продолжение',uploadInterruptedAt:new Date().toISOString()})}
  else{
   if(attempt&&!acceptedVideoId)failPublishAttempt(attempt.id,error);
   const h=humanizeError(error,'upload'),dailyLimit=isYoutubeDailyUploadLimitError(error),quotaError=isYoutubeQuotaError(error),acceptedVerifyFailed=Boolean(videoIdReceivedThisAttempt&&acceptedVideoId&&(phase==='REMOTE_VERIFY'||phase==='PROCESSING_CHECK'||phase==='THUMBNAIL'));
   if(!acceptedVideoId)journal({eventType:'UPLOAD_FAILED',status:'FAILED',source:'LIVE_OPERATION',operationId,batchId,channelId:spec.channelId,channelName:spec.channelName,profileId:spec.profileId,jobId:spec.jobId,localSourcePath:spec.filePath,errorCode:quotaError?'YOUTUBE_QUOTA':h.code,details:{filename:baseName(spec.filePath),error:h.message,phase}});
   useApp.getState().patchJob(spec.jobId,{status:'ERROR',storageLifecycle:acceptedVideoId?'UPLOADED':'FAILED',processingState:acceptedVideoId?'PROCESSING_UNKNOWN':current?.processingState,processingError:acceptedVideoId?h.message:current?.processingError,error:dailyLimit?'YouTube остановил загрузки: достигнут лимит загрузок канала':acceptedVideoId?`Видео уже получило YouTube ID ${acceptedVideoId}. Повторная загрузка заблокирована до проверки состояния. ${h.message}`:h.message,uploadInterruptedAt:new Date().toISOString()});
   if(dailyLimit)useApp.getState().updateChannel(spec.channelId,{knownUploadLimitState:'limited',lastDailyLimitError:h.message,lastUploadAt:new Date().toISOString()});
   appendErrorHistory(h.title,`VIDEO_${String(spec.videoNumber).padStart(3,'0')}: ${h.message}`,h.detail,{errorCode:quotaError?'YOUTUBE_QUOTA':acceptedVerifyFailed?'UPLOAD_ACCEPTED_VERIFY_FAILED':acceptedVideoId?'REMOTE_VERIFICATION_REQUIRED':h.code,videoId:acceptedVideoId||spec.jobId,filePath:spec.filePath,stage:acceptedVerifyFailed?'verification':phase==='PRECHECK'?'preflight':'upload-transfer',channelId:spec.channelId,profileId:spec.profileId,operationId,rootIssueKey:acceptedVideoId&&!videoIdReceivedThisAttempt?`${batchId}:REMOTE_VERIFICATION_REQUIRED`:undefined,videoIdReceivedThisAttempt,operationPhase:phase});
  }
  throw error;
 }finally{if(quotaReserved)releaseYoutubeQuotaReservation(operationId);if(lock)releaseChannelUploadLock(spec.channelId,lock)}
}

const queue=new MultiChannelUploadQueue(executeUpload,2);
export function configureUploadQueue(concurrency:number){queue.setConcurrency(concurrency)}
export function uploadQueueSnapshot(){return queue.snapshot()}
export function subscribeUploadQueue(cb:(snapshot:UploadQueueSnapshot)=>void){return queue.subscribe(cb)}
export function uploadQueueRuntimeFacts(){return queue.getRuntimeFacts()}
export function waitForUploadQueueEntries(queueIds:string[]){return queue.waitForEntries(queueIds)}
export function enqueueUpload(spec:ImmutableUploadJob){if(queue.hasDuplicate(spec))throw new Error('UPLOAD_QUEUE_DUPLICATE: project/fingerprint already queued or running');const batchId=spec.batchId||`upload-batch:${spec.channelId}:${spec.submittedAt}`;useApp.getState().patchJob(spec.jobId,{status:'READY_UPLOAD',storageLifecycle:'QUEUED',uploadProgress:0,error:undefined,uploadFingerprint:spec.fingerprint,currentSourceFingerprint:spec.fingerprint,currentSourceFileSize:spec.fileSize,currentSourceModifiedAt:spec.modifiedAt,sourceGenerationKey:`${spec.channelId}:${spec.fingerprint}:${spec.fileSize}`});journal({eventType:'UPLOAD_QUEUED',status:'STARTED',source:'LIVE_OPERATION',timestamp:spec.submittedAt,operationId:batchId+':'+spec.jobId,batchId,channelId:spec.channelId,channelName:spec.channelName,profileId:spec.profileId,jobId:spec.jobId,localSourcePath:spec.filePath,details:{filename:baseName(spec.filePath),fileSize:spec.fileSize,title:spec.title,publishAt:spec.publishAt}});return queue.enqueue(spec)}
export function removeQueuedUpload(jobId:string){const ok=queue.removeQueued(jobId);if(ok)useApp.getState().patchJob(jobId,{status:'READY_UPLOAD',storageLifecycle:'NEW',uploadProgress:0});return ok}
export function uploadQueueHasActiveJob(jobId:string){const s=queue.snapshot();return [...s.queued,...s.running].some(x=>x.spec.jobId===jobId)}
export function uploadQueueActiveCount(){return queue.snapshot().running.length}
export function uploadQueueQueuedCount(){return queue.snapshot().queued.length}
export function warnQueueFailure(message:string){notifyWarning('Очередь загрузки',message)}
