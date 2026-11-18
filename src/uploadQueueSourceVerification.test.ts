import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {verifyQueuedSourceFingerprint} from './uploadQueueSourceVerification';

// WebCrypto uses the DOM types already included in VYRON tsconfig, while the
// native uploader uses the Rust SHA-256 implementation.
async function sha(value:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
describe('YouTube upload queue last-moment physical source verification',()=>{
  it('accepts byte-identical current files and normalizes SHA-256 casing',async()=>{
    const current=await sha('VIDEO_041 synthetic content');
    const scan=vi.fn(async()=>({fingerprint:current,size:100}));
    await verifyQueuedSourceFingerprint({filePath:'/synthetic/VIDEO_041.mp4',fingerprint:current.toUpperCase(),fileSize:100},scan);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith('/synthetic/VIDEO_041.mp4');
  });
  it('blocks changed content even if file size and mtime are identical',async()=>{
    const other=await sha('VIDEO_042 different bytes');
    const original=await sha('VIDEO_041 original bytes');
    const scan=vi.fn(async()=>({fingerprint:other,size:100,modifiedAt:1}));
    await expect(verifyQueuedSourceFingerprint({filePath:'/synthetic/VIDEO_041.mp4',fingerprint:original,fileSize:100},scan)).rejects.toThrow(/UPLOAD_QUEUE_SOURCE_CHANGED/);
  });
  it('blocks different file sizes before any upload execution',async()=>{
    const same=await sha('same');
    await expect(verifyQueuedSourceFingerprint({filePath:'/synthetic/VIDEO_043.mp4',fingerprint:same,fileSize:100},async()=>({fingerprint:same,size:101}))).rejects.toThrow(/UPLOAD_QUEUE_SOURCE_CHANGED/);
  });
  it('does not collapse VIDEO_041, 042 and 043 content identities',async()=>{
    const hashes=await Promise.all(['VIDEO_041','VIDEO_042','VIDEO_043'].map(x=>sha('synthetic '+x)));
    expect(new Set(hashes).size).toBe(3);
  });
  it('production queue checks full bytes before reserving YouTube API quota',()=>{
    const source=readFileSync('src/uploadQueueRuntime.ts','utf8');
    const verify=source.indexOf('await verifyQueuedSourceFingerprint(spec,path=>api.youtubeFileFingerprint(path))');
    const reserve=source.indexOf('const quota=reserveYoutubeQuotaAtomic(',verify);
    expect(verify).toBeGreaterThan(-1);
    expect(reserve).toBeGreaterThan(verify);
  });
});
