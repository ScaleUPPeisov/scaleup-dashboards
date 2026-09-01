import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import type { AppState, ChannelAnalytics, Competitor, Diagnostics, InboxScan, LicenseStatus, VideoJob, YoutubeProfile } from './types';
import {recordYoutubeCommand,youtubeGuardedCall} from './youtubeQuota';

export type AiMetadata={title:string;description:string;tags:string[]};
export type YoutubeUploadResult={videoId?:string;channelId?:string;channelTitle?:string;scheduled:boolean};
export type GoogleConfigStatus={configured:boolean;projectId?:string;clientIdMasked?:string;hasSecret:boolean;hasApiKey:boolean};
export type YoutubeProfileHealth={ok:boolean;status:string;channelId?:string;channelTitle?:string;thumbnail?:string;expiresAt?:number;analyticsAuthorized?:boolean;monetaryAuthorized?:boolean;error?:string};
export type ExistingVideoSyncResult={channelId?:string;channelTitle?:string;youtubeFound:number;received:number;requested:number;privateCount:number;publicCount:number;scheduledCount:number;unlistedCount?:number;complete:boolean;videos:import('./types').YoutubeExistingVideo[]};
export type CompetitorCandidate={channelId:string;name:string;url:string;thumbnail?:string;subscribers?:number;views?:number;videos?:number;similarity:number};
const ytInvoke=<T>(command:string,args?:Record<string,unknown>)=>youtubeGuardedCall(async()=>{const result=await invoke<T>(command,args);recordYoutubeCommand(command,args,result);return result});

export const api={
  loadState:()=>invoke<AppState>('load_state'),
  saveState:(state:AppState)=>invoke<void>('save_state',{state}),
  license:()=>invoke<LicenseStatus>('license_status'),
  activate:(key:string)=>invoke<LicenseStatus>('activate_license',{key}),
  diagnostics:(workspace:string)=>invoke<Diagnostics>('diagnostics',{workspace}),
  defaultWorkspace:()=>invoke<string>('default_workspace'),
  chooseWorkspace:async()=>{const r=await open({directory:true,multiple:false,title:'Папка VYRON'});return typeof r==='string'?r:null},
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
  youtubeGoogleConfig:()=>invoke<GoogleConfigStatus>('youtube_google_config_status'),
  youtubeImportGoogleConfig:(jsonText:string,apiKey='')=>invoke<GoogleConfigStatus>('youtube_google_config_import',{jsonText,apiKey}),
  youtubeOauthBrowsers:()=>invoke<{id:string;label:string;available:boolean}[]>('youtube_oauth_browsers'),
  youtubeConnectGlobal:(browser='default')=>invoke<YoutubeProfile>('youtube_oauth_connect_global',{browser}),
  youtubeProfileHealth:(profileId:string)=>ytInvoke<YoutubeProfileHealth>('youtube_oauth_profile_health',{profileId}),
  youtubeConnect:(clientId:string,clientSecret:string,browser='default')=>invoke<YoutubeProfile>('youtube_oauth_connect',{clientId,clientSecret,browser}),
  youtubeDisconnect:(profileId:string)=>invoke<void>('youtube_oauth_disconnect',{profileId}),
  youtubeUpload:(profileId:string,jobId:string,filePath:string,title:string,description:string,tags:string[],publishAt:string|undefined,categoryId:string)=>ytInvoke<YoutubeUploadResult>('youtube_upload_video',{profileId,jobId,filePath,title,description,tags,publishAt,categoryId}),
  youtubeListExisting:(profileId:string,maxResults=30)=>ytInvoke<ExistingVideoSyncResult>('youtube_list_existing_videos',{profileId,maxResults}),
  youtubeBackupExisting:(profileId:string,videos:any[])=>ytInvoke<{path:string;count:number}>('youtube_backup_existing_videos',{profileId,videos}),
  youtubeCacheThumbnail:(videoId:string,primary?:string)=>invoke<string>('youtube_cache_thumbnail',{videoId,primary}),
  youtubeUpdateExisting:(profileId:string,videoId:string,title:string,description:string,tags:string[],publishAt?:string,privacyStatus?:string)=>ytInvoke<{id:string;verified:boolean;metadataAccepted?:boolean;metadataVerified:boolean;metadataVerifyPending?:boolean;scheduleRequested:boolean;scheduleAccepted?:boolean;scheduleVerified:boolean;scheduleVerifyPending?:boolean;scheduleError?:string|null;skipped?:boolean;appliedTags?:number}>('youtube_update_existing_video',{profileId,videoId,title,description,tags,publishAt,privacyStatus}),
  onYoutubeProgress:(cb:(data:{jobId:string;progress:number})=>void)=>listen<{jobId:string;progress:number}>('youtube-upload-progress',e=>cb(e.payload)),
  appVersion:()=>getVersion(),
  checkUpdate:async()=>{
    const current=await getVersion();
    const update=await check();
    if(!update)return {none:true,current} as any;
    let downloaded=0,total=0;
    return {version:update.version,date:update.date,body:update.body||'',current:update.currentVersion,install:async(onProgress?:(p:number)=>void)=>{
      await update.downloadAndInstall((event:any)=>{
        if(event.event==='Started'){total=Number(event.data?.contentLength||0);downloaded=0;onProgress?.(0)}
        if(event.event==='Progress'){downloaded+=Number(event.data?.chunkLength||0);if(total>0)onProgress?.(Math.min(100,downloaded/total*100))}
        if(event.event==='Finished')onProgress?.(100);
      });
      await relaunch();
    }};
  }
};
