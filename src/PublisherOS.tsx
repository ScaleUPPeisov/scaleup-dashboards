import React,{useEffect,useMemo,useRef,useState} from 'react';
import * as mammoth from 'mammoth';
import {api,type RenderFolderScanResult,type YoutubeUploadSession} from './api';
import {useApp} from './store';
import {parseMetadataFile,type ImportedMetadata} from './metadata';
import type {UploadHistoryRecord,VideoJob} from './types';
import {sortChannelsAlphabetically} from './channelSort';
import {mapThumbnailsToJobs,metadataCoverage,baseName} from './publishCenterCore';
import {metadataPublishAt,metadataRowForJob,resolvedUploadMetadata} from './publisherMetadata';
import {publisherVideoCapacity,quotaDelta} from './publisherQuota';
import {acquireChannelUploadLock,beginPublishAttempt,completePublishAttempt,completeStartedPublishAttempt,failPublishAttempt,failStartedPublishAttempt,isChannelUploadLocked,isYoutubeDailyUploadLimitError,releaseChannelUploadLock,safeDailyStatus} from './youtubePublishSafety';
import {isYoutubeQuotaError,planYoutubeQuota,releaseYoutubeQuotaReservation,reserveYoutubeQuota,subscribeYoutubeQuota,subscribeYoutubeQuotaClock,youtubeOperationActualCost,youtubeQuotaClockSnapshot,youtubeQuotaProjectIdentity,youtubeQuotaUsage,youtubeUploadQuotaState} from './youtubeQuota';
import {clearPublishWorkspace,loadActivePublishChannel,loadPublishWorkspace,saveActivePublishChannel,savePublishWorkspace,type PublishScheduleMode,type PublishWorkspaceDraft} from './publishWorkspaceState';
import {publisherKrasnoyarskIso,publisherScheduleDates} from './publisherSchedule';
import {PUBLISHER_TIMEZONE,recommendScheduleContinuation,resolvePublisherBatchSchedule} from './scheduleContinuation';
import {notifyError,notifyInfo,notifySuccess,notifyWarning} from './notificationCenter';
import {humanizeError} from './errorCenter';
import {removeSelectedPublishItems} from './publishRemoval';
import {appendErrorHistory} from './errorHistory';
import {batchFailureToast,type BatchFailure} from './errorPresentationPolicy';
import {canonicalSelectedJobs,publisherGlobalBlockReasons,publisherPreflightItems,publisherUploadButtonLabel} from './publisherRuntime';
import {classifyUploadState,clearStaleUploadLink,cleanupEligibleUpload,latestUploadRecord,markHistoryTrashed,nextProjectLifecycle,recordVerifiedUpload,successfulUploadForHash,updateUploadProcessing,updateUploadRemoteEvidence,uploadStateCounters,type CanonicalUploadState} from './storageLifecycle';
import {configureUploadQueue,enqueueUpload,waitForUploadQueueEntries} from './uploadQueueRuntime';
import {existingSyncIncompleteSummary,readAuthoritativeExistingSnapshot,replaceExistingCacheFromSync} from './channelSchedule';
import {journal} from './activityJournalRuntime';
import {buildLegacyRecoveryPreview,canRefreshCurrentGenerationEvidence,classifyChannelRenderFiles,crossChannelScanRecoveryJobs,normalizeRenderPath,planRenderScanImport,summarizeRenderScan,type LegacyRecoveryPreview,type RenderScanRow,type RenderScanSummary} from './renderScanClassifier';
import {completeTask,ensureTask,failTask,startTask,updateTask} from './taskEngine';
import {ModalPortal} from './ModalPortal';
import {cleanupCandidateBytes,cleanupCandidateIds,confirmedCleanupCandidates,latestChannelUploadBatchId,postUploadCleanupEligible} from './postUploadCleanup';

const status=(j:VideoJob)=>j.status==='READY_UPLOAD'?'В ОЧЕРЕДИ':j.status==='UPLOADING'?'ЗАГРУЖАЕТСЯ':j.status==='SCHEDULED'?'YOUTUBE ✓':j.status==='ERROR'?'ОШИБКА':j.status;
const pct=(a:number,b:number)=>b?Math.min(100,Math.max(0,a/b*100)):0;
const scheduleDateTimeLabel=(iso?:string)=>iso?new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Krasnoyarsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):'—';
type RemoveRequest={ids:string[];label:string;cleanupMode?:'batch'|'channel'};
type VideoFilter='new'|'youtube'|'processing'|'verify'|'errors'|'all';
type RenderScanPreview={result:RenderFolderScanResult;rows:RenderScanRow[];summary:RenderScanSummary;scannedAt:string;importReport?:{requested:number;added:number;skipped:number;alreadyKnown:number;errors:number;details:string[]}};
type DryRunReport={at:string;ready:number;blocked:number;videosInsert:0;youtubeApiRequests:0;rows:Array<{jobId:string;number:number;ok:boolean;issues:string[]}>};
type RenderSourceAvailability='ONLINE'|'OFFLINE'|'MISSING'|'UNKNOWN';
const errorUploadStates=new Set<CanonicalUploadState>(['UPLOAD_FAILED','PROCESSING_FAILED','REJECTED','REMOTE_MISSING','SOURCE_MISSING']);

export function PublisherOS(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),patchJob=useApp(s=>s.patchJob),addJobs=useApp(s=>s.addJobs),updateChannel=useApp(s=>s.updateChannel),settings=useApp(s=>s.settings),log=useApp(s=>s.log),uploadHistory=useApp(s=>s.uploadHistory),fingerprintCache=useApp(s=>s.fingerprintCache),projectLifecycle=useApp(s=>s.projectLifecycle),replaceUploadHistory=useApp(s=>s.replaceUploadHistory),cacheFingerprint=useApp(s=>s.cacheFingerprint),patchProjectLifecycle=useApp(s=>s.patchProjectLifecycle);
 const orderedChannels=useMemo(()=>sortChannelsAlphabetically(channels.filter(c=>c.enabled)),[channels]);
 const initialActive=loadActivePublishChannel();const first=orderedChannels.some(c=>c.id===initialActive)?initialActive:(orderedChannels[0]?.id||'');
 const [channelId,setChannelId]=useState(first),[draft,setDraft]=useState<PublishWorkspaceDraft>(()=>loadPublishWorkspace(first)),[busy,setBusy]=useState(false),[fingerprints,setFingerprints]=useState<Record<string,{fingerprint:string;size:number;modifiedAt:number}>>({}),[sessions,setSessions]=useState<YoutubeUploadSession[]>([]),[quotaRev,setQuotaRev]=useState(0),[clock,setClock]=useState(()=>youtubeQuotaClockSnapshot()),[removeRequest,setRemoveRequest]=useState<RemoveRequest|null>(null),[videoFilter,setVideoFilter]=useState<VideoFilter>('new'),[renderScanBusy,setRenderScanBusy]=useState(false),[renderScan,setRenderScan]=useState<RenderScanPreview|null>(null),[legacyRecoveryPreview,setLegacyRecoveryPreview]=useState<LegacyRecoveryPreview|null>(null),[lastQuotaReport,setLastQuotaReport]=useState<{plannedGeneral:number;actualGeneral:number;plannedUploads:number;actualUploads:number;remainingGeneral:number;remainingUploads:number|null}|null>(null),[quotaProjectKey,setQuotaProjectKey]=useState(''),[quotaProjectLabel,setQuotaProjectLabel]=useState('Не удалось определить API-проект для квоты');
 const [scheduleStartMode,setScheduleStartMode]=useState<'continue'|'manual'>('continue');
 const [scheduleSync,setScheduleSync]=useState<{state:'idle'|'loading'|'ready'|'error';lastScheduled?:string;suggestedStart?:string;note?:string;futureCount:number;occupied:string[];timezone:string}>({state:'idle',futureCount:0,occupied:[],timezone:PUBLISHER_TIMEZONE});
 const docInput=useRef<HTMLInputElement>(null);const channel=channels.find(c=>c.id===channelId),profileId=channel?.youtubeProfileId||'',channelRenderFolder=(channel?.renderFolderPath||'').trim(),channelProjectsFolder=(channel?.projectsFolderPath||'').trim();
 const [folderDiscoveryBusy,setFolderDiscoveryBusy]=useState(false),[dryRunBusy,setDryRunBusy]=useState(false),[dryRunReport,setDryRunReport]=useState<DryRunReport|null>(null),[sourceAvailability,setSourceAvailability]=useState<RenderSourceAvailability>(channelRenderFolder?'UNKNOWN':'MISSING');
 const recoveryJobs=useMemo(()=>channelRenderFolder?crossChannelScanRecoveryJobs(jobs,uploadHistory,channelId,channelRenderFolder):[],[jobs,uploadHistory,channelId,channelRenderFolder]);
 const recoveryJobIds=useMemo(()=>new Set(recoveryJobs.map(j=>j.id)),[recoveryJobs]);
 const setDraftPatch=(p:Partial<PublishWorkspaceDraft>)=>setDraft(d=>savePublishWorkspace(channelId,{...d,...p}));
 const supersededJobIds=useMemo(()=>new Set(jobs.filter(j=>j.channelId===channelId&&j.sourcePreviousJobId).map(j=>j.sourcePreviousJobId!)),[jobs,channelId]);
 const currentPhysicalPaths=useMemo(()=>new Set(sourceAvailability==='ONLINE'&&renderScan?renderScan.result.files.map(f=>normalizeRenderPath(f.path)):[]),[sourceAvailability,renderScan]);
 const allChannelJobs=useMemo(()=>sourceAvailability==='ONLINE'?jobs.filter(j=>j.channelId===channelId&&j.sourceOrigin==='render-scan'&&Boolean(j.finalPath)&&currentPhysicalPaths.has(normalizeRenderPath(j.finalPath||''))&&!j.removedFromPublishList&&!recoveryJobIds.has(j.id)&&!supersededJobIds.has(j.id)&&!j.youtubeVideoId&&!j.uploadedAt&&j.storageLifecycle!=='UPLOADED'&&j.status!=='SCHEDULED'&&['READY_UPLOAD','UPLOADING','ERROR'].includes(j.status)).sort((a,b)=>a.number-b.number):[],[jobs,channelId,recoveryJobs,supersededJobIds,sourceAvailability,currentPhysicalPaths]);
 const uploadStateById=useMemo(()=>new Map(allChannelJobs.map(j=>[j.id,classifyUploadState(j,uploadHistory)] as const)),[allChannelJobs,uploadHistory]);
 const stateOf=(j:VideoJob)=>uploadStateById.get(j.id)||classifyUploadState(j,uploadHistory);
 const selectableJobs=useMemo(()=>allChannelJobs.filter(j=>uploadStateById.get(j.id)==='NEW'&&!recoveryJobIds.has(j.id)),[allChannelJobs,uploadStateById,recoveryJobIds]);
 const selectableJobIds=useMemo(()=>new Set(selectableJobs.map(j=>j.id)),[selectableJobs]);
 const channelJobs=useMemo(()=>allChannelJobs.filter(j=>{const st=uploadStateById.get(j.id);if(videoFilter==='all')return true;if(videoFilter==='new')return st==='NEW';if(videoFilter==='youtube')return st==='READY'||st==='UPLOAD_ACCEPTED';if(videoFilter==='processing')return st==='YOUTUBE_PROCESSING'||st==='QUEUED'||st==='UPLOADING';if(videoFilter==='verify')return st==='VERIFY_REQUIRED';return Boolean(st&&errorUploadStates.has(st))}),[allChannelJobs,uploadStateById,videoFilter]);
 const selected=canonicalSelectedJobs(selectableJobs,draft.selectedIds),thumbMap=useMemo(()=>mapThumbnailsToJobs(selected,draft.thumbs),[selected.map(j=>j.id).join('|'),draft.thumbs.join('|')]);
 const thumbnailsEnabled=draft.thumbs.length>0,selectedThumbnail=(j:VideoJob)=>thumbnailsEnabled?(thumbMap[j.id]||j.thumbnailPath||''):'';
 const thumbCount=thumbnailsEnabled?selected.filter(j=>Boolean(selectedThumbnail(j))).length:0,missingThumbs=thumbnailsEnabled?Math.max(0,selected.length-thumbCount):0,coverage=metadataCoverage(draft.rows,selected.length),daily=safeDailyStatus(channelId,channel?.safeDailyUploadLimit),duplicates=selected.filter(j=>fingerprints[j.id]&&successfulUploadForHash(uploadHistory,fingerprints[j.id].fingerprint,channelId,fingerprints[j.id].size));
 const channelDefaultTime=`${String(channel?.publishHour??18).padStart(2,'0')}:${String(channel?.publishMinute??0).padStart(2,'0')}`,scheduleTime=draft.scheduleTime||channelDefaultTime,scheduleStart=scheduleStartMode==='continue'?(scheduleSync.suggestedStart||''):draft.scheduleStartDate;
 const scheduleFallbackIso=scheduleStart?publisherKrasnoyarskIso(scheduleStart,scheduleTime):undefined;
 const filePublishAts=selected.map((j,i)=>{const row=metadataRowForJob(draft.rows,j,i),fallback=row?.publishTime&&!row?.publishAt?scheduleFallbackIso:j.publishAt;return metadataPublishAt(row,fallback)});
 const scheduleResolution=useMemo(()=>resolvePublisherBatchSchedule({mode:draft.scheduleMode,startDate:scheduleStart,time:scheduleTime,count:selected.length,filePublishAts,occupied:scheduleSync.state==='ready'?scheduleSync.occupied:[],fallbackIntervalDays:Math.max(1,channel?.publishIntervalDays||channel?.cadenceDays||1)}),[draft.scheduleMode,scheduleStart,scheduleTime,selected.map(j=>`${j.id}:${j.publishAt||''}`).join('|'),JSON.stringify(draft.rows),scheduleSync.state,scheduleSync.occupied.join('|'),channel?.publishIntervalDays,channel?.cadenceDays]);
 const scheduleDates=scheduleResolution.items.map(x=>x.publishAt),schedulePreview={count:scheduleResolution.dates.length,first:scheduleResolution.dates[0],last:scheduleResolution.dates.at(-1),dates:scheduleResolution.dates};
 const effectivePublishAt=(j:VideoJob)=>scheduleDates[selected.findIndex(x=>x.id===j.id)],publishRepair=(j:VideoJob)=>{const x=scheduleResolution.items[selected.findIndex(v=>v.id===j.id)];return{status:x?.status==='MISSING'?'SKIPPED_PAST_DATE':x?.status==='RESCHEDULED'?'RESCHEDULED':'UNCHANGED',publishAt:x?.publishAt} as const};
 const recovery=sessions.filter(x=>allChannelJobs.some(j=>j.id===x.jobId)),preflight=publisherPreflightItems(selected,{getPublishAt:effectivePublishAt,getPastRepairStatus:j=>publishRepair(j).status,safeMode:settings.youtubePublishSafeMode,duplicateIds:duplicates.map(x=>x.id),recoveryIds:recovery.map(x=>x.jobId),requireThumbnail:thumbnailsEnabled&&!draft.allowMissingThumbs,hasThumbnail:j=>Boolean(selectedThumbnail(j))}),uploadableSelected=selected.filter(j=>preflight.readyIds.includes(j.id)),blockedItems=preflight.blocked,uploadableThumbCount=thumbnailsEnabled?uploadableSelected.filter(j=>Boolean(selectedThumbnail(j))).length:0;
 const uploadQuota=youtubeUploadQuotaState(quotaProjectKey||null),quotaPlan=useMemo(()=>planYoutubeQuota([{method:'videos.insert',count:uploadableSelected.length,label:'Загрузка видео'},{method:'videos.list',count:uploadableSelected.length,label:'Проверка загрузки'},{method:'thumbnails.set',count:uploadableThumbCount,label:'Обложки'}],undefined,quotaProjectKey||undefined),[uploadableSelected.length,uploadableThumbCount,quotaRev,quotaProjectKey]),quota=youtubeQuotaUsage();
 const videoCapacity=publisherVideoCapacity(uploadQuota.remaining,daily.remaining,uploadableSelected.length);
 const stateCounts=uploadStateCounters(allChannelJobs,uploadHistory),newCount=selectableJobs.length,uploadedCount=stateCounts.ON_YOUTUBE,processingCount=stateCounts.PROCESSING,verifyCount=stateCounts.VERIFY_REQUIRED,errorCount=stateCounts.ERRORS;
 const latestCleanupBatchId=latestChannelUploadBatchId(uploadHistory,channelId);
 const batchCleanupRows=useMemo(()=>latestCleanupBatchId?confirmedCleanupCandidates(uploadHistory,jobs,channelId,latestCleanupBatchId):[],[uploadHistory,jobs,channelId,latestCleanupBatchId]);
 const channelCleanupRows=useMemo(()=>confirmedCleanupCandidates(uploadHistory,jobs,channelId),[uploadHistory,jobs,channelId]);
 const uploadForJob=(jobId:string)=>latestUploadRecord(uploadHistory,jobId);
 const refreshSessions=()=>api.youtubeUploadSessions().then(setSessions).catch(()=>setSessions([]));
 useEffect(()=>{const off=subscribeYoutubeQuota(()=>setQuotaRev(x=>x+1)),offClock=subscribeYoutubeQuotaClock(setClock);void refreshSessions();return()=>{off();offClock()}},[]);
 useEffect(()=>{if(!channelId)return;saveActivePublishChannel(channelId);setDraft(loadPublishWorkspace(channelId));setFingerprints({});setRenderScan(null);setLegacyRecoveryPreview(null);setScheduleStartMode('continue');setScheduleSync({state:'idle',futureCount:0,occupied:[],timezone:PUBLISHER_TIMEZONE});void refreshSessions()},[channelId]);
 useEffect(()=>{let live=true;const check=async()=>{if(!channelRenderFolder){if(live){setSourceAvailability('MISSING');setRenderScan(null);setDraftPatch({selectedIds:[]})}return}try{const st=await api.localSourceStatus(channelRenderFolder);if(!live)return;if(st.exists&&!st.isFile){setSourceAvailability('ONLINE')}else{setSourceAvailability('OFFLINE');setRenderScan(null);setLegacyRecoveryPreview(null);setFingerprints({});setDraftPatch({selectedIds:[]})}}catch{if(live){setSourceAvailability('OFFLINE');setRenderScan(null);setLegacyRecoveryPreview(null);setFingerprints({});setDraftPatch({selectedIds:[]})}}};void check();const timer=window.setInterval(()=>void check(),5000);const onFocus=()=>void check();window.addEventListener('focus',onFocus);return()=>{live=false;window.clearInterval(timer);window.removeEventListener('focus',onFocus)}},[channelId,channelRenderFolder]);
 useEffect(()=>{if(!channel||!settings.workspace)return;if(channelRenderFolder&&channelProjectsFolder)return;void discoverChannelFolders(true)},[channelId,channel?.name,settings.workspace]);
 useEffect(()=>{let live=true;setQuotaProjectKey('');setQuotaProjectLabel('Не удалось определить API-проект для квоты');if(!profileId)return()=>{live=false};void Promise.all([api.youtubeProfiles(),api.youtubeGoogleConfig()]).then(([profiles,config])=>{if(!live)return;const identity=youtubeQuotaProjectIdentity(profiles.find(x=>x.id===profileId),config);setQuotaProjectKey(identity.projectKey||'');setQuotaProjectLabel(identity.label);setQuotaRev(x=>x+1)}).catch(()=>{if(live){setQuotaProjectKey('');setQuotaProjectLabel('Не удалось определить API-проект для квоты')}});return()=>{live=false}},[profileId]);
 useEffect(()=>{const valid=new Set(selectableJobs.map(j=>j.id));const next=draft.selectedIds.filter(id=>valid.has(id));if(next.length!==draft.selectedIds.length)setDraftPatch({selectedIds:next})},[selectableJobs.map(j=>`${j.id}:${j.status}:${j.youtubeVideoId||''}`).join('|')]);
 useEffect(()=>{let live=true;const targets=selected.filter(j=>j.finalPath&&!fingerprints[j.id]);if(!targets.length)return;void(async()=>{for(const j of targets){if(!live||!j.finalPath)break;try{const cache=fingerprintCache[j.finalPath],x=await api.youtubeFileFingerprint(j.finalPath,cache?{size:cache.size,mtimeMs:cache.mtimeMs,sha256:cache.sha256}:undefined);if(!live)break;cacheFingerprint(j.finalPath,{path:j.finalPath,size:x.size,mtimeMs:x.modifiedAt,sha256:x.fingerprint,computedAt:new Date().toISOString()});setFingerprints(prev=>({...prev,[j.id]:{fingerprint:x.fingerprint,size:x.size,modifiedAt:x.modifiedAt}}))}catch{}}})();return()=>{live=false}},[selected.map(x=>`${x.id}:${x.finalPath}`).join('|')]);
 async function readDoc(fl:FileList|null){if(!fl?.length)return;const out:ImportedMetadata[]=[];let strict=false;for(const f of Array.from(fl)){const isDocx=f.name.toLowerCase().endsWith('.docx');strict=strict||isDocx;const text=isDocx?(await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()})).value:await f.text();out.push(...parseMetadataFile(f.name,text))}out.sort((a,b)=>(a.number??Number.MAX_SAFE_INTEGER)-(b.number??Number.MAX_SAFE_INTEGER));setDraftPatch({rows:out,docx:strict});const c=metadataCoverage(out,selected.length);if(selected.length&&!c.ok)notifyWarning('Недостаточно метаданных',`Word: ${out.length} • выбрано видео: ${selected.length} • не хватает: ${c.missing}`);else{if(selected.length)applyLocalPreparation(out,selected,true);notifySuccess('Word-файл сохранён и применён локально',selected.length?`${out.length} записей • автоматически применено ${selected.length}${c.surplus?` • лишних ${c.surplus}`:''}`:`Распознано ${out.length}. После выбора видео метаданные применятся автоматически.`)}}
 function applyLocalPreparation(rows:ImportedMetadata[],targets:VideoJob[],silent=false){if(!targets.length)return;const haveRows=rows.length>=targets.length;if(rows.length&&!haveRows){if(!silent)notifyWarning('Недостаточно метаданных',`Word: ${rows.length} • видео: ${targets.length}`);return}const generated=publisherScheduleDates(draft.scheduleMode,scheduleStart,scheduleTime,targets.length);targets.forEach((j,i)=>{const x=haveRows?metadataRowForJob(rows,j,i):undefined;const p:Partial<VideoJob>={};if(x){p.metadataSource='import';p.metadataLocked=true;if(x.title)p.title=x.title;if(x.description)p.description=x.description;if(x.tags?.length)p.tags=x.tags}const fallback=scheduleStart?publisherKrasnoyarskIso(scheduleStart,scheduleTime):undefined;const nextTime=draft.scheduleMode==='file'?metadataPublishAt(x,x?.publishTime&&!x?.publishAt?fallback:j.publishAt):generated[i];if(nextTime)p.publishAt=nextTime;if(Object.keys(p).length){patchJob(j.id,p);if(j.folder)void api.writeJobMetadata(j.folder,p.title||j.title,p.description||j.description,p.tags||j.tags,p.publishAt||j.publishAt,x?'import':(j.metadataSource||'template'))}});if(!silent)notifySuccess('Метаданные подготовлены',`${targets.length} видео подготовлены локально.`)}
 useEffect(()=>{if(!selected.length)return;if((draft.rows.length>=selected.length&&draft.rows.length>0)||draft.scheduleMode!=='file')applyLocalPreparation(draft.rows,selected,true)},[selected.map(j=>j.id).join('|'),JSON.stringify(draft.rows),draft.scheduleMode,scheduleStart,scheduleTime]);
 async function syncScheduleFromYoutube(){if(!profileId){notifyWarning('Синхронизация недоступна','Подключите YouTube OAuth для этого канала.');return}setScheduleSync(x=>({...x,state:'loading'}));try{const r=await api.youtubeListExisting(profileId,1000);replaceExistingCacheFromSync(channelId,r.videos||[],r);const scheduleComplete=r.scheduleComplete??(r.complete&&!r.draftCandidateCount);let source=r.videos||[],sourceNote='';if(!scheduleComplete){const reasons=existingSyncIncompleteSummary(r),snapshot=readAuthoritativeExistingSnapshot(channelId),at=snapshot?.updatedAt?Date.parse(snapshot.updatedAt):NaN,ageMs=Number.isFinite(at)?Date.now()-at:Number.POSITIVE_INFINITY,fresh=Boolean(snapshot?.videos.length)&&ageMs>=0&&ageMs<=15*60*1000;if(fresh&&snapshot){source=snapshot.videos;sourceNote=`Текущая проверка неполная: ${reasons.join(' • ')}. Расписание рассчитано по последней полной синхронизации ${new Date(snapshot.updatedAt!).toLocaleString('ru-RU')}.`}else{const note=`Синхронизация канала неполная: ${reasons.join(' • ')}`;setScheduleSync(x=>({...x,state:'error',note}));notifyWarning('Синхронизация канала неполная',`${reasons.join(' • ')}. Откройте «Загруженные» → «Проверить недостающие»; полный inventory повторно читать не требуется, если известны missing IDs.`);return}}const plan=recommendScheduleContinuation(source,draft.scheduleMode,scheduleTime,new Date()),note=sourceNote||(plan.lastPublishAt?'Продолжаем после последней отложенной публикации YouTube':'Будущих отложенных публикаций нет — выбрана ближайшая безопасная дата');setScheduleSync({state:'ready',lastScheduled:plan.lastPublishAt,suggestedStart:plan.recommendedStart,note,futureCount:plan.futureCount,occupied:plan.occupied,timezone:plan.timezone});if(sourceNote)notifyWarning('Использован последний полный snapshot',sourceNote);else notifySuccess('Расписание синхронизировано',plan.lastPublishAt?`Последняя дата на YouTube: ${scheduleDateTimeLabel(plan.lastPublishAt)}. Рекомендуемое начало: ${plan.recommendedStart}.`:`Будущих scheduled-видео нет. Рекомендуемое начало: ${plan.recommendedStart}.`)}catch(e){const h=humanizeError(e,'youtube');setScheduleSync(x=>({...x,state:'error',note:h.message}));notifyError(h.title,h.message,{technicalDetail:h.detail})}}
 async function chooseThumbnails(){const x=await api.chooseImages();if(x.length){const mapped=mapThumbnailsToJobs(selected,x);for(const j of selected)if(mapped[j.id])patchJob(j.id,{thumbnailPath:mapped[j.id]});setDraftPatch({thumbs:x,allowMissingThumbs:false});notifySuccess('Обложки сохранены',`${x.length} изображений сопоставлены с выбранными видео.`)}}
 async function removeReady(ids:string[],deleteFromDisk:boolean){
   const wanted=[...new Set(ids)],all=useApp.getState().jobs;
   const targets=all.filter(j=>wanted.includes(j.id)&&j.channelId===channelId&&j.status!=='UPLOADING');
   if(!targets.length){setRemoveRequest(null);notifyInfo('Действие недоступно','Загружающееся видео нельзя перемещать или скрывать до завершения transfer.');return}
   if(!deleteFromDisk){for(const j of targets){patchJob(j.id,{removedFromPublishList:true});await api.youtubeCancelUploadSession(j.id).catch(()=>undefined)}const repaired=removeSelectedPublishItems(draft.selectedIds,selected.map(x=>x.id),draft.rows,targets.map(x=>x.id));setDraftPatch({selectedIds:repaired.selectedIds,rows:repaired.rows});setRemoveRequest(null);notifySuccess('Видео убраны из списка',`${targets.length} видео • физические файлы и upload history не изменены.`);return}
   const allowedRoots=[channelRenderFolder,channelProjectsFolder].filter((x,i,a)=>Boolean(x)&&a.indexOf(x)===i),operationId=`publisher-cleanup:${channelId}:${Date.now()}`;
   setBusy(true);let moved=0,alreadyMissing=0,processing=0,changed=0,verification=0;const removed:string[]=[];
   try{
    let nextHistory=[...useApp.getState().uploadHistory];
    for(const j of targets){
     const proof=nextHistory.slice().reverse().find(x=>x.jobId===j.id&&x.status==='UPLOADED'&&Boolean(x.youtubeVideoId));
     if(!proof){verification++;continue}
     const idx=nextHistory.findIndex(x=>x.id===proof.id),at=new Date().toISOString();
     let local:{exists:boolean;isFile:boolean;path:string};
     try{local=await api.localSourceStatus(proof.localFilePath||j.finalPath||'')}catch{local={exists:false,isFile:false,path:proof.localFilePath||j.finalPath||''}}
     if(!local.exists||!local.isFile){
      alreadyMissing++;if(idx>=0)nextHistory[idx]={...nextHistory[idx],sourceLifecycle:'MISSING_LEGACY_UNKNOWN',sourceCheckedAt:at};patchJob(j.id,{removedFromPublishList:true});removed.push(j.id);
      journal({eventId:operationId+':missing:'+proof.id,eventType:'SOURCE_MISSING',status:'INFO',source:'LIVE_OPERATION',timestamp:at,operationId,batchId:operationId,channelId,channelName:channel?.name||channelId,profileId:proof.profileId,jobId:j.id,youtubeVideoId:proof.youtubeVideoId,localSourcePath:proof.localFilePath,details:{reason:'already absent; no filesystem action',filename:proof.originalFilename}});continue
     }
     if(idx>=0)nextHistory[idx]={...nextHistory[idx],sourceLifecycle:'PRESENT',sourceCheckedAt:at};
     const currentProof=idx>=0?nextHistory[idx]:proof;
     if(!postUploadCleanupEligible(currentProof,j)){if(currentProof.processingState==='PROCESSING_UNKNOWN'||currentProof.processingState==='PROCESSING_FAILED'||currentProof.processingState==='REJECTED')processing++;else verification++;continue}
     journal({eventId:operationId+':requested:'+proof.id,eventType:'SOURCE_TRASH_REQUESTED',status:'STARTED',source:'LIVE_OPERATION',timestamp:at,operationId,batchId:operationId,channelId,channelName:channel?.name||channelId,profileId:proof.profileId,jobId:j.id,youtubeVideoId:proof.youtubeVideoId,localSourcePath:proof.localFilePath,details:{filename:proof.originalFilename}});
     try{
      const p=await api.youtubeVideoProcessingStatus(proof.profileId!,proof.youtubeVideoId,`${operationId}:verify:${j.id}`);
      if((p.processingState!=='READY'&&p.processingState!=='YOUTUBE_PROCESSING')||!p.identityVerified){processing++;continue}
      const cache=useApp.getState().fingerprintCache[proof.localFilePath],fp=await api.youtubeFileFingerprint(proof.localFilePath,cache?{size:cache.size,mtimeMs:cache.mtimeMs,sha256:cache.sha256}:undefined);
      if(fp.fingerprint.toLowerCase()!==proof.sha256.toLowerCase()||fp.size!==proof.fileSize){changed++;if(idx>=0)nextHistory[idx]={...nextHistory[idx],sourceLifecycle:'SOURCE_CHANGED',sourceCheckedAt:new Date().toISOString()};continue}
      const trash=await api.trashLocalFile(proof.localFilePath,allowedRoots);
      if(!trash.trashed){if(trash.missing){alreadyMissing++;if(idx>=0)nextHistory[idx]={...nextHistory[idx],sourceLifecycle:'MISSING_LEGACY_UNKNOWN',sourceCheckedAt:new Date().toISOString()};patchJob(j.id,{removedFromPublishList:true});removed.push(j.id)}else verification++;continue}
      const trashedAt=new Date().toISOString();nextHistory=markHistoryTrashed(nextHistory,j.id,trashedAt,operationId);patchJob(j.id,{storageLifecycle:'TRASHED_BY_VYRON',removedFromPublishList:true});removed.push(j.id);moved++;
      journal({eventId:operationId+':trashed:'+proof.id,eventType:'SOURCE_TRASHED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:trashedAt,operationId,batchId:operationId,channelId,channelName:channel?.name||channelId,profileId:proof.profileId,jobId:j.id,youtubeVideoId:proof.youtubeVideoId,localSourcePath:proof.localFilePath,details:{filename:proof.originalFilename,permanentDelete:false}})
     }catch{verification++}
    }
    replaceUploadHistory(nextHistory);
    for(const id of removed)await api.youtubeCancelUploadSession(id).catch(()=>undefined);
    if(removed.length){const repaired=removeSelectedPublishItems(draft.selectedIds,selected.map(x=>x.id),draft.rows,removed);setDraftPatch({selectedIds:repaired.selectedIds,rows:repaired.rows});setFingerprints(prev=>{const next={...prev};for(const id of removed)delete next[id];return next})}
    if(moved)notifySuccess('Видео перемещены в Корзину',`${moved} файлов • permanent delete: NO.`,{operationId});
    const skipped=alreadyMissing+processing+changed+verification;if(skipped)notifyWarning('Очистка завершена с исключениями',`Уже отсутствуют: ${alreadyMissing} • YouTube не READY: ${processing} • source changed: ${changed} • verification: ${verification}. Одна сводка вместо CLEANUP_NOT_READY по каждому файлу.`,{operationId:operationId+':summary'});
   }finally{setRemoveRequest(null);setBusy(false);void refreshSessions();if(deleteFromDisk&&channelRenderFolder)void scanRenderFolder()}
  }
  async function fingerprintForJob(j:VideoJob){if(!j.finalPath)throw new Error('LOCAL_FILE_REQUIRED');const existing=fingerprints[j.id];if(existing)return existing;const cache=useApp.getState().fingerprintCache[j.finalPath];const x=await api.youtubeFileFingerprint(j.finalPath,cache?{size:cache.size,mtimeMs:cache.mtimeMs,sha256:cache.sha256}:undefined);cacheFingerprint(j.finalPath,{path:j.finalPath,size:x.size,mtimeMs:x.modifiedAt,sha256:x.fingerprint,computedAt:new Date().toISOString()});const fp={fingerprint:x.fingerprint,size:x.size,modifiedAt:x.modifiedAt};patchJob(j.id,{currentSourceFingerprint:x.fingerprint,currentSourceFileSize:x.size,currentSourceModifiedAt:x.modifiedAt,sourceGenerationKey:`${j.channelId}:${x.fingerprint}:${x.size}`});setFingerprints(prev=>({...prev,[j.id]:fp}));return fp}
 function persistVerifiedUpload(j:VideoJob,c:NonNullable<typeof channel>,videoId:string,fp:{fingerprint:string;size:number},overrideDuplicate=false,proofSource:'UPLOAD_TIME'|'UPLOAD_RESUME_TIME'='UPLOAD_TIME',uploadOperationId?:string,fingerprintCapturedAt=new Date().toISOString()){if(!j.finalPath)throw new Error('LOCAL_FILE_REQUIRED');const now=new Date().toISOString();const state=useApp.getState();const projectEntry=Object.entries(state.projectLifecycle).find(([,x])=>x.jobId===j.id);const nextHistory=recordVerifiedUpload(state.uploadHistory,{jobId:j.id,channelId:c.id,profileId:c.youtubeProfileId,youtubeChannelId:c.youtubeChannelId,youtubeVideoId:videoId,localFilePath:j.finalPath,originalFilename:baseName(j.finalPath),projectId:projectEntry?.[1].projectId,sourceProjectPath:projectEntry?.[1].projectPath,titleAtUpload:j.title,uploadedAt:now,fileSize:fp.size,sha256:fp.fingerprint,fingerprintProofSource:proofSource,fingerprintCapturedAt,sourceGenerationKeyAtUpload:`${j.channelId}:${fp.fingerprint}:${fp.size}`,uploadOperationId,proofSchemaVersion:1,publishAt:j.publishAt,overrideDuplicate,sourceLifecycle:'PRESENT',processingState:'UPLOAD_ACCEPTED',identityVerifiedAt:now});replaceUploadHistory(nextHistory);if(projectEntry){patchProjectLifecycle(projectEntry[0],nextProjectLifecycle(projectEntry[1],nextHistory))}patchJob(j.id,{status:'SCHEDULED',storageLifecycle:'UPLOADED',youtubeVideoId:videoId,uploadProgress:100,uploadedAt:now,uploadAcceptedAt:now,processingState:'UPLOAD_ACCEPTED',uploadInterruptedAt:undefined,currentSourceFingerprint:fp.fingerprint,currentSourceFileSize:fp.size,sourceGenerationKey:`${j.channelId}:${fp.fingerprint}:${fp.size}`});return now}
 async function resumeUpload(session:YoutubeUploadSession){
  const j=jobs.find(x=>x.id===session.jobId),c=j&&channels.find(x=>x.id===j.channelId);if(!j||!c?.youtubeProfileId){notifyWarning('Продолжение недоступно','Проект или OAuth канала больше не найден.');return}
  const lock=acquireChannelUploadLock(c.id);if(!lock){notifyWarning('Канал занят',`Для ${c.name} уже выполняется загрузка.`);return}setBusy(true);patchJob(j.id,{status:'UPLOADING',storageLifecycle:'UPLOADING',error:undefined});
  try{
   const resumeOperationId=session.operationId||`resume-upload:${j.id}:${Date.now()}`,fingerprintCapturedAt=new Date().toISOString(),fp=await fingerprintForJob(j),expectedHash=String(j.uploadFingerprint||'').trim().toLowerCase(),expectedSize=Number(j.currentSourceFileSize||session.total||0);
   if(!/^[a-f0-9]{64}$/i.test(expectedHash))throw new Error('UPLOAD_RESUME_SOURCE_PROOF_MISSING: original upload fingerprint is unavailable');
   if(expectedHash!==fp.fingerprint.toLowerCase()||expectedSize!==fp.size)throw new Error('UPLOAD_RESUME_SOURCE_CHANGED: current file no longer matches the source that started this resumable upload');
   const uploaded=await api.youtubeResumeUpload(j.id);if(!uploaded.videoId)throw new Error('UPLOAD_NEEDS_VERIFICATION: YouTube не вернул video ID');
   const acceptedAt=new Date().toISOString();patchJob(j.id,{youtubeVideoId:uploaded.videoId,uploadedAt:acceptedAt,uploadAcceptedAt:acceptedAt,uploadProgress:100,storageLifecycle:'UPLOADED',processingState:'UPLOAD_ACCEPTED'});
   if(uploaded.verified===false){const reason=uploaded.verificationError||'videos.list verification не подтверждена';const state=useApp.getState(),projectEntry=Object.entries(state.projectLifecycle).find(([,x])=>x.jobId===j.id),uncertain=recordVerifiedUpload(state.uploadHistory,{jobId:j.id,channelId:c.id,profileId:c.youtubeProfileId,youtubeChannelId:c.youtubeChannelId,youtubeVideoId:uploaded.videoId,localFilePath:j.finalPath!,originalFilename:baseName(j.finalPath!),projectId:projectEntry?.[1].projectId,sourceProjectPath:projectEntry?.[1].projectPath,titleAtUpload:j.title,uploadedAt:acceptedAt,fileSize:fp.size,sha256:fp.fingerprint,fingerprintProofSource:'UPLOAD_RESUME_TIME',fingerprintCapturedAt,sourceGenerationKeyAtUpload:`${j.channelId}:${fp.fingerprint}:${fp.size}`,uploadOperationId:resumeOperationId,proofSchemaVersion:1,publishAt:j.publishAt,overrideDuplicate:false,sourceLifecycle:'PRESENT',processingState:'PROCESSING_UNKNOWN',processingCheckedAt:acceptedAt,processingError:reason});replaceUploadHistory(uncertain);patchJob(j.id,{status:'ERROR',storageLifecycle:'UPLOADED',youtubeVideoId:uploaded.videoId,uploadedAt:acceptedAt,processingState:'PROCESSING_UNKNOWN',processingError:reason,error:`Видео уже получило YouTube ID ${uploaded.videoId}. Повторная загрузка заблокирована до проверки. ${reason}`,uploadInterruptedAt:undefined});appendErrorHistory('Загрузка требует проверки',`VIDEO_${String(j.number).padStart(3,'0')}: ${reason}`,reason,{errorCode:'UPLOAD_ACCEPTED_VERIFY_FAILED',videoId:uploaded.videoId,filePath:j.finalPath,stage:'verification',profileId:c.youtubeProfileId,channelId:c.id});return}
   completeStartedPublishAttempt(j.id,uploaded.videoId);persistVerifiedUpload(j,c,uploaded.videoId,fp,false,'UPLOAD_RESUME_TIME',resumeOperationId,fingerprintCapturedAt);
   try{
    const p=await api.youtubeVideoProcessingStatus(c.youtubeProfileId,uploaded.videoId,`resume-processing:${j.id}`),next=updateUploadProcessing(useApp.getState().uploadHistory,j.id,{processingState:p.processingState,processingCheckedAt:p.processingCheckedAt,processingStatus:p.processingStatus,processingError:p.processingFailureReason||p.rejectionReason||undefined,readyAt:p.processingState==='READY'?p.processingCheckedAt:undefined,identityVerifiedAt:p.processingCheckedAt});
    replaceUploadHistory(next);patchJob(j.id,{processingState:p.processingState,processingCheckedAt:p.processingCheckedAt,processingError:p.processingFailureReason||p.rejectionReason||undefined});const project=Object.entries(useApp.getState().projectLifecycle).find(([,x])=>x.jobId===j.id);if(project)patchProjectLifecycle(project[0],nextProjectLifecycle(project[1],next))
   }catch(e){patchJob(j.id,{processingState:'PROCESSING_UNKNOWN',processingError:String(e)})}
   let thumbError='';const thumb=selectedThumbnail(j);if(thumb){const op=`resume-thumb:${j.id}:${Date.now()}`,plan=planYoutubeQuota([{method:'thumbnails.set',count:1}]);if(plan.affordable&&reserveYoutubeQuota(op,plan)){try{await api.youtubeSetThumbnail(c.youtubeProfileId,uploaded.videoId,thumb,op);patchJob(j.id,{thumbnailPath:thumb})}catch(e){const h=humanizeError(e,'thumbnail');thumbError=h.message;notifyWarning(h.title,`VIDEO_${String(j.number).padStart(3,'0')}: ${h.message}`)}finally{releaseYoutubeQuotaReservation(op)}}else thumbError='Недостаточно general quota для thumbnail.set'}
   if(thumbError)patchJob(j.id,{error:thumbError});updateChannel(c.id,{lastUploadAt:new Date().toISOString(),knownUploadLimitState:'ok',lastDailyLimitError:undefined});setDraftPatch({selectedIds:draft.selectedIds.filter(id=>id!==j.id)});notifySuccess('Загрузка продолжена',`VIDEO_${String(j.number).padStart(3,'0')} получил YouTube videoId. Processing проверяется отдельно.`);log(`VIDEO_${String(j.number).padStart(3,'0')} восстановлено из resumable YouTube session`)
  }catch(e){
   const h=humanizeError(e,'upload'),current=useApp.getState().jobs.find(x=>x.id===j.id),accepted=current?.youtubeVideoId;
   patchJob(j.id,{status:'ERROR',storageLifecycle:accepted?'UPLOADED':'FAILED',error:accepted?`Видео уже найдено на YouTube (${accepted}). Сначала проверьте состояние; повторный upload не запускается. ${h.message}`:h.message,processingState:accepted?'PROCESSING_UNKNOWN':current?.processingState,processingError:accepted?h.message:current?.processingError,uploadInterruptedAt:new Date().toISOString()});notifyError(h.title,h.message,{technicalDetail:h.detail,operationId:`resume:${j.id}`})
  }finally{releaseChannelUploadLock(c.id,lock);setBusy(false);void refreshSessions()}
 }
 async function reconcileExistingUploads(targetJobIds?:string[]){
  if(!channel||!profileId){notifyWarning('Проверка недоступна','Для канала нет активного YouTube OAuth профиля.');return}
  const profile=(await api.youtubeProfiles()).find(x=>x.id===profileId),expectedChannelId=channel.youtubeChannelId;
  if(!profile?.channelId||!expectedChannelId||profile.channelId!==expectedChannelId){notifyWarning('Проверка заблокирована','OAuth профиль и ожидаемый YouTube Channel ID не совпадают. Video ID не очищаются и повторный upload не запускается.');return}
  const wanted=targetJobIds?new Set(targetJobIds):null,targets=allChannelJobs.filter(j=>Boolean(j.youtubeVideoId)&&(!wanted||wanted.has(j.id))&&(stateOf(j)==='VERIFY_REQUIRED'||stateOf(j)==='REMOTE_MISSING'||stateOf(j)==='YOUTUBE_PROCESSING'||stateOf(j)==='UPLOAD_ACCEPTED'));
  if(!targets.length){notifyInfo('Проверять нечего','Нет видео с сохранённым YouTube ID, требующих reconciliation.');return}
  const operationId=`youtube-reconcile:${channelId}:${Date.now()}`;setBusy(true);
  try{
   const result=await api.youtubeVideoProcessingStatusBatch(profileId,targets.map(j=>j.youtubeVideoId!),operationId),byId=new Map(result.rows.map(x=>[x.videoId,x])),checkedAt=new Date().toISOString();
   let remoteExists=0,ready=0,processing=0,missing=0,unknown=0,nextHistory=[...useApp.getState().uploadHistory];
   for(const j of targets){
    const videoId=j.youtubeVideoId!,row=byId.get(videoId),proof=latestUploadRecord(nextHistory,j.id);
    if(!row){unknown++;patchJob(j.id,{remoteExists:undefined,remoteCheckedAt:checkedAt,processingError:'REMOTE_STATUS_UNKNOWN'});continue}
    if(row.remoteExists===false){
     missing++;patchJob(j.id,{remoteExists:false,remoteCheckedAt:row.processingCheckedAt,identityVerifiedAt:undefined,processingState:'PROCESSING_UNKNOWN',processingCheckedAt:row.processingCheckedAt,processingError:'REMOTE_MISSING'});
     nextHistory=updateUploadRemoteEvidence(nextHistory,j.id,{remoteExists:false,remoteCheckedAt:row.processingCheckedAt,processingState:'PROCESSING_UNKNOWN',processingCheckedAt:row.processingCheckedAt,processingError:'REMOTE_MISSING'});
     journal({eventId:`${operationId}:missing:${j.id}`,eventType:'REMOTE_VIDEO_MISSING',status:'INFO',source:'LIVE_OPERATION',operationId,batchId:operationId,channelId,channelName:channel.name,profileId,jobId:j.id,youtubeVideoId:videoId,localSourcePath:j.finalPath,details:{videoId,expectedChannelId}});
     continue
    }
    if(row.remoteExists===true&&row.identityVerified){
     remoteExists++;if(row.processingState==='READY')ready++;else if(row.processingState==='YOUTUBE_PROCESSING')processing++;
     const processingError=row.processingFailureReason||row.rejectionReason||undefined;
     patchJob(j.id,{storageLifecycle:'UPLOADED',remoteExists:true,remoteCheckedAt:row.processingCheckedAt,identityVerifiedAt:row.processingCheckedAt,remotePrivacyStatus:row.privacyStatus||undefined,processingState:row.processingState,processingCheckedAt:row.processingCheckedAt,processingError,publishAt:row.publishAt||j.publishAt,error:undefined});
     if(proof)nextHistory=updateUploadRemoteEvidence(nextHistory,j.id,{remoteExists:true,remoteCheckedAt:row.processingCheckedAt,processingState:row.processingState,processingCheckedAt:row.processingCheckedAt,processingStatus:row.processingStatus,processingError,readyAt:row.processingState==='READY'?(proof.readyAt||row.processingCheckedAt):proof.readyAt,identityVerifiedAt:row.processingCheckedAt,publishAt:row.publishAt||proof.publishAt});
     // Remote existence proves only that the historical YouTube ID exists. Never fingerprint
     // today's bytes at a reused path and attach them to an old upload record.
     journal({eventId:`${operationId}:verified:${j.id}`,eventType:'REMOTE_VIDEO_VERIFIED',status:'SUCCESS',source:'LIVE_OPERATION',operationId,batchId:operationId,channelId,channelName:channel.name,profileId,jobId:j.id,youtubeVideoId:videoId,localSourcePath:j.finalPath,details:{videoId,processingState:row.processingState,privacyStatus:row.privacyStatus||'',publishAt:row.publishAt||''}});
    }else unknown++;
   }
   replaceUploadHistory(nextHistory);
   journal({eventId:`${operationId}:summary`,eventType:'RECONCILIATION_COMPLETED',status:unknown?'PARTIAL':'SUCCESS',source:'LIVE_OPERATION',operationId,batchId:operationId,channelId,channelName:channel.name,profileId,details:{checked:targets.length,remoteExists,ready,processing,missing,unknown,historyRepairs:0,videosInsertSent:0}});
   notifySuccess('Проверка YouTube завершена',`Проверено: ${targets.length} • доступны: ${remoteExists} • готовы: ${ready} • обрабатываются: ${processing} • не найдены: ${missing} • неизвестно: ${unknown}.`,{operationId});
  }catch(e){
   const h=humanizeError(e,'youtube'),at=new Date().toISOString();for(const j of targets)patchJob(j.id,{remoteExists:undefined,remoteCheckedAt:at,processingError:`REMOTE_STATUS_UNKNOWN: ${h.message}`});
   journal({eventId:`${operationId}:failed`,eventType:'RECONCILIATION_COMPLETED',status:'FAILED',source:'LIVE_OPERATION',operationId,batchId:operationId,channelId,channelName:channel.name,profileId,errorCode:h.code,details:{checked:targets.length,remoteStatus:'UNKNOWN',videosInsertSent:0}});
   notifyWarning('Не удалось проверить YouTube',`${h.message} Сохранённые videoId оставлены без изменений; повторная загрузка заблокирована.`,{operationId});
  }finally{setBusy(false)}
 }
 function clearRemoteMissing(j:VideoJob){
  if(stateOf(j)!=='REMOTE_MISSING'||!j.youtubeVideoId)return;
  const ok=window.confirm(`VIDEO_${String(j.number).padStart(3,'0')}\n\nYouTube ID ${j.youtubeVideoId} не найден при авторизованной проверке. Очистить только активную связь VYRON и разрешить подготовку новой загрузки? История останется сохранена.`);
  if(!ok)return;const at=new Date().toISOString(),videoId=j.youtubeVideoId,next=clearStaleUploadLink(useApp.getState().uploadHistory,j.id,videoId,at,'REMOTE_MISSING_CONFIRMED');replaceUploadHistory(next);
  patchJob(j.id,{youtubeVideoId:undefined,uploadedAt:undefined,uploadAcceptedAt:undefined,storageLifecycle:'NEW',processingState:undefined,processingCheckedAt:undefined,processingError:undefined,remoteExists:undefined,remoteCheckedAt:undefined,identityVerifiedAt:undefined,remotePrivacyStatus:undefined,error:undefined,status:'READY_UPLOAD'});
  journal({eventId:`remote-link-cleared:${j.id}:${at}`,eventType:'REMOTE_LINK_CLEARED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:at,channelId:j.channelId,channelName:channel?.name,profileId,youtubeVideoId:videoId,jobId:j.id,localSourcePath:j.finalPath,details:{reason:'REMOTE_MISSING_CONFIRMED',explicitOperatorConfirmation:true}});
  notifyInfo('Устаревшая связь очищена',`VIDEO_${String(j.number).padStart(3,'0')} снова может быть подготовлено как новое. Старый YouTube ID сохранён в истории.`);
 }
 async function chooseChannelRenderFolder(){
  if(!channel)return;
  const selected=await api.chooseRenderFolder(channelRenderFolder||undefined);
  if(!selected)return;
  updateChannel(channel.id,{renderFolderPath:selected});
  setRenderScan(null);
  notifySuccess('Папка рендера сохранена',`${channel.name}: папка выбрана.`);
 }
 async function chooseChannelProjectsFolder(){
  if(!channel)return;
  const selected=await api.chooseProjectsFolder(channelProjectsFolder||undefined);
  if(!selected)return;
  updateChannel(channel.id,{projectsFolderPath:selected});
  notifySuccess('Папка проектов сохранена',`${channel.name}: папка выбрана.`);
 }
 async function discoverChannelFolders(silent=false){
  if(!channel||!settings.workspace)return;
  setFolderDiscoveryBusy(true);
  try{
   const found=await api.discoverChannelFolders(settings.workspace,channel.name),patch:Record<string,string>={};
   if(!channelRenderFolder&&found.render.length===1)patch.renderFolderPath=found.render[0];
   if(!channelProjectsFolder&&found.projects.length===1)patch.projectsFolderPath=found.projects[0];
   if(Object.keys(patch).length){updateChannel(channel.id,patch);setRenderScan(null)}
   const ambiguous=[found.render.length>1?'Render':'',found.projects.length>1?'Projects':''].filter(Boolean);
   if(ambiguous.length)notifyWarning('Найдено несколько папок',`${ambiguous.join(' + ')}: выберите нужную папку вручную. VYRON не будет угадывать.`);
   else if(!silent){if(Object.keys(patch).length)notifySuccess('Папки канала найдены',[patch.renderFolderPath&&`Render: ${patch.renderFolderPath}`,patch.projectsFolderPath&&`Projects: ${patch.projectsFolderPath}`].filter(Boolean).join(' • '));else notifyInfo('Автопоиск завершён','Новых однозначных папок не найдено. Существующие привязки не изменены.');}
  }catch(e){if(!silent){const h=humanizeError(e,'storage');notifyWarning('Не удалось найти папки канала',h.message)}}finally{setFolderDiscoveryBusy(false)}
 }
 async function autoDiscoverChannelRenderFolder(){
  if(!channel)return;
  const current=useApp.getState().jobs.filter(j=>j.channelId===channelId&&j.finalPath),counts=new Map<string,number>();
  for(const j of current){const parent=(j.finalPath||'').replace(/[\\/][^\\/]+$/,'');if(parent)counts.set(parent,(counts.get(parent)||0)+1)}
  const ranked=[...counts].sort((a,b)=>b[1]-a[1]),best=ranked[0],second=ranked[1];
  if(!best||best[1]<2||best[1]/Math.max(1,current.length)<0.8||(second&&second[1]===best[1])){
    notifyWarning('Автопоиск не дал однозначного результата','Нет единственной папки с сильным локальным evidence. Выберите папку вручную — VYRON не будет привязывать слабую догадку.');
    return
  }
  const st=await api.localSourceStatus(best[0]).catch(()=>null);
  if(!st?.exists||st.isFile){notifyWarning('Найденная папка недоступна',best[0]);return}
  const ok=window.confirm(`Найдена папка для ${channel.name}:\n\n${best[0]}\n\nИспользовать её как точную папку рендера этого канала?`);
  if(!ok)return;
  updateChannel(channel.id,{renderFolderPath:best[0]});
  setRenderScan(null);
  notifySuccess('Папка рендера привязана',`${channel.name} → ${best[0]}`);
 }
 async function fingerprintRenderEvidenceFiles(result:RenderFolderScanResult,current:VideoJob[],history:UploadHistoryRecord[],progress?:(done:number,total:number,name:string)=>void){
  const files=[] as RenderFolderScanResult['files'];let done=0;const total=result.files.length;
  for(const file of result.files){
   // Every current render gets SHA+size before upload eligibility is decided.
   // Current-file identity is local and consumes zero YouTube API quota.
   try{
    const cache=useApp.getState().fingerprintCache[file.path];
    const fp=await api.youtubeFileFingerprint(file.path,cache?{size:cache.size,mtimeMs:cache.mtimeMs,sha256:cache.sha256}:undefined);
    cacheFingerprint(file.path,{path:file.path,size:fp.size,mtimeMs:fp.modifiedAt,sha256:fp.fingerprint,computedAt:new Date().toISOString()});
    files.push({...file,size:fp.size,modifiedAt:fp.modifiedAt,fingerprint:fp.fingerprint});
   }catch{
    files.push(file)
   }
   done++;progress?.(done,total,file.name);
  }
  return{...result,files};
 }
 async function scanRenderFolder(){
  const root=channelRenderFolder,taskId=`render-scan:${channelId}`;
  if(!root){
    setRenderScan(null);
    notifyWarning('Папка рендера не настроена',`Выберите папку Render для ${channel?.name||'текущего канала'} или запустите автопоиск.`);
    return
  }
  setLegacyRecoveryPreview(null);
  const source=await api.localSourceStatus(root).catch(()=>null);
  if(!source?.exists||source.isFile){
    setSourceAvailability('OFFLINE');setRenderScan(null);setFingerprints({});setDraftPatch({selectedIds:[]});
    notifyWarning('Внешний диск недоступен','Подключите диск с папкой Render, чтобы продолжить работу с видео.',{operationId:`render-source-offline:${channelId}`});
    return
  }
  setSourceAvailability('ONLINE');
  ensureTask({taskId,type:'RENDER_SCAN',state:'QUEUED',channelId,channelName:channel?.name,label:'Скан Render',detail:root,progress:0,completed:0,total:0,resourceKey:`render-scan:${channelId}`});
  startTask(taskId,'Чтение папки рендера');
  setRenderScanBusy(true);
  try{
    const cheap=await api.scanRenderFolder(root),current=useApp.getState().jobs,history=useApp.getState().uploadHistory;
    updateTask(taskId,{total:cheap.files.length,completed:0,progress:cheap.files.length?0:100,detail:`Найдено физических файлов: ${cheap.files.length}`});
    const result=await fingerprintRenderEvidenceFiles(cheap,current,history,(done,total,name)=>updateTask(taskId,{completed:done,total,progress:total?done/total*100:100,detail:`Проверка identity: ${name}`}));
    const rows=classifyChannelRenderFiles(result.files,current,history,channelId,result.root),summary=summarizeRenderScan(rows);
    for(const row of rows){
      if(!row.matchedJobId||!row.currentFingerprint)continue;
      const matched=current.find(j=>j.id===row.matchedJobId);
      if(!matched||normalizeRenderPath(matched.finalPath||'')!==normalizeRenderPath(row.file.path))continue;
      // A scan observes the bytes currently occupying a path. It must never mutate the
      // identity of an already-uploaded historical generation. Otherwise VIDEO_001 + old
      // youtubeVideoId can silently inherit today's file hash and become permanently blocked.
      if(canRefreshCurrentGenerationEvidence(matched)){
       patchJob(matched.id,{currentSourceFingerprint:row.currentFingerprint,currentSourceFileSize:row.file.size,currentSourceModifiedAt:row.file.modifiedAt||undefined,sourceGenerationKey:`${channelId}:${row.currentFingerprint}:${row.file.size}`})
      }
    }
    if(result.root!==root&&channel)updateChannel(channel.id,{renderFolderPath:result.root});
    const bad=crossChannelScanRecoveryJobs(current,history,channelId,result.root);
    for(const j of current.filter(x=>x.channelId===channelId)){
      const flagged=bad.some(x=>x.id===j.id);
      if(flagged&&j.scanRecoveryState!=='CROSS_CHANNEL_SCAN_RECOVERY_REQUIRED')patchJob(j.id,{scanRecoveryState:'CROSS_CHANNEL_SCAN_RECOVERY_REQUIRED'});
      else if(!flagged&&j.scanRecoveryState)patchJob(j.id,{scanRecoveryState:undefined})
    }
    const scannedAt=new Date().toISOString(),scanPreview:RenderScanPreview={result,rows,summary,scannedAt};
    setRenderScan(scanPreview);
    // Current valid bytes become canonical NEW jobs immediately. Exact successful
    // same-channel SHA+size matches were classified as uploaded before this point.
    const currentCandidates=rows.filter(r=>r.classification==='NEW_CANDIDATE'||r.classification==='NEW_GENERATION');
    if(currentCandidates.length)materializeRenderGenerationRows(currentCandidates,false,scanPreview);
    journal({eventId:`render-scan:${channelId}:${scannedAt}`,eventType:'RENDER_FOLDER_SCANNED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:scannedAt,channelId,channelName:channel?.name,details:{folder:result.root,rootType:'CHANNEL_SPECIFIC',found:summary.TOTAL_CLASSIFIED_FILES,knownExact:summary.KNOWN_EXACT,uploadedLocalCopies:summary.UPLOADED_LOCAL_COPY,newCandidates:summary.NEW_CANDIDATE,newGenerations:summary.NEW_GENERATION,legacyIdentityUnproven:summary.LEGACY_IDENTITY_UNPROVEN,verifyRequired:summary.VERIFY_REQUIRED,ambiguous:summary.AMBIGUOUS,invalid:summary.INVALID,crossChannelRecovery:bad.length,truncated:result.truncated,youtubeApiRequests:0}});
    const newTotal=currentCandidates.length;
    const msg=`Найдено: ${summary.TOTAL_CLASSIFIED_FILES} • exact uploaded: ${summary.UPLOADED_LOCAL_COPY} • текущих кандидатов: ${newTotal} • invalid: ${summary.INVALID} • YouTube API: 0.`;
    completeTask(taskId,`${summary.TOTAL_CLASSIFIED_FILES} файлов • selectable candidates ${newTotal} • exact uploaded ${summary.UPLOADED_LOCAL_COPY}`);
    result.truncated?notifyWarning('Сканирование ограничено',`Найдено ${summary.TOTAL_CLASSIFIED_FILES} видео. Часть папки не прочитана.`,{operationId:taskId}):notifyInfo('Папка просканирована',`Найдено ${summary.TOTAL_CLASSIFIED_FILES} видео • можно загрузить ${newTotal}.`,{operationId:taskId})
  }catch(e){const h=humanizeError(e,'storage');failTask(taskId,h.message);notifyWarning('Не удалось просканировать папку рендера',h.message,{operationId:taskId})}
  finally{setRenderScanBusy(false)}
 }
 function materializeRenderGenerationRows(rows:RenderScanRow[],explicitLegacyOverride=false,scanOverride?:RenderScanPreview){
  const activeScan=scanOverride||renderScan;
  if(!activeScan||!channel||!rows.length)return;
  const current=useApp.getState().jobs.filter(j=>j.channelId===channelId),plan=planRenderScanImport(rows,current,new Set(recoveryJobs.map(j=>j.id))),created:VideoJob[]=[],details:string[]=[];
  const minTracks=Math.max(1,settings.tracksPerVideo||15);
  for(const row of plan.accepted){
    try{
      const file=row.file,n=row.sequence!,createdMs=file.createdAt||file.modifiedAt||Date.now(),folder=file.path.replace(/[\\/][^\\/]+$/,''),fp=row.currentFingerprint||file.fingerprint;
      const sourceGenerationKey=fp?`${channelId}:${fp}:${file.size}`:`${channelId}:${normalizeRenderPath(file.path)}:${file.size}:${file.modifiedAt||0}`;
      const previous=row.matchedJobId?current.find(j=>j.id===row.matchedJobId):undefined;
      const next:VideoJob={id:crypto.randomUUID(),channelId,number:n,folder,status:'READY_UPLOAD',createdAt:new Date(createdMs).toISOString(),tracksCount:minTracks,minTracks,finalPath:file.path,title:`VIDEO_${String(n).padStart(3,'0')}`,description:'',tags:[...(channel.seo.tags||[])],metadataSource:'template',storageLifecycle:'NEW',uploadProgress:0,sourceOrigin:'render-scan',currentSourceFingerprint:fp,currentSourceFileSize:file.size,currentSourceModifiedAt:file.modifiedAt||undefined,sourceGenerationKey,sourcePreviousJobId:previous?.id};
      created.push(next);
      // Historical uploaded generation remains immutable and visible as audit evidence.
    }catch(e){details.push(`${row.file.name}: ${String(e)}`)}
  }
  if(created.length){
    addJobs(created);
    setFingerprints(prev=>{const next={...prev};for(const j of created){if(j.currentSourceFingerprint&&j.currentSourceFileSize&&j.currentSourceModifiedAt!=null)next[j.id]={fingerprint:j.currentSourceFingerprint,size:j.currentSourceFileSize,modifiedAt:j.currentSourceModifiedAt}}return next});
    // New physical generations become usable immediately; owner selection stays explicit.
    setVideoFilter('new');
  }
  for(const j of created)journal({eventId:`local-video-discovered:${j.id}`,eventType:'LOCAL_VIDEO_DISCOVERED',status:'SUCCESS',source:'LIVE_OPERATION',channelId,channelName:channel.name,jobId:j.id,localSourcePath:j.finalPath,details:{videoNumber:j.number,evidence:explicitLegacyOverride?'explicit-new-generation-override':'fingerprint-generation-reconciliation',previousJobId:j.sourcePreviousJobId||'',currentFingerprint:j.currentSourceFingerprint||'',youtubeApiRequests:0}});
  const alreadyKnown=plan.skipped.filter(x=>x.reason==='ALREADY_KNOWN_PATH'||x.reason==='SEQUENCE_ALREADY_USED').length;
  const report={requested:rows.length,added:created.length,skipped:plan.skipped.length+details.length,alreadyKnown,errors:details.length,details:[...plan.skipped.map(x=>`${x.name}: ${x.reason}`),...details]};
  const nowJobs=[...current,...created],nextRows=classifyChannelRenderFiles(activeScan.result.files,nowJobs,useApp.getState().uploadHistory,channelId,activeScan.result.root);
  setRenderScan({...activeScan,rows:nextRows,summary:summarizeRenderScan(nextRows),importReport:report});
  notifySuccess('Локальные поколения добавлены',`Запрошено: ${report.requested} • добавлено: ${report.added} • пропущено: ${report.skipped} • уже известно: ${report.alreadyKnown} • ошибок: ${report.errors}. YouTube upload: 0.`)
 }
 function addScannedRenderCandidates(){
  if(!renderScan||!channel)return;
  const rows=renderScan.rows.filter(r=>r.classification==='NEW_CANDIDATE'||r.classification==='NEW_GENERATION');
  if(!rows.length)return;
  const replacements=rows.filter(r=>r.classification==='NEW_GENERATION').length;
  const ok=window.confirm(`Добавить ${rows.length} текущих физических видео в VYRON? Новых генераций по старым путям/номерам: ${replacements}. Исторические YouTube записи сохранятся. Загрузка на YouTube НЕ начнётся.`);
  if(!ok)return;
  materializeRenderGenerationRows(rows,false)
 }
 async function recheckRenderIdentity(row:RenderScanRow){
  if(!renderScan)return;
  setRenderScanBusy(true);
  try{
   const cache=useApp.getState().fingerprintCache[row.file.path],x=await api.youtubeFileFingerprint(row.file.path,cache?{size:cache.size,mtimeMs:cache.mtimeMs,sha256:cache.sha256}:undefined);
   cacheFingerprint(row.file.path,{path:row.file.path,size:x.size,mtimeMs:x.modifiedAt,sha256:x.fingerprint,computedAt:new Date().toISOString()});
   const files=renderScan.result.files.map(f=>normalizeRenderPath(f.path)===normalizeRenderPath(row.file.path)?{...f,size:x.size,modifiedAt:x.modifiedAt,fingerprint:x.fingerprint}:f);
   const current=useApp.getState().jobs,history=useApp.getState().uploadHistory,rows=classifyChannelRenderFiles(files,current,history,channelId,renderScan.result.root),summary=summarizeRenderScan(rows);
   const refreshed=rows.find(r=>normalizeRenderPath(r.file.path)===normalizeRenderPath(row.file.path));
   if(refreshed?.matchedJobId&&refreshed.currentFingerprint){
    const matched=current.find(j=>j.id===refreshed.matchedJobId);
    // Identity verification must never rewrite an already-uploaded/historical generation
    // with the bytes currently occupying the same path. Historical YouTube evidence stays
    // immutable; a changed physical file is materialized as a separate NEW_GENERATION.
    if(matched&&canRefreshCurrentGenerationEvidence(matched)&&normalizeRenderPath(matched.finalPath||'')===normalizeRenderPath(refreshed.file.path))patchJob(matched.id,{currentSourceFingerprint:refreshed.currentFingerprint,currentSourceFileSize:refreshed.file.size,currentSourceModifiedAt:refreshed.file.modifiedAt||undefined,sourceGenerationKey:`${channelId}:${refreshed.currentFingerprint}:${refreshed.file.size}`})
   }
   setRenderScan({...renderScan,result:{...renderScan.result,files},rows,summary});
   notifyInfo('Файл проверен',`${row.file.name}: состояние обновлено.`)
  }catch(e){notifyWarning('Не удалось проверить файл',humanizeError(e,'storage').message)}
  finally{setRenderScanBusy(false)}
 }
 async function bulkReconcileLegacyRenderRows(){
  if(!renderScan||!channel)return;
  const initial=renderScan.rows.filter(r=>r.classification==='VERIFY_REQUIRED'||r.classification==='LEGACY_IDENTITY_UNPROVEN');
  if(!initial.length){notifyInfo('Проверка не требуется','В текущем physical scan нет legacy-файлов, требующих fingerprint recovery.');return}
  const targetPaths=new Set(initial.map(r=>normalizeRenderPath(r.file.path)));
  setRenderScanBusy(true);setLegacyRecoveryPreview(null);
  try{
   const files=[...renderScan.result.files];let done=0,hashErrors=0;
   for(const row of initial){
    const idx=files.findIndex(x=>normalizeRenderPath(x.path)===normalizeRenderPath(row.file.path));
    if(idx<0){hashErrors++;continue}
    try{
     const current=files[idx],cache=useApp.getState().fingerprintCache[current.path];
     const fp=await api.youtubeFileFingerprint(current.path,cache?{size:cache.size,mtimeMs:cache.mtimeMs,sha256:cache.sha256}:undefined);
     cacheFingerprint(current.path,{path:current.path,size:fp.size,mtimeMs:fp.modifiedAt,sha256:fp.fingerprint,computedAt:new Date().toISOString()});
     files[idx]={...current,size:fp.size,modifiedAt:fp.modifiedAt,fingerprint:fp.fingerprint};
    }catch{hashErrors++}
    done++;
   }
   const currentJobs=useApp.getState().jobs,currentHistory=useApp.getState().uploadHistory;
   const rows=classifyChannelRenderFiles(files,currentJobs,currentHistory,channelId,renderScan.result.root),summary=summarizeRenderScan(rows);
   const recoveredRows=rows.filter(r=>targetPaths.has(normalizeRenderPath(r.file.path)));
   const preview=buildLegacyRecoveryPreview(recoveredRows,currentHistory,channelId);
   setRenderScan({...renderScan,result:{...renderScan.result,files},rows,summary});
   setLegacyRecoveryPreview(preview);
   notifyInfo('Legacy recovery preview готов',`Проверено: ${preview.total} • trusted new: ${preview.newGenerations.length} • legacy identity unproven: ${preview.legacyUnproven.length} • уже загружены точно: ${preview.uploadedExact.length} • дубликаты: ${preview.duplicates.length} • fingerprint ещё не доказан: ${preview.verifyRequired.length} • invalid/errors: ${preview.invalid.length+hashErrors}. YouTube upload: 0.`)
  }catch(e){notifyWarning('Не удалось выполнить bulk recovery',humanizeError(e,'storage').message)}
  finally{setRenderScanBusy(false)}
 }
 function confirmLegacyNewGenerations(){
  if(!legacyRecoveryPreview||!renderScan||!channel)return;
  const history=useApp.getState().uploadHistory,safe:RenderScanRow[]=[],blocked:string[]=[];
  for(const decision of legacyRecoveryPreview.legacyUnproven){
   const row=decision.row,fp=(row.currentFingerprint||row.file.fingerprint||'').trim().toLowerCase(),size=row.currentFileSize??row.file.size;
   if(!/^[a-f0-9]{64}$/i.test(fp)||!Number.isFinite(size)||size<=0){blocked.push(`${row.file.name}: current fingerprint/size not proven`);continue}
   const duplicate=successfulUploadForHash(history,fp,channelId,size);
   if(duplicate){blocked.push(`${row.file.name}: duplicate of ${duplicate.youtubeVideoId}`);continue}
   safe.push({...row,classification:'NEW_GENERATION',reason:'BULK_LEGACY_IDENTITY_CONFIRMED'});
  }
  if(blocked.length)notifyWarning('Часть файлов заблокирована повторной проверкой',blocked.slice(0,5).join(' • ')+(blocked.length>5?` • ещё ${blocked.length-5}`:''));
  if(!safe.length){notifyInfo('Новых поколений для подтверждения нет','Ни один файл не прошёл повторную проверку SHA-256 + size против same-channel successful history.');return}
  const ok=window.confirm(`Считать ${safe.length} текущих физических файлов новыми поколениями? Каждый SHA-256 + size уже повторно проверен против successful history этого канала. Старые YouTube ID и uploadHistory сохранятся. Загрузка на YouTube НЕ начнётся.`);
  if(!ok)return;
  materializeRenderGenerationRows(safe,true);
  setLegacyRecoveryPreview(null)
 }

 async function treatVerifyRowAsNewGeneration(row:RenderScanRow){
  if(!channel||!renderScan||(row.classification!=='VERIFY_REQUIRED'&&row.classification!=='LEGACY_IDENTITY_UNPROVEN'))return;
  let fp=row.currentFingerprint||row.file.fingerprint;
  if(!fp){
   try{
    const cache=useApp.getState().fingerprintCache[row.file.path],x=await api.youtubeFileFingerprint(row.file.path,cache?{size:cache.size,mtimeMs:cache.mtimeMs,sha256:cache.sha256}:undefined);
    fp=x.fingerprint;cacheFingerprint(row.file.path,{path:row.file.path,size:x.size,mtimeMs:x.modifiedAt,sha256:x.fingerprint,computedAt:new Date().toISOString()});
    row={...row,file:{...row.file,size:x.size,modifiedAt:x.modifiedAt,fingerprint:x.fingerprint},currentFingerprint:x.fingerprint,currentFileSize:x.size}
   }catch(e){notifyWarning('Не удалось проверить файл',humanizeError(e,'storage').message);return}
  }
  const duplicate=successfulUploadForHash(useApp.getState().uploadHistory,fp,channelId,row.currentFileSize??row.file.size);
  if(duplicate){notifyWarning('Текущий файл уже загружался на этот канал',`Fingerprint совпадает с YouTube ID ${duplicate.youtubeVideoId}. Новая генерация не создана.`);return}
  const ok=window.confirm('Старая YouTube-запись останется в истории. Текущий физический файл будет создан как НОВАЯ генерация и станет кандидатом на загрузку. Продолжить?');
  if(!ok)return;
  materializeRenderGenerationRows([{...row,classification:'NEW_GENERATION',reason:'EXPLICIT_LEGACY_IDENTITY_CONFIRMED'}],true)
 }
 function removeWrongScanJob(j:VideoJob){
  if(!window.confirm(`Убрать ошибочную запись VIDEO_${String(j.number).padStart(3,'0')} из публикации? Физический файл не будет изменён.`))return;
  patchJob(j.id,{removedFromPublishList:true,scanRecoveryState:undefined});
  notifyInfo('Ошибочная запись убрана','Изменены только метаданные VYRON. Файл не перемещён и не удалён.')
 }
 function rebindWrongScanJob(j:VideoJob){
  const name=window.prompt('Введите точное имя правильного локального канала для перепривязки файла:','');
  if(!name)return;
  const target=channels.find(c=>c.id!==channelId&&c.name.trim().toLowerCase()===name.trim().toLowerCase());
  if(!target){notifyWarning('Канал не найден','Имя должно точно совпадать с существующим локальным каналом VYRON.');return}
  patchJob(j.id,{channelId:target.id,scanRecoveryState:undefined});
  notifySuccess('Локальная запись перепривязана',`${j.finalPath||''} → ${target.name}. Физический файл не изменён.`)
 }
 async function runDryRun(){
  if(dryRunBusy)return;
  if(!channel||!profileId){notifyWarning('Проверка готовности','Для канала не найдено активное подключение YouTube.');return}
  if(!selected.length){notifyWarning('Проверка готовности','Выберите хотя бы одно новое видео.');return}
  setDryRunBusy(true);setDryRunReport(null);
  try{
   const states=await api.youtubeOauthCredentialStates().catch(()=>null),credential=states?.profiles?.find(x=>x.profileUuid===profileId),rows:DryRunReport['rows']=[];
   for(let i=0;i<selected.length;i++){
    const j=selected[i],issues:string[]=[];
    try{
     if(!j.finalPath)issues.push('LOCAL_FILE_REQUIRED');
     else{
      const source=await api.localSourceStatus(j.finalPath);
      if(!source.exists||!source.isFile)issues.push('SOURCE_MISSING');
      const fp=await fingerprintForJob(j);
      if(source.size!=null&&Number(source.size)!==fp.size)issues.push('SOURCE_CHANGED_DURING_PREFLIGHT');
      if(successfulUploadForHash(useApp.getState().uploadHistory,fp.fingerprint,channelId,fp.size))issues.push('DUPLICATE_FINGERPRINT');
     }
    }catch(e){issues.push(humanizeError(e,'storage').code||'FINGERPRINT_FAILED')}
    const pre=preflight.items.find(x=>x.id===j.id);if(pre)issues.push(...pre.issues.map(x=>x.code));
    if(credential?.credentialState!=='READY')issues.push('OAUTH_NOT_READY');
    const publishAt=effectivePublishAt(j);if(!publishAt)issues.push('PUBLISH_AT_REQUIRED');else if(Date.parse(publishAt)<=Date.now())issues.push('PUBLISH_AT_NOT_FUTURE');
    if(thumbnailsEnabled&&!draft.allowMissingThumbs&&!selectedThumbnail(j))issues.push('THUMBNAIL_REQUIRED');
    rows.push({jobId:j.id,number:j.number,ok:issues.length===0,issues:[...new Set(issues)]})
   }
   if(!quotaPlan.affordable)for(const row of rows)if(!row.issues.includes('QUOTA_INSUFFICIENT')){row.issues.push('QUOTA_INSUFFICIENT');row.ok=false}
   if(daily.remaining!=null&&rows.filter(x=>x.ok).length>daily.remaining){let allowance=daily.remaining;for(const row of rows){if(!row.ok)continue;if(allowance>0){allowance--;continue}row.ok=false;row.issues.push('CHANNEL_24H_LIMIT')}}
   const report:DryRunReport={at:new Date().toISOString(),ready:rows.filter(x=>x.ok).length,blocked:rows.filter(x=>!x.ok).length,videosInsert:0,youtubeApiRequests:0,rows};
   setDryRunReport(report);
   if(report.blocked)notifyWarning('Нужно исправить перед загрузкой',`Готово: ${report.ready} • требуют внимания: ${report.blocked}.`);
   else notifySuccess('Локальная проверка пройдена',`${report.ready} видео готовы к следующему шагу.`);
  }finally{setDryRunBusy(false)}
 }
 async function runBatch(requested?:number){
  log(`[UPLOAD_QUEUE] submit clicked channel=${channelId} selected=${selected.length} ready=${uploadableSelected.length}`);
  if(!channel||!profileId){notifyWarning('Загрузка недоступна','Для канала не найден активный YouTube OAuth профиль.');return}
  if(sourceAvailability!=='ONLINE'){notifyWarning('Внешний диск недоступен','Подключите диск с текущими видео и повторите сканирование.');return}
   if(draft.scheduleMode!=='file'&&scheduleStartMode==='continue'&&scheduleSync.state!=='ready'){notifyWarning('Сначала синхронизируйте расписание','Для режима «Продолжить расписание канала» нужна актуальная синхронизация.');return}
  if(blockedItems.length){for(const x of blockedItems){const j=selected.find(v=>v.id===x.id),message=`VIDEO_${String(x.number).padStart(3,'0')}: ${x.issues.map(i=>i.message).join(' • ')}`,pastOnly=x.issues.every(i=>i.code==='SKIPPED_PAST_DATE');if(j)patchJob(j.id,pastOnly?{error:'SKIPPED_PAST_DATE'}:{error:message});if(pastOnly)log(`[SCHEDULE] VIDEO_${String(x.number).padStart(3,'0')} SKIPPED_PAST_DATE`);else appendErrorHistory('Pre-flight: видео пропущено',message,x.issues.map(i=>i.code).join(','),{errorCode:x.issues[0]?.code,videoId:x.id,filePath:j?.finalPath,stage:'preflight'})}notifyWarning('Часть видео пропущена',`${blockedItems.length} видео не прошли pre-flight. Остальные ${uploadableSelected.length} можно поставить в очередь.`)}
  let batch=uploadableSelected.slice(0,requested||uploadableSelected.length);if(daily.remaining!=null)batch=batch.slice(0,daily.remaining);
  if(!batch.length){notifyWarning('Загрузка заблокирована',recovery.length?'Сначала продолжите или отмените сохранённую resumable session.':'По вашему безопасному 24h лимиту сейчас нельзя ставить новые видео в очередь.');return}
  configureUploadQueue(settings.youtubeUploadConcurrency||2,settings.youtubeUploadPerChannelConcurrency||1);setBusy(true);const batchId=`upload-batch:${channelId}:${Date.now()}`,queued:string[]=[],queueIds:string[]=[],failed:string[]=[];
  try{
   for(const j of batch){try{
    if(!j.finalPath)throw new Error('LOCAL_FILE_REQUIRED');const liveFile=await api.localSourceStatus(j.finalPath);if(!liveFile.exists||!liveFile.isFile)throw new Error('LOCAL_FILE_REQUIRED: файл сейчас недоступен');const fp=await fingerprintForJob(j),selectedIndex=selected.findIndex(x=>x.id===j.id),row=metadataRowForJob(draft.rows,j,Math.max(0,selectedIndex)),publishAt=effectivePublishAt(j);if(!publishAt)throw new Error('PUBLISH_AT_REQUIRED: дата публикации отсутствует');const payload=resolvedUploadMetadata(j,row,publishAt,settings.youtubeCategoryId),projectEntry=Object.values(useApp.getState().projectLifecycle).find(x=>x.jobId===j.id),thumbnailPath=selectedThumbnail(j)||undefined;
    patchJob(j.id,{title:payload.title,description:payload.description,tags:payload.tags,publishAt:payload.publishAt,metadataSource:row?'import':j.metadataSource,metadataLocked:row?true:j.metadataLocked,error:undefined});
    const queueEntry=enqueueUpload({jobId:j.id,batchId,projectId:projectEntry?.projectId,localVideoIdentity:`${channelId}:${j.id}:${fp.fingerprint}`,videoNumber:j.number,channelId:channel.id,channelName:channel.name,profileId,youtubeChannelId:channel.youtubeChannelId,filePath:j.finalPath,fingerprint:fp.fingerprint,fileSize:fp.size,modifiedAt:fp.modifiedAt,publishAt:payload.publishAt!,title:payload.title,description:payload.description,tags:[...payload.tags],categoryId:payload.categoryId,thumbnailPath,metadataSource:row?'import':(j.metadataSource||'template'),quotaProjectKey:quotaProjectKey||undefined,quotaOperations:[{method:'videos.insert',count:1,label:'Загрузка видео'},{method:'videos.list',count:1,label:'Проверка videoId'},{method:'videos.list',count:1,label:'Проверка processing'},...(thumbnailPath?[{method:'thumbnails.set' as const,count:1,label:'Обложка'}]:[])],allowDuplicate:false,submittedAt:new Date().toISOString()} as const);queued.push(j.id);queueIds.push(queueEntry.queueId);log(`[UPLOAD_QUEUE] QUEUED job=${j.id} channel=${channel.id} profile=${profileId}`)
   }catch(error){const h=humanizeError(error,'upload');failed.push(`VIDEO_${String(j.number).padStart(3,'0')}: ${h.message}`);log(`[UPLOAD_QUEUE] submit failed job=${j.id}: ${h.message}`,'warn')}}
   if(queued.length){setDraftPatch({selectedIds:draft.selectedIds.filter(id=>!queued.includes(id))});notifySuccess('Добавлено в очередь',`${queued.length} видео • канал ${channel.name} • concurrency ${settings.youtubeUploadConcurrency||2}. Переключение вкладок и каналов загрузку не остановит.`)}
   if(queueIds.length){void waitForUploadQueueEntries(queueIds).then(entries=>{const batchFailures:BatchFailure[]=entries.filter(x=>x.state==='FAILED').map(x=>{const h=humanizeError(x.error||'UPLOAD_FAILED','upload');return{id:x.spec.jobId,message:`VIDEO_${String(x.spec.videoNumber).padStart(3,'0')}: ${h.message}`,technicalDetail:h.detail}});const failureToast=batchFailureToast(batchFailures);if(failureToast)notifyError(failureToast.title,failureToast.message,{persistError:false})})}
   if(failed.length)notifyWarning('Часть видео не добавлена',failed.join(' • '));
  }finally{setBusy(false)}
 }
 const missingMetadata=preflight.items.filter(x=>x.issues.some(i=>i.code==='MISSING_TITLE')).length,missingSchedule=preflight.items.filter(x=>x.issues.some(i=>i.code==='MISSING_SCHEDULE')).length,pastSchedule=preflight.items.filter(x=>x.issues.some(i=>i.code==='PAST_SCHEDULE')).length,scheduleSyncBlocked=draft.scheduleMode!=='file'&&scheduleStartMode==='continue'&&scheduleSync.state!=='ready',locked=isChannelUploadLocked(channelId),globalBlockReasons=publisherGlobalBlockReasons({selectedCount:selected.length,hasProfile:Boolean(profileId),readyCount:uploadableSelected.length,quotaAffordable:quotaPlan.affordable,scheduleSyncBlocked,locked:false,dailyRemaining:daily.remaining}),preflightBlocked=sourceAvailability!=='ONLINE'||globalBlockReasons.length>0;const general=quotaPlan.buckets.general,uploads=quotaPlan.buckets.videoUploads,remaining=Math.max(0,quota.limit-quota.used);
 return <>
  <div className="pageHeader publishMasterHead"><div><small>YOUTUBE • ПУБЛИКАЦИЯ</small><h2>Публикация на YouTube</h2><p>Выберите канал, видео, метаданные и расписание. VYRON сохранит рабочее состояние автоматически.</p></div><div className="headerActions"><select value={channelId} onChange={e=>setChannelId(e.target.value)}>{orderedChannels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button onClick={()=>{setDraft(clearPublishWorkspace(channelId));notifyInfo('Черновик очищен','Файлы на диске не удалены.')}}>Очистить черновик</button></div></div>
  <section className="panel channelFolderBindings"><div className="panelHead"><div><small>ПАПКИ</small><h3>Папки канала</h3><p>Папки видео и проектов для выбранного канала.</p></div><button disabled={folderDiscoveryBusy} onClick={()=>void discoverChannelFolders(false)}>{folderDiscoveryBusy?'Ищу…':'Найти папки'}</button></div><div className="channelFolderGrid"><div><small>Папка рендера</small><b>{channelRenderFolder?'✓ Найдена / настроена':'Не настроена'}</b><span>{channelRenderFolder||('VYRON попробует найти Render / '+(channel?.name||'канал'))}</span><div><button disabled={!channelRenderFolder} onClick={()=>channelRenderFolder&&api.openLocal(channelRenderFolder)}>Открыть</button><button onClick={()=>void chooseChannelRenderFolder()}>Изменить</button></div></div><div><small>Папка проектов</small><b>{channelProjectsFolder?'✓ Найдена / настроена':'Не настроена'}</b><span>{channelProjectsFolder||('VYRON попробует найти Projects / '+(channel?.name||'канал'))}</span><div><button disabled={!channelProjectsFolder} onClick={()=>channelProjectsFolder&&api.openLocal(channelProjectsFolder)}>Открыть</button><button onClick={()=>void chooseChannelProjectsFolder()}>Изменить</button></div></div></div></section>
  {recovery.length>0&&<section className="panel recoveryPublishPanel"><div className="panelHead"><div><small>RECOVERY</small><h3>Незавершённые загрузки</h3><p>Незавершённую загрузку можно безопасно продолжить с сохранённого места.</p></div><span>{recovery.length}</span></div><div className="recoveryUploadRows">{recovery.map(x=>{const j=jobs.find(z=>z.id===x.jobId);return <div key={x.jobId}><span><b>{j?`VIDEO_${String(j.number).padStart(3,'0')}`:baseName(x.filePath)}</b><small>{Math.round(pct(x.offset,x.total))}% • {Math.round(x.offset/1024/1024)} / {Math.round(x.total/1024/1024)} MB</small></span><div className="masterProgress"><i style={{width:`${pct(x.offset,x.total)}%`}}/></div><button className="primary" disabled={busy} onClick={()=>resumeUpload(x)}>Продолжить</button><button disabled={busy} onClick={async()=>{await api.youtubeCancelUploadSession(x.jobId);void refreshSessions();notifyInfo('Локальная recovery-сессия удалена','Видео автоматически заново не загружается.')}}>Отменить recovery</button></div>})}</div></section>}
  <div className="publishStepGrid">
   <section className="panel publishStep"><div className="panelHead"><div><small>01 • VIDEO</small><h3>Готовые видео</h3><p>{newCount} новых · {uploadedCount} на YouTube · {processingCount} обрабатываются · {errorCount} ошибок</p></div><span>{draft.selectedIds.length} выбрано</span></div><div className="publishToolbar"><button className={videoFilter==='new'?'active':''} onClick={()=>setVideoFilter('new')}>Новые {newCount}</button><button className={videoFilter==='youtube'?'active':''} onClick={()=>setVideoFilter('youtube')}>На YouTube {uploadedCount}</button><button className={videoFilter==='processing'?'active':''} onClick={()=>setVideoFilter('processing')}>Обрабатываются {processingCount}</button><button className={videoFilter==='errors'?'active':''} onClick={()=>setVideoFilter('errors')}>Ошибки {errorCount}</button><button className={videoFilter==='all'?'active':''} onClick={()=>setVideoFilter('all')}>Все {stateCounts.ALL}</button></div><div className="publishToolbar"><button disabled={!channelJobs.some(j=>selectableJobIds.has(j.id))} onClick={()=>setDraftPatch({selectedIds:channelJobs.filter(j=>selectableJobIds.has(j.id)).map(j=>j.id)})}>Выбрать все</button><button onClick={()=>setDraftPatch({selectedIds:[]})}>Снять выбор</button><button disabled={busy||renderScanBusy} onClick={()=>void scanRenderFolder()}>{renderScanBusy?'Сканирую…':'↻ Просканировать папку рендера'}</button><button disabled={busy||renderScanBusy} onClick={()=>void autoDiscoverChannelRenderFolder()}>Найти автоматически</button><button disabled={busy||renderScanBusy} onClick={()=>void chooseChannelRenderFolder()}>Выбрать папку</button><button disabled={busy||!selected.some(j=>j.status!=='UPLOADING')} onClick={()=>setRemoveRequest({ids:selected.filter(j=>j.status!=='UPLOADING').map(j=>j.id),label:`Убрать из списка: ${selected.filter(j=>j.status!=='UPLOADING').length}`})}>Убрать выбранные</button>{batchCleanupRows.length>0&&<button className="danger" disabled={busy||sourceAvailability!=='ONLINE'} onClick={()=>setRemoveRequest({ids:cleanupCandidateIds(batchCleanupRows),label:`Удалить загруженные из этой партии: ${batchCleanupRows.length}`,cleanupMode:'batch'})}>Удалить загруженные из партии ({batchCleanupRows.length})</button>}{channelCleanupRows.length>0&&<button className="danger" disabled={busy||sourceAvailability!=='ONLINE'} onClick={()=>setRemoveRequest({ids:cleanupCandidateIds(channelCleanupRows),label:`Очистить подтверждённо загруженные видео: ${channelCleanupRows.length}`,cleanupMode:'channel'})}>Очистить подтверждённо загруженные ({channelCleanupRows.length})</button>}</div>{!channelRenderFolder&&<div className="publishCheck warn"><b>Папка рендера не настроена</b><span>Выберите точную папку Render для этого канала.</span><button onClick={()=>void autoDiscoverChannelRenderFolder()}>Найти автоматически</button><button onClick={()=>void chooseChannelRenderFolder()}>Выбрать папку</button></div>}{channelRenderFolder&&sourceAvailability==='OFFLINE'&&<div className="publishCheck warn renderSourceOffline"><div className="renderSourceOfflineMessage"><b>Внешний диск недоступен</b><span>Подключите TOSHIBA EXT, чтобы продолжить работу с видео. Текущих физических файлов: 0.</span></div><div className="renderSourceOfflineActions"><button disabled={renderScanBusy} onClick={()=>void scanRenderFolder()}>Повторить</button><button onClick={()=>void chooseChannelRenderFolder()}>Изменить папку</button></div></div>}{channelRenderFolder&&sourceAvailability!=='OFFLINE'&&!renderScan&&<div className="publishCheck"><b>{sourceAvailability==='ONLINE'?'Диск подключён':'Проверяю папку…'}</b><span>Просканируйте папку, чтобы показать только реально существующие сейчас видео.</span></div>}{renderScan&&<div className="publishCheck good"><b>Папка канала: {renderScan.result.root}</b><span>{renderScan.summary.TOTAL_CLASSIFIED_FILES} найдено • {renderScan.summary.NEW_CANDIDATE+renderScan.summary.NEW_GENERATION} можно загрузить</span>{(renderScan.summary.NEW_CANDIDATE+renderScan.summary.NEW_GENERATION)>0&&<button onClick={addScannedRenderCandidates}>Добавить новые ({renderScan.summary.NEW_CANDIDATE+renderScan.summary.NEW_GENERATION})</button>}{legacyRecoveryPreview&&<details><summary>Технические сведения legacy identity</summary><div className="publisherNotice"><b>Предпросмотр legacy identity</b><p>Текущих файлов: <b>{legacyRecoveryPreview.total}</b> • точно уже загружены по fingerprint: <b>{legacyRecoveryPreview.uploadedExact.length}</b> • точные дубликаты: <b>{legacyRecoveryPreview.duplicates.length}</b> • trusted новые поколения: <b>{legacyRecoveryPreview.newGenerations.length}</b> • старые записи без fingerprint: <b>{legacyRecoveryPreview.legacyUnproven.length}</b> • fingerprint ещё не доказан: <b>{legacyRecoveryPreview.verifyRequired.length}</b> • invalid: <b>{legacyRecoveryPreview.invalid.length}</b>.</p><p>YouTube API: <b>0</b>. Старые YouTube ID и uploadHistory не изменяются.</p><button disabled={busy||renderScanBusy||legacyRecoveryPreview.legacyUnproven.length===0} onClick={confirmLegacyNewGenerations}>Считать текущие физические файлы новыми поколениями ({legacyRecoveryPreview.legacyUnproven.length})</button></div></details>}{renderScan.importReport&&<details><summary>Результат добавления</summary><p>Запрошено: {renderScan.importReport.requested} • добавлено: {renderScan.importReport.added} • пропущено: {renderScan.importReport.skipped} • уже известно: {renderScan.importReport.alreadyKnown} • ошибок: {renderScan.importReport.errors}</p>{renderScan.importReport.details.map((x,i)=><p key={i}>{x}</p>)}</details>}<details><summary>Все физические файлы канала ({renderScan.rows.length})</summary>{renderScan.rows.map(row=>{const stateLabel=row.classification==='UPLOADED_LOCAL_COPY'?'Уже загружено — файл совпадает с trusted fingerprint':row.classification==='NEW_GENERATION'?'Новая версия файла':row.classification==='NEW_CANDIDATE'?'Новый физический файл':row.classification==='LEGACY_IDENTITY_UNPROVEN'?'Старая загрузка без trusted fingerprint — требуется решение владельца':row.classification==='VERIFY_REQUIRED'?'Нужно вычислить/доказать fingerprint текущего файла':row.reason;return <div key={row.file.path} className="renderIdentityEvidence"><p><b>{row.file.name}</b> • Sequence {row.sequence??'—'} • {(row.file.size/1024/1024).toFixed(1)} MB • {stateLabel}</p><details><summary>Показать доказательство статуса</summary><p><b>Current file</b></p><p className="mono">Path: {row.file.path}</p><p>Size: {row.currentFileSize??row.file.size} bytes</p><p className="mono">Fingerprint: {row.currentFingerprint||'НЕ ВЫЧИСЛЕН'}</p><p>Modified: {row.file.modifiedAt?new Date(row.file.modifiedAt).toLocaleString('ru-RU'):'—'}</p><p><b>Matched historical upload</b></p><p>Job ID: {row.historyJobId||row.matchedJobId||'—'}</p><p>YouTube ID: {row.youtubeVideoId||'—'}</p><p>Stored size: {row.historyFileSize??'—'}</p><p className="mono">Stored fingerprint: {row.historyFingerprint||'—'}</p><p>Uploaded: {row.historyUploadedAt?new Date(row.historyUploadedAt).toLocaleString('ru-RU'):'—'}</p><p>Proof source: <b>{row.historyProofSource||'UNKNOWN'}</b></p><p>{row.historyProofSource==='UPLOAD_TIME'||row.historyProofSource==='UPLOAD_RESUME_TIME'?'Загружено через VYRON — fingerprint сохранён во время фактической загрузки.':'Старая запись — fingerprint не имеет upload-time provenance и не используется для блокировки текущего файла.'}</p><p>Classification: <b>{row.classification}</b> • {row.reason}</p><p>YouTube API requests: 0</p></details>{(row.classification==='VERIFY_REQUIRED'||row.classification==='LEGACY_IDENTITY_UNPROVEN')&&<><button className="mini" disabled={renderScanBusy||busy} onClick={()=>void recheckRenderIdentity(row)}>Проверить текущий файл</button><button className="mini" disabled={renderScanBusy||busy} onClick={()=>void treatVerifyRowAsNewGeneration(row)}>Считать текущий файл новой версией</button></>}</div>})}</details>{recoveryJobs.length>0&&<details><summary>{recoveryJobs.length} старая запись другого канала скрыта</summary>{recoveryJobs.map(j=><div key={j.id} className="publishVideoRow"><span><b>VIDEO_{String(j.number).padStart(3,'0')} • старая запись другого канала</b><small>Current channel: {channel?.name} • Physical file: {j.finalPath}</small></span><button className="mini" onClick={()=>removeWrongScanJob(j)}>Убрать ошибочную запись из публикации</button><button className="mini" onClick={()=>rebindWrongScanJob(j)}>Перепривязать к правильному каналу</button></div>)}</details>}</div>}<div className="publishVideoRows">{channelJobs.length?channelJobs.map(j=>{const st=stateOf(j),proof=uploadForJob(j.id),videoId=j.youtubeVideoId||proof?.youtubeVideoId,recovery=recoveryJobIds.has(j.id),fresh=selectableJobIds.has(j.id),disabledReason=recovery?'Старая запись сканирования — требуется проверка':st==='READY'?'Уже загружено на YouTube':st==='UPLOAD_ACCEPTED'?'YouTube уже принял видео':st==='YOUTUBE_PROCESSING'?'Видео обрабатывается YouTube':st==='VERIFY_REQUIRED'?'Историческая запись — не текущий физический файл':st==='REMOTE_MISSING'?'Связь YouTube требует проверки':st==='UPLOAD_FAILED'||st==='PROCESSING_FAILED'||st==='REJECTED'?'Ошибка — откройте действия':!j.finalPath?'Файл не найден':'Недоступно для новой загрузки',label=recovery?'НЕВЕРНАЯ ПРИВЯЗКА':st==='NEW'?'НОВОЕ':st==='UPLOAD_ACCEPTED'?'НА YOUTUBE':st==='READY'?'READY':st==='YOUTUBE_PROCESSING'?'ОБРАБОТКА YOUTUBE':st==='VERIFY_REQUIRED'?'ИСТОРИЯ':st==='REMOTE_MISSING'?'YOUTUBE: НЕ НАЙДЕНО':st;return <div key={j.id} className={`publishVideoRow ${draft.selectedIds.includes(j.id)?'selected':''} ${!fresh?'uploaded':''}`}><label className="publishVideoSelect"><input type="checkbox" disabled={!fresh||busy} checked={fresh&&draft.selectedIds.includes(j.id)} onChange={()=>fresh&&setDraftPatch({selectedIds:draft.selectedIds.includes(j.id)?draft.selectedIds.filter(x=>x!==j.id):[...draft.selectedIds,j.id]})}/><span><b>VIDEO_{String(j.number).padStart(3,'0')}</b><small>{baseName(j.finalPath||'')} • {label}{videoId?` • YouTube ID: ${videoId}`:''}{proof?.uploadedAt?` • ${new Date(proof.uploadedAt).toLocaleDateString('ru-RU')}`:''}{!fresh?` • ${disabledReason}`:''}</small></span>{j.uploadProgress!=null&&j.status==='UPLOADING'&&<em>{j.uploadProgress.toFixed(0)}%</em>}</label>{st==='REMOTE_MISSING'&&<button className="mini" disabled={busy} onClick={()=>clearRemoteMissing(j)}>Очистить связь</button>}<button className="mini" disabled={busy||j.status==='UPLOADING'} onClick={()=>setRemoveRequest({ids:[j.id],label:`VIDEO_${String(j.number).padStart(3,'0')}`})}>Действия</button></div>}):<p>{videoFilter==='youtube'?'Подтверждённых видео YouTube в локальном списке нет.':videoFilter==='new'?'В VYRON нет зарегистрированных готовых видео. Просканируйте папку рендера.':'Для выбранного фильтра видео нет.'}</p>}</div></section>
   <section className="panel publishStep"><div className="panelHead"><div><small>02 • DOCX</small><h3>Метаданные</h3></div><span>{draft.rows.length}</span></div><input ref={docInput} type="file" accept=".docx,.txt,.json,.csv" hidden onChange={e=>void readDoc(e.target.files)}/><button className="primary" onClick={()=>docInput.current?.click()}>{draft.rows.length?'Заменить Word / SEO pack':'Загрузить Word / SEO pack'}</button><div className={`publishCheck ${coverage.ok?'good':selected.length?'warn':''}`}><b>{draft.rows.length} записей</b><span>{selected.length?coverage.ok?`Автоматически применено к ${selected.length}; лишних ${coverage.surplus}`:`Не хватает ${coverage.missing}`:'Выберите видео — сопоставление выполнится автоматически'}</span></div><small>VIDEO_001 → запись 001. Название, описание и теги применяются автоматически.</small></section>
   <section className="panel publishStep"><div className="panelHead"><div><small>03 • THUMBNAILS</small><h3>Обложки</h3></div><span>{thumbnailsEnabled?`${thumbCount}/${selected.length}`:'НЕ МЕНЯТЬ'}</span></div><button className="primary" onClick={chooseThumbnails}>{draft.thumbs.length?'Заменить изображения':'Выбрать новые обложки'}</button>{thumbnailsEnabled&&<button onClick={()=>setDraftPatch({thumbs:[],allowMissingThumbs:false})}>Не менять обложки YouTube</button>}<div className={`publishCheck ${thumbnailsEnabled&&missingThumbs?'warn':'good'}`}><b>{thumbnailsEnabled?`${draft.thumbs.length} файлов`:'Обложки YouTube — не менять'}</b><span>{!thumbnailsEnabled?'Существующие обложки останутся без изменений':missingThumbs?`Без новой обложки: ${missingThumbs}`:'Сопоставление готово'}</span></div>{missingThumbs>0&&thumbnailsEnabled&&<label className="checkLine"><input type="checkbox" checked={draft.allowMissingThumbs} onChange={e=>setDraftPatch({allowMissingThumbs:e.target.checked})}/>Продолжить без обложки для {missingThumbs}</label>}<small>{thumbnailsEnabled?'Обложки сопоставляются с видео по порядку.':'Существующие обложки на YouTube остаются как есть.'}</small></section>
   <section className="panel publishStep"><div className="panelHead"><div><small>04 • SCHEDULE</small><h3>Когда публиковать</h3></div><span>{draft.scheduleMode==='file'?'ИЗ ФАЙЛА':draft.scheduleMode.toUpperCase()}</span></div><div className="scheduleModeButtons publisherScheduleButtons">{([['file','Из файла'],['daily','Каждый день'],['2/2','2/2'],['3/1','3/1']] as Array<[PublishScheduleMode,string]>).map(([mode,label])=><button key={mode} type="button" className={draft.scheduleMode===mode?'active':''} onClick={()=>{if(mode!==draft.scheduleMode)setScheduleSync(x=>({...x,state:'idle',note:undefined}));setDraftPatch({scheduleMode:mode,...(mode!=='file'&&!draft.scheduleTime?{scheduleTime:scheduleTime}:{})})}}>{label}</button>)}</div><div className="scheduleModeButtons publisherScheduleButtons"><button type="button" className={scheduleStartMode==='continue'?'active':''} onClick={()=>setScheduleStartMode('continue')}>Продолжить расписание канала</button><button type="button" className={scheduleStartMode==='manual'?'active':''} onClick={()=>setScheduleStartMode('manual')}>Начать с даты</button></div><div className="publishActions"><button disabled={busy||scheduleSync.state==='loading'||!profileId} onClick={()=>void syncScheduleFromYoutube()}>{scheduleSync.state==='loading'?'СИНХРОНИЗИРУЮ…':scheduleSync.state==='ready'?'Синхронизировать':'Получить актуальное расписание канала'}</button></div><div className={`publishCheck ${scheduleSync.state==='ready'?'good':'warn'}`}><b>{scheduleSync.state==='ready'?'Расписание синхронизировано':'Синхронизация не требуется для «Из файла»'}</b><span>Отложенных публикаций: {scheduleSync.futureCount} • последняя: {scheduleDateTimeLabel(scheduleSync.lastScheduled)}</span></div>{scheduleSync.state==='ready'&&<div className="publishCheck good"><b>Рекомендуемое начало: {scheduleSync.suggestedStart||'—'} {scheduleTime}</b><span>{scheduleSync.note}</span><div className="publishActions"><button onClick={()=>setScheduleStartMode('continue')}>Использовать рекомендуемую</button><button onClick={()=>setScheduleStartMode('manual')}>Изменить дату начала</button></div></div>}{scheduleStartMode==='manual'&&<label className="checkLine">Начальная дата <input type="date" value={draft.scheduleStartDate} onChange={e=>setDraftPatch({scheduleStartDate:e.target.value})}/></label>}<label className="checkLine">Время публикации <input type="time" value={scheduleTime} onChange={e=>{setDraftPatch({scheduleTime:e.target.value});if(scheduleSync.state==='ready')setScheduleSync(x=>({...x,state:'idle',note:'Время изменено — синхронизируйте расписание повторно'}))}}/></label>{draft.scheduleMode==='file'?<div className="publishCheck good"><b>Дата и время из метаданных</b><span>Дата и время берутся из метаданных каждого видео. Если дата отсутствует, используется выбранная дата начала.</span></div>:<div className={`publishCheck ${schedulePreview.count===selected.length?'good':'warn'}`}><b>{schedulePreview.count?`${scheduleDateTimeLabel(schedulePreview.first)} → ${scheduleDateTimeLabel(schedulePreview.last)}`:'Сначала синхронизируйте канал или выберите дату вручную'}</b><span>{draft.scheduleMode==='daily'?'Публикация каждый день':draft.scheduleMode==='2/2'?'2 дня публикации / 2 дня пауза':'3 дня публикации / 1 день пауза'} • Красноярск</span></div>}<div className="publishCheck good"><b>Расписание подготовлено</b><span>{scheduleResolution.dates[0]?`Начало: ${scheduleDateTimeLabel(scheduleResolution.dates[0])}`:'Дата появится после выбора видео'}</span></div><details><summary>Технические сведения расписания</summary><p>New queue start: {scheduleDateTimeLabel(scheduleResolution.dates[0])}</p><p>Date conflicts: {scheduleResolution.conflicts} • Past dates corrected: {scheduleResolution.pastCorrected}</p></details>{schedulePreview.dates.length>0&&<div className="scheduleBatchPreview"><b>Preview дат</b><small>Первые публикации до отправки в YouTube</small><div>{schedulePreview.dates.slice(0,12).map((x,i)=><span key={x+String(i)}>VIDEO_{String(selected[i]?.number??i+1).padStart(3,'0')} • {scheduleDateTimeLabel(x)}</span>)}</div></div>}<small>Для «Из файла» используются даты из метаданных. Синхронизация нужна только для продолжения расписания канала.</small></section>
  </div>
  <section className={`panel quotaPreflightCard ${preflightBlocked?'blocked':'ready'}`}><div className="panelHead"><div><small>05 • ПРОВЕРКА</small><h3>{preflightBlocked?'Нужно исправить':'Готово к загрузке'}</h3></div><span>{settings.youtubePublishSafeMode?'Тестовый режим — реальная загрузка отключена':'Реальная загрузка включена'}</span></div><div className="publisherSimpleReady"><b>{preflightBlocked?`Нужно исправить: ${Math.max(1,blockedItems.length+globalBlockReasons.length+(sourceAvailability==='ONLINE'?0:1))}`:`Готово к загрузке: ${uploadableSelected.length}`}</b><span>{selected.length} выбрано</span></div><details><summary>Технические сведения</summary><div className="quotaPreflightGrid"><span><small>Видео</small><b>{selected.length}</b></span><span><small>Schedule sync</small><b>{scheduleSync.state==='ready'?'PASS':'NOT SYNCED'}</b></span><span><small>Existing scheduled</small><b>{scheduleSync.futureCount}</b></span><span><small>Last YouTube publishAt</small><b>{scheduleDateTimeLabel(scheduleSync.lastScheduled)}</b></span><span><small>New queue start</small><b>{scheduleDateTimeLabel(scheduleResolution.dates[0])}</b></span><span><small>Date conflicts</small><b>{scheduleResolution.conflicts}</b></span><span><small>Past dates corrected</small><b>{scheduleResolution.pastCorrected}</b></span><span><small>Metadata без title</small><b>{missingMetadata}</b></span><span><small>Без schedule</small><b>{missingSchedule}</b></span><span><small>Дата в прошлом</small><b>{pastSchedule}</b></span><span><small>Blocked</small><b>{blockedItems.length}</b></span><span><small>Duplicate</small><b>{duplicates.length}</b></span><span><small>За 24 часа</small><b>{daily.used}{daily.limit!=null?` / ${daily.limit}`:' / лимит не задан'}</b></span><span><small>General сейчас</small><b>{remaining}</b></span><span><small>Эта операция</small><b>−{general.required}</b></span><span><small>После операции</small><b>{general.remainingAfter}</b></span><span><small>Video Uploads сегодня</small><b>{uploadQuota.limit==null?uploadQuota.used:`${uploadQuota.used} / ${uploadQuota.limit}`}</b><em>{uploadQuota.limitSource==='user-configured'?'Лимит: настроен вручную':uploadQuota.limitSource==='default'?'Лимит: значение по умолчанию':'Дневной лимит не настроен'}</em></span><span><small>Осталось upload-квоты</small><b>{uploadQuota.remaining==null?'Неизвестно':`${uploadQuota.remaining} видео`}</b></span><span><small>Можно загрузить сегодня</small><b>{uploadableSelected.length?`${videoCapacity.canUploadToday} видео`:'0 / выберите видео'}</b></span><span><small>Эта партия</small><b>+{uploads.required} videos.insert</b></span><span><small>После партии</small><b>{uploadQuota.limit==null?'Неизвестно':`${Math.max(0,uploadQuota.limit-uploadQuota.used-uploads.required)} видео`}</b></span><span><small>Сброс</small><b>{clock.localTime} • {clock.countdown}</b></span></div></details>{sourceAvailability!=='ONLINE'&&<div className="publishCheck warn"><b>Внешний диск недоступен</b><span>Подключите диск и повторите сканирование.</span></div>}{globalBlockReasons.length>0&&<div className="publishCheck warn"><b>Почему загрузка сейчас недоступна</b><span>{globalBlockReasons.join(' • ')}</span></div>}{!quotaProjectKey&&<div className="publishCheck warn"><b>Не удалось проверить лимит загрузок</b><span>Проверьте подключение YouTube в Настройки → YouTube.</span></div>}{uploadQuota.remaining!=null&&uploads.required>uploadQuota.remaining&&<div className="publishCheck warn"><b>На сегодня доступна только часть загрузок</b><span>Можно загрузить сейчас: {videoCapacity.canUploadToday} из {uploads.required}. Уменьшите количество выбранных видео.</span></div>}{duplicates.length>0&&<div className="publishCheck warn"><b>Это видео уже было загружено</b><span>{duplicates.slice(0,3).map(j=>{const d=successfulUploadForHash(uploadHistory,fingerprints[j.id]?.fingerprint||'',channelId,fingerprints[j.id]?.size);return `VIDEO_${String(j.number).padStart(3,'0')}: ${d?.youtubeVideoId||'videoId'} • ${d?.uploadedAt?new Date(d.uploadedAt).toLocaleString('ru-RU'):'—'}`}).join(' • ')}</span></div>}{duplicates.length>0&&<details><summary>Доказательство duplicate protection</summary><div className="publishCheck warn"><b>Совпадает сохранённый fingerprint</b><span>Такой же SHA-256 уже есть в успешной истории загрузок этого канала. Этот videos.insert блокируется независимо от пути, номера VIDEO и legacy override.</span></div></details>}<details><summary>Технические сведения запроса</summary><p><b>General API quota</b></p>{quotaPlan.operations.filter(x=>x.bucket==='general').map((x,i)=><p key={`general:${i}`}>{x.count} × {x.method} = {x.cost}</p>)}<p>Estimated general cost: {general.required}</p><p><b>Upload quota</b></p><p>videos.insert operations: {uploads.required}</p><p>Observed today: {uploadQuota.used}</p><p>Configured limit: {uploadQuota.limit==null?'Not configured':uploadQuota.limit}</p>{uploadQuota.remaining!=null&&<><p>Remaining before: {uploadQuota.remaining}</p><p>Remaining after: {Math.max(0,uploadQuota.remaining-uploads.required)}</p></>}<p>API project: {quotaProjectLabel}</p>{blockedItems.map(x=><p key={`blocked:${x.id}`}>VIDEO_{String(x.number).padStart(3,'0')} — BLOCKED: {x.issues.map(i=>i.message).join(' • ')}</p>)}</details>{dryRunReport&&<div className={`publishCheck ${dryRunReport.blocked?'warn':'good'}`}><b>{dryRunReport.blocked?'Нужно исправить перед загрузкой':'Локальная проверка пройдена'}</b><span>Готово: {dryRunReport.ready} из {dryRunReport.rows.length} • {new Date(dryRunReport.at).toLocaleTimeString('ru-RU')}</span>{dryRunReport.blocked>0&&<details><summary>Почему заблокировано</summary>{dryRunReport.rows.filter(x=>!x.ok).map(x=><p key={x.jobId}>VIDEO_{String(x.number).padStart(3,'0')} — {x.issues.join(' • ')}</p>)}</details>}</div>}<div className="publishActions"><button disabled={busy||dryRunBusy||!selected.length} onClick={()=>void runDryRun()}>{dryRunBusy?'ПРОВЕРЯЮ ЛОКАЛЬНО…':'ПРОВЕРИТЬ БЕЗ ЗАГРУЗКИ'}</button><button disabled={busy||preflightBlocked} onClick={()=>runBatch(1)}>ЗАГРУЗИТЬ 1 ТЕСТОВОЕ</button><button className="primary" disabled={busy||preflightBlocked} onClick={()=>runBatch()}>{scheduleSyncBlocked?'СНАЧАЛА СИНХРОНИЗИРУЙТЕ РАСПИСАНИЕ':publisherUploadButtonLabel(selected.length,uploadableSelected.length)}</button></div><p className="quotaFinePrint">Счётчики обновятся после фактической загрузки.</p><p className="quotaFinePrint">Черновик сохранён: {draft.updatedAt&&draft.updatedAt!==new Date(0).toISOString()?new Date(draft.updatedAt).toLocaleString('ru-RU'):'сейчас'}. Переход между экранами не сбрасывает выбор.</p></section>{lastQuotaReport&&<section className="panel quotaResultCard"><div className="panelHead"><div><small>ПОСЛЕДНЯЯ ОПЕРАЦИЯ</small><h3>Операция завершена</h3></div></div><details><summary>Технические сведения квоты</summary><div className="quotaPreflightGrid"><span><small>General план</small><b>{lastQuotaReport.plannedGeneral}</b></span><span><small>General факт</small><b>{lastQuotaReport.actualGeneral}</b></span><span><small>General разница</small><b>{lastQuotaReport.actualGeneral-lastQuotaReport.plannedGeneral>=0?'+':''}{lastQuotaReport.actualGeneral-lastQuotaReport.plannedGeneral}</b></span><span><small>General осталось</small><b>{lastQuotaReport.remainingGeneral}</b></span><span><small>Uploads план</small><b>{lastQuotaReport.plannedUploads}</b></span><span><small>Uploads факт</small><b>{lastQuotaReport.actualUploads}</b></span><span><small>Uploads осталось</small><b>{lastQuotaReport.remainingUploads==null?'Неизвестно':`${lastQuotaReport.remainingUploads} видео`}</b></span></div></details></section>}
  {removeRequest&&<ModalPortal onClose={()=>!busy&&setRemoveRequest(null)}><section className="confirmModal" onMouseDown={e=>e.stopPropagation()}><small>{removeRequest.cleanupMode?'БЕЗОПАСНАЯ ОЧИСТКА':'ДЕЙСТВИЯ С ВИДЕО'}</small><h2>{removeRequest.cleanupMode?'Будет перемещено в Корзину:':removeRequest.label}</h2>{removeRequest.cleanupMode?<><p><b>{removeRequest.ids.length} видео</b><br/>{(cleanupCandidateBytes(uploadHistory.filter(x=>removeRequest.ids.includes(x.jobId)))/1024/1024/1024).toFixed(2)} GB</p><p>Только файлы с trusted upload-time SHA-256 + size и подтверждённым YouTube ID. История загрузки, metadata и YouTube evidence сохранятся.</p></>:<><p>«Скрыть запись» меняет только список VYRON. Физический файл не удаляется.</p><div className="cacheNotice"><b>{sourceAvailability==='ONLINE'?'Размер файла':'Сохранённый размер'}</b><span>{(removeRequest.ids.reduce((sum,id)=>sum+(uploadHistory.slice().reverse().find(x=>x.jobId===id)?.fileSize||0),0)/1024/1024/1024).toFixed(2)} GB</span></div></>}<footer><button disabled={busy} onClick={()=>setRemoveRequest(null)}>Отмена</button>{!removeRequest.cleanupMode&&<button disabled={busy} onClick={()=>void removeReady(removeRequest.ids,false)}>Скрыть запись из VYRON</button>}<button className="danger" disabled={busy||sourceAvailability!=='ONLINE'} onClick={()=>void removeReady(removeRequest.ids,true)}>Переместить в Корзину</button></footer></section></ModalPortal>}
 </>
}
