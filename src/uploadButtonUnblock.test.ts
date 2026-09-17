import {describe,expect,it,vi} from 'vitest';
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
