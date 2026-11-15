import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root=new URL('../../',import.meta.url);
const appConfig=JSON.parse(readFileSync(fileURLToPath(new URL('src-tauri/tauri.conf.json',root)),'utf8'));
const frozenWorkflow=readFileSync(fileURLToPath(new URL('.github/workflows/vyron-6118-macos-new-key-release.yml',root)),'utf8');
const buildScript=readFileSync(fileURLToPath(new URL('src-tauri/build.rs',root)),'utf8');
const publishScript=readFileSync(fileURLToPath(new URL('scripts/macos/vyron-617-publish-new-key.sh',root)),'utf8');
const probeConfig=JSON.parse(readFileSync(fileURLToPath(new URL('src-tauri/tauri.pr22-probe.conf.json',root)),'utf8'));
const probeScript=readFileSync(fileURLToPath(new URL('scripts/macos/vyron-pr22-release-validation.sh',root)),'utf8');
const updaterBridge=readFileSync(fileURLToPath(new URL('src-tauri/src/updater_bridge.rs',root)),'utf8');
const cargoManifest=readFileSync(fileURLToPath(new URL('src-tauri/Cargo.toml',root)),'utf8');

test('production updater config remains pinned to the existing 6.1.15 feed',()=>{
  assert.equal(appConfig.version,'6.1.15');
  assert.equal(appConfig.identifier,'studio.channelflow.desktop');
  assert.equal(appConfig.plugins.updater.endpoints[0],'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json');
});

test('unauthenticated tracked rotated-key overlays are absent',()=>{
  for(const name of ['tauri.617-rotated.conf.json','tauri.618-rotated.conf.json']){
    assert.equal(existsSync(fileURLToPath(new URL('src-tauri/'+name,root))),false,name+' must be generated only from an independently authenticated offline public key');
  }
});

test('release fingerprint bypass is limited to the isolated offline probe bundle',()=>{
  assert.equal(probeConfig.identifier,'studio.channelflow.desktop.pr22probe');
  assert.equal(probeConfig.bundle.createUpdaterArtifacts,false);
  assert.deepEqual(probeConfig.plugins.updater.endpoints,[]);
  assert.match(probeScript,/VYRON_NON_DISTRIBUTABLE_PROBE=studio\.channelflow\.desktop\.pr22probe/);
});

test('probe marker cannot bypass release safeguards without an isolated Tauri CLI overlay',()=>{
  assert.match(buildScript,/TAURI_CONFIG/);
  assert.match(buildScript,/verified_non_distributable_probe_overlay/);
  assert.match(buildScript,/requested_probe&&verified_non_distributable_probe_overlay\(\)/);
  assert.match(buildScript,/updater_endpoints_empty/);
  assert.match(buildScript,/app_only_bundle/);
  assert.match(cargoManifest,/\[build-dependencies\][\s\S]*serde_json = "1"/);
});

test('compromised updater public-key fingerprint is explicitly rejected at build and runtime',()=>{
  const minisign=Buffer.from(appConfig.plugins.updater.pubkey,'base64').toString('utf8').trimEnd().split(/\r?\n/);
  const publicKeyBytes=Buffer.from(minisign[1],'base64');
  const compromisedFingerprint=createHash('sha256').update(publicKeyBytes).digest('hex');
  assert.equal(publicKeyBytes.length,42);
  assert.match(buildScript,new RegExp(compromisedFingerprint));
  assert.match(updaterBridge,new RegExp(compromisedFingerprint));
  assert.match(updaterBridge,/COMPROMISED_LEGACY_UPDATER_KEY_SHA256/);
});

test('owner new-key publish script is frozen and cannot publish a release',()=>{
  assert.match(publishScript,/UPDATER_KEY_ROTATION_NOT_AUTHORIZED/);
  assert.doesNotMatch(publishScript,/gh release create|gh release upload|git push|TAURI_SIGNING_PRIVATE_KEY/);
});

test('release profile refuses builds without an independently authenticated updater fingerprint',()=>{
  assert.match(buildScript,/UPDATER_TRUST_FINGERPRINT_REQUIRED_FOR_RELEASE/);
  assert.match(buildScript,/VYRON_TRUSTED_UPDATER_PUBLIC_KEY_SHA256/);
});

test('6.1.18 release workflow is inert and cannot access signing or publishing secrets',()=>{
  assert.match(frozenWorkflow,/FROZEN/);
  assert.match(frozenWorkflow,/workflow_dispatch:/);
  assert.match(frozenWorkflow,/if:\s*\$\{\{\s*false\s*\}\}/);
  assert.doesNotMatch(frozenWorkflow,/TAURI_SIGNING_PRIVATE_KEY|TAURI_SIGNING_PRIVATE_KEY_PASSWORD|VYRON_RELEASES_TOKEN/);
  assert.doesNotMatch(frozenWorkflow,/gh release create|git push origin main|upload-artifact/);
});
