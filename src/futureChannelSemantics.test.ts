import {describe,expect,it,vi} from 'vitest';import {readFileSync} from 'node:fs';
import type {Channel,AutopilotSummary} from './types';
const fixture=vi.hoisted(()=>({settings:{autoUploadYoutube:true,youtubePublishSafeMode:true},
 sessions:vi.fn(async()=>[]),upload:vi.fn(),resume:vi.fn()}));
vi.mock('./store',()=>({useApp:{getState:()=>({settings:fixture.settings,jobs:[]})}}));
vi.mock('./api',()=>({api:{youtubeUploadSessions:fixture.sessions,youtubeUpload:fixture.upload,youtubeResumeUpload:fixture.resume}}));
import {runYoutubeAutopilotForChannel} from './youtubeAutopilot';
describe('future channel semantics',()=>{
 it('does not rename local production identity after YouTube bind or analytics sync',()=>{const a=readFileSync('src/AccountsPage.tsx','utf8'),y=readFileSync('src/youtubeIntelligence.ts','utf8');expect(a).not.toContain('name:p.channelTitle||exact.name');expect(y).not.toContain('name:ps.title||channel.name')});
 it('does not report intentionally future channels as OAuth failures',()=>{const d=readFileSync('src/DashboardOS.tsx','utf8'),c=readFileSync('src/ChannelsOS.tsx','utf8');expect(d).toContain('!isFutureChannel(c)&&!c.youtubeProfileId');expect(d).toContain('!isFutureChannel(c)&&settings.autoUploadYoutube');expect(c).toContain("isFutureChannel(c)?'Будущий канал':'YouTube не подключён'")});
 it('routes future-channel connection into YouTube Center',()=>{const c=readFileSync('src/ChannelsOS.tsx','utf8');expect(c).toContain("function openYoutube(c:Channel,tab:'publish'|'schedule'|'accounts')");expect(c).toContain("setPage('youtube')");expect(c).toContain("openYoutube(c,'accounts')")});
 it('keeps YouTube Autopilot hard-gated by OAuth',async()=>{
  // Test the entry point rather than its old spelling: an explicit limit of
  // zero now means unlimited, while a missing limit must still block work.
  for(const blocked of ['oauth','autopilot','safe-mode','missing-limit']){
   vi.clearAllMocks();
   fixture.settings={autoUploadYoutube:blocked!=='autopilot',youtubePublishSafeMode:blocked!=='safe-mode'};
   const channel={id:'synthetic',youtubeProfileId:blocked==='oauth'?undefined:'synthetic-profile',
    safeDailyUploadLimit:blocked==='missing-limit'?undefined:10} as Channel;
   const summary={uploads:0,errors:0,notes:[]} as unknown as AutopilotSummary;
   await runYoutubeAutopilotForChannel(channel,summary);
   expect(fixture.sessions,blocked).not.toHaveBeenCalled();
   expect(fixture.upload,blocked).not.toHaveBeenCalled();
   expect(fixture.resume,blocked).not.toHaveBeenCalled();
   expect(summary.uploads).toBe(0);
  }
 });
});
