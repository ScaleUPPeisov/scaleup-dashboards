import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const frozenFiles=[
  "vyron-v091-signed-release-v2.yml",
  "vyron-v091-updater-bootstrap.yml",
  "vyron-v092-google-oauth-release.yml",
  "vyron-v093-release.yml",
  "vyron-v094-release.yml",
  "vyron-v095-release.yml",
  "vyron-v096-release.yml",
  "vyron-v097-release.yml",
  "vyron-v098-quota-session-release.yml",
  "vyron-v098-release.yml",
  "vyron-v099-quota-planner-release.yml"
];

for(const filename of frozenFiles){
  test(`legacy signing job stays disabled: ${filename}`,()=>{
    const contents=readFileSync(new URL(`../../.github/workflows/${filename}`,import.meta.url),'utf8');
    const triggerBlock=contents.split(/^jobs:\s*$/m)[0];
    assert.match(triggerBlock,/^  workflow_dispatch:\s*$/m);
    assert.doesNotMatch(triggerBlock,/^  push:\s*$/m);
    assert.match(contents,/^permissions:\s*\n  contents: read\s*$/m);
    assert.match(contents,/^  release-macos-arm64:\s*\n    # SECURITY FREEZE 2026-11-15:[^\n]*\n    if: \$\{\{ false \}\}\s*$/m);
    assert.match(contents,/secrets\.TAURI_SIGNING_PRIVATE_KEY/);
  });
}

test('no new GitHub Actions workflow may reference the compromised updater signing secret',()=>{
  const directory=new URL('../../.github/workflows/',import.meta.url);
  const knownFrozen=new Set([...frozenFiles,'vyron-219-rc3-self-signed.yml']);
  const offenders=[];
  for(const file of readdirSync(directory).filter(n=>/\.ya?ml$/.test(n))){
    const content=readFileSync(new URL(file,directory),'utf8');
    if(!/secrets\.TAURI_SIGNING_PRIVATE_KEY\b/.test(content))continue;
    if(file==='vyron-legacy-signing-freeze-gate.yml'){
      // The only permitted references are the read-only presence checks below.
      const gateJob=content.slice(content.indexOf('  verify-compromised-secrets-revoked:'));
      assert.ok(gateJob.includes("if: github.event_name == 'push' && github.ref == 'refs/heads/main'"));
      assert.equal(gateJob.split("secrets.TAURI_SIGNING_PRIVATE_KEY }}").length-1,1);
      assert.equal(gateJob.split("secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}").length-1,1);
      assert.ok(!content.slice(0,content.indexOf('  verify-compromised-secrets-revoked:')).includes('secrets.TAURI_SIGNING_PRIVATE_KEY'));
      continue;
    }
    if(!knownFrozen.has(file)){
      offenders.push(file);
      continue;
    }
    if(file==='vyron-219-rc3-self-signed.yml'){
      assert.match(content,/^  verify-build-publish-rc3:\s*\n    # SECURITY FREEZE 2026-11-15:[^\n]*\n    if: \$\{\{ false \}\}\s*$/m);
    }
  }
  assert.deepEqual(offenders,[],'Unexpected workflow references to compromised TAURI_SIGNING_PRIVATE_KEY secret');
});
