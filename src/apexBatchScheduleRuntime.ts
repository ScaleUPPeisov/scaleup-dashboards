import type {Channel,VideoJob} from './types';
import {readExistingCache,scheduleSyncTruthFromInfo} from './channelSchedule';
import {uploadQueueSnapshot} from './uploadQueueRuntime';
import type {BatchScheduleEvidence} from './apexBatchSchedule';

/** Only the latest complete owner response is admissible; never promote a historical baseline. */
export function batchScheduleEvidence(channel:Channel):BatchScheduleEvidence|undefined{
 const cache=readExistingCache(channel.id);
 if(!cache||scheduleSyncTruthFromInfo(cache.syncInfo)!=='complete'||cache.syncInfo?.channelId!==channel.youtubeChannelId)return;
 const rows=Object.values(cache.baseline||{});
 // A verified empty response is valid, a nonempty display without baseline is not.
 if(!rows.length&&cache.videos.length)return;
 if(rows.some(v=>v.channelId&&v.channelId!==channel.youtubeChannelId))return;
 return{updatedAt:cache.updatedAt,complete:true,youtubeChannelId:cache.syncInfo.channelId,occupied:rows.filter(v=>v.privacyStatus==='private'&&v.publishAt).map(v=>v.publishAt!)};
}
export function batchLocalOccupied(channelId:string,jobs:readonly VideoJob[],excludeIds:ReadonlySet<string>){
 const q=uploadQueueSnapshot();
 return [...jobs.filter(j=>j.channelId===channelId&&!excludeIds.has(j.id)&&j.publishAt).map(j=>j.publishAt!),...[...q.queued,...q.running,...q.paused,...q.recent.filter(x=>x.state==='SUCCEEDED')].filter(x=>x.spec.channelId===channelId).map(x=>x.spec.publishAt)];
}
