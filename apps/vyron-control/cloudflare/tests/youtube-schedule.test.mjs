import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverScheduledVideos,scheduledContentDays} from '../src/youtube-schedule.mjs';
const channel='UC'+'j'.repeat(22),video='v'.repeat(11);
function mockYoutube({hasMore=false,authorized=true,partialVideo=false}={}){
 const calls=[];
 return {calls,fetchImpl:async url=>{
   const u=new URL(url);calls.push(u);
   if(u.pathname.endsWith('/channels'))return new Response(JSON.stringify({
     items:authorized?[{id:channel,contentDetails:{relatedPlaylists:{uploads:'UUuploads'}}}]:[]
   }),{status:200});
   if(u.pathname.endsWith('/playlistItems'))return new Response(JSON.stringify({
     items:[{contentDetails:{videoId:video}}],
     ...(hasMore?{nextPageToken:'more'}:{})
   }),{status:200});
   if(u.pathname.endsWith('/videos'))return new Response(JSON.stringify({
     items:partialVideo?[]:[{id:video,snippet:{channelId:channel},
       status:{privacyStatus:'private',publishAt:'2026-11-23T17:00:00Z'}}]
   }),{status:200});
   throw Error('Unexpected youtube URL');
 }};
}
test('authenticated read-only API verifies future private status.publishAt',async()=>{
 const x=mockYoutube();
 const now=new Date('2026-11-18T10:00:00Z');
 const result=await discoverScheduledVideos('a-test-access-token',channel,x.fetchImpl,now);
 assert.equal(result.status,'COMPLETE');assert.equal(result.complete,true);
 assert.equal(result.scanned,1);assert.equal(result.videos.length,1);
 assert.equal(result.videos[0].videoId,video);
 assert.equal(x.calls.length,3);
 assert.equal(x.calls[0].searchParams.get('mine'),'true');
 assert.equal(x.calls[2].searchParams.get('part'),'status,snippet');
 assert.equal(scheduledContentDays({...result,capturedAt:now.toISOString()},now),6);
 // Publishing 2026-11-23 17:00 UTC is already Nov 24 in Krasnoyarsk.
});
test('wrong authorized channel never scans other owners private videos',async()=>{
 const x=mockYoutube({authorized:false});
 const result=await discoverScheduledVideos('a-test-access-token',channel,x.fetchImpl,
   new Date('2026-11-18T10:00:00Z'));
 assert.equal(result.status,'NOT_AUTHORIZED');assert.equal(result.videos.length,0);
 assert.equal(x.calls.length,1);
 assert.equal(scheduledContentDays({...result,capturedAt:new Date().toISOString()}),null);
});
test('incomplete paginated YouTube inventory cannot claim a runway value',async()=>{
 const x=mockYoutube({hasMore:true});
 const now=new Date('2026-11-18T10:00:00Z');
 const result=await discoverScheduledVideos('a-test-access-token',channel,x.fetchImpl,now);
 assert.equal(result.status,'PARTIAL');assert.equal(result.complete,false);
 assert.equal(scheduledContentDays({...result,capturedAt:now.toISOString()},now),null);
});
test('an unavailable private video must not be interpreted as a complete zero-video schedule',async()=>{
 const x=mockYoutube({partialVideo:true});
 const now=new Date('2026-11-18T10:00:00Z');
 const result=await discoverScheduledVideos('a-test-access-token',channel,x.fetchImpl,now);
 assert.equal(result.complete,false);
 assert.equal(scheduledContentDays({...result,capturedAt:now.toISOString()},now),null);
});
test('no future publishAt and stale data cannot be misreported as a zero-day schedule',()=>{
 const now=new Date('2026-11-18T10:00:00Z');
 assert.equal(scheduledContentDays({status:'COMPLETE',complete:true,
   capturedAt:now.toISOString(),videos:[]},now),null);
 assert.equal(scheduledContentDays({status:'COMPLETE',complete:true,
   capturedAt:'2026-11-01T10:00:00Z',videos:[]},now),null);
});
