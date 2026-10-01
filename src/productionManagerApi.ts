import {invoke} from '@tauri-apps/api/core';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import {open} from '@tauri-apps/plugin-dialog';
import {beginMaterialsIpc,finishMaterialsIpc} from './materialsPerfDiag';

async function tracedInvoke<T>(command:string,args?:Record<string,unknown>):Promise<T>{
  const row=beginMaterialsIpc(command);
  try{const out=await invoke<T>(command,args);finishMaterialsIpc(row,true);return out}catch(error){finishMaterialsIpc(row,false);throw error}
}

export type DistributionMode='even'|'random'|'alphabetical'|'no-repeat';
export type ImportSession={schemaVersion:number;sessionId:string;channelId:string;channelName:string;active:boolean;startedAt:string;stoppedAt?:string|null;downloadsPath:string;importPath:string;collected:{id:string;number:number;path:string;sourcePath:string;capturedAt:string}[]};
export type MusicSummary={libraryPath:string;tracks:number;indexedAt:string};
export type ImageSummary={total:number;available:number;assigned:number;used:number;missing:number;rootPath:string};
export type MaterialsSummary={channelId:string;image:ImageSummary;musicLibraryPath:string;musicTotal:number;musicFree:number;musicAssigned:number;musicUsed:number};
export type ImageImportResult={added:number;duplicates:number;skipped:number;available:number;libraryPath:string};
export type BatchSummary={batchId:string;channelId:string;channelName:string;createdAt:string;projectCount:number;tracksAssigned:number;status:string;manifestPath:string;rootPath:string;completedProjects:number;errorProjects:number};
export type ChannelProductionState={settings:{musicLibrary?:string};importSession:ImportSession;music?:MusicSummary|null;images?:ImageSummary|null;batches:BatchSummary[]};
export type RecoveryUiContext={page?:string;channelId?:string;productionTab?:string;selectedBatchId?:string;selectedProjectIds?:string[];filter?:string};
export type BuildRequest={requestId:string;workspace:string;outputWorkspace?:string;channelId:string;channelName:string;projectCount:number;tracksPerProject:number;mode:DistributionMode;allowImageReuse:boolean;jobLinks:{jobId:string;number:number}[];recoveryUiContext?:RecoveryUiContext};
export type ManualBuildRequest={requestId:string;workspace:string;outputWorkspace?:string;channelId:string;channelName:string;images:string[];audioFiles:string[];tracksPerProject:number;jobLinks:{jobId:string;number:number;channelId:string}[];recoveryUiContext?:RecoveryUiContext};
export type ManualProjectResult={projectId:string;jobId:string;videoNumber:number;folderPath:string;coverPath:string;tracksCount:number;status:'READY_RENDER'|string};
export type ManualBuildResult={status:'ready'|string;batch:BatchSummary;projects:ManualProjectResult[]};
export type ProductionStorageStatus={path:string;exists:boolean;writable:boolean;external:boolean;freeBytes?:number|null;error?:string|null};
export type BuildResult={status:'ready'|'insufficient_images';availableImages:number;requestedProjects:number;batch?:BatchSummary|null;message?:string|null};
export type Validation={batchId:string;ready:number;errors:number;endlumeExists:boolean;items:{projectId:string;ok:boolean;error?:string|null}[]};
export type BatchStatus={batchId:string;status:string;updatedAt?:string;projects:{projectId:string;jobId?:string|null;videoNumber?:number|null;renderStatus:string;outputFile?:string|null;duration?:number|null;fileSize?:number|null;error?:string|null;progress?:number|null;startedAt?:string|null;handoffStatus?:'SENT'|string|null;handoffSentAt?:string|null;handoffCount?:number|null}[]};
export type DeleteResult={deletedProjectIds:string[];deletedJobIds:string[];batch?:BatchSummary|null};
export type CleanupResult={eligibleProjects:number;cleanedProjects:number;removedFiles:number;freedBytes:number;skippedProjects:number;skipReasons:Record<string,number>};
export type GlobalProjectCleanupPreview={scannedChannels:number;foundProjects:number;eligibleProjects:number;skippedProjects:number;protectedRenders:number;estimatedBytes:number;skipReasons:Record<string,number>;errors:string[]};
export type GlobalProjectCleanupResult={scannedChannels:number;foundProjects:number;deletedProjects:number;failedProjects:number;skippedProjects:number;protectedRenders:number;bytesFreed:number;deletedJobIds:string[];skipReasons:Record<string,number>;errors:string[]};
export type ArchiveRenderedResult={archivePath:string;copiedFiles:number;copiedBytes:number;skippedFiles:number};
export type HandoffReceipt={batchId:string;manifestPath:string;requestPath:string;selectedProjectIds:string[];repeatedProjectIds:string[]};
export type RecoveryState={batchId:string;channelId:string;channelName:string;rootPath:string;completedProjects:number;totalProjects:number;currentProject:string;status:string;updatedAt:string;recoverable:boolean};
export type RecoveryCandidate={recoverySchemaVersion:number;recoverySessionId:string;operationType:string;state:string;batchId:string;channelId:string;channelName:string;rootPath:string;resolvedRootPath?:string|null;completedProjects:number;totalProjects:number;progress:number;lastCheckpoint:string;updatedAt:string;safeToResume:boolean;waitReason?:string|null;requiredVolumeName?:string|null;dismissed:boolean;previousSessionEndedCleanly:boolean;schemaCompatible:boolean;uiContext?:RecoveryUiContext|null};

export const productionManagerApi={
  chooseMusicFolder:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка музыкальной библиотеки канала',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},
  chooseManualMusicFiles:async(defaultPath?:string)=>{const p=await open({directory:false,multiple:true,title:'Музыка для ручной сборки',defaultPath:defaultPath||undefined,filters:[{name:'Audio',extensions:['mp3','wav','m4a','aac','flac','ogg','opus']}]});return !p?[]:Array.isArray(p)?p:[p];},
  chooseManualMusicFolder:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка музыки для ручной сборки',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},
  scanManualMusic:(path:string)=>tracedInvoke<string[]>('scan_manual_production_music',{path}),
  manualBuild:(request:ManualBuildRequest)=>tracedInvoke<ManualBuildResult>('build_manual_production_batch',{request}),
  materialsDownloadsPath:()=>tracedInvoke<string>('production_materials_downloads_path'),
  chooseMaterialImages:async(defaultPath?:string)=>{const p=await open({directory:false,multiple:true,title:'Изображения для выбранного YouTube-канала',defaultPath:defaultPath||undefined,filters:[{name:'Images',extensions:['jpg','jpeg','png','webp']}]});return !p?[]:Array.isArray(p)?p:[p];},
  importMaterialImages:(workspace:string,channelId:string,channelName:string,files:string[])=>tracedInvoke<ImageImportResult>('import_production_material_images',{workspace,channelId,channelName,files}),
  materialsSummary:(workspace:string,channelId:string)=>tracedInvoke<MaterialsSummary>('production_materials_summary',{workspace,channelId}),
  chooseProductionRoot:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка для проектов VYRON',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},
  chooseArchiveRoot:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка безопасного архива MP4',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},
  storageStatus:(path:string)=>tracedInvoke<ProductionStorageStatus>('production_storage_status',{path}),
  openFolder:(path:string)=>tracedInvoke<void>('reveal_path',{path}),
  startImport:(workspace:string,channelId:string,channelName:string)=>tracedInvoke<ImportSession>('start_production_import',{workspace,channelId,channelName}),
  stopImport:(workspace:string,channelId:string)=>tracedInvoke<ImportSession>('stop_production_import',{workspace,channelId}),
  importStatus:(workspace:string,channelId:string)=>tracedInvoke<ImportSession>('production_import_status',{workspace,channelId}),
  setMusicLibrary:(workspace:string,channelId:string,channelName:string,path:string)=>tracedInvoke('set_production_music_library',{workspace,channelId,channelName,path}),
  indexMusic:(workspace:string,channelId:string)=>tracedInvoke<MusicSummary>('index_production_music_library',{workspace,channelId}),
  state:(workspace:string,channelId:string)=>tracedInvoke<ChannelProductionState>('production_channel_state',{workspace,channelId}),
  build:(request:BuildRequest)=>tracedInvoke<BuildResult>('build_production_batch',{request}),
  resume:(manifestOrRoot:string)=>tracedInvoke<BatchSummary>('resume_production_batch',{manifestOrRoot}),
  resumeRecovery:(recoverySessionId:string)=>tracedInvoke<BatchSummary>('resume_production_recovery',{recoverySessionId}),
  recoveryCandidates:(includeDismissed=false)=>tracedInvoke<RecoveryCandidate[]>('recovery_candidates',{includeDismissed}),
  refreshRecoveryCandidate:(recoverySessionId:string)=>tracedInvoke<RecoveryCandidate>('recovery_refresh_candidate',{recoverySessionId}),
  dismissRecovery:(recoverySessionId:string)=>tracedInvoke<void>('recovery_dismiss_session',{recoverySessionId}),
  markCleanShutdown:()=>tracedInvoke<void>('recovery_mark_clean_shutdown'),
  findRecovery:(workspaces:string[])=>tracedInvoke<RecoveryState[]>('find_production_recovery',{workspaces}),
  restartRecovery:(manifestOrRoot:string)=>tracedInvoke<BatchSummary>('restart_production_batch',{manifestOrRoot}),
  batches:(workspace:string,channelId:string)=>tracedInvoke<BatchSummary[]>('list_production_batches',{workspace,channelId}),
  validate:(manifestPath:string,endlumePath:string)=>tracedInvoke<Validation>('validate_production_batch',{manifestPath,endlumePath}),
  validateProjects:(manifestPath:string,endlumePath:string,projectIds:string[])=>tracedInvoke<Validation>('validate_production_projects',{manifestPath,endlumePath,projectIds}),
  deleteBatchProjects:(manifestPath:string,projectIds:string[])=>tracedInvoke<DeleteResult>('delete_production_batch_projects',{manifestPath,projectIds}),
  deleteJobFolder:(workspace:string,folder:string,jobId:string)=>tracedInvoke<void>('delete_production_job_folder',{workspace,folder,jobId}),
  previewCompletedProjects:(manifestPath:string)=>tracedInvoke<string[]>('preview_completed_production_projects',{manifestPath}),
  cleanupCompletedAssets:(manifestPath:string)=>tracedInvoke<CleanupResult>('cleanup_completed_production_assets',{manifestPath}),
  cleanupCompletedProjects:(manifestPath:string,projectIds:string[])=>tracedInvoke<CleanupResult>('cleanup_completed_production_projects',{manifestPath,projectIds}),
  applyCleanupPolicy:(manifestPath:string,policy:'prompt'|'never'|'auto3d'|'afterUpload',uploadedJobIds:string[])=>tracedInvoke<CleanupResult>('apply_production_cleanup_policy',{manifestPath,policy,uploadedJobIds}),
  previewGlobalProjectCleanup:(workspaces:string[])=>tracedInvoke<GlobalProjectCleanupPreview>('preview_global_production_project_cleanup',{workspaces}),
  executeGlobalProjectCleanup:(workspaces:string[],confirmed:boolean)=>tracedInvoke<GlobalProjectCleanupResult>('execute_global_production_project_cleanup',{workspaces,confirmed}),
  archiveRenderedVideos:(manifestPath:string,archiveRoot:string)=>tracedInvoke<ArchiveRenderedResult>('archive_production_rendered_videos',{manifestPath,archiveRoot}),
  openInEndlume:(endlumePath:string,manifestPath:string,selectedProjectIds?:string[],forceResend=false)=>tracedInvoke<HandoffReceipt>('open_production_batch_in_endlume',{endlumePath,manifestPath,selectedProjectIds,forceResend}),
  handoffConsumed:(requestPath:string)=>tracedInvoke<boolean>('production_endlume_handoff_consumed',{requestPath}),
  status:(manifestPath:string)=>tracedInvoke<BatchStatus>('read_production_batch_status',{manifestPath}),
  onImportProgress:(cb:(p:{channelId:string;collected:number;sessionId:string})=>void):Promise<UnlistenFn>=>listen('production-import-progress',e=>cb(e.payload as any)),
  onImportError:(cb:(p:{channelId:string;sessionId:string;message:string})=>void):Promise<UnlistenFn>=>listen('production-import-error',e=>cb(e.payload as any)),
  onBatchProgress:(cb:(p:{batchId:string;completed:number;total:number;stage:string})=>void):Promise<UnlistenFn>=>listen('production-batch-progress',e=>cb(e.payload as any)),
};
