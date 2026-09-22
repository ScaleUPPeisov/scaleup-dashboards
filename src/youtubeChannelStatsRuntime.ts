import {api} from './api';
import {journal} from './activityJournalRuntime';
import {useApp} from './store';
import type {YoutubeChannelStatistics,YoutubeProfile} from './types';
import {isChannelStatsStale,normalizeChannelStatistics,preserveChannelStatisticsOnError} from './youtubeChannelStats';
import {classifyYoutubeChannels,makeStatisticsSnapshot,migrateStatisticsBaselines,type LinkedYoutubeChannel} from './youtubeStatisticsCenter';
import {youtubeOperationActualCost,youtubeQuotaUsage} from './youtubeQuota';
import {appendErrorHistory,resolveStatisticsCredentialErrors} from './errorHistory';

export const BACKGROUND_CHANNEL_STATS_TTL_MS=45*60*1000;

export type ChannelStatisticsRefreshProgress={done:number;total:number};
export type ChannelStatisticsRefreshFailure={channelId:string;channelName:string;profileId:string;youtubeChannelId:string;error:string};
export type ChannelCredentialFailure={profileId:string;channelName:string;youtubeChannelId:string;error:string};
export type ChannelStatisticsRefreshSummary={
 operationId:string;startedAt:string;completedAt:string;
 workspaceChannels:number;linkedChannels:number;unlinked:number;orphans:number;mismatched:number;duplicates:number;
 done:number;total:number;requested:number;updated:number;failed:number;credentialBlocked:number;
 apiRequests:number;quotaUnits:number;quotaBefore:number;quotaAfter:number;
 failures:ChannelStatisticsRefreshFailure[];credentialFailures:ChannelCredentialFailure[];
};

const profileRuns=new Map<string,Promise<YoutubeChannelStatistics|null>>();
let allRun:Promise<ChannelStatisticsRefreshSummary>|undefined;

function exactLinkedForProfile(profile:YoutubeProfile){
 const classification=classifyYoutubeChannels(useApp.getState().channels,[profile]);
 return classification.linked.find(x=>x.profile.id===profile.id&&x.youtubeChannelId===profile.channelId);
}

function applyToLinked(rows:LinkedYoutubeChannel[],youtubeChannelId:string,stats:YoutubeChannelStatistics){
 const state=useApp.getState();
 const targets=rows.filter(x=>x.youtubeChannelId===youtubeChannelId);
 for(const row of targets){
  const current=useApp.getState().channels.find(c=>c.id===row.channel.id);
  if(!current)continue;
  const normalized=normalizeChannelStatistics(stats,current.stats);
  state.updateChannel(current.id,{stats:normalized});
  state.recordStatisticsSnapshot(makeStatisticsSnapshot(current,row.profile,normalized,'LIVE_REFRESH',normalized.statisticsUpdatedAt));
 }
 return targets.length;
}

function preserveLinked(row:LinkedYoutubeChannel,error:unknown){
 const current=useApp.getState().channels.find(c=>c.id===row.channel.id);
 if(!current)return;
 useApp.getState().updateChannel(current.id,{stats:preserveChannelStatisticsOnError(current.stats,error)});
}

export async function ensureStatisticsBaselines(profiles?:YoutubeProfile[]){
 const rows=profiles||await api.youtubeProfiles();
 const state=useApp.getState();
 const migrated=migrateStatisticsBaselines(state.channels,rows,state.statisticsHistory);
 if(migrated.added)state.replaceStatisticsHistory(migrated.history);
 return migrated.added;
}

function isOauthDriverError(error:unknown){
 const s=String(error||'').toUpperCase();
 return s.includes('OAUTH_')||s.includes('REFRESH_TOKEN')||s.includes('INVALID_GRANT')||s.includes('CREDENTIAL')||s.includes('KEYCHAIN');
}

export function refreshYoutubeProfileStatistics(profile:YoutubeProfile,operationId?:string){
 if(!profile.id||!profile.channelId)return Promise.resolve(null);
 const linked=exactLinkedForProfile(profile);
 if(!linked)return Promise.resolve(null);
 const op=operationId||`stats-one:${linked.channel.id}:${Date.now()}`;
 const key=`${profile.id}:${op}`;
 const existing=profileRuns.get(key);
 if(existing)return existing;
 const task=(async()=>{
  await ensureStatisticsBaselines([profile]);
  const startedAt=new Date().toISOString(),quotaBefore=youtubeQuotaUsage().used,eventId=`stats-channel:${op}`;
  journal({eventId,eventType:'CHANNEL_STATS_REFRESH',status:'STARTED',source:'LIVE_OPERATION',timestamp:startedAt,operationId:op,batchId:op,channelId:linked.channel.id,channelName:linked.channel.name,profileId:profile.id,details:{youtubeChannelId:linked.youtubeChannelId}});
  try{
   const stats=await api.youtubeChannelStatistics(profile.id,op);
   applyToLinked([linked],linked.youtubeChannelId,stats);
   const actual=youtubeOperationActualCost(op),quotaAfter=youtubeQuotaUsage().used,completedAt=new Date().toISOString();
   journal({eventId,eventType:'CHANNEL_STATS_REFRESH',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:completedAt,operationId:op,batchId:op,channelId:linked.channel.id,channelName:linked.channel.name,profileId:profile.id,details:{youtubeChannelId:linked.youtubeChannelId,apiRequests:Object.values(actual.methods).reduce((n,x)=>n+x.calls,0),quotaUnits:actual.buckets.general,quotaBefore,quotaAfter}});
   resolveStatisticsCredentialErrors([profile.id]);
   return stats;
  }catch(error){
   preserveLinked(linked,error);
   const actual=youtubeOperationActualCost(op),quotaAfter=youtubeQuotaUsage().used,completedAt=new Date().toISOString();
   journal({eventId,eventType:'CHANNEL_STATS_REFRESH',status:'FAILED',source:'LIVE_OPERATION',timestamp:completedAt,operationId:op,batchId:op,channelId:linked.channel.id,channelName:linked.channel.name,profileId:profile.id,errorCode:'CHANNEL_STATS_REFRESH_FAILED',details:{youtubeChannelId:linked.youtubeChannelId,error:String(error),apiRequests:Object.values(actual.methods).reduce((n,x)=>n+x.calls,0),quotaUnits:actual.buckets.general,quotaBefore,quotaAfter}});
   return null;
  }
 })();
 profileRuns.set(key,task);
 void task.finally(()=>{if(profileRuns.get(key)===task)profileRuns.delete(key)});
 return task;
}

const BLOCKED_STATS_CREDENTIAL_STATES=new Set(['NOT_CHECKED','CANONICAL_PRESENT_UNVERIFIED','CHECK_ON_USE','RECOVERABLE','RECOVERABLE_KEYCHAIN_BLOCKED','KEYCHAIN_BLOCKED','RECONNECT_REQUIRED','MISSING','WRONG_CHANNEL','FAILED','KEYCHAIN_ERROR']);
export function planStatisticsBatchDrivers(chunk:LinkedYoutubeChannel[]){
 const unique=[...new Map(chunk.map(x=>[x.profile.id,x])).values()];
 const blocked=unique.filter(x=>BLOCKED_STATS_CREDENTIAL_STATES.has(String(x.profile.credentialStatus||'')));
 const candidates=unique.filter(x=>!BLOCKED_STATS_CREDENTIAL_STATES.has(String(x.profile.credentialStatus||'')));
 return{
  channelIds:[...new Set(chunk.map(x=>x.youtubeChannelId))],
  candidates,
  blocked:blocked.map(row=>({profileId:row.profile.id,channelName:row.channel.name,youtubeChannelId:row.youtubeChannelId,error:`OAUTH_CREDENTIAL_BLOCKED: status=${row.profile.credentialStatus}`} as ChannelCredentialFailure))
 };
}

export async function requestBatchWithDriverRotation(chunk:LinkedYoutubeChannel[],operationId:string){
 const plan=planStatisticsBatchDrivers(chunk),credentialFailures=[...plan.blocked];
 let lastError:unknown;
 for(const driver of plan.candidates){
  try{
   const batch=await api.youtubeChannelStatisticsBatch(driver.profile.id,plan.channelIds,operationId);
   return{batch,credentialFailures,driverProfileId:driver.profile.id};
  }catch(error){
   lastError=error;
   if(!isOauthDriverError(error))throw Object.assign(new Error(String(error)),{credentialFailures});
   credentialFailures.push({profileId:driver.profile.id,channelName:driver.channel.name,youtubeChannelId:driver.youtubeChannelId,error:String(error)});
  }
 }
 if(credentialFailures.length)return{batch:{items:[],requested:0,found:0,missingChannelIds:[],apiRequests:0},credentialFailures,driverProfileId:undefined};
 throw lastError||new Error('NO_OPERATIONAL_STATS_DRIVER');
}

async function runAll(force:boolean,onProgress?:((p:ChannelStatisticsRefreshProgress)=>void)):Promise<ChannelStatisticsRefreshSummary>{
 const startedAt=new Date().toISOString(),operationId=`stats-refresh-all:${Date.now()}`,quotaBefore=youtubeQuotaUsage().used;
 const profiles=await api.youtubeProfiles();
 await ensureStatisticsBaselines(profiles);
 const channels=useApp.getState().channels,classification=classifyYoutubeChannels(channels,profiles);
 const entries=classification.eligible.filter(x=>force||isChannelStatsStale(x.channel.stats,Date.now(),BACKGROUND_CHANNEL_STATS_TTL_MS));
 const total=entries.length;
 let done=0,updated=0,failed=0;
 const failures:ChannelStatisticsRefreshFailure[]=[];
 const credentialFailures:ChannelCredentialFailure[]=[];
 onProgress?.({done,total});
 const parentEventId=`stats-batch:${operationId}`;
 journal({eventId:parentEventId,eventType:'STATS_REFRESH_BATCH',status:'STARTED',source:'LIVE_OPERATION',timestamp:startedAt,operationId,batchId:operationId,details:{workspaceChannels:channels.length,eligibleChannels:classification.eligible.length,requestedChannels:total,unlinked:classification.unlinked.length,orphans:classification.orphans.length,mismatched:classification.mismatched.length,duplicates:classification.duplicates.length}});
 if(total){
  for(let offset=0;offset<entries.length;offset+=50){
   const chunk=entries.slice(offset,offset+50);
   try{
    const result=await requestBatchWithDriverRotation(chunk,operationId),byId=new Map(result.batch.items.filter(x=>x.channelId).map(x=>[x.channelId!,x]));
    for(const x of result.credentialFailures){
     if(!credentialFailures.some(y=>y.profileId===x.profileId))credentialFailures.push(x);
    }
    const noDriver=result.batch.requested===0&&result.batch.apiRequests===0&&result.credentialFailures.length>0;
    for(const row of chunk){
     if(noDriver){
      const blocked=result.credentialFailures.find(x=>x.profileId===row.profile.id);
      preserveLinked(row,blocked?.error||'OAUTH_CREDENTIAL_BLOCKED: no operational statistics driver');
      done++;onProgress?.({done,total});continue;
     }
     const stats=byId.get(row.youtubeChannelId);
     if(stats){
      applyToLinked(classification.linked,row.youtubeChannelId,stats);
      updated++;
     }else{
      const error=`YOUTUBE_CHANNEL_STATS_MISSING: ${row.youtubeChannelId}`;
      preserveLinked(row,error);failed++;
      failures.push({channelId:row.channel.id,channelName:row.channel.name,profileId:row.profile.id,youtubeChannelId:row.youtubeChannelId,error});
     }
     done++;onProgress?.({done,total});
    }
   }catch(error){
    for(const row of chunk){
     preserveLinked(row,error);failed++;
     failures.push({channelId:row.channel.id,channelName:row.channel.name,profileId:row.profile.id,youtubeChannelId:row.youtubeChannelId,error:String(error)});
     done++;onProgress?.({done,total});
    }
   }
  }
 }
 const actual=youtubeOperationActualCost(operationId),quotaAfter=youtubeQuotaUsage().used,completedAt=new Date().toISOString();
 const apiRequests=Object.values(actual.methods).reduce((n,x)=>n+x.calls,0),quotaUnits=actual.buckets.general;
 const summary:ChannelStatisticsRefreshSummary={
  operationId,startedAt,completedAt,workspaceChannels:channels.length,linkedChannels:classification.eligible.length,
  unlinked:classification.unlinked.length,orphans:classification.orphans.length,mismatched:classification.mismatched.length,duplicates:classification.duplicates.length,
  done,total,requested:total,updated,failed,credentialBlocked:credentialFailures.length,apiRequests,quotaUnits,quotaBefore,quotaAfter,failures,credentialFailures
 };
 const status=failed?(updated?'PARTIAL':'FAILED'):credentialFailures.length?'PARTIAL':'SUCCESS';
 journal({eventId:parentEventId,eventType:'STATS_REFRESH_BATCH',status,source:'LIVE_OPERATION',timestamp:completedAt,operationId,batchId:operationId,errorCode:failed&&!updated?'STATS_REFRESH_BATCH_FAILED':credentialFailures.length&&!updated?'OAUTH_KEYCHAIN_ACCESS_DENIED':undefined,details:{workspaceChannels:summary.workspaceChannels,eligibleChannels:summary.linkedChannels,requestedChannels:summary.requested,updatedChannels:updated,failedChannels:failed,credentialBlockedProfiles:credentialFailures.length,unlinked:summary.unlinked,orphans:summary.orphans,mismatched:summary.mismatched,duplicates:summary.duplicates,apiRequests,quotaUnits,quotaBefore,quotaAfter,failureChannels:failures.map(x=>x.channelName).slice(0,100)}});
 if(credentialFailures.length){
  appendErrorHistory('Подключение YouTube части каналов ещё не готово',`Ожидают восстановления: ${credentialFailures.length}. Запросы YouTube для них не выполнялись.`,credentialFailures.map(x=>`${x.channelName}: ${x.error}`).join('\n'),{errorCode:'KEYCHAIN_ACCESS_DENIED',stage:'preflight',rootIssueKey:`oauth-keychain-batch:${credentialFailures.map(x=>x.profileId).sort().join(',')}`,youtubeRequestSent:apiRequests>0});
 }else if(updated>0){
  resolveStatisticsCredentialErrors(entries.map(x=>x.profile.id));
 }
 return summary;
}

export function refreshYoutubeChannelStatistics(force=false,onProgress?:((p:ChannelStatisticsRefreshProgress)=>void)){
 if(allRun)return allRun;
 const task=runAll(force,onProgress);
 allRun=task;
 void task.finally(()=>{if(allRun===task)allRun=undefined});
 return task;
}

export function channelStatisticsRefreshRunning(){return !!allRun}
