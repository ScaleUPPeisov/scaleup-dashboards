import {describe,it,expect} from 'vitest';
import {isYoutubeQuotaError} from './youtubeQuota';

describe('YouTube quota guard',()=>{
  it('detects real quotaExceeded errors',()=>{
    expect(isYoutubeQuotaError(new Error('The request cannot be completed because you have exceeded your quota. [quotaExceeded]'))).toBe(true);
    expect(isYoutubeQuotaError('YOUTUBE_QUOTA_PAUSED: daily quota')).toBe(true);
  });
  it('does not classify ordinary YouTube errors as quota',()=>{
    expect(isYoutubeQuotaError(new Error('invalidPublishAt'))).toBe(false);
    expect(isYoutubeQuotaError(new Error('network timeout'))).toBe(false);
  });
});
