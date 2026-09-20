import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');

describe('VYRON RC7 Publisher render scan wiring',()=>{
  it('has no global workspace fallback inside channel scan',()=>{
    const p=read('src/PublisherOS.tsx');
    expect(p).toContain("channelRenderFolder=(channel?.renderFolderPath||'').trim()");
    expect(p).toContain('CHANNEL_RENDER_FOLDER_NOT_CONFIGURED');
    const fn=p.split('async function scanRenderFolder()').at(1)!.split('function addScannedRenderCandidates')[0];
    expect(fn).toContain('const root=channelRenderFolder');
    expect(fn).not.toContain('settings.workspace');
  });
  it('blocks cross-channel recovery jobs from selectable uploads',()=>{
    const p=read('src/PublisherOS.tsx');
    expect(p).toContain("!recoveryJobIds.has(j.id)");
    expect(p).toContain('CROSS_CHANNEL_SCAN_RECOVERY_REQUIRED');
  });
  it('persists exact render path on stable local Channel, not OAuth profile',()=>{
    const t=read('src/types.ts');
    const p=read('src/PublisherOS.tsx');
    expect(t).toContain('renderFolderPath?:string');
    expect(p).toContain("updateChannel(channel.id,{renderFolderPath:selected})");
  });
});
