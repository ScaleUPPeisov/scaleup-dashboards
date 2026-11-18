import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
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
    'VYRON617_APPLE_DEVELOPER_ID_P12','VYRON_MACOS_SIGNING_P12_BASE64','VYRON617_NOTARY_APP_PASSWORD',
    'approved_pubkey_sha256','approved_apple_team_id','OWNER_APPLE_TEAM_PIN_MISMATCH','prepare-vyron-rotated-updater.mjs',
    'grep -Fxq "PUBLIC_KEY_SHA256=$TRUST_SHA"',
    'VYRON_TRUSTED_UPDATER_PUBLIC_KEY_SHA256',
    'minisign -Vm','codesign --verify --deep --strict',
    'Authority=Developer ID Application:',
    '2C8B0BD4EE1C000D29DD0667BF1068D4673692C9',
    'HISTORIC_APPLE_CERTIFICATE_FINGERPRINT_MISMATCH',
    'write-vyron-617-release-kit.mjs',
    'deliver_signed_rc_to_actions_artifact',
    'VYRON617-NOTARIZED-OWNER-RC-NOT-STABLE',
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

test('release kit is staged only after notarized GUI and signed updater, without automatic publication',()=>{
 const script=readFileSync(fileURLToPath(new URL('./write-vyron-617-release-kit.mjs',import.meta.url)),'utf8');
 for(const token of ['gui-bridge-status.txt','dmg_notarization=ACCEPTED','notarized_app_archive=NEW_KEY_MINISIGN_VERIFIED',
 'VYRON.app.tar.gz','one-time-GUI.dmg','latest.staging.json','release-manifest.json',
 'RELEASE-NOTES.md','owner_migration_verified:false','stable_feed_changed:false']){
   assert.ok(script.includes(token),'MISSING_RELEASE_KIT_GUARD: '+token);
 }
 assert.match(workflow,/if: \${{ inputs.deliver_signed_rc_to_actions_artifact }}/);
 assert.doesNotMatch(script,/gh release|git push|git tag|curl.*sh|release published/i);
});

test('synthetic release-kit fixture preserves signed archive bytes in feed, hashes and release notes',()=>{
 const root=mkdtempSync(join(tmpdir(),'vyron-617-kit-test-'));
 try{
  const evidence=join(root,'evidence'),output=join(root,'kit');mkdirSync(evidence);
  const dmg=join(root,'VYRON-6.1.17-one-time-GUI.dmg'),archive=join(root,'VYRON.app.tar.gz');
  writeFileSync(dmg,Buffer.alloc(200,0x23));
  writeFileSync(archive,Buffer.alloc(256,0x45));
  const minisign='untrusted comment: signature from tauri secret key\n'+Buffer.alloc(80,0x77).toString('base64')+'\ntrusted comment: timestamp:1770000000 file:VYRON.app.tar.gz\n'+Buffer.alloc(64,0x01).toString('base64')+'\n';
  const signature=Buffer.from(minisign).toString('base64');
  writeFileSync(archive+'.sig',signature);
  writeFileSync(join(evidence,'gui-bridge-status.txt'),[
   'gui_bootstrap=BUILT_NOT_PUBLISHED',
   'notarized_app_archive=NEW_KEY_MINISIGN_VERIFIED',
   'dmg_notarization=ACCEPTED',
   'release=HOLD_UNTIL_OWNER_APPROVAL'
  ].join('\n'));
  const env={...process.env,VYRON_RC_DMG:dmg,VYRON_RC_ARCHIVE:archive,VYRON_RC_EVIDENCE_DIR:evidence,
   VYRON_RC_RELEASE_KIT_DIR:output,VYRON_RC_SOURCE_SHA:'1'.repeat(40),VYRON_RC_TEAM_ID:'ABCDE12345',
   VYRON_RC_PUBKEY_SHA256:'2'.repeat(64)};
  const run=spawnSync(process.execPath,[fileURLToPath(new URL('./write-vyron-617-release-kit.mjs',import.meta.url))],{env,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const expected=createHash('sha256').update(readFileSync(archive)).digest('hex');
  const staged=JSON.parse(readFileSync(join(output,'updates/latest.staging.json'),'utf8'));
  assert.equal(staged.version,'6.1.17');
  assert.equal(staged.platforms['darwin-aarch64'].sha256,expected);
  assert.equal(staged.platforms['darwin-aarch64'].signature,signature);
  const manifest=JSON.parse(readFileSync(join(output,'release-manifest.json'),'utf8'));
  assert.equal(manifest.owner_migration_verified,false);
  assert.equal(manifest.stable_feed_changed,false);
  assert.equal(manifest.assets['VYRON.app.tar.gz'],expected);
  assert.match(readFileSync(join(output,'RELEASE-NOTES.md'),'utf8'),/33.channel migration/);
  const forbidden=spawnSync(process.execPath,[fileURLToPath(new URL('./write-vyron-617-release-kit.mjs',import.meta.url))],{
    env:{...env,VYRON_RC_PUBKEY_SHA256:'aa6fb45ab082ef39279e841dc40b0f85e5b33f23746f77557b6f93e3e72c2c06'},
    encoding:'utf8'
  });
  assert.notEqual(forbidden.status,0);
  assert.match(forbidden.stderr,/INVALID_OR_LEGACY_UPDATER_KEY/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
