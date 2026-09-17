import type { Channel, VideoJob } from './types';
import { deficit, generateMetadata, nextPublishSlots } from './core';

export function createJobsCount(channel:Channel,jobs:VideoJob[],count:number,now=new Date()){
 const n=Math.max(0,Math.min(10000,Math.floor(count)));if(!n)return [] as VideoJob[];const max=Math.max(0,...jobs.filter(j=>j.channelId===channel.id).map(j=>j.number));const slots=nextPublishSlots(channel,jobs,n,now);return Array.from({length:n},(_,i)=>{const number=max+i+1,meta=generateMetadata(channel,number);return {id:crypto.randomUUID(),channelId:channel.id,number,folder:'',status:'NEED_IMAGE',createdAt:now.toISOString(),publishAt:slots[i],tracksCount:0,minTracks:channel.minTracks,title:meta.title,description:meta.description,tags:meta.tags,metadataSource:'template'} as VideoJob})
}
export function createMissingJobs(channel:Channel,jobs:VideoJob[],now=new Date()){return createJobsCount(channel,jobs,deficit(channel,jobs,now),now)}
export function musicAllocation(jobs:VideoJob[],files:string[],minTracks:number){let cursor=0;const out:{jobId:string;files:string[]}[]=[];for(const j of [...jobs].sort((a,b)=>a.number-b.number)){const need=Math.max(0,minTracks-j.tracksCount);if(!need||cursor>=files.length)continue;const take=files.slice(cursor,cursor+need);if(take.length){out.push({jobId:j.id,files:take});cursor+=take.length}}return out}
export function imageAllocation(jobs:VideoJob[],files:string[]){let cursor=0;const out:{jobId:string;file:string}[]=[];for(const j of [...jobs].sort((a,b)=>a.number-b.number)){if(j.coverPath||cursor>=files.length)continue;out.push({jobId:j.id,file:files[cursor++]})}return out}
