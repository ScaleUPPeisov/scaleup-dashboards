import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const publisher=fs.readFileSync('src/PublisherOS.tsx','utf8');

function localCleanupBody(){
  const start=publisher.indexOf('async function removeReady');
  const end=publisher.indexOf('async function fingerprintForJob',start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return publisher.slice(start,end);
}

describe('VYRON 5.0.1 local cleanup zero-quota contract',()=>{
  it('never calls YouTube API while moving already verified local files to Trash',()=>{
    const body=localCleanupBody();
    expect(body).not.toContain('youtubeVideoProcessingStatus(');
    expect(body).not.toContain('youtubeVideoProcessingStatusBatch(');
    expect(body).not.toContain('youtubeListExisting(');
    expect(body).not.toContain('youtubeRetryExistingHydration(');
    expect(body).toContain('localSourceStatus(');
    expect(body).toContain('youtubeFileFingerprint(');
    expect(body).toContain('trashLocalFile(');
    expect(body).toContain('youtubeApiRequests:0');
  });

  it('keeps the post-cleanup render rescan local-only',()=>{
    const body=localCleanupBody();
    expect(body).toContain("scanRenderFolder('cleanup')");
  });
});
