import type {YoutubeExistingVideo} from './types';

export type ExistingFilter='private'|'scheduled'|'public'|'unlisted'|'all';

export function existingBucket(v:Pick<YoutubeExistingVideo,'privacyStatus'|'publishAt'>):Exclude<ExistingFilter,'all'> {
  if(v.privacyStatus==='private' && Boolean(v.publishAt)) return 'scheduled';
  if(v.privacyStatus==='private') return 'private';
  if(v.privacyStatus==='unlisted') return 'unlisted';
  return 'public';
}

export function matchesExistingFilter(v:YoutubeExistingVideo,filter:ExistingFilter){
  return filter==='all'||existingBucket(v)===filter;
}

export function selectedVisibleIds(videos:YoutubeExistingVideo[],filter:ExistingFilter){
  return new Set(videos.filter(v=>matchesExistingFilter(v,filter)).map(v=>v.id));
}

export function latestPrivateIds(videos:YoutubeExistingVideo[],count:number){
  return new Set([...videos].filter(v=>existingBucket(v)==='private').sort((a,b)=>{
    const ta=Date.parse(a.publishedAt||'')||0,tb=Date.parse(b.publishedAt||'')||0;
    return tb-ta;
  }).slice(0,Math.max(0,count)).map(v=>v.id));
}

export function countBuckets(videos:YoutubeExistingVideo[]){
  const out={private:0,scheduled:0,public:0,unlisted:0};
  for(const v of videos) out[existingBucket(v)]++;
  return out;
}
