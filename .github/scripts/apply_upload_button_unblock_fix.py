#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1])

safety=root/'src/youtubePublishSafety.ts'
s=safety.read_text()
old="""const RECORDS='vyron:youtube-publish-records:v1',LOCKS='vyron:youtube-publish-locks:v1';"""
new="""const RECORDS='vyron:youtube-publish-records:v1';
// Upload locks protect concurrent videos.insert only while this frontend runtime is alive.
// Resumable sessions are persisted by the Rust backend; a dead frontend process must not
// leave a localStorage lock that disables publishing for up to two hours after restart.
let runtimeLocks:ChannelUploadLock[]=[];"""
if old not in s: raise SystemExit('youtubePublishSafety RECORDS/LOCKS anchor not found')
s=s.replace(old,new,1)
old="""function locks():ChannelUploadLock[]{return get<ChannelUploadLock[]>(LOCKS,[]).filter(x=>Date.now()-Date.parse(x.acquiredAt)<2*60*60*1000)}
export function acquireChannelUploadLock(channelId:string){const rows=locks();if(rows.some(x=>x.channelId===channelId))return null;const token=crypto.randomUUID();rows.push({channelId,token,acquiredAt:new Date().toISOString()});set(LOCKS,rows);return token}
export function releaseChannelUploadLock(channelId:string,token:string){set(LOCKS,locks().filter(x=>!(x.channelId===channelId&&x.token===token)))}
export function isChannelUploadLocked(channelId:string){return locks().some(x=>x.channelId===channelId)}"""
new="""function locks():ChannelUploadLock[]{return runtimeLocks}
export function acquireChannelUploadLock(channelId:string){if(runtimeLocks.some(x=>x.channelId===channelId))return null;const token=crypto.randomUUID();runtimeLocks=[...runtimeLocks,{channelId,token,acquiredAt:new Date().toISOString()}];return token}
export function releaseChannelUploadLock(channelId:string,token:string){runtimeLocks=runtimeLocks.filter(x=>!(x.channelId===channelId&&x.token===token))}
export function isChannelUploadLocked(channelId:string){return runtimeLocks.some(x=>x.channelId===channelId)}
export function clearRuntimeChannelUploadLocks(){runtimeLocks=[]}"""
if old not in s: raise SystemExit('youtubePublishSafety lock implementation anchor not found')
s=s.replace(old,new,1)
safety.write_text(s)

runtime=root/'src/publisherRuntime.ts'
s=runtime.read_text()
marker='export function publisherGlobalBlockReasons('
if marker not in s:
    s += """

export function publisherGlobalBlockReasons(x:{selectedCount:number;hasProfile:boolean;readyCount:number;quotaAffordable:boolean;scheduleSyncBlocked:boolean;locked:boolean;dailyRemaining?:number}){
 const reasons:string[]=[];
 if(x.selectedCount<=0)reasons.push('Выберите хотя бы одно видео');
 if(!x.hasProfile)reasons.push('Подключите YouTube для этого канала');
 if(x.readyCount<=0)reasons.push('Нет видео, готовых к загрузке');
 if(!x.quotaAffordable)reasons.push('Недостаточно YouTube API quota для этой партии');
 if(x.scheduleSyncBlocked)reasons.push('Сначала синхронизируйте расписание с YouTube');
 if(x.locked)reasons.push('Канал занят текущей загрузкой');
 if(x.dailyRemaining!=null&&x.dailyRemaining<=0)reasons.push('Достигнут безопасный лимит загрузок канала за 24 часа');
 return reasons
}
"""
runtime.write_text(s)

pub=root/'src/PublisherOS.tsx'
s=pub.read_text()
old="import {canonicalSelectedJobs,publisherPreflightItems,publisherUploadButtonLabel} from './publisherRuntime';"
new="import {canonicalSelectedJobs,publisherGlobalBlockReasons,publisherPreflightItems,publisherUploadButtonLabel} from './publisherRuntime';"
if old not in s: raise SystemExit('PublisherOS publisherRuntime import anchor not found')
s=s.replace(old,new,1)
old="""const missingMetadata=preflight.items.filter(x=>x.issues.some(i=>i.code==='MISSING_TITLE')).length,missingSchedule=preflight.items.filter(x=>x.issues.some(i=>i.code==='MISSING_SCHEDULE')).length,pastSchedule=preflight.items.filter(x=>x.issues.some(i=>i.code==='PAST_SCHEDULE')).length,scheduleSyncBlocked=draft.scheduleMode!=='file'&&scheduleSync.state!=='ready',locked=isChannelUploadLocked(channelId),preflightBlocked=!selected.length||!profileId||!uploadableSelected.length||!quotaPlan.affordable||scheduleSyncBlocked||locked||(daily.remaining!=null&&daily.remaining<=0);const general=quotaPlan.buckets.general,uploads=quotaPlan.buckets.videoUploads,remaining=Math.max(0,quota.limit-quota.used);"""
new="""const missingMetadata=preflight.items.filter(x=>x.issues.some(i=>i.code==='MISSING_TITLE')).length,missingSchedule=preflight.items.filter(x=>x.issues.some(i=>i.code==='MISSING_SCHEDULE')).length,pastSchedule=preflight.items.filter(x=>x.issues.some(i=>i.code==='PAST_SCHEDULE')).length,scheduleSyncBlocked=draft.scheduleMode!=='file'&&scheduleSync.state!=='ready',locked=isChannelUploadLocked(channelId),globalBlockReasons=publisherGlobalBlockReasons({selectedCount:selected.length,hasProfile:Boolean(profileId),readyCount:uploadableSelected.length,quotaAffordable:quotaPlan.affordable,scheduleSyncBlocked,locked,dailyRemaining:daily.remaining}),preflightBlocked=globalBlockReasons.length>0;const general=quotaPlan.buckets.general,uploads=quotaPlan.buckets.videoUploads,remaining=Math.max(0,quota.limit-quota.used);"""
if old not in s: raise SystemExit('PublisherOS preflightBlocked anchor not found')
s=s.replace(old,new,1)
old="""</span></div>{duplicates.length>0&&<label className=\"checkLine\">"""
new="""</span></div>{globalBlockReasons.length>0&&<div className=\"publishCheck warn\"><b>Почему загрузка сейчас недоступна</b><span>{globalBlockReasons.join(' • ')}</span></div>}{duplicates.length>0&&<label className=\"checkLine\">"""
if old not in s: raise SystemExit('PublisherOS blocker UI anchor not found')
s=s.replace(old,new,1)
old="""<button className=\"primary\" disabled={busy||preflightBlocked} onClick={()=>runBatch()}>{publisherUploadButtonLabel(selected.length,uploadableSelected.length)}</button>"""
new="""<button className=\"primary\" disabled={busy||preflightBlocked} onClick={()=>runBatch()}>{scheduleSyncBlocked?'СНАЧАЛА СИНХРОНИЗИРУЙТЕ РАСПИСАНИЕ':locked?'КАНАЛ ЗАНЯТ ТЕКУЩЕЙ ЗАГРУЗКОЙ':publisherUploadButtonLabel(selected.length,uploadableSelected.length)}</button>"""
if old not in s: raise SystemExit('PublisherOS primary upload button anchor not found')
s=s.replace(old,new,1)
pub.write_text(s)

test=root/'src/uploadButtonUnblock.test.ts'
test.write_text("""import {describe,expect,it,vi} from 'vitest';
import {publisherGlobalBlockReasons} from './publisherRuntime';

describe('upload button global gates',()=>{
 it('explains schedule synchronization gate instead of an inert button',()=>{
  expect(publisherGlobalBlockReasons({selectedCount:55,hasProfile:true,readyCount:55,quotaAffordable:true,scheduleSyncBlocked:true,locked:false,dailyRemaining:99})).toEqual(['Сначала синхронизируйте расписание с YouTube']);
 });
 it('has no hidden global blocker after schedule sync when capacity is valid',()=>{
  expect(publisherGlobalBlockReasons({selectedCount:55,hasProfile:true,readyCount:55,quotaAffordable:true,scheduleSyncBlocked:false,locked:false,dailyRemaining:99})).toEqual([]);
 });
 it('explains a live runtime upload lock',()=>{
  expect(publisherGlobalBlockReasons({selectedCount:55,hasProfile:true,readyCount:55,quotaAffordable:true,scheduleSyncBlocked:false,locked:true,dailyRemaining:99})).toEqual(['Канал занят текущей загрузкой']);
 });
});

describe('channel upload lock lifetime',()=>{
 it('blocks concurrent videos.insert in the same runtime and releases explicitly',async()=>{
  const m=await import('./youtubePublishSafety');
  m.clearRuntimeChannelUploadLocks();
  const token=m.acquireChannelUploadLock('channel-a');
  expect(token).toBeTruthy();
  expect(m.isChannelUploadLocked('channel-a')).toBe(true);
  expect(m.acquireChannelUploadLock('channel-a')).toBeNull();
  m.releaseChannelUploadLock('channel-a',token!);
  expect(m.isChannelUploadLocked('channel-a')).toBe(false);
 });
 it('does not restore the old runtime lock after a fresh module boot',async()=>{
  const first=await import('./youtubePublishSafety');
  first.clearRuntimeChannelUploadLocks();
  expect(first.acquireChannelUploadLock('channel-restart')).toBeTruthy();
  expect(first.isChannelUploadLocked('channel-restart')).toBe(true);
  vi.resetModules();
  const fresh=await import('./youtubePublishSafety');
  expect(fresh.isChannelUploadLocked('channel-restart')).toBe(false);
  fresh.clearRuntimeChannelUploadLocks();
 });
});
""")
print('upload button unblock fix applied')
