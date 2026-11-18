import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const workflow=readFileSync(fileURLToPath(new URL('../../.github/workflows/vyron-617-rotated-signed-rc.yml',import.meta.url)),'utf8');

test('new-key RC pipeline runs only by manual approval and cannot publish',()=>{
  assert.match(workflow,/^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/\n  (push|pull_request|schedule):/);
  assert.match(workflow,/environment: vyron-rotated-key-rc/);
  assert.match(workflow,/runs-on: macos-15-arm64/);
  assert.doesNotMatch(workflow,/runs-on: macos-15\n/);
  assert.match(workflow,/BUILD_ONLY_NO_RELEASE/);
  assert.match(workflow,/test "\$HEAD_SHA" = "\$GITHUB_SHA"/);
  assert.doesNotMatch(workflow,/gh release (create|upload)|git push|git tag|git merge/);
  assert.doesNotMatch(workflow,/actions\/upload-artifact@v4[\s\S]*path:.*bundle\/macos/);
});
test('new signer and notarization have independent trust, hard failure, and no old-key fallback',()=>{
  const required=[
    'VYRON617_NEW_TAURI_PRIVATE_KEY','VYRON617_NEW_TAURI_PUBLIC_KEY_B64',
    'VYRON617_APPLE_DEVELOPER_ID_P12','VYRON617_NOTARY_APP_PASSWORD',
    'approved_pubkey_sha256','prepare-vyron-rotated-updater.mjs',
    'grep -Fxq "PUBLIC_KEY_SHA256=$TRUST_SHA"',
    'VYRON_TRUSTED_UPDATER_PUBLIC_KEY_SHA256',
    'minisign -Vm','codesign --verify --deep --strict',
    'xcrun notarytool submit','xcrun stapler validate','spctl --assess'
  ];
  for (const name of required) assert.ok(workflow.includes(name),'MISSING_RC_SECURITY_GATE: '+name);
  assert.doesNotMatch(workflow,/secrets\.TAURI_SIGNING_PRIVATE_KEY\b|secrets\.APPLE_CERTIFICATE\b/);
  assert.match(workflow,/rc-evidence\//);
  assert.match(workflow,/stable_feed=UNCHANGED/);
  assert.match(workflow,/owner_migration=NOT_TESTED/);
  assert.match(workflow,/release=BLOCKED_UNTIL_TRUSTED_BOOTSTRAP_AND_APPROVAL/);
  assert.match(workflow,/finalize-vyron-617-gui-candidate.sh/);
});
test('GUI bootstrap contains notarized app and re-signed Tauri update without production publication',()=>{
  const script=readFileSync(fileURLToPath(new URL('./finalize-vyron-617-gui-candidate.sh',import.meta.url)),'utf8');
  const posStapled=script.indexOf('xcrun stapler validate "$APP"');
  const posRepack=script.indexOf('COPYFILE_DISABLE=1 tar -czf "$ARCHIVE"');
  const posResign=script.indexOf('npx tauri signer sign --app-version 6.1.17 "$ARCHIVE"');
  assert.ok(posStapled>=0&&posStapled<posRepack&&posRepack<posResign,'ticket must exist before update archive signing');
  assert.ok(script.indexOf('tar -xzf "$ARCHIVE"')>posResign,'post-staple updater payload must be extracted and verified');
  assert.match(script,/spctl --assess --type execute --verbose=4 "\$EXTRACTED\/VYRON\.app"/);
  for(const term of ['studio.channelflow.desktop','minisign -Vm','VYRON.app','hdiutil create','ln -s /Applications',
    'xcrun notarytool submit "$DMG"','xcrun stapler validate "$DMG"',
    'spctl --assess --type open','gui_bootstrap=BUILT_NOT_PUBLISHED']){
    assert.ok(script.includes(term),'MISSING_GUI_BRIDGE_GATE: '+term);
  }
  assert.doesNotMatch(script,/gh release|git push|curl.*sh|spctl --master-disable|xattr -dr/);
  assert.match(workflow,/VYRON617-SIGNED-RC-EVIDENCE-ONLY/);
  assert.doesNotMatch(workflow,/upload-artifact@v4\s*\n\s*with:\s*\n\s*name: .*\.dmg/);
});
