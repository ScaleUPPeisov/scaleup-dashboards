import {describe,it,expect} from 'vitest';
import {isYoutubeQuotaError,shouldClearYoutubeQuotaGuard} from './youtubeQuota';
describe('YouTube quota rollover 2.0.1',()=>{
 it('clears a provider guard from an older Pacific quota day',()=>{expect(shouldClearYoutubeQuotaGuard({blocked:true,ptDate:'2026-09-03',resetAt:'2026-09-04T07:00:00.000Z'},new Date('2026-09-04T08:00:00.000Z'))).toBe(true)});
 it('keeps a current-window provider guard until its reset',()=>{expect(shouldClearYoutubeQuotaGuard({blocked:true,ptDate:'2026-09-04',resetAt:'2026-09-05T07:00:00.000Z'},new Date('2026-09-04T20:00:00.000Z'))).toBe(false)});
 it('does not re-latch on VYRON local quota copy',()=>{expect(isYoutubeQuotaError('YouTube API quota временно исчерпана. Сброс: 14:00.')).toBe(false);expect(isYoutubeQuotaError('The request cannot be completed because you have exceeded your quota. [quotaExceeded]')).toBe(true)});
});
