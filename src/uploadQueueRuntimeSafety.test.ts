import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import type {ImmutableUploadJob} from './uploadQueue';

const h=vi.hoisted(()=>({sessions:vi.fn(),upload:vi.fn(),cancel:vi.fn(),patch:vi.fn(),quota:vi.fn(),attention:vi.fn(),warning:vi.fn(),write:vi.fn(),applying:vi.fn(),metadataError:vi.fn(),failAttempt:vi.fn(),job:{id:'job-1',channelId:'channel-1',finalPath:'/test/video.mp4'} as any}));
vi.mock('./api',()=>({api:{youtubeUploadSessions:h.sessions,youtubeUpload:h.upload,youtubeCancelUploadSession:h.cancel,writeJobMetadata:h.write,metadataQueueMarkApplying:h.applying,metadataQueueMarkError:h.metadataError}}));
vi.mock('./store',()=>({useApp:{getState:()=>({jobs:[h.job],channels:[{id:'channel-1'}],uploadHistory:[],patchJob:h.patch})}}));
vi.mock('./taskEngine',()=>({attentionTask:h.attention,cancelTask:vi.fn(),completeTask:vi.fn(),ensureTask:vi.fn(),failTask:vi.fn(),startTask:vi.fn()}));
vi.mock('./activityJournalRuntime',()=>({journal:vi.fn(),journalProcessingState:vi.fn()}));
vi.mock('./errorHistory',()=>({appendErrorHistory:vi.fn()}));
vi.mock('./notificationCenter',()=>({notifyWarning:h.warning}));
vi.mock('./storageLifecycle',()=>({recordVerifiedUpload:vi.fn(),nextProjectLifecycle:vi.fn(),successfulUploadForHash:()=>false,updateUploadProcessing:vi.fn()}));
vi.mock('./youtubePublishSafety',()=>({acquireChannelUploadLock:()=> 'lock',beginPublishAttempt:()=>({id:'attempt'}),completePublishAttempt:vi.fn(),failPublishAttempt:h.failAttempt,isChannelUploadLocked:()=>false,isYoutubeDailyUploadLimitError:()=>false,releaseChannelUploadLock:vi.fn(),safeDailyStatus:()=>({remaining:10})}));
vi.mock('./youtubeQuota',()=>({isYoutubeQuotaError:()=>false,releaseYoutubeQuotaReservation:vi.fn(),reserveYoutubeQuotaAtomic:h.quota}));
vi.mock('./publishWorkspaceState',()=>({loadPublishWorkspace:vi.fn(),retireCompletedWorkspaceMetadata:vi.fn(),savePublishWorkspace:vi.fn()}));

const spec:ImmutableUploadJob={jobId:'job-1',projectId:'project-1',localVideoIdentity:'video-1',videoNumber:1,channelId:'channel-1',channelName:'Test channel',profileId:'profile-1',filePath:'/test/video.mp4',fingerprint:'a'.repeat(64),fileSize:100,modifiedAt:1,publishAt:'2030-01-01T00:00:00Z',title:'Synthetic title',description:'Synthetic description',tags:['test'],categoryId:'10',quotaOperations:[{method:'videos.insert',count:1}],allowDuplicate:false,submittedAt:'2026-11-26T00:00:00Z'};

describe('upload queue preflight, isolated from YouTube',()=>{
 beforeEach(()=>{vi.resetModules();vi.resetAllMocks();h.job={id:'job-1',channelId:'channel-1',finalPath:'/test/video.mp4'};h.quota.mockReturnValue({reserved:false});h.applying.mockResolvedValue(null);h.metadataError.mockResolvedValue(null)});
 afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()});
 async function run(){const runtime=await import('./uploadQueueRuntime');const entry=runtime.enqueueUpload(spec);const result=await runtime.waitForUploadQueueEntries([entry.queueId]);return {runtime,result}}
 it('pauses without creating or deleting a resumable session, even on channel mismatch',async()=>{
  h.sessions.mockResolvedValue([{jobId:'job-1',channelId:'different',offset:42}]);
  const {runtime,result}=await run();
  expect(result[0].state).toBe('PAUSED');expect(runtime.uploadQueueSnapshot().paused[0].error).toContain('UPLOAD_QUEUE_RECOVERY_REQUIRED');
  expect(h.upload).not.toHaveBeenCalled();expect(h.cancel).not.toHaveBeenCalled();expect(h.sessions).toHaveBeenCalledTimes(1);
 });
 it.each([['unavailable',()=>h.sessions.mockRejectedValue(new Error('access denied'))],['malformed',()=>h.sessions.mockResolvedValue({})],['unknown record',()=>h.sessions.mockResolvedValue([{}])]])('pauses safely when session check is %s',async(_name,setup)=>{
  setup();const {result}=await run();expect(result[0].state).toBe('PAUSED');expect(result[0].error).toContain('UPLOAD_QUEUE_RECOVERY_CHECK_FAILED');expect(h.upload).not.toHaveBeenCalled();expect(h.cancel).not.toHaveBeenCalled();
 });
 it('does not block an unrelated session and proceeds to the next safety check',async()=>{
  h.sessions.mockResolvedValue([{jobId:'other',offset:42}]);const {result}=await run();expect(h.quota).toHaveBeenCalledTimes(1);expect(result[0].error).toContain('UPLOAD_QUEUE_QUOTA_RECHECK_FAILED');expect(h.upload).not.toHaveBeenCalled();expect(h.cancel).not.toHaveBeenCalled();
 });
 it('rejects malformed or expired scheduled dates before mutating the queue or job',async()=>{
  const runtime=await import('./uploadQueueRuntime');for(const publishAt of ['invalid','2000-01-01T00:00:00Z'])expect(()=>runtime.enqueueUpload({...spec,publishAt})).toThrow('UPLOAD_QUEUE_PUBLISH_AT_EXPIRED');expect(h.patch).not.toHaveBeenCalled();expect(h.sessions).not.toHaveBeenCalled();
 });
 it('keeps an expired paused entry intact on resume',async()=>{
  h.sessions.mockResolvedValue([{jobId:'job-1',offset:42}]);const {runtime}=await run();vi.useFakeTimers();vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
  const prior=runtime.uploadQueueSnapshot().paused[0];expect(runtime.resumePausedUpload('job-1')).toBe(false);expect(runtime.uploadQueueSnapshot().paused[0]).toEqual(prior);expect(h.cancel).not.toHaveBeenCalled();expect(h.upload).not.toHaveBeenCalled();expect(h.warning).toHaveBeenCalledTimes(1);
 });
 it('rechecks the date after waiting for metadata and before starting transfer',async()=>{
  h.sessions.mockResolvedValue([]);h.quota.mockReturnValue({reserved:true});h.job.folder='/test/project';let finish!:()=>void;h.write.mockImplementation(()=>new Promise<void>(r=>{finish=r}));
  const runtime=await import('./uploadQueueRuntime');const entry=runtime.enqueueUpload({...spec,metadataSource:'queue'});
  await vi.waitFor(()=>expect(h.write).toHaveBeenCalledTimes(1));vi.spyOn(Date,'now').mockReturnValue(Date.parse('2031-01-01T00:00:00Z'));finish();
  const [result]=await runtime.waitForUploadQueueEntries([entry.queueId]);expect(result.state).toBe('PAUSED');expect(result.error).toContain('UPLOAD_QUEUE_PUBLISH_AT_EXPIRED');expect(h.upload).not.toHaveBeenCalled();expect(h.cancel).not.toHaveBeenCalled();expect(h.failAttempt).toHaveBeenCalledTimes(1);expect(h.applying).toHaveBeenCalledTimes(1);expect(h.metadataError).toHaveBeenCalledWith('channel-1','job-1',expect.stringContaining('Дата публикации прошла'));
 });
 it('warns when an expired metadata reservation cannot be updated',async()=>{
  h.sessions.mockResolvedValue([]);h.quota.mockReturnValue({reserved:true});h.job.folder='/test/project';h.metadataError.mockRejectedValue(new Error('unavailable'));let finish!:()=>void;h.write.mockImplementation(()=>new Promise<void>(r=>{finish=r}));
  const runtime=await import('./uploadQueueRuntime');const entry=runtime.enqueueUpload({...spec,metadataSource:'queue'});await vi.waitFor(()=>expect(h.write).toHaveBeenCalledTimes(1));vi.spyOn(Date,'now').mockReturnValue(Date.parse('2031-01-01T00:00:00Z'));finish();
  const [result]=await runtime.waitForUploadQueueEntries([entry.queueId]);expect(result.state).toBe('PAUSED');expect(h.warning).toHaveBeenCalledWith('Не удалось обновить состояние метаданных',expect.any(String));expect(h.cancel).not.toHaveBeenCalled();expect(h.upload).not.toHaveBeenCalled();
 });
 it('preserves a newly created resumable record when the transfer rejects metadata',async()=>{
  h.sessions.mockResolvedValueOnce([]).mockResolvedValue([{jobId:'job-1',offset:42}]);h.quota.mockReturnValue({reserved:true});h.upload.mockRejectedValue(new Error('invalidTags'));
  const {result}=await run();expect(result[0].state).toBe('FAILED');expect(h.upload).toHaveBeenCalledTimes(1);expect(h.cancel).not.toHaveBeenCalled();
 });
 it('pauses if session state becomes unavailable after a failed transfer',async()=>{
  h.sessions.mockResolvedValueOnce([]).mockRejectedValue(new Error('access denied'));h.quota.mockReturnValue({reserved:true});h.upload.mockRejectedValue(new Error('invalidTags'));
  const {result}=await run();expect(result[0].state).toBe('PAUSED');expect(result[0].error).toContain('UPLOAD_QUEUE_RECOVERY_CHECK_FAILED');expect(h.upload).toHaveBeenCalledTimes(1);expect(h.cancel).not.toHaveBeenCalled();
 });
});
