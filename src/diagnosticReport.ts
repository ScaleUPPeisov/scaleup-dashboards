import type {AppState,Diagnostics} from './types';
import type {ChannelInventorySnapshot} from './renderInventoryRuntime';
import {redactSensitive} from './securityRedaction';

export type SafeDiagnosticReportInput={
 appVersion:string;platform:string;updateChannel:string;updaterStatus:string;updaterLatest?:string;
 state:Pick<AppState,'channels'|'jobs'|'uploadHistory'|'activityJournal'|'statisticsHistory'|'projectLifecycle'>;
 snapshots:Record<string,ChannelInventorySnapshot>;
 quota:{used:number;limit:number;calls:number;ptDate:string};
 globalUploads:{used:number;limit:number;remaining:number;quotaDay:string};
 core?:Diagnostics|null;
};

export function safeDiagnosticObject(input:SafeDiagnosticReportInput){
 const enabled=input.state.channels.filter(c=>c.enabled!==false);
 const renderConfigured=enabled.filter(c=>Boolean(c.renderFolderPath)).length;
 const renderOffline=enabled.filter(c=>{const x=input.snapshots[c.id];return Boolean(c.renderFolderPath)&&Boolean(x)&&(x.folderState==='OFFLINE'||x.folderState==='ERROR')}).length;
 const oauthLinked=enabled.filter(c=>Boolean(c.youtubeProfileId&&c.youtubeChannelId)).length;
 const jobErrors=input.state.jobs.filter(j=>j.status==='ERROR').length;
 const activeUploads=input.state.jobs.filter(j=>j.status==='UPLOADING').length;
 const scheduled=input.state.jobs.filter(j=>j.status==='SCHEDULED').length;
 const statisticsSnapshots=Object.values(input.state.statisticsHistory||{}).reduce((n,rows)=>n+(rows?.length||0),0);
 const readyLocal=Object.values(input.snapshots).filter(x=>enabled.some(c=>c.id===x.channelId)).reduce((n,x)=>n+(x.readyVideos||0),0);
 return{
  schema:'vyron-safe-diagnostic-v1',
  generatedAt:new Date().toISOString(),
  app:{name:'VYRON YT PEISOV',version:input.appVersion,platform:input.platform,updateChannel:input.updateChannel,updaterStatus:input.updaterStatus,updaterLatest:input.updaterLatest||null},
  core:input.core?{ok:input.core.ok,workspaceExists:input.core.workspaceExists,workspaceWritable:input.core.workspaceWritable,platform:input.core.platform,appVersion:input.core.appVersion,notes:(input.core.notes||[]).map(x=>redactSensitive(x))}:null,
  counts:{
   channels:input.state.channels.length,enabledChannels:enabled.length,oauthLinkedChannels:oauthLinked,
   renderConfigured,renderOffline,readyLocal,jobs:input.state.jobs.length,jobErrors,activeUploads,scheduled,
   uploadHistory:input.state.uploadHistory.length,activityEvents:input.state.activityJournal.length,
   statisticsSnapshots,projectLifecycle:Object.keys(input.state.projectLifecycle||{}).length
  },
  quota:{youtubeApi:{used:input.quota.used,limit:input.quota.limit,calls:input.quota.calls,ptDate:input.quota.ptDate},vyronUploads:input.globalUploads},
  privacy:{containsTokens:false,containsSecrets:false,containsPasswords:false,containsApiKeys:false}
 }
}

export function buildSafeDiagnosticReport(input:SafeDiagnosticReportInput){
 return JSON.stringify(safeDiagnosticObject(input),null,2)
}
