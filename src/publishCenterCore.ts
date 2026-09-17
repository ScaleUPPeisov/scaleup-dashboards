import type {ImportedMetadata} from './metadata';
import type {VideoJob} from './types';
export const baseName=(p:string)=>p.replace(/\\/g,'/').split('/').pop()||p;
export function numericSuffix(p:string){const m=baseName(p).match(/(?:^|[_\-\s])(\d{1,6})(?=\.[^.]+$)/);return m?Number(m[1]):undefined}
export function naturalPaths(paths:string[]){return [...paths].sort((a,b)=>baseName(a).localeCompare(baseName(b),'en',{numeric:true,sensitivity:'base'}))}
export function mapThumbnailsToJobs(jobs:VideoJob[],paths:string[]){const sortedJobs=[...jobs].sort((a,b)=>a.number-b.number),files=naturalPaths(paths),out:Record<string,string>={},used=new Set<string>();for(const j of sortedJobs){const exact=files.find(f=>!used.has(f)&&numericSuffix(f)===j.number);if(exact){out[j.id]=exact;used.add(exact)}}const rest=files.filter(f=>!used.has(f));let i=0;for(const j of sortedJobs){if(out[j.id])continue;if(rest[i])out[j.id]=rest[i++]}return out}
export function metadataCoverage(rows:ImportedMetadata[],selected:number){return{ok:selected>0&&rows.length>=selected,selected,rows:rows.length,surplus:Math.max(0,rows.length-selected),missing:Math.max(0,selected-rows.length)}}
export function mergePublishTime(base:string|undefined,raw:string|undefined){if(!raw)return base;const v=raw.trim();if(/^\d{4}-\d{2}-\d{2}T/.test(v))return v;if(!base)return base;const m=v.match(/(\d{1,2}):(\d{2})/);if(!m)return base;const d=new Date(base);if(Number.isNaN(d.getTime()))return base;d.setHours(Math.max(0,Math.min(23,+m[1])),Math.max(0,Math.min(59,+m[2])),0,0);return d.toISOString()}
