import {api} from './api';
import {appendErrorHistory,type ErrorHistoryMeta} from './errorHistory';
import {humanizeError} from './errorCenter';
import {notifyWarning} from './notificationCenter';
import {baseName} from './publishCenterCore';
import {recordVerifiedUpload,nextProjectLifecycle,successfulUploadForHash} from './storageLifecycle';
import {useApp} from './store';
import {acquireChannelUploadLock,beginPublishAttempt,completePublishAttempt,failPublishAttempt,isChannelUploadLocked,isYoutubeDailyUploadLimitError,releaseChannelUploadLock,safeDailyStatus} from './youtubePublishSafety';
import {isYoutubeQuotaError,releaseYoutubeQuotaReservation,reserveYoutubeQuotaAtomic,type YoutubeQuotaOperation} from './youtubeQuota';
import {MultiChannelUploadQueue,type ImmutableUploadJob,type UploadQueueSnapshot} from './uploadQueue';

export function uploadFailureHistoryMeta(spec:ImmutableUploadJob,errorCode?:string):ErrorHistoryMeta{
 return{errorCode,videoId:spec.jobId,projectId:spec.projectId,filePath:spec.filePath,stage:'upload-transfer',profileId:spec.profileId,channelId:spec.channelId};
}

async function executeUpload(spec:ImmutableUploadJob){
 const operationId=`upload-queue:${spec.jobId}:${Date.now()}`;
 let lock:string|null=null,attempt:ReturnType<typeof beginPublishAttempt>|undefined,quotaReserved=false;
 try{
  const state=useApp.getState(),job=state.jobs.find(x=>x.id===spec.jobId),channel=state.channels.find(x=>x.id===spec.channelId);
  if(!job||!channel)throw new Error('UPLOAD_QUEUE_SOURCE_MISSING: project/channel no longer exists');
  if(job.channelId!==spec.channelId||job.finalPath!==spec.filePath)throw new Error('UPLOAD_QUEUE_IDENTITY_CHANGED: local video identity changed after submission');
  if(Date.parse(spec.publishAt)<=Date.now())throw new Error('UPLOAD_QUEUE_PUBLISH_AT_EXPIRED: publishAt is no longer in the future');
  if(!spec.allowDuplicate&&successfulUploadForHash(state.uploadHistory,spec.fingerprint))throw new Error('UPLOAD_QUEUE_DUPLICATE_VERIFIED: fingerprint already uploaded');
  const daily=safeDailyStatus(spec.channelId,channel.safeDailyUploadLimit);if(daily.remaining!=null&&daily.remaining<=0)throw new Error('UPLOAD_QUEUE_CHANNEL_DAILY_LIMIT: safe rolling limit reached');
  const quota=reserveYoutubeQuotaAtomic(operationId,spec.quotaOperations as YoutubeQuotaOperation[],spec.quotaProjectKey||undefined);
  if(!quota.reserved)throw new Error('UPLOAD_QUEUE_QUOTA_RECHECK_FAILED: quota changed before start');
  quotaReserved=true;
  if(isChannelUploadLocked(spec.channelId))throw new Error('UPLOAD_QUEUE_CHANNEL_BUSY: another factual upload owns the channel');
  lock=acquireChannelUploadLock(spec.channelId);if(!lock)throw new Error('UPLOAD_QUEUE_CHANNEL_BUSY: another factual upload owns the channel');
  attempt=beginPublishAttempt({channelId:spec.channelId,jobId:spec.jobId,filePath:spec.filePath,fingerprint:spec.fingerprint,fileSize:spec.fileSize});
  useApp.getState().patchJob(spec.jobId,{status:'UPLOADING',storageLifecycle:'UPLOADING',uploadProgress:0,error:undefined,uploadFingerprint:spec.fingerprint,title:spec.title,description:spec.description,tags:[...spec.tags],publishAt:spec.publishAt});
  if(job.folder)await api.writeJobMetadata(job.folder,spec.title,spec.description,[...spec.tags],spec.publishAt,spec.metadataSource||job.metadataSource||'template');
  const uploaded=await api.youtubeUpload(spec.profileId,spec.jobId,spec.filePath,spec.title,spec.description,[...spec.tags],spec.publishAt,spec.categoryId,operationId,{channelId:spec.channelId,projectId:spec.projectId,totalBytes:spec.fileSize,startedAt:new Date().toISOString()});
  if(!uploaded.videoId)throw new Error('UPLOAD_NEEDS_VERIFICATION: YouTube did not return video ID');
  if(uploaded.verified===false)throw new Error(uploaded.verificationError||'UPLOAD_VERIFY_FAILED: videos.list verification failed');
  completePublishAttempt(attempt.id,uploaded.videoId);
  const at=new Date().toISOString(),fresh=useApp.getState(),projectEntry=Object.entries(fresh.projectLifecycle).find(([,x])=>x.jobId===spec.jobId);
  const nextHistory=recordVerifiedUpload(fresh.uploadHistory,{jobId:spec.jobId,channelId:spec.channelId,profileId:spec.profileId,youtubeChannelId:spec.youtubeChannelId,youtubeVideoId:uploaded.videoId,localFilePath:spec.filePath,originalFilename:baseName(spec.filePath),projectId:spec.projectId||projectEntry?.[1].projectId,sourceProjectPath:projectEntry?.[1].projectPath,uploadedAt:at,fileSize:spec.fileSize,sha256:spec.fingerprint,publishAt:spec.publishAt,overrideDuplicate:spec.allowDuplicate});
  useApp.getState().replaceUploadHistory(nextHistory);if(projectEntry)useApp.getState().patchProjectLifecycle(projectEntry[0],nextProjectLifecycle(projectEntry[1],nextHistory));
  let thumbError='';if(spec.thumbnailPath){try{await api.youtubeSetThumbnail(spec.profileId,uploaded.videoId,spec.thumbnailPath,operationId);useApp.getState().patchJob(spec.jobId,{thumbnailPath:spec.thumbnailPath})}catch(error){thumbError=humanizeError(error,'thumbnail').message}}
  useApp.getState().patchJob(spec.jobId,{status:'SCHEDULED',storageLifecycle:'UPLOADED',youtubeVideoId:uploaded.videoId,uploadProgress:100,uploadedAt:at,uploadInterruptedAt:undefined,error:thumbError||undefined});
  useApp.getState().updateChannel(spec.channelId,{lastUploadAt:at,knownUploadLimitState:'ok',lastDailyLimitError:undefined});
 }catch(error){
  const pending=await api.youtubeUploadSessions().catch(()=>[]),recoverable=pending.some(x=>x.jobId===spec.jobId);
  if(recoverable){useApp.getState().patchJob(spec.jobId,{status:'ERROR',storageLifecycle:'UPLOADING',youtubeVideoId:undefined,uploadedAt:undefined,error:'Загрузка прервана — доступно продолжение',uploadInterruptedAt:new Date().toISOString()})}
  else{if(attempt)failPublishAttempt(attempt.id,error);const h=humanizeError(error,'upload'),dailyLimit=isYoutubeDailyUploadLimitError(error),quotaError=isYoutubeQuotaError(error);useApp.getState().patchJob(spec.jobId,{status:'ERROR',storageLifecycle:'FAILED',youtubeVideoId:undefined,uploadedAt:undefined,error:dailyLimit?'YouTube остановил загрузки: достигнут лимит загрузок канала':h.message,uploadInterruptedAt:new Date().toISOString()});if(dailyLimit)useApp.getState().updateChannel(spec.channelId,{knownUploadLimitState:'limited',lastDailyLimitError:h.message,lastUploadAt:new Date().toISOString()});appendErrorHistory(h.title,`VIDEO_${String(spec.videoNumber).padStart(3,'0')}: ${h.message}`,h.detail,uploadFailureHistoryMeta(spec,quotaError?'YOUTUBE_QUOTA':h.code))}
  throw error;
 }finally{if(quotaReserved)releaseYoutubeQuotaReservation(operationId);if(lock)releaseChannelUploadLock(spec.channelId,lock)}
}

const queue=new MultiChannelUploadQueue(executeUpload,2);
export function configureUploadQueue(concurrency:number){queue.setConcurrency(concurrency)}
export function uploadQueueSnapshot(){return queue.snapshot()}
export function subscribeUploadQueue(cb:(snapshot:UploadQueueSnapshot)=>void){return queue.subscribe(cb)}
export function uploadQueueRuntimeFacts(){return queue.getRuntimeFacts()}
export function waitForUploadQueueEntries(queueIds:string[]){return queue.waitForEntries(queueIds)}
export function enqueueUpload(spec:ImmutableUploadJob){if(queue.hasDuplicate(spec))throw new Error('UPLOAD_QUEUE_DUPLICATE: project/fingerprint already queued or running');useApp.getState().patchJob(spec.jobId,{status:'READY_UPLOAD',storageLifecycle:'QUEUED',uploadProgress:0,error:undefined,uploadFingerprint:spec.fingerprint});return queue.enqueue(spec)}
export function removeQueuedUpload(jobId:string){const ok=queue.removeQueued(jobId);if(ok)useApp.getState().patchJob(jobId,{status:'READY_UPLOAD',storageLifecycle:'NEW',uploadProgress:0});return ok}
export function uploadQueueHasActiveJob(jobId:string){const s=queue.snapshot();return [...s.queued,...s.running].some(x=>x.spec.jobId===jobId)}
export function uploadQueueActiveCount(){return queue.snapshot().running.length}
export function uploadQueueQueuedCount(){return queue.snapshot().queued.length}
export function warnQueueFailure(message:string){notifyWarning('Очередь загрузки',message)}
