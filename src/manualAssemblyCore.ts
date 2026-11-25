import type {VideoJob} from './types';

// Avoid spreading all project numbers into Math.max: large histories can
// exceed the JavaScript argument limit while opening the assembly dialog.
export function nextManualProjectNumber(jobs:readonly Pick<VideoJob,'channelId'|'number'>[],channelId:string){
 let max=0;
 if(channelId)for(const job of jobs)if(job.channelId===channelId)max=Math.max(max,job.number);
 return max+1;
}
