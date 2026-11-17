import {createHash} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {verifyQueuedSourceFingerprint} from './uploadQueueSourceVerification';

const sha=(x:string)=>createHash('sha256').update(x).digest('hex');
describe('YouTube upload queue last-moment physical source verification',()=>{
  it('accepts byte-identical current files and normalizes SHA-256 casing',async()=>{
    const current=sha('VIDEO_041 synthetic content');
    const scan=vi.fn(async()=>({fingerprint:current,size:100}));
    await verifyQueuedSourceFingerprint({filePath:'/synthetic/VIDEO_041.mp4',fingerprint:current.toUpperCase(),fileSize:100},scan);
    expect(scan).toHaveBeenCalledExactlyOnceWith('/synthetic/VIDEO_041.mp4');
  });
  it('blocks changed content even if file size and mtime are identical',async()=>{
    const scan=vi.fn(async()=>({fingerprint:sha('VIDEO_042 different bytes'),size:100,modifiedAt:1}));
    await expect(verifyQueuedSourceFingerprint({filePath:'/synthetic/VIDEO_041.mp4',fingerprint:sha('VIDEO_041 original bytes'),fileSize:100},scan)).rejects.toThrow(/UPLOAD_QUEUE_SOURCE_CHANGED/);
  });
  it('blocks different file sizes before any upload execution',async()=>{
    await expect(verifyQueuedSourceFingerprint({filePath:'/synthetic/VIDEO_043.mp4',fingerprint:sha('same'),fileSize:100},async()=>({fingerprint:sha('same'),size:101}))).rejects.toThrow(/UPLOAD_QUEUE_SOURCE_CHANGED/);
  });
  it('does not collapse VIDEO_041, 042 and 043 content identities',()=>{
    expect(new Set(['VIDEO_041','VIDEO_042','VIDEO_043'].map(x=>sha('synthetic '+x))).size).toBe(3);
  });
  it('production queue requires full scan before reserving YouTube API quota',()=>{
    const source=readFileSync('src/uploadQueueRuntime.ts','utf8');
    const verify=source.indexOf('await verifyQueuedSourceFingerprint(spec,path=>api.youtubeFileFingerprint(path))');
    const reserve=source.indexOf('const quota=reserveYoutubeQuotaAtomic(',verify);
    expect(verify).toBeGreaterThan(-1);
    expect(reserve).toBeGreaterThan(verify);
  });
});
