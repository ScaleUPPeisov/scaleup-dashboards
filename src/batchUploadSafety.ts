import type {Channel,VideoJob,YoutubeProfile} from './types';

/** Reject absent, malformed and expired dates before any queue mutation. */
export function isFuturePublishAt(value:string|undefined,nowMs:number=Date.now()):boolean{
 if(!value)return false;
 const at=Date.parse(value);
 return Number.isFinite(at)&&at>nowMs;
}

/** The native store exposes resumable records, not a completed-state flag. */
export function pendingSessionCheck(value:unknown,jobId:string):'CLEAR'|'RECOVERY_REQUIRED'|'UNAVAILABLE'{
 if(!Array.isArray(value)||!jobId)return 'UNAVAILABLE';
 for(const entry of value){
  if(!entry||typeof entry!=='object'||typeof entry.jobId!=='string'||!entry.jobId.trim())return 'UNAVAILABLE';
  if(entry.jobId===jobId)return 'RECOVERY_REQUIRED';
 }
 return 'CLEAR';
}

/** Do not queue a stale confirmation after awaiting filesystem or fingerprint work. */
export function batchJobStillMatches(confirmed:VideoJob,current:VideoJob|undefined,channel:Channel|undefined,profile:YoutubeProfile|undefined,active:boolean,nowMs:number=Date.now()):boolean{
 if(!current||!channel||!profile||active||current.id!==confirmed.id||current.channelId!==confirmed.channelId||channel.id!==confirmed.channelId)return false;
 if(current.status!=='READY_UPLOAD'||!current.finalPath||current.finalPath!==confirmed.finalPath||current.youtubeVideoId)return false;
 if(!channel.youtubeProfileId||channel.youtubeProfileId!==profile.id||!channel.youtubeChannelId||channel.youtubeChannelId!==profile.channelId)return false;
 if(current.title!==confirmed.title||current.description!==confirmed.description||current.publishAt!==confirmed.publishAt||!isFuturePublishAt(current.publishAt,nowMs))return false;
 if(!Array.isArray(current.tags)||!Array.isArray(confirmed.tags)||current.tags.length!==confirmed.tags.length||current.tags.some((tag,i)=>tag!==confirmed.tags[i]))return false;
 return true;
}
