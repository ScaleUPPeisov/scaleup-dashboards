import {describe,it,expect} from 'vitest';
import {planYoutubeQuota} from './youtubeQuota';

describe('VYRON 2.0.11 existing videos quota contracts',()=>{
 it('prices changed metadata as pre-read + update + verify and authoritative batch backup',()=>{
  const p=planYoutubeQuota([{method:'videos.list',count:1},{method:'videos.list',count:3},{method:'videos.update',count:2},{method:'videos.list',count:2}]);
  expect(p.buckets.general.required).toBe(1+3+100+2);
 });
 it('prices playlist add/remove with pre-read and mandatory verify',()=>{
  const add=planYoutubeQuota([{method:'playlistItems.list',count:4},{method:'playlistItems.insert',count:4},{method:'playlistItems.list',count:4}]);
  const remove=planYoutubeQuota([{method:'playlistItems.list',count:4},{method:'playlistItems.delete',count:4},{method:'playlistItems.list',count:4}]);
  expect(add.buckets.general.required).toBe(208);
  expect(remove.buckets.general.required).toBe(208);
 });
});
