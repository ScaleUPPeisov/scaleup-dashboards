import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const workflow=readFileSync('.github/workflows/vyron-300-stable-release.yml','utf8');

describe('VYRON 3.0.0 stable release is physical-gated and exact-artifact only',()=>{
  it('cannot auto-release from a branch push',()=>{
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/on:\s*\n\s*push:/);
    expect(workflow).toContain("test \"$PHYSICAL_ACCEPTANCE\" = 'VYRON_3_0_0_PHYSICAL_PASS'");
    expect(workflow).toContain('test -n "$PHYSICAL_VIDEO_ID"');
  });

  it('requires exact successful Physical Candidate run and exact approved HEAD',()=>{
    expect(workflow).toContain("d['name']=='VYRON 3.0.0 Physical Candidate'");
    expect(workflow).toContain("d['conclusion']=='success'");
    expect(workflow).toContain("d['head_sha']==os.environ['APPROVED_HEAD']");
    expect(workflow).toContain('test "$BRANCH_HEAD" = "$APPROVED_HEAD"');
  });

  it('reuses the approved candidate artifact instead of rebuilding stable binaries',()=>{
    expect(workflow).toContain("gh run download \"$APPROVED_RUN_ID\"");
    expect(workflow).toContain("VYRON-3.0.0-PHYSICAL-CANDIDATE-arm64");
    expect(workflow).toContain('APPROVED_ARTIFACT_HASHES=PASS');
    expect(workflow).toContain('UPDATER_SIGNATURE_VERIFY=PASS');
    expect(workflow).not.toContain('npx tauri build');
  });

  it('publishes v3.0.0 then promotes only macOS updater feed',()=>{
    expect(workflow).toContain("TAG: v3.0.0");
    expect(workflow).toContain("gh release create \"$TAG\"");
    expect(workflow).toContain('vyron-updates/latest.json');
    expect(workflow).toContain("MACOS_UPDATER_FEED_3_0_0=PASS");
    expect(workflow).toContain("WINDOWS_FEED_UNCHANGED=PASS");
    expect(workflow).toContain("= '2.1.13'");
  });

  it('keeps final online updater acceptance explicitly pending after publication',()=>{
    expect(workflow).toContain('ONLINE_UPDATER_PHYSICAL_ACCEPTANCE=PENDING');
  });
});
