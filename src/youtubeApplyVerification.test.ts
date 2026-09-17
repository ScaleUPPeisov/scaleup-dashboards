import {describe,it,expect} from 'vitest';
import {ESTIMATED_VIDEO_WRITE_UNITS,planYoutubeQuota} from './youtubeQuota';

describe('VYRON 2.0.10 verified YouTube Apply contract',()=>{
 it('reserves pre-read + one update + mandatory post-write videos.list',()=>{
  const p=planYoutubeQuota([{method:'videos.list',count:1},{method:'videos.update',count:1},{method:'videos.list',count:1}]);
  expect(ESTIMATED_VIDEO_WRITE_UNITS).toBe(52);
  expect(p.buckets.general.required).toBe(52);
 });
});
