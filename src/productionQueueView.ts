import type {VideoJob} from './types';

/** Filtering defines bulk-operation scope; paging limits only the rendered rows. */
export function productionQueueRows(jobs:VideoJob[],filter:string):VideoJob[]{
 return jobs.filter(job=>filter==='all'||job.channelId===filter||job.status===filter).sort((a,b)=>a.number-b.number);
}
export function productionQueuePage(rows:VideoJob[],limit:number):VideoJob[]{
 return rows.slice(0,Math.max(0,limit));
}
