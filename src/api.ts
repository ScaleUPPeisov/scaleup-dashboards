export type StudioDraftBridgeItem={studioKey:string;title:string;editUrl?:string;videoId?:string;channelId?:string;seenAtMs:number};
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { check } from '@tauri-apps/plugin-updater';
import {UPDATER_CHECK_OPTIONS} from './updaterPolicy';
import { relaunch } from '@tauri-apps/plugin-process';
import type {YoutubeExistingVideo, AppState, ChannelAnalytics, Competitor, Diagnostics, InboxScan, LicenseStatus, VideoJob, YoutubeProfile } from './types';
import {recordYoutubeApiRequest,recordYoutubeCommand,youtubeGuardedCall,type YoutubeApiRequestEvent} from './youtubeQuota';
import {mutateShortsState,recordShortUploadAttempt} from './shortsCore';

export type AiMetadata={title:string;description:string;tags:string[]};
export type YoutubeUploadResult={videoId?:string;channelId?:string;channelTitle?:string;scheduled:boolean;resumed?:boolean;verified?:boolean;verificationError?:string;actual?:{id?:string;channelId?:string;privacyStatus?:string;publishAt?:string|null}};
export type YoutubeUploadSession={jobId:string;profileId:string;filePath:string;total:number;offset:number;createdAt:string;updatedAt:string;operationId?:string};
export type YoutubeFileFingerprint={fingerprint:string;size:number;modifiedAt:number;path:string;cached?:boolean};
export type ShortsProbe={path:string;duration:number;width:number;height:number;hasVideo:boolean;hasAudio:boolean;size:number;format:string};
export type ShortsSourceFile={path:string;name:string;size:number;extension:string};
export type ShortsRenderResult={outputPath:string;duration:number;width:number;height:number;hasAudio:boolean;encoder:string;reused:boolean};
export type GoogleConfigStatus={configured:boolean;projectId?:string;clientIdMasked?:string;hasSecret:boolean;hasApiKey:boolean};
export type StateSaveResult={ok:boolean;securityWarning?:string|null;securityWarnings?:number};
export type KeychainDiagnostic={ok:boolean;status:string;service?:string};
export type OAuthInventoryProfile={profile_uuid:string;is_current:boolean;is_orphan:boolean;refresh_token_account:'PRESENT'|'ABSENT';access_token_account:'PRESENT'|'ABSENT';client_secret_account:'PRESENT'|'ABSENT';refresh_token_read:'PASS'|'ACCESS_DENIED'|'READ_FAILED'|'NOT_RUN';refresh_read_osstatus?:number|null;refresh_read_error?:string|null};
export type OAuthLocalInventory={app_version:string;bundle_id:string;service:string;enumeration_status:'PASS'|'FAIL';osstatus?:number|null;enumeration_error?:string|null;total_service_accounts:number;refresh_token_accounts:number;access_token_accounts:number;client_secret_accounts:number;unique_oauth_profile_uuids:number;profiles:OAuthInventoryProfile[];current_channel_profiles:number;current_uuid_with_refresh_token:number;current_uuid_without_refresh_token:number;keychain_uuid_not_present_in_current_database:number;orphan_profile_uuid_count:number;readable_orphan_refresh_tokens:number;denied_orphan_refresh_tokens:number;failed_orphan_refresh_tokens:number;historical_json:{exact_path:string;file:'FOUND'|'NOT_FOUND'|'READ_FAILED';profiles_in_json:number;profiles_with_refresh_token:number;error?:string|null}};
export type OAuthRecoveryDiagnostic={appVersion:string;bundleId:string;channelId?:string;currentProfileUuid:string;currentRefreshToken:{status:string;osstatus?:number};keychainService:string;enumeration:'PASS'|'FAIL';orphanCandidates:{count:number;profileUuids:string[];results:Array<{profile_id:string;account:string;source:string;keychain_read_status:string;osstatus?:number;token_refresh_status:string;identity_validation_status:string;channel_id_match:string}>};v208Json:{path:string;status:string;matchingProfile:string};finalRecoveryStatus:'RECOVERED'|'MISSING'|'DENIED'|'REVOKED'|'MISMATCH'|'FAILED';error?:string};
export type YoutubeProfileHealth={ok:boolean;status:string;channelId?:string;channelTitle?:string;thumbnail?:string;expiresAt?:number;analyticsAuthorized?:boolean;monetaryAuthorized?:boolean;error?:string};
export type OAuthReconnectResult={ok:boolean;status:'CONNECTED';profileId:string;profileUuidPreserved:boolean;expectedChannelId:string;authorizedChannelId:string;channelTitle:string;refreshTokenStored:boolean;keychainReadback:'FOUND';tokenRefresh:'PASS';channelIdentity:'PASS';youtubeIdentityRequests:number;videosInsert:number};
export type ExistingVideoSyncResult={channelId?:string;channelTitle?:string;youtubeFound:number;received:number;requested:number;privateCount:number;publicCount:number;scheduledCount:number;unlistedCount?:number;complete:boolean;draftCandidateCount?:number;searchSupplementCount?:number;searchUsed?:boolean;playlistFound?:number;videos:import('./types').YoutubeExistingVideo[]};
export type CompetitorCandidate={channelId:string;name:string;url:string;thumbnail?:string;subscribers?:number;views?:number;videos?:number;similarity:number};
const METHOD_LEDGER_COMMANDS=new Set(['youtube_oauth_profile_health','youtube_upload_video','youtube_list_existing_videos','youtube_backup_existing_videos','youtube_update_existing_video','youtube_list_playlists','youtube_playlist_membership','youtube_set_thumbnail']);
const ytInvoke=<T>(command:string,args?:Record<string,unknown>)=>youtubeGuardedCall(async()=>{const result=await invoke<T>(command,args);if(!METHOD_LEDGER_COMMANDS.has(command))recordYoutubeCommand(command,args,result);return result});

export const api={
  studioDraftsStartBridge:()=>invoke<{ok:boolean;port:number;ttlMs:number}>('studio_drafts_start_bridge'),
  studioDraftsList:()=>invoke<{drafts:StudioDraftBridgeItem[];port:number;running:boolean}>('studio_drafts_list'),
  studioDraftsClear:()=>invoke<{ok:boolean}>('studio_drafts_clear'),
  loadState:()=>invoke<AppState>('load_state'),
  saveState:(state:AppState)=>invoke<StateSaveResult>('save_state',{state}),
  securityKeychainDiagnostics:()=>invoke<KeychainDiagnostic>('security_keychain_diagnostics'),
  securityOauthInventory:()=>invoke<OAuthLocalInventory>('security_oauth_inventory'),
  license:()=>invoke<LicenseStatus>('license_status'),
  activate:(key:string)=>invoke<LicenseStatus>('activate_license',{key}),
  diagnostics:(workspace:string)=>invoke<Diagnostics>('diagnostics',{workspace}),
  defaultWorkspace:()=>invoke<string>('default_workspace'),
  chooseWorkspace:async()=>{const r=await open({directory:true,multiple:false,title:'Папка VYRON YT PEISOV'});return typeof r==='string'?r:null},
  chooseShortsSourceFolder:async()=>{const r=await open({directory:true,multiple:false,title:'Выберите папку с видео для Shorts'});return typeof r==='string'?r:null},
  chooseShortsOutputFolder:async(defaultPath?:string)=>{const r=await open({directory:true,multiple:false,title:'Папка для готовых Shorts',defaultPath:defaultPath||undefined});return typeof r==='string'?r:null},
  chooseEndlume:async()=>{const r=await open({directory:false,multiple:false,title:'Выберите ENDLUME Studio.app'});return typeof r==='string'?r:null},
  chooseImages:async()=>{const r=await open({directory:false,multiple:true,title:'Выберите изображения',filters:[{name:'Images',extensions:['png','jpg','jpeg','webp']}]});return !r?[]:Array.isArray(r)?r:[r]},
  chooseTracks:async()=>{const r=await open({directory:false,multiple:true,title:'Выберите музыку',filters:[{name:'Audio',extensions:['mp3','wav','m4a','aac','flac','ogg','opus']}]});return !r?[]:Array.isArray(r)?r:[r]},
  importImages:(workspace:string,channelId:string,channelName:string,files:string[],minTracks:number,targetNumbers:number[]=[])=>invoke<VideoJob[]>('import_images',{workspace,channelId,channelName,files,minTracks,targetNumbers}),
  addTracks:(jobFolder:string,files:string[],minTracks:number)=>invoke<{tracksCount:number;status:string}>('add_tracks',{jobFolder,files,minTracks}),
  refreshJob:(jobFolder:string,minTracks:number)=>invoke<Partial<VideoJob>>('refresh_job',{jobFolder,minTracks}),
  prepareJob:async(workspace:string,channelId:string,channelName:string,number:number,minTracks:number)=>{const r=await invoke<any>('prepare_job_folder',{workspace,channelId,channelName,number,minTracks});return {folder:String(r.folder||''),status:String(r.status||'NEED_IMAGE'),tracksCount:Number(r.tracksCount||0),coverPath:r.coverPath?String(r.coverPath):undefined,finalPath:r.finalPath?String(r.finalPath):undefined}},
  ensureChannelInbox:(workspace:string,channelName:string)=>invoke<{root:string;music:string;images:string;metadata:string}>('ensure_channel_inbox',{workspace,channelName}),
  scanChannelInbox:(workspace:string,channelName:string)=>invoke<InboxScan>('scan_channel_inbox',{workspace,channelName}),
  ingestTracks:(jobFolder:string,files:string[],minTracks:number)=>invoke<{tracksCount:number;status:string}>('ingest_tracks',{jobFolder,files,minTracks}),
  ingestCover:(jobFolder:string,file:string,minTracks:number)=>invoke<Partial<VideoJob>>('ingest_cover',{jobFolder,file,minTracks}),
  writeJobMetadata:(jobFolder:string,title:string,description:string,tags:string[],publishAt:string|undefined,source:string)=>invoke<void>('write_job_metadata',{jobFolder,title,description,tags,publishAt,source}),
  enqueueRender:(workspace:string,jobFolder:string)=>invoke<{queueFile:string}>('enqueue_render',{workspace,jobFolder}),
  reveal:(path:string)=>invoke<void>('reveal_path',{path}),
  openEndlume:(path:string)=>invoke<void>('open_endlume',{path}),
  openLocal:(path:string)=>openPath(path),
  openWeb:(url:string)=>openUrl(url),
  aiGenerateMetadata:(apiKey:string,model:string,channelName:string,genre:string,language:string,country:string,videoNumber:number,topic:string|undefined,prompt:string|undefined)=>invoke<AiMetadata>('ai_generate_metadata',{apiKey,model,channelName,genre,language,country,videoNumber,topic,prompt}),
  youtubeStats:(apiKey:string,channelId:string)=>ytInvoke<any>('youtube_channel_stats',{apiKey,channelId}),
  youtubeAnalytics:(profileId:string,days=28,offsetDays=0,allTime=false)=>ytInvoke<ChannelAnalytics&{publicStats?:any}>('youtube_channel_analytics',{profileId,days,offsetDays,allTime}),
  youtubeCompetitorSnapshot:(profileId:string,channelRef:string)=>ytInvoke<Partial<Competitor>&{channelId:string}>('youtube_competitor_snapshot',{profileId,channelRef}),
  youtubeDiscoverCompetitors:(profileId:string,maxResults=8)=>ytInvoke<CompetitorCandidate[]>('youtube_discover_competitors',{profileId,maxResults}),
  youtubeProfiles:()=>invoke<YoutubeProfile[]>('youtube_oauth_profiles'),
  youtubeOauthRecoveryDiagnostic:(profileId:string)=>invoke<OAuthRecoveryDiagnostic>('youtube_oauth_recovery_diagnostic',{profileId}),
  youtubeGoogleConfig:()=>invoke<GoogleConfigStatus>('youtube_google_config_status'),
  youtubeImportGoogleConfig:(jsonText:string,apiKey='')=>invoke<GoogleConfigStatus>('youtube_google_config_import',{jsonText,apiKey}),
  youtubeOauthBrowsers:()=>invoke<{id:string;label:string;available:boolean}[]>('youtube_oauth_browsers'),
  youtubeConnectGlobal:(browser='default')=>invoke<YoutubeProfile>('youtube_oauth_connect_global',{browser}),
  youtubeReconnectExisting:(profileId:string,browser='default')=>invoke<OAuthReconnectResult>('youtube_oauth_reconnect_existing',{profileId,browser}),
  onOauthRecoveryStage:(cb:(data:{profileId:string;state:string;expectedChannelId?:string;authorizedChannelId?:string})=>void)=>listen('oauth-recovery-stage',e=>cb(e.payload as any)),
  youtubeProfileHealth:(profileId:string)=>ytInvoke<YoutubeProfileHealth>('youtube_oauth_profile_health',{profileId}),
  youtubeConnect:(clientId:string,clientSecret:string,browser='default')=>invoke<YoutubeProfile>('youtube_oauth_connect',{clientId,clientSecret,browser}),
  youtubeDisconnect:(profileId:string)=>invoke<void>('youtube_oauth_disconnect',{profileId}),
  youtubeUpload:(profileId:string,jobId:string,filePath:string,title:string,description:string,tags:string[],publishAt:string|undefined,categoryId:string,operationId?:string)=>ytInvoke<YoutubeUploadResult>('youtube_upload_video',{profileId,jobId,filePath,title,description,tags,publishAt,categoryId,operationId}),
  shortsScanFolder:(sourceFolder:string)=>invoke<ShortsSourceFile[]>('shorts_scan_folder',{sourceFolder}),
  shortsProbeSource:(sourcePath:string)=>invoke<ShortsProbe>('shorts_probe_source',{sourcePath}),
  shortsValidateFile:(outputPath:string,targetDuration:number)=>invoke<ShortsProbe>('shorts_validate_file',{outputPath,targetDuration}),
  shortsRenderSegment:(sourcePath:string,outputPath:string,start:number,duration:number)=>invoke<ShortsRenderResult>('shorts_render_segment',{sourcePath,outputPath,start,duration}),
  youtubeUploadSessions:()=>invoke<YoutubeUploadSession[]>('youtube_upload_sessions'),
  youtubeResumeUpload:(jobId:string)=>invoke<YoutubeUploadResult>('youtube_resume_upload',{jobId}),
  trashLocalFile:(path:string,allowedRoots:string[])=>invoke<{trashed:boolean;missing:boolean}>('trash_local_file',{path,allowedRoots}),
  youtubeCancelUploadSession:(jobId:string)=>invoke<void>('youtube_cancel_upload_session',{jobId}),
  youtubeSetThumbnail:(profileId:string,videoId:string,filePath:string,operationId?:string)=>ytInvoke<{ok:boolean;videoId:string;filePath:string}>('youtube_set_thumbnail',{profileId,videoId,filePath,operationId}),
  youtubeFileFingerprint:(filePath:string,cache?:{size:number;mtimeMs:number;sha256:string})=>invoke<YoutubeFileFingerprint>('youtube_file_fingerprint',{filePath,cachedSize:cache?.size,cachedModifiedAt:cache?.mtimeMs,cachedHash:cache?.sha256}),
  youtubeListExisting:(profileId:string,maxResults=30)=>ytInvoke<ExistingVideoSyncResult>('youtube_list_existing_videos',{profileId,maxResults}),
  youtubeBackupExisting:(profileId:string,videos:any[],operationId?:string)=>ytInvoke<{path:string;count:number;videos:YoutubeExistingVideo[]}>('youtube_backup_existing_videos',{profileId,videos,operationId}),
  youtubeCacheThumbnail:(videoId:string,primary?:string)=>invoke<string>('youtube_cache_thumbnail',{videoId,primary}),
  youtubeUpdateExisting:(profileId:string,videoId:string,title:string,description:string,tags:string[],publishAt?:string,privacyStatus?:string,categoryId?:string,operationId?:string)=>ytInvoke<{id:string;verified:boolean;metadataAccepted?:boolean;metadataVerified:boolean;metadataVerifyPending?:boolean;scheduleRequested:boolean;scheduleAccepted?:boolean;scheduleVerified:boolean;scheduleVerifyPending?:boolean;scheduleError?:string|null;verificationError?:string|null;mismatches?:string[];skipped?:boolean;appliedTags?:number;actual?:{title?:string;description?:string;tags?:string[];publishAt?:string|null;privacyStatus?:string;categoryId?:string}}>('youtube_update_existing_video',{profileId,videoId,title,description,tags,publishAt,privacyStatus,categoryId,operationId}),
  youtubeListPlaylists:(profileId:string,operationId?:string)=>ytInvoke<{playlists:Array<{id:string;title:string;privacyStatus?:string}>;calls:number}>('youtube_list_playlists',{profileId,operationId}),
  youtubePlaylistMembership:(profileId:string,videoId:string,playlistId:string,action:'add'|'remove',operationId?:string)=>ytInvoke<{verified:boolean;skipped:boolean;wasMember:boolean;isMember:boolean;action:'add'|'remove';playlistId:string;videoId:string;verificationError?:string|null}>('youtube_playlist_membership',{profileId,videoId,playlistId,action,operationId}),
  onYoutubeProgress:(cb:(data:{jobId:string;progress:number})=>void)=>listen<{jobId:string;progress:number}>('youtube-upload-progress',e=>cb(e.payload)),
  onYoutubeApiRequest:(cb:(data:YoutubeApiRequestEvent)=>void)=>listen<YoutubeApiRequestEvent>('youtube-api-request',e=>{recordYoutubeApiRequest(e.payload);if(e.payload.method==='videos.insert'&&e.payload.operationId?.startsWith('short-upload:')){const shortId=e.payload.operationId.slice('short-upload:'.length).split(':')[0];mutateShortsState(s=>recordShortUploadAttempt(s,shortId,e.payload.operationId!,e.payload.at||new Date().toISOString()))}cb(e.payload)}),
  appVersion:()=>getVersion(),
  checkUpdate:async()=>{
    const current=await getVersion();
    const update=await check(UPDATER_CHECK_OPTIONS);
    if(!update)return {none:true,current} as any;
    let downloaded=0,total=0;
    return {version:update.version,date:update.date,body:update.body||'',current:update.currentVersion,install:async(onProgress?:(p:number)=>void)=>{
      await invoke<string>('prepare_updater_tempdir');
      await update.downloadAndInstall((event:any)=>{
        if(event.event==='Started'){total=Number(event.data?.contentLength||0);downloaded=0;onProgress?.(0)}
        if(event.event==='Progress'){downloaded+=Number(event.data?.chunkLength||0);if(total>0)onProgress?.(Math.min(100,downloaded/total*100))}
        if(event.event==='Finished')onProgress?.(100);
      });
      await relaunch();
    }};
  }
};
