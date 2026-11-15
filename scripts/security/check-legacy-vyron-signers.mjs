import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
