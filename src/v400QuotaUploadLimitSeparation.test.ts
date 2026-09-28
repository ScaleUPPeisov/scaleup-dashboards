import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const quota=fs.readFileSync('src/youtubeQuota.ts','utf8');
const publisher=fs.readFileSync('src/PublisherOS.tsx','utf8');
const channels=fs.readFileSync('src/ChannelsOS.tsx','utf8');

describe('VYRON 4.0.0 API quota / upload allowance separation',()=>{
 it('does not turn legacy 100 into a provider-confirmed upload allowance',()=>{
  expect(quota).toContain("limitSource:row?.limitSource==='user-configured'||row?.limitSource==='google-cloud'?row.limitSource:'unknown'");
  expect(quota).toContain("source==='unknown'?null:row.configuredLimit");
  expect(quota).toContain("x.row.limitSource='unknown'");
 });
 it('labels provider allowance as unknown unless explicitly configured',()=>{
  expect(publisher).toContain('Остаток provider upload allowance');
  expect(publisher).toContain("uploadQuota.remaining==null?'Неизвестно'");
 });
 it('exposes per-channel VYRON limiter separately including explicit unlimited mode',()=>{
  expect(channels).toContain('Дневной лимит upload VYRON');
  expect(channels).toContain('без ограничения VYRON');
  expect(channels).toContain('safeDailyUploadLimit:n<0?undefined:n');
 });
});
