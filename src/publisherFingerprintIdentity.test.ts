import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fingerprintForCurrentSource,type SourceFingerprint} from './publisherFingerprintIdentity';

describe('Publisher physical-source fingerprint cache identity',()=>{
  const old:SourceFingerprint={path:'/synthetic/channel/VIDEO_041.mp4',fingerprint:'a'.repeat(64),size:2048,modifiedAt:100};
  it('keeps verified cache only for the exact current file path',()=>{
    expect(fingerprintForCurrentSource(old,old.path)).toEqual(old);
    expect(fingerprintForCurrentSource(old,undefined)).toBeUndefined();
    expect(fingerprintForCurrentSource(old,old.path,true)).toBeUndefined();
    // A file with unchanged path, size and modifiedAt may have different bytes.
    // Force fresh requires the Rust command to calculate SHA-256 from disk.
  });
  it('never reuses VIDEO_041 SHA-256 for VIDEO_042 or VIDEO_043 with the same jobId',()=>{
    const currentPaths=['/synthetic/channel/VIDEO_042.mp4','/synthetic/channel/VIDEO_043.mp4'];
    for(const path of currentPaths)expect(fingerprintForCurrentSource(old,path)).toBeUndefined();
    const current:SourceFingerprint={path:currentPaths[0],fingerprint:'b'.repeat(64),size:2048,modifiedAt:100};
    expect(fingerprintForCurrentSource(current,currentPaths[0])?.fingerprint).toBe('b'.repeat(64));
  });
  it('Publisher UI checks source path in duplicate preflight, async selection and upload',()=>{
    const source=readFileSync('src/PublisherOS.tsx','utf8');
    expect(source).toContain('const fp=fingerprintForCurrentSource(fingerprints[j.id],j.finalPath)');
    expect(source).toContain('!fingerprintForCurrentSource(fingerprints[j.id],j.finalPath)');
    expect(source).toContain('const existing=fingerprintForCurrentSource(fingerprints[j.id],j.finalPath,forceFresh)');
    expect(source).toContain('const cache=forceFresh?undefined:useApp.getState().fingerprintCache[j.finalPath]');
    expect(source).toContain('const fp=await fingerprintForJob(j,true),selectedIndex=');
    expect(source).toContain('fp=await fingerprintForJob(j,true),expectedHash=');
  });
});
