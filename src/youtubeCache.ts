import {tenantStorageKey} from './tenantStorage';
export type YoutubeCacheDomain='analytics'|'existing'|'competitor-discovery'|'competitor-snapshot';
export type YoutubeCacheStamp={key:string;domain:YoutubeCacheDomain;scope:string;updatedAt:string;ttlMs:number};
const KEY='vyron:youtube-cache-freshness:v1';
const defaults:Record<YoutubeCacheDomain,number>={analytics:30*60_000,existing:15*60_000,'competitor-discovery':24*60*60_000,'competitor-snapshot':6*60*60_000};
const cacheKey=(domain:YoutubeCacheDomain,scope:string)=>`${domain}:${scope}`;
function read():Record<string,YoutubeCacheStamp>{try{const x=JSON.parse(localStorage.getItem(tenantStorageKey(KEY))||'{}');return x&&typeof x==='object'?x:{}}catch{return{}}}
function write(x:Record<string,YoutubeCacheStamp>){try{localStorage.setItem(tenantStorageKey(KEY),JSON.stringify(x))}catch{}}
export function markYoutubeCache(domain:YoutubeCacheDomain,scope:string,ttlMs=defaults[domain],at=new Date()){const rows=read(),key=cacheKey(domain,scope),row={key,domain,scope,updatedAt:at.toISOString(),ttlMs};rows[key]=row;write(rows);return row}
export function youtubeCacheStamp(domain:YoutubeCacheDomain,scope:string){return read()[cacheKey(domain,scope)]}
export function youtubeCacheFresh(domain:YoutubeCacheDomain,scope:string,now=Date.now()){const x=youtubeCacheStamp(domain,scope);return Boolean(x&&Date.parse(x.updatedAt)+x.ttlMs>now)}
export function youtubeCacheAgeMs(domain:YoutubeCacheDomain,scope:string,now=Date.now()){const x=youtubeCacheStamp(domain,scope);return x?Math.max(0,now-Date.parse(x.updatedAt)):Number.POSITIVE_INFINITY}
export function youtubeCacheAgeLabel(domain:YoutubeCacheDomain,scope:string){const ms=youtubeCacheAgeMs(domain,scope);if(!Number.isFinite(ms))return'нет синхронизации';const m=Math.floor(ms/60_000);if(m<1)return'только что';if(m<60)return`${m} мин назад`;const h=Math.floor(m/60);if(h<48)return`${h} ч назад`;return`${Math.floor(h/24)} дн. назад`}
export function invalidateYoutubeCache(domain:YoutubeCacheDomain,scope:string){const rows=read();delete rows[cacheKey(domain,scope)];write(rows)}
