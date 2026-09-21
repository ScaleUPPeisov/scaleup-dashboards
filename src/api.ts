export type StudioDraftBridgeItem={studioKey:string;title:string;editUrl?:string;videoId?:string;channelId?:string;seenAtMs:number};
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { check } from '@tauri-apps/plugin-updater';
import {classifyUpdaterError,UPDATER_CHECK_OPTIONS,UPDATER_ENDPOINTS,updaterFailureMessage,updaterVersionStatus} from './updaterPolicy';
import { relaunch } from '@tauri-apps/plugin-process';
import type {YoutubeExistingVideo, AppState, ChannelAnalytics, Competitor, Diagnostics, InboxScan, LicenseStatus, VideoJob, YoutubeProfile, YoutubeChannelStatistics } from './types';
import {bindYoutubeQuotaOperationProject,recordYoutubeApiRequest,recordYoutubeCommand,registerYoutubeUploadProject,youtubeGuardedCall,youtubeQuotaProjectIdentity,type YoutubeApiRequestEvent} from './youtubeQuota';
import {mutateShortsState,recordShortUploadAttempt} from './shortsCore';
import {endUploadRuntime,registerUploadRuntime,type UploadProgressFact} from './uploadTelemetry';

export type AiMetadata={title:string;description:string;tags:string[]};
export type YoutubeUploadResult={videoId?:string;channelId?:string;channelTitle?:string;scheduled:boolean;resumed?:boolean;verified?:boolean;verificationError?:string;actual?:{id?:string;channelId?:string;privacyStatus?:string;publishAt?:string|null}};
export type YoutubeUploadSession={jobId:string;profileId:string;filePath:string;total:number;offset:number;createdAt:string;updatedAt:string;operationId?:string;channelId?:string;projectId?:string};
export type YoutubeFileFingerprint={fingerprint:string;size:number;modifiedAt:number;path:string;cached?:boolean};
export type ShortsAudioStream={index:number;codec:string;channels:number;sampleRate:number;duration:number;startTime:number;bitRate:number;isDefault:boolean};
export type ShortsProbe={path:string;duration:number;width:number;height:number;hasVideo:boolean;hasAudio:boolean;size:number;format:string;audioStreams:ShortsAudioStream[]};
export type ShortsSourceFile={path:string;name:string;size:number;extension:string};
export type ShortsRenderResult={outputPath:string;duration:number;width:number;height:number;hasAudio:boolean;encoder:string;reused:boolean;audioStreamIndex:number;audioMaxDb:number};
export type GoogleConfigStatus={configured:boolean;oauthReady:boolean;projectId?:string;clientIdMasked?:string;hasSecret:boolean;hasApiKey:boolean;oauthState?:'NOT_CONFIGURED'|'CONFIGURED'|'READY'|'NEEDS_SECURE_STORAGE_REPAIR'|'KEYCHAIN_ACCESS_BLOCKED'|'ERROR';secretOperational?:boolean;repairRequired?:boolean;secureStorageErrorCode?:string|null;secretValuesIncluded?:false};
export type OAuthReconciliationDiagnostic={channelsTotal:number;profilesTotal:number;channelsWithYoutubeProfileId:number;profilesWithChannelId:number;orphanChannels:Array<{channelId:string;channelName:string;youtubeProfileId:string;reason:'ORPHAN_MAPPING'}>;orphanProfiles:Array<{profileId:string;youtubeChannelId?:string;channelTitle?:string}>;duplicateMappings:Array<{profileId:string;channelMappings:number}>;oauthStoreExists:boolean;secretValuesIncluded:false;keychainSecretsRead:false};
export type YoutubeProcessingStatus={videoId:string;channelId?:string;remoteExists?:boolean;identityVerified:boolean;processingStatus:string;processingState:'READY'|'YOUTUBE_PROCESSING'|'PROCESSING_FAILED'|'PROCESSING_UNKNOWN';processingCheckedAt:string;processingProgress?:{partsTotal?:string|null;partsProcessed?:string|null;timeLeftMs?:string|null};processingFailureReason?:string|null;processingIssuesAvailability?:string|null;rejectionReason?:string|null;uploadStatus?:string|null;privacyStatus?:string|null;publishAt?:string|null};
export type LocalSourceStatus={path:string;exists:boolean;isFile:boolean;size?:number|null;modifiedAt?:number|null};
export type RenderFolderVideoFile={path:string;name:string;size:number;createdAt?:number|null;modifiedAt?:number|null;fingerprint?:string};
export type RenderFolderScanResult={root:string;files:RenderFolderVideoFile[];scannedEntries:number;truncated:boolean};
export type ChannelFolderDiscovery={render:string[];projects:string[];rootsChecked:string[]};
export type YoutubeProcessingBatchResult={requested:number;found:number;calls:number;rows:YoutubeProcessingStatus[]};
export type GoogleProjectDiagnosticSafe={oauthProfileId:string;channelId?:string|null;channelTitle?:string|null;clientId:string;projectId?:string|null;projectIdSource:'google-config-exact-client-match'|'not-locally-known';youtubeApiRequests:0;keychainSecretsRead:false};
export type StateSaveResult={ok:boolean;securityWarning?:string|null;securityWarnings?:number};
export type KeychainDiagnostic={ok:boolean;status:string;service?:string};
export type KeychainRuntimeDiagnostic={legacyService:string;canonicalService:string;backendReads:number;backendWrites:number;backendDeletes:number;legacyBackendReads:number;canonicalBackendReads:number;canonicalBackendWrites:number;canonicalBackendDeletes:number;interactiveUiRequestsBlocked:number;legacyReconnectRequired:number;aclMutations:0;cacheHits:number;cacheMisses:number;migrationAttempts:number;migrationSuccesses:number;migrationFailures:number;secretValuesIncluded:false;accounts:Array<{profileUuid?:string|null;accountType:string;cacheHits:number;cacheMisses:number;backendReads:number;backendWrites:number;backendDeletes:number;migrationAttempts:number;migrationSuccesses:number;migrationFailures:number;lastOsstatus?:number|null}>;events:Array<{at:string;operation:string;profile_uuid?:string|null;account_type:string;cache:string;osstatus?:number|null;migration_state?:string|null}>};
export type OAuthInventoryProfile={profile_uuid:string;is_current:boolean;is_orphan:boolean;refresh_token_account:'PRESENT'|'ABSENT';access_token_account:'PRESENT'|'ABSENT';client_secret_account:'PRESENT'|'ABSENT';refresh_token_read:'PASS'|'ACCESS_DENIED'|'READ_FAILED'|'NOT_RUN';refresh_read_osstatus?:number|null;refresh_read_error?:string|null};
export type OAuthLocalInventory={app_version:string;bundle_id:string;service:string;enumeration_status:'PASS'|'FAIL';osstatus?:number|null;enumeration_error?:string|null;total_service_accounts:number;refresh_token_accounts:number;access_token_accounts:number;client_secret_accounts:number;unique_oauth_profile_uuids:number;profiles:OAuthInventoryProfile[];current_channel_profiles:number;current_uuid_with_refresh_token:number;current_uuid_without_refresh_token:number;keychain_uuid_not_present_in_current_database:number;orphan_profile_uuid_count:number;readable_orphan_refresh_tokens:number;denied_orphan_refresh_tokens:number;failed_orphan_refresh_tokens:number;historical_json:{exact_path:string;file:'FOUND'|'NOT_FOUND'|'READ_FAILED';profiles_in_json:number;profiles_with_refresh_token:number;error?:string|null}};
export type OAuthCredentialState='READY'|'CONNECTED'|'CANONICAL_PRESENT_UNVERIFIED'|'KEYCHAIN_BLOCKED'|'RECONNECT_REQUIRED'|'MISSING'|'WRONG_CHANNEL'|'FAILED'|'NOT_CHECKED';
export type KeychainDenialDiagnostic={account:string;profileUuid?:string|null;accountType:string;firstDeniedAt:string;lastDeniedAt:string;originalOsstatus?:number|null;currentOsstatus?:number|null;originalErrorCode:string;currentErrorCode:string;originalOperation:string;denialCount:number;lastRetryAt?:string|null;retryCount:number};
export type CanonicalAccountDiagnostic={account:string;service:string;metadataEnumeration:'VISIBLE'|'NOT_VISIBLE'|'ERROR';attributes?:Record<string,string>|null;denial?:KeychainDenialDiagnostic|null;secretValuesIncluded:false;secretReads:0;errorCode?:string;osstatus?:number|null};
export type OAuthCredentialStateProfile={profileUuid:string;channelTitle?:string|null;expectedChannelId?:string|null;canonicalAccount:string;canonicalRefreshPresent:boolean;canonicalRefreshAccessibleThisProcess?:boolean;canonicalRefreshMetadata?:CanonicalAccountDiagnostic;keychainDenial?:KeychainDenialDiagnostic|null;credentialGeneration?:number;credentialRotatedAt?:string|null;legacyBlockedAccounts?:string[];legacyRefreshPresent:boolean;migrationState:string;credentialState:OAuthCredentialState;credentialSchemaVersion:2;lastValidatedAt?:string|null;lastValidationResult:string;clientSecretState:'PROFILE_CANONICAL'|'GLOBAL_EXACT_MATCH'|'GLOBAL_CURRENT_READY'|'CANONICAL_PRESENT_UNVERIFIED'|'KEYCHAIN_BLOCKED'|'CLIENT_SECRET_REIMPORT_REQUIRED'|'MISSING';clientSecretPresent:boolean;clientSecretOperational?:boolean;clientSecretAccount?:string;globalClientSecretAccount?:string;secretValuesIncluded:false;youtubeApiRequests:0;keychainSecretReads:0};
export type OAuthCredentialStatesResponse={credentialSchemaVersion:2;profiles:OAuthCredentialStateProfile[];secretValuesIncluded:false;youtubeApiRequests:0;keychainSecretReads:0};
export type OAuthRecoveryDiagnostic=OAuthCredentialStateProfile&{appVersion:string;bundleId:string;currentProfileUuid:string;legacyService:string;canonicalService:string;canonicalAccountDiagnostic?:CanonicalAccountDiagnostic;path:string};
export type OAuthSafeRetryProfileResult={profileUuid:string;channelId?:string|null;channelTitle?:string|null;account:string;status:'ACCESSIBLE'|'KEYCHAIN_BLOCKED'|'MISSING'|'READ_FAILED';recovered:boolean;errorCode?:string|null;osstatus?:number|null;denial?:KeychainDenialDiagnostic|null;secretValuesIncluded:false;youtubeApiRequests:0;youtubeQuotaDelta:0};
export type OAuthSafeRetryAllResult={profiles:OAuthSafeRetryProfileResult[];total:number;accessible:number;recoveredAutomatically:number;keychainBlocked:number;missing:number;readFailed:number;secretValuesIncluded:false;youtubeApiRequests:0;youtubeQuotaDelta:0};
export type OAuthExistingProfileRecoveryStatus='READY'|'KEYCHAIN_BLOCKED'|'RECONNECT_REQUIRED'|'FAILED';
export type OAuthExistingProfileRecoveryRow={profileUuid:string;expectedChannelId?:string|null;refreshAccount:string;status:OAuthExistingProfileRecoveryStatus;reasonCode:string;tokenRefresh:'PASS'|'NOT_RUN';clientSecretSource?:'PROFILE_CANONICAL'|'GLOBAL_EXACT_MATCH'|'GLOBAL_CURRENT_MIGRATION'|'LEGACY_STABLE'|null;browserLaunches:0;youtubeApiRequests:0;credentialsDialogs:0;keychainPasswordDialogs:0;secretValuesIncluded:false};
export type OAuthExistingProfilesRecoveryResult={total:number;automaticallyRestored:number;ready:number;keychainBlocked:number;reconnectRequired:number;failed:number;manualQueue:number;browserLaunches:0;googleAccountSelectors:0;credentialsDialogs:0;keychainPasswordDialogs:0;youtubeApiRequests:0;videosInsert:0;profiles:OAuthExistingProfileRecoveryRow[];secretValuesIncluded:false};
export type OAuthExistingRecoveryProgress={done:number;total:number;profileUuid:string;status:OAuthExistingProfileRecoveryStatus;automaticallyRestored:number;keychainBlocked:number;reconnectRequired:number;failed:number;browserLaunches:0;youtubeApiRequests:0};
export type OAuthKeychainMatrixRow={channelName?:string|null;profileUuid:string;expectedChannelId?:string|null;activeRefreshAccount:string;canonicalService:string;credentialGeneration:number;activePointerExists:boolean;accountMetadataVisibility:'VISIBLE'|'NOT_VISIBLE'|'ERROR'|'UNKNOWN';itemAttributesEnumerable:boolean;secretReadBlocked:boolean;credentialState:OAuthCredentialState;currentOsstatus?:number|null;originalOsstatus?:number|null;currentErrorCode?:string|null;originalErrorCode?:string|null;legacyRefreshPresent:boolean;legacyRefreshAccount?:string|null;classification:'ITEM_MISSING'|'ITEM_EXISTS_ACCESS_DENIED'|'ITEM_EXISTS_INTERACTION_REQUIRED'|'AUTH_FAILED'|'LEGACY_POINTER_ONLY'|'STALE_POINTER'|'ITEM_PRESENT'|'UNKNOWN_KEYCHAIN_FAILURE';lastRecoveryAction:string;secretValuesIncluded:false;secretReads:0;youtubeApiRequests:0};
export type OAuthKeychainMatrix={profiles:OAuthKeychainMatrixRow[];total:number;canonicalService:string;legacyService:string;secretValuesIncluded:false;secretReads:0;youtubeApiRequests:0};
export type OAuthInteractiveRecoveryRow={profileUuid:string;expectedChannelId?:string|null;oldAccount:string;newAccount?:string|null;status:'READY'|'KEYCHAIN_BLOCKED'|'RECONNECT_REQUIRED'|'FAILED';reasonCode:string;classification?:string;pointerChanged:boolean;generationChanged:boolean;credentialGeneration?:number;tokenRefresh:'PASS'|'FAIL'|'NOT_RUN';errorCode?:string|null;osstatus?:number|null;browserLaunches:0;youtubeApiRequests:0;secretValuesIncluded:false};
export type OAuthInteractiveRecoveryResult={total:number;recoveredWithoutGoogle:number;keychainBlocked:number;reconnectRequired:number;failed:number;skippedReady:number;manualQueue:number;browserLaunches:0;googleAccountSelectors:0;credentialsDialogs:0;youtubeApiRequests:0;videosInsert:0;profiles:OAuthInteractiveRecoveryRow[];secretValuesIncluded:false};
export type OAuthInteractiveRecoveryProgress={done:number;total:number;profileUuid:string;status:'READY'|'KEYCHAIN_BLOCKED'|'RECONNECT_REQUIRED'|'FAILED';recoveredWithoutGoogle:number;keychainBlocked:number;reconnectRequired:number;failed:number};
export type YoutubeKeychainMigrationDiagnostic={version:number;credentialSchemaVersion:2;legacyService:string;canonicalService:string;profileStates:Record<string,string>;validationStates:Record<string,{at?:string|null;result:string;expected_channel_id?:string|null;actual_channel_id?:string|null}>;globalClientSecretState:string;migratedProfiles:number;failedProfiles:number;reconnectRequiredProfiles:number;profileMigrationAttempts:number;profileMigrationSuccesses:number;profileMigrationFailures:number;accessTokenMemoryHits:number;secretValuesIncluded:false};
export type YoutubeProfileHealth={ok:boolean;status:string;channelId?:string;channelTitle?:string;thumbnail?:string;expiresAt?:number;analyticsAuthorized?:boolean;monetaryAuthorized?:boolean;statistics?:YoutubeChannelStatistics;error?:string};
export type YoutubeChannelStatisticsBatch={items:YoutubeChannelStatistics[];requested:number;found:number;missingChannelIds:string[];apiRequests:number};
export type OAuthAuthorizedChannel={channelId:string;channelTitle:string;handle?:string|null;thumbnail?:string|null;alreadyConnected:boolean;existingProfileId?:string|null;existingProfileTitle?:string|null};
export type OAuthReconnectConnected={ok:true;status:'CONNECTED';profileId:string;profileUuidPreserved:boolean;expectedChannelId:string;authorizedChannelId:string;channelTitle:string;refreshTokenStored:boolean;clientSecretStored:boolean;keychainReadback:'FOUND';tokenRefresh:'PASS';channelIdentity:'PASS';youtubeIdentityRequests:number;videosInsert:number;credentialRotated?:boolean;refreshRotated?:boolean;clientSecretRotated?:boolean;oldRefreshAccount?:string;activeRefreshAccount?:string;oldClientSecretAccount?:string;activeClientSecretAccount?:string;oldRefreshOsstatus?:number|null;oldClientSecretOsstatus?:number|null;rotationReason?:string|null;credentialGeneration?:number;googleRefreshTokenReturned?:boolean;keychainNewWrite?:'PASS';keychainNewReadback?:'PASS';metadataPointer?:'PASS';postCommitRead?:'PASS';secretValuesIncluded?:false};
export type OAuthReconnectWrongChannel={ok:false;status:'WRONG_CHANNEL';code:'WRONG_CHANNEL'|'WRONG_ACCOUNT';profileId:string;profileUuidPreserved:true;expectedChannelId:string;expectedChannelTitle?:string|null;expectedGoogleEmail?:string|null;authorizedGoogleEmail?:string|null;authorizedChannels:OAuthAuthorizedChannel[];browser:string;credentialsCommitted:false;refreshPointerChanged:false;clientSecretPointerChanged:false;generationChanged:false;videosInsert:0;secretValuesIncluded:false};
export type OAuthReconnectResult=OAuthReconnectConnected|OAuthReconnectWrongChannel;
export type OAuthNewChannelConnected=YoutubeProfile&{ok?:true;status?:'CONNECTED';statistics?:YoutubeChannelStatistics;oauthTokenStored?:boolean;secureReadback?:'PASS';profileUuidPreserved?:boolean;secretValuesIncluded?:false};
export type OAuthNewChannelSelectionRequired={ok:false;status:'CHANNEL_SELECTION_REQUIRED';sessionId:string;channels:OAuthAuthorizedChannel[];credentialsCommitted:false;secretValuesIncluded:false};
export type OAuthNewChannelConnectResult=OAuthNewChannelConnected|OAuthNewChannelSelectionRequired;
export type OAuthProfileCredentialsImportResult={ok:true;profileUuid:string;clientIdMasked:string;projectId?:string|null;clientSecretStored:true;account:string;secretValuesIncluded:false};
export type ExistingVideoSyncResult={channelId?:string;channelTitle?:string;youtubeFound:number;received:number;requested:number;privateCount:number;publicCount:number;scheduledCount:number;unlistedCount?:number;complete:boolean;syncComplete?:boolean;scheduleComplete?:boolean;draftCandidateCount?:number;searchSupplementCount?:number;searchUsed?:boolean;playlistFound?:number;playlistReportedTotal?:number;inventoryExpected?:number;playlistItemsFetched?:number;playlistItemsInspected?:number;uniqueVideoIds?:number;videosHydrated?:number;playlistExhausted?:boolean;truncated?:boolean;playlistDuplicateCount?:number;playlistUnresolvedCount?:number;pagesFetched?:number;hydrationBatches?:number;missingHydrationCount?:number;missingHydrationIds?:string[];failedHydrationIds?:string[];scheduleDataIncompleteCount?:number;scheduleIncompleteIds?:string[];hydrationErrors?:string[];incompleteReasons?:string[];inventoryIncompleteReasons?:string[];diagnosticWarnings?:string[];pageInfoTotalMismatch?:boolean;fullSyncApiRequests?:number;fullSyncEstimatedQuotaCost?:number;videos:import('./types').YoutubeExistingVideo[]};
export type ExistingVideoTargetedRetryResult={requestedIds:string[];videosHydrated:number;missingHydrationCount:number;missingHydrationIds:string[];scheduleDataIncompleteCount:number;scheduleIncompleteIds:string[];hydrationErrors:string[];apiRequests:number;complete:boolean;scheduleComplete:boolean;videos:import('./types').YoutubeExistingVideo[]};
export type YoutubeScheduleUpdateResult={id:string;verified:boolean;skipped:boolean;skipReason?:'ALREADY_PUBLISHED'|'ALREADY_CORRECT'|'UNSUPPORTED_STATE'|null;scheduleAccepted:boolean;scheduleVerified:boolean;metadataPreserved:boolean;statusPreserved:boolean;snippetWrites:0;thumbnailWrites:0;playlistWrites:0;videosInsert:0;mismatches?:string[];before?:{publishAt?:string|null;privacyStatus?:string;snippet?:Record<string,unknown>;preservedStatus?:Record<string,unknown>};actual?:{publishAt?:string|null;privacyStatus?:string;snippet?:Record<string,unknown>;preservedStatus?:Record<string,unknown>}};
export type CompetitorCandidate={channelId:string;name:string;url:string;thumbnail?:string;subscribers?:number;views?:number;videos?:number;similarity:number};
export type UpdaterTransferProgress={status:'DOWNLOADING'|'VERIFYING';percent:number;downloadedBytes:number;totalBytes:number};
export type UpdaterInstallPreflight={currentExecutablePath:string;currentAppBundlePath?:string|null;underApplications:boolean;runningFromDmg:boolean;bundleReplaceable:boolean;currentVersion:string;bundleId:string;targetPlatform:string;signatureConfigured:boolean;secretValuesIncluded:false};
export type CheckedUpdaterCandidate={none:false;version:string;date?:string;body:string;current:string;latest:string;status:'AVAILABLE';endpoint:string;versionComparison:string;download:(onProgress?:(p:UpdaterTransferProgress)=>void)=>Promise<void>;install:(onStatus?:(s:'VERIFYING'|'INSTALLING'|'READY_TO_RESTART')=>void)=>Promise<void>;restart:()=>Promise<void>};
export type NoUpdaterCandidate={none:true;current:string;latest:string;status:'UP_TO_DATE';endpoint:string;versionComparison:string};
export type CheckedUpdater=CheckedUpdaterCandidate|NoUpdaterCandidate;
export const METHOD_LEDGER_COMMANDS=new Set(['youtube_oauth_profile_health','youtube_channel_statistics','youtube_channel_statistics_batch','youtube_upload_video','youtube_list_existing_videos','youtube_retry_existing_video_hydration','youtube_video_processing_status','youtube_video_processing_status_batch','youtube_backup_existing_videos','youtube_update_existing_video','youtube_update_existing_schedule','youtube_list_playlists','youtube_playlist_membership','youtube_set_thumbnail']);
export const youtubeCommandUsesMethodLedger=(command:string)=>METHOD_LEDGER_COMMANDS.has(command);
const quotaProjectCache=new Map<string,string|null>();
async function quotaProjectForProfile(profileId:string){
 if(!profileId)return null;if(quotaProjectCache.has(profileId))return quotaProjectCache.get(profileId)??null;
 try{const [profiles,config]=await Promise.all([invoke<YoutubeProfile[]>('youtube_oauth_profiles'),invoke<GoogleConfigStatus>('youtube_google_config_status')]),profile=profiles.find(x=>x.id===profileId),identity=youtubeQuotaProjectIdentity(profile,config),key=identity.projectKey;if(key)registerYoutubeUploadProject(key);quotaProjectCache.set(profileId,key);return key}catch{quotaProjectCache.set(profileId,null);return null}
}
const ytInvoke=<T>(command:string,args?:Record<string,unknown>)=>youtubeGuardedCall(async()=>{const profileId=String(args?.profileId||''),operationId=String(args?.operationId||'');if(profileId&&operationId){const projectKey=await quotaProjectForProfile(profileId);if(projectKey)bindYoutubeQuotaOperationProject(operationId,projectKey)}const result=await invoke<T>(command,args);if(!METHOD_LEDGER_COMMANDS.has(command))recordYoutubeCommand(command,args,result);return result});
const channelStatsInFlight=new Map<string,Promise<unknown>>();
function channelStatsSingleFlight<T>(key:string,run:()=>Promise<T>):Promise<T>{
 const existing=channelStatsInFlight.get(key) as Promise<T>|undefined;
 if(existing)return existing;
 const task=run().finally(()=>{if(channelStatsInFlight.get(key)===task)channelStatsInFlight.delete(key)});
 channelStatsInFlight.set(key,task);
 return task;
}


export const api={
  studioDraftsStartBridge:()=>invoke<{ok:boolean;port:number;ttlMs:number}>('studio_drafts_start_bridge'),
  studioDraftsList:()=>invoke<{drafts:StudioDraftBridgeItem[];port:number;running:boolean}>('studio_drafts_list'),
  studioDraftsClear:()=>invoke<{ok:boolean}>('studio_drafts_clear'),
  loadState:()=>invoke<AppState>('load_state'),
  saveState:(state:AppState)=>invoke<StateSaveResult>('save_state',{state}),
  securityKeychainDiagnostics:()=>invoke<KeychainDiagnostic>('security_keychain_diagnostics'),
  securityKeychainRuntimeDiagnostics:()=>invoke<KeychainRuntimeDiagnostic>('security_keychain_runtime_diagnostics'),
  securityOauthInventory:()=>invoke<OAuthLocalInventory>('security_oauth_inventory'),
  license:()=>invoke<LicenseStatus>('license_status'),
  activate:(key:string)=>invoke<LicenseStatus>('activate_license',{key}),
  diagnostics:(workspace:string)=>invoke<Diagnostics>('diagnostics',{workspace}),
  defaultWorkspace:()=>invoke<string>('default_workspace'),
  chooseWorkspace:async()=>{const r=await open({directory:true,multiple:false,title:'Папка VYRON YT PEISOV'});return typeof r==='string'?r:null},
  chooseRenderFolder:async(defaultPath?:string)=>{const r=await open({directory:true,multiple:false,title:'Папка рендера текущего канала',defaultPath:defaultPath||undefined});return typeof r==='string'?r:null},
  chooseProjectsFolder:async(defaultPath?:string)=>{const r=await open({directory:true,multiple:false,title:'Папка проектов текущего канала',defaultPath:defaultPath||undefined});return typeof r==='string'?r:null},
  discoverChannelFolders:(workspace:string,channelName:string)=>invoke<ChannelFolderDiscovery>('discover_channel_folders',{workspace,channelName}),
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
  youtubeOauthReconciliationDiagnostics:()=>invoke<OAuthReconciliationDiagnostic>('youtube_oauth_reconciliation_diagnostics'),
  youtubeGoogleProjectDiagnostic:(profileId:string)=>invoke<GoogleProjectDiagnosticSafe>('youtube_google_project_diagnostic',{profileId}),
  youtubeOauthCredentialStates:()=>invoke<OAuthCredentialStatesResponse>('youtube_oauth_credential_states'),
  youtubeOauthRecoveryDiagnostic:(profileId:string)=>invoke<OAuthRecoveryDiagnostic>('youtube_oauth_recovery_diagnostic',{profileId}),
  youtubeOauthRetryProfileKeychain:(profileId:string)=>invoke<OAuthSafeRetryProfileResult>('youtube_oauth_retry_profile_keychain',{profileId}),
  youtubeOauthSafeCheckAllProfiles:()=>invoke<OAuthSafeRetryAllResult>('youtube_oauth_safe_check_all_profiles'),
  youtubeOauthRecoverExistingProfiles:()=>invoke<OAuthExistingProfilesRecoveryResult>('youtube_oauth_recover_existing_profiles'),
  onOauthExistingRecoveryProgress:(cb:(data:OAuthExistingRecoveryProgress)=>void)=>listen('oauth-existing-recovery-progress',e=>cb(e.payload as OAuthExistingRecoveryProgress)),
  youtubeOauthKeychainMatrix:()=>invoke<OAuthKeychainMatrix>('youtube_oauth_keychain_matrix'),
  youtubeOauthInteractiveRecoverBlockedProfiles:()=>invoke<OAuthInteractiveRecoveryResult>('youtube_oauth_interactive_recover_blocked_profiles'),
  onOauthInteractiveRecoveryProgress:(cb:(data:OAuthInteractiveRecoveryProgress)=>void)=>listen('oauth-interactive-recovery-progress',e=>cb(e.payload as OAuthInteractiveRecoveryProgress)),
  youtubeKeychainMigrationDiagnostics:()=>invoke<YoutubeKeychainMigrationDiagnostic>('youtube_keychain_migration_diagnostics'),
  youtubeGoogleConfig:()=>invoke<GoogleConfigStatus>('youtube_google_config_status'),
  youtubeRetryGoogleConfig:()=>invoke<GoogleConfigStatus>('youtube_google_config_retry'),
  youtubeImportGoogleConfig:(jsonText:string,apiKey='')=>invoke<GoogleConfigStatus>('youtube_google_config_import',{jsonText,apiKey}),
  youtubeImportProfileCredentials:async(profileId:string)=>{const filePath=await open({directory:false,multiple:false,title:'Выберите credentials.json этого OAuth Client',filters:[{name:'Google OAuth credentials',extensions:['json']}]});if(typeof filePath!=='string')return null;return invoke<OAuthProfileCredentialsImportResult>('youtube_oauth_import_profile_credentials_file',{profileId,filePath})},
  youtubeOauthBrowsers:()=>invoke<{id:string;label:string;available:boolean}[]>('youtube_oauth_browsers'),
  youtubeConnectGlobal:(browser='default')=>invoke<OAuthNewChannelConnectResult>('youtube_oauth_connect_global',{browser}),
  youtubeOpenYoutube:(browser='default')=>invoke<{ok:true;browser:string;oauthStarted:false}>('youtube_oauth_open_youtube',{browser}),
  youtubeSelectNewChannel:(sessionId:string,channelId:string)=>invoke<OAuthNewChannelConnected>('youtube_oauth_select_new_channel',{sessionId,channelId}),
  youtubeCancelNewChannelSelection:(sessionId:string)=>invoke<{ok:true;discarded:true;credentialsCommitted:false}>('youtube_oauth_cancel_new_channel_selection',{sessionId}),
  youtubeReconnectExisting:(profileId:string,browser='default')=>invoke<OAuthReconnectResult>('youtube_oauth_reconnect_existing',{profileId,browser}),
  onOauthRecoveryStage:(cb:(data:{profileId:string;state:string;expectedChannelId?:string;authorizedChannelId?:string;googleRefreshTokenReturned?:boolean;tokenRefreshSmoke?:string;channelIdentity?:string;oldRefreshAccount?:string;newRefreshAccount?:string;oldRefreshReadOsstatus?:number|null;refreshRotated?:boolean;newWrite?:string;newReadback?:string;metadataPointer?:string;postCommitRead?:string})=>void)=>listen('oauth-recovery-stage',e=>cb(e.payload as any)),
  youtubeProfileHealth:(profileId:string)=>ytInvoke<YoutubeProfileHealth>('youtube_oauth_profile_health',{profileId}),
  youtubeChannelStatistics:(profileId:string,operationId?:string)=>channelStatsSingleFlight(`single:${profileId}:${operationId||'shared'}`,()=>ytInvoke<YoutubeChannelStatistics>('youtube_channel_statistics',{profileId,operationId})),
  youtubeChannelStatisticsBatch:(profileId:string,channelIds:string[],operationId?:string)=>{const ids=[...new Set(channelIds.map(x=>x.trim()).filter(Boolean))].sort();return channelStatsSingleFlight(`batch:${profileId}:${ids.join(',')}:${operationId||'shared'}`,()=>ytInvoke<YoutubeChannelStatisticsBatch>('youtube_channel_statistics_batch',{profileId,channelIds:ids,operationId}))},
  youtubeConnect:(clientId:string,clientSecret:string,browser='default')=>invoke<OAuthNewChannelConnectResult>('youtube_oauth_connect',{clientId,clientSecret,browser}),
  youtubeDisconnect:(profileId:string)=>invoke<void>('youtube_oauth_disconnect',{profileId}),
  youtubeUpload:async(profileId:string,jobId:string,filePath:string,title:string,description:string,tags:string[],publishAt:string|undefined,categoryId:string,operationId?:string,telemetry?:{channelId?:string;projectId?:string;totalBytes?:number;startedAt?:string})=>{const startedAt=telemetry?.startedAt||new Date().toISOString();registerUploadRuntime({jobId,projectId:telemetry?.projectId,channelId:telemetry?.channelId||'',profileId,filePath,startedAt},telemetry?.totalBytes,0);try{return await ytInvoke<YoutubeUploadResult>('youtube_upload_video',{profileId,jobId,filePath,title,description,tags,publishAt,categoryId,operationId,channelId:telemetry?.channelId,projectId:telemetry?.projectId})}finally{endUploadRuntime(jobId)}},
  shortsScanFolder:(sourceFolder:string)=>invoke<ShortsSourceFile[]>('shorts_scan_folder',{sourceFolder}),
  shortsProbeSource:(sourcePath:string)=>invoke<ShortsProbe>('shorts_probe_source',{sourcePath}),
  shortsValidateFile:(outputPath:string,targetDuration:number)=>invoke<ShortsProbe>('shorts_validate_file',{outputPath,targetDuration}),
  shortsRenderSegment:(sourcePath:string,outputPath:string,start:number,duration:number)=>invoke<ShortsRenderResult>('shorts_render_segment',{sourcePath,outputPath,start,duration}),
  youtubeUploadSessions:()=>invoke<YoutubeUploadSession[]>('youtube_upload_sessions'),
  youtubeActiveUploads:()=>invoke<UploadProgressFact[]>('youtube_active_uploads'),
  youtubeResumeUpload:async(jobId:string)=>{const session=(await invoke<YoutubeUploadSession[]>('youtube_upload_sessions')).find(x=>x.jobId===jobId);if(session)registerUploadRuntime({jobId,projectId:session.projectId,channelId:session.channelId||'',profileId:session.profileId,filePath:session.filePath,startedAt:new Date().toISOString()},session.total,session.offset);try{return await invoke<YoutubeUploadResult>('youtube_resume_upload',{jobId})}finally{endUploadRuntime(jobId)}},
  trashLocalFile:(path:string,allowedRoots:string[])=>invoke<{trashed:boolean;missing:boolean}>('trash_local_file',{path,allowedRoots}),
   localSourceStatus:(path:string)=>invoke<LocalSourceStatus>('local_source_status',{path}),
  scanRenderFolder:(path:string)=>invoke<RenderFolderScanResult>('scan_render_folder',{path}),
  youtubeCancelUploadSession:(jobId:string)=>invoke<void>('youtube_cancel_upload_session',{jobId}),
  youtubeVideoProcessingStatus:(profileId:string,videoId:string,operationId?:string)=>ytInvoke<YoutubeProcessingStatus>('youtube_video_processing_status',{profileId,videoId,operationId}),
   youtubeVideoProcessingStatusBatch:(profileId:string,videoIds:string[],operationId?:string)=>ytInvoke<YoutubeProcessingBatchResult>('youtube_video_processing_status_batch',{profileId,videoIds,operationId}),
  youtubeSetThumbnail:(profileId:string,videoId:string,filePath:string,operationId?:string)=>ytInvoke<{ok:boolean;videoId:string;filePath:string}>('youtube_set_thumbnail',{profileId,videoId,filePath,operationId}),
  youtubeFileFingerprint:(filePath:string,cache?:{size:number;mtimeMs:number;sha256:string})=>invoke<YoutubeFileFingerprint>('youtube_file_fingerprint',{filePath,cachedSize:cache?.size,cachedModifiedAt:cache?.mtimeMs,cachedHash:cache?.sha256}),
  youtubeListExisting:(profileId:string,maxResults=30)=>ytInvoke<ExistingVideoSyncResult>('youtube_list_existing_videos',{profileId,maxResults}),
  youtubeRetryExistingHydration:(profileId:string,videoIds:string[],operationId?:string)=>ytInvoke<ExistingVideoTargetedRetryResult>('youtube_retry_existing_video_hydration',{profileId,videoIds,operationId}),
  youtubeBackupExisting:(profileId:string,videos:any[],operationId?:string)=>ytInvoke<{path:string;count:number;videos:YoutubeExistingVideo[]}>('youtube_backup_existing_videos',{profileId,videos,operationId}),
  youtubeCacheThumbnail:(videoId:string,primary?:string)=>invoke<string>('youtube_cache_thumbnail',{videoId,primary}),
  youtubeUpdateExisting:(profileId:string,videoId:string,title:string,description:string,tags:string[],publishAt?:string,privacyStatus?:string,categoryId?:string,operationId?:string)=>ytInvoke<{id:string;verified:boolean;metadataAccepted?:boolean;metadataVerified:boolean;metadataVerifyPending?:boolean;scheduleRequested:boolean;scheduleAccepted?:boolean;scheduleVerified:boolean;scheduleVerifyPending?:boolean;scheduleError?:string|null;verificationError?:string|null;mismatches?:string[];skipped?:boolean;appliedTags?:number;actual?:{title?:string;description?:string;tags?:string[];publishAt?:string|null;privacyStatus?:string;categoryId?:string}}>('youtube_update_existing_video',{profileId,videoId,title,description,tags,publishAt,privacyStatus,categoryId,operationId}),
  youtubeUpdateExistingSchedule:(profileId:string,videoId:string,publishAt:string,operationId?:string)=>ytInvoke<YoutubeScheduleUpdateResult>('youtube_update_existing_schedule',{profileId,videoId,publishAt,operationId}),
  youtubeListPlaylists:(profileId:string,operationId?:string)=>ytInvoke<{playlists:Array<{id:string;title:string;privacyStatus?:string}>;calls:number}>('youtube_list_playlists',{profileId,operationId}),
  youtubePlaylistMembership:(profileId:string,videoId:string,playlistId:string,action:'add'|'remove',operationId?:string)=>ytInvoke<{verified:boolean;skipped:boolean;wasMember:boolean;isMember:boolean;action:'add'|'remove';playlistId:string;videoId:string;verificationError?:string|null}>('youtube_playlist_membership',{profileId,videoId,playlistId,action,operationId}),
  onYoutubeProgress:(cb:(data:UploadProgressFact)=>void)=>listen<UploadProgressFact>('youtube-upload-progress',e=>cb(e.payload)),
  onYoutubeApiRequest:(cb:(data:YoutubeApiRequestEvent)=>void)=>listen<YoutubeApiRequestEvent>('youtube-api-request',e=>{recordYoutubeApiRequest(e.payload);if(e.payload.method==='videos.insert'&&e.payload.operationId?.startsWith('short-upload:')){const shortId=e.payload.operationId.slice('short-upload:'.length).split(':')[0];mutateShortsState(s=>recordShortUploadAttempt(s,shortId,e.payload.operationId!,e.payload.at||new Date().toISOString()))}cb(e.payload)}),
  appVersion:()=>getVersion(),
  updaterInstallPreflight:()=>invoke<UpdaterInstallPreflight>('updater_install_preflight'),
  checkUpdate:async():Promise<CheckedUpdater>=>{
    const current=await getVersion();
    let update:any;
    try{update=await check(UPDATER_CHECK_OPTIONS)}catch(error){const x=classifyUpdaterError(error,'check');throw new Error(`${x.code}: ${updaterFailureMessage(x.code,x.detail)}`)}
    if(!update)return {none:true,current,latest:current,status:'UP_TO_DATE',endpoint:UPDATER_ENDPOINTS[0],versionComparison:updaterVersionStatus(current,current)};
    let downloaded=0,total=0;
    return {none:false,version:update.version,date:update.date,body:update.body||'',current:update.currentVersion||current,latest:update.version,status:'AVAILABLE',endpoint:UPDATER_ENDPOINTS[0],versionComparison:updaterVersionStatus(update.currentVersion||current,update.version),
      download:async(onProgress?:(p:UpdaterTransferProgress)=>void)=>{
        await invoke<string>('prepare_updater_tempdir');
        try{
          await update.download((event:any)=>{
            if(event.event==='Started'){total=Number(event.data?.contentLength||0);downloaded=0;onProgress?.({status:'DOWNLOADING',percent:0,downloadedBytes:0,totalBytes:total})}
            if(event.event==='Progress'){downloaded+=Number(event.data?.chunkLength||0);onProgress?.({status:'DOWNLOADING',percent:total>0?Math.min(100,downloaded/total*100):0,downloadedBytes:downloaded,totalBytes:total})}
            if(event.event==='Finished'){onProgress?.({status:'VERIFYING',percent:100,downloadedBytes:downloaded||total,totalBytes:total})}
          });
        }catch(error){const x=classifyUpdaterError(error,'download');throw new Error(`${x.code}: ${updaterFailureMessage(x.code,x.detail)}`)}
      },
      install:async(onStatus?:(s:'VERIFYING'|'INSTALLING'|'READY_TO_RESTART')=>void)=>{
        onStatus?.('VERIFYING');
        onStatus?.('INSTALLING');
        try{await update.install()}catch(error){const x=classifyUpdaterError(error,'install');throw new Error(`${x.code}: ${updaterFailureMessage(x.code,x.detail)}`)}
        onStatus?.('READY_TO_RESTART');
      },
      restart:async()=>{try{await relaunch()}catch(error){const x=classifyUpdaterError(error,'relaunch');throw new Error(`${x.code}: ${updaterFailureMessage(x.code,x.detail)}`)}}
    };
  }
};
