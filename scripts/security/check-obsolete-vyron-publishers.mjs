import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// These obsolete release jobs must never dispatch, sign, or publish assets.
const frozenJobs=[
  [
    "vyron-219-rc3-self-signed.yml",
    "verify-build-publish-rc3"
  ],
  [
    "vyron-300-stable-release.yml",
    "stable-release"
  ],
  [
    "vyron-512-macos-fast-promote.yml",
    "promote"
  ],
  [
    "vyron-512-windows-fast-promote.yml",
    "promote"
  ],
  [
    "vyron-inapp-updater.yml",
    "publish"
  ],
  [
    "vyron-v050-publish.yml",
    "publish"
  ],
  [
    "vyron-v091-key-normalizer-fix.yml",
    "patch"
  ],
  [
    "vyron-v091-kickoff.yml",
    "dispatch"
  ],
  [
    "vyron-v091-signed-release-v2-kickoff.yml",
    "dispatch"
  ]
];

for(const [filename,job] of frozenJobs){
  test(`obsolete publisher is inert: ${filename}`,()=>{
    const source=readFileSync(new URL(`../../.github/workflows/${filename}`,import.meta.url),'utf8');
    const header=source.split(/^jobs:\s*$/m)[0];
    assert.match(header,/^  workflow_dispatch:\s*$/m);
    assert.doesNotMatch(header,/^  push:\s*$/m);
    assert.doesNotMatch(header,/^  release:\s*$/m);
    assert.doesNotMatch(header,/^  contents: write\s*$/m);
    assert.doesNotMatch(header,/^  actions: write\s*$/m);
    const marker='  '+job+':\\n';
    const start=source.indexOf('  '+job+':\n');
    assert.ok(start>=0,`missing job ${job}`);
    const suffix=source.slice(start+'  '.length+job.length+2);
    assert.match(suffix,/^    # SECURITY FREEZE 2026-11-15:[^\n]*\n    if: \$\{\{ false \}\}\s*$/m);
  });
}
