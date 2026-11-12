import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appConfig=JSON.parse(readFileSync(fileURLToPath(new URL('../../src-tauri/tauri.conf.json',import.meta.url)),'utf8'));
const candidate=JSON.parse(readFileSync(fileURLToPath(new URL('../../src-tauri/tauri.617-rotated.conf.json',import.meta.url)),'utf8'));
const expectedPublicKeySha256='6f95fd039839eaa94cb378a67a0205e42e449a84c978674e20c5fb5abcfdfb19';
const stableFeed='https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json';

test('candidate is 6.1.17 and preserves stable app identity / existing updater feed',()=>{
  assert.equal(appConfig.version,'6.1.15');
  assert.equal(candidate.version,'6.1.17');
  assert.equal(candidate.identifier,appConfig.identifier);
  assert.equal(candidate.identifier,'studio.channelflow.desktop');
  assert.equal(candidate.bundle.createUpdaterArtifacts,true);
  assert.deepEqual(candidate.plugins.updater.endpoints,[stableFeed]);
  assert.equal(appConfig.plugins.updater.endpoints[0],stableFeed);
});

test('candidate embeds ONLY explicitly supplied replacement Minisign public key',()=>{
  const pub=candidate.plugins.updater.pubkey;
  assert.notEqual(pub,appConfig.plugins.updater.pubkey,'previous exposed-key trust root MUST NOT be reused');
  assert.equal(createHash('sha256').update(pub,'utf8').digest('hex'),expectedPublicKeySha256);
  const decoded=Buffer.from(pub,'base64').toString('utf8');
  assert.equal(Buffer.from(decoded,'utf8').toString('base64'),pub,'must be canonical base64');
  const lines=decoded.trimEnd().split('\n');
  assert.deepEqual(lines[0],'untrusted comment: minisign public key: 8133C9873FAB79C1');
  const bytes=Buffer.from(lines[1],'base64');
  assert.equal(lines.length,2);
  assert.equal(bytes.length,42);
  assert.equal(bytes.subarray(0,2).toString('utf8'),'Ed');
  assert.equal(bytes.subarray(2,10).toString('hex'),'c179ab3f87c93381');
});

test('6.1.17 candidate contains no secret-key path or signing environment',()=>{
  const text=readFileSync(fileURLToPath(new URL('../../src-tauri/tauri.617-rotated.conf.json',import.meta.url)),'utf8');
  assert.doesNotMatch(text,/TAURI_SIGNING_PRIVATE_KEY|TAURI_SIGNING_PRIVATE_KEY_PASSWORD|\.vyron-release-keys/);
  assert.equal(Object.keys(candidate.plugins.updater).sort().join(','),'endpoints,pubkey');
});
