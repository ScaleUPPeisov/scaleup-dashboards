import {invoke} from '@tauri-apps/api/core';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import {open} from '@tauri-apps/plugin-dialog';

export type DistributionMode='even'|'random'|'alphabetical'|'no-repeat';
export type ImportSession={schemaVersion:number;sessionId:string;channelId:string;channelName:string;active:boolean;startedAt:string;stoppedAt?:string|null;downloadsPath:string;importPath:string;collected:{id:string;number:number;path:string;sourcePath:string;capturedAt:string}[]};
export type MusicSummary={libraryPath:string;tracks:number;indexedAt:string};
export type BatchSummary={batchId:string;channelId:string;channelName:string;createdAt:string;projectCount:number;tracksAssigned:number;status:string;manifestPath:string;rootPath:string;completedProjects:number;errorProjects:number};
export type ChannelProductionState={settings:{musicLibrary?:string};importSession:ImportSession;music?:MusicSummary|null;batches:BatchSummary[]};
export type BuildRequest={requestId:string;workspace:string;outputWorkspace?:string;channelId:string;channelName:string;projectCount:number;tracksPerProject:number;mode:DistributionMode;allowImageReuse:boolean;jobLinks:{jobId:string;number:number}[]};
export type ProductionStorageStatus={path:string;exists:boolean;writable:boolean;external:boolean;freeBytes?:number|null;error?:string|null};
export type BuildResult={status:'ready'|'insufficient_images';availableImages:number;requestedProjects:number;batch?:BatchSummary|null;message?:string|null};
export type Validation={batchId:string;ready:number;errors:number;endlumeExists:boolean;items:{projectId:string;ok:boolean;error?:string|null}[]};
export type BatchStatus={batchId:string;status:string;updatedAt?:string;projects:{projectId:string;jobId?:string|null;videoNumber?:number|null;renderStatus:string;outputFile?:string|null;duration?:number|null;fileSize?:number|null;error?:string|null;progress?:number|null;startedAt?:string|null;handoffStatus?:'SENT'|string|null;handoffSentAt?:string|null;handoffCount?:number|null}[]};
export type DeleteResult={deletedProjectIds:string[];deletedJobIds:string[];batch?:BatchSummary|null};
export type CleanupResult={eligibleProjects:number;cleanedProjects:number;removedFiles:number;freedBytes:number;skippedProjects:number};
export type GlobalProjectCleanupPreview={scannedChannels:number;foundProjects:number;eligibleProjects:number;skippedProjects:number;protectedRenders:number;estimatedBytes:number;errors:string[]};
export type GlobalProjectCleanupResult={scannedChannels:number;foundProjects:number;deletedProjects:number;failedProjects:number;skippedProjects:number;protectedRenders:number;bytesFreed:number;deletedJobIds:string[];errors:string[]};
export type ArchiveRenderedResult={archivePath:string;copiedFiles:number;copiedBytes:number;skippedFiles:number};
export type HandoffReceipt={batchId:string;manifestPath:string;requestPath:string;selectedProjectIds:string[];repeatedProjectIds:string[]};
export type RecoveryState={batchId:string;channelId:string;channelName:string;rootPath:string;completedProjects:number;totalProjects:number;currentProject:string;status:string;updatedAt:string;recoverable:boolean};

export const productionManagerApi={
  chooseMusicFolder:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка музыкальной библиотеки канала',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},
  chooseProductionRoot:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка для проектов VYRON',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},
  chooseArchiveRoot:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка безопасного архива MP4',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},
  storageStatus:(path:string)=>invoke<ProductionStorageStatus>('production_storage_status',{path}),
  openFolder:(path:string)=>invoke<void>('reveal_path',{path}),
  startImport:(workspace:string,channelId:string,channelName:string)=>invoke<ImportSession>('start_production_import',{workspace,channelId,channelName}),
  stopImport:(workspace:string,channelId:string)=>invoke<ImportSession>('stop_production_import',{workspace,channelId}),
  importStatus:(workspace:string,channelId:string)=>invoke<ImportSession>('production_import_status',{workspace,channelId}),
  setMusicLibrary:(workspace:string,channelId:string,channelName:string,path:string)=>invoke('set_production_music_library',{workspace,channelId,channelName,path}),
  indexMusic:(workspace:string,channelId:string)=>invoke<MusicSummary>('index_production_music_library',{workspace,channelId}),
  state:(workspace:string,channelId:string)=>invoke<ChannelProductionState>('production_channel_state',{workspace,channelId}),
  build:(request:BuildRequest)=>invoke<BuildResult>('build_production_batch',{request}),
  resume:(manifestOrRoot:string)=>invoke<BatchSummary>('resume_production_batch',{manifestOrRoot}),
  findRecovery:(workspaces:string[])=>invoke<RecoveryState[]>('find_production_recovery',{workspaces}),
  restartRecovery:(manifestOrRoot:string)=>invoke<BatchSummary>('restart_production_batch',{manifestOrRoot}),
  batches:(workspace:string,channelId:string)=>invoke<BatchSummary[]>('list_production_batches',{workspace,channelId}),
  validate:(manifestPath:string,endlumePath:string)=>invoke<Validation>('validate_production_batch',{manifestPath,endlumePath}),
  validateProjects:(manifestPath:string,endlumePath:string,projectIds:string[])=>invoke<Validation>('validate_production_projects',{manifestPath,endlumePath,projectIds}),
  deleteBatchProjects:(manifestPath:string,projectIds:string[])=>invoke<DeleteResult>('delete_production_batch_projects',{manifestPath,projectIds}),
  deleteJobFolder:(workspace:string,folder:string,jobId:string)=>invoke<void>('delete_production_job_folder',{workspace,folder,jobId}),
  cleanupCompletedAssets:(manifestPath:string)=>invoke<CleanupResult>('cleanup_completed_production_assets',{manifestPath}),
  previewGlobalProjectCleanup:(workspaces:string[])=>invoke<GlobalProjectCleanupPreview>('preview_global_production_project_cleanup',{workspaces}),
  executeGlobalProjectCleanup:(workspaces:string[],confirmed:boolean)=>invoke<GlobalProjectCleanupResult>('execute_global_production_project_cleanup',{workspaces,confirmed}),
  archiveRenderedVideos:(manifestPath:string,archiveRoot:string)=>invoke<ArchiveRenderedResult>('archive_production_rendered_videos',{manifestPath,archiveRoot}),
  openInEndlume:(endlumePath:string,manifestPath:string,selectedProjectIds?:string[],forceResend=false)=>invoke<HandoffReceipt>('open_production_batch_in_endlume',{endlumePath,manifestPath,selectedProjectIds,forceResend}),
  handoffConsumed:(requestPath:string)=>invoke<boolean>('production_endlume_handoff_consumed',{requestPath}),
  status:(manifestPath:string)=>invoke<BatchStatus>('read_production_batch_status',{manifestPath}),
  onImportProgress:(cb:(p:{channelId:string;collected:number;sessionId:string})=>void):Promise<UnlistenFn>=>listen('production-import-progress',e=>cb(e.payload as any)),
  onImportError:(cb:(p:{channelId:string;sessionId:string;message:string})=>void):Promise<UnlistenFn>=>listen('production-import-error',e=>cb(e.payload as any)),
  onBatchProgress:(cb:(p:{batchId:string;completed:number;total:number;stage:string})=>void):Promise<UnlistenFn>=>listen('production-batch-progress',e=>cb(e.payload as any)),
};
