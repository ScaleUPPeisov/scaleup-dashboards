import type {UploadHistoryRecord} from './types';

export function successfulVyronUploadTotal(history:UploadHistoryRecord[]){
 const ids=new Set<string>();
 for(const row of history){
  if(row.status!=='UPLOADED')continue;
  const videoId=String(row.youtubeVideoId||'').trim();
  if(videoId)ids.add(videoId);
 }
 return ids.size;
}
