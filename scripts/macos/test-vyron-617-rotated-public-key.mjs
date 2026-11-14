import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root=new URL('../../',import.meta.url);
const appConfig=JSON.parse(readFileSync(fileURLToPath(new URL('src-tauri/tauri.conf.json',root)),'utf8'));
const frozenWorkflow=readFileSync(fileURLToPath(new URL('.github/workflows/vyron-6118-macos-new-key-release.yml',root)),'utf8');
const buildScript=readFileSync(fileURLToPath(new URL('src-tauri/build.rs',root)),'utf8');

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
