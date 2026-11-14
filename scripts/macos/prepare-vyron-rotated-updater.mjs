#!/usr/bin/env node
// Prepare a NON-PRODUCTION Tauri config overlay for the first trusted-key bridge
// and subsequent releases. No private key is read, printed or stored here.
// The old updater key is compromised; this tool refuses to reuse it.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const sourceConfigPath = fileURLToPath(new URL('../../src-tauri/tauri.conf.json', import.meta.url));
const args = new Map();
for (let i=2; i<process.argv.length; i+=2) {
  const flag = process.argv[i];
  if (!['--public-key-file','--output','--version'].includes(flag) || !process.argv[i+1]) {
    throw new Error('USAGE: --public-key-file <offline-owned .pub> --output <temporary absolute overlay path> --version <semver>');
  }
  if (args.has(flag)) throw new Error('DUPLICATE_OPTION');
  args.set(flag, process.argv[i+1]);
}
for (const flag of ['--public-key-file','--output','--version']) {
  if (!args.has(flag)) throw new Error('MISSING_REQUIRED_OPTION: '+flag);
}
const version = args.get('--version');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('INVALID_RELEASE_VERSION');
const output = args.get('--output');
if (!output.startsWith('/')) throw new Error('TEMPORARY_ABSOLUTE_OUTPUT_REQUIRED');
if (resolve(output)===resolve(sourceConfigPath)) throw new Error('PRODUCTION_CONFIG_MUST_NOT_BE_MODIFIED');

const stable = JSON.parse(readFileSync(sourceConfigPath,'utf8'));
if (stable.identifier!=='studio.channelflow.desktop') throw new Error('BUNDLE_IDENTITY_CHANGED');
if (stable.plugins?.updater?.endpoints?.[0]!=='https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json') {
  throw new Error('STABLE_UPDATE_FEED_CHANGED');
}
const currentTriplet = stable.version.split('.').map(Number);
const targetTriplet = version.split('-')[0].split('.').map(Number);
const newer = targetTriplet.some((part,index)=>part>currentTriplet[index] && targetTriplet.slice(0,index).every((n,j)=>n===currentTriplet[j]));
if (!newer) throw new Error('VERSION_NOT_NEWER_THAN_STABLE');

const supplied = readFileSync(args.get('--public-key-file'),'utf8').trim();
let encoded = supplied;
let decoded = '';
// Tauri .pub files normally contain base64-encoded minisign public-key text.
// A raw minisign public-key file is accepted and encoded for Tauri config.
if (supplied.startsWith('untrusted comment:')) {
  decoded = supplied;
  encoded = Buffer.from(supplied+'\n','utf8').toString('base64');
} else {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(supplied)) throw new Error('INVALID_PUBLIC_KEY_BASE64');
  const bytes = Buffer.from(supplied,'base64');
  if (bytes.toString('base64')!==supplied) throw new Error('NONCANONICAL_PUBLIC_KEY');
  decoded = bytes.toString('utf8');
}
const lines = decoded.trimEnd().split(/\r?\n/);
if (lines.length!==2 || !lines[0].startsWith('untrusted comment: minisign public key: ') ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(lines[1])) throw new Error('INVALID_MINISIGN_PUBLIC_KEY');
const publicBytes = Buffer.from(lines[1],'base64');
if (publicBytes.length!==42 || publicBytes[0]!==69 || publicBytes[1]!==100) {
  throw new Error('INVALID_MINISIGN_ED25519_KEY');
}
if (encoded===stable.plugins.updater.pubkey) throw new Error('COMPROMISED_LEGACY_KEY_FORBIDDEN');
const overlay = {
  version,
  identifier: stable.identifier,
  bundle: {createUpdaterArtifacts: true},
  plugins: {updater:{
    pubkey: encoded,
    endpoints: [stable.plugins.updater.endpoints[0]]
  }}
};
writeFileSync(output,JSON.stringify(overlay,null,2)+'\n',{flag:'wx',mode:0o600});
const fingerprint=createHash('sha256').update(publicBytes).digest('hex');
process.stdout.write('ROTATED_UPDATER_OVERLAY_READY=PASS\n');
process.stdout.write('PUBLIC_KEY_SHA256='+fingerprint+'\n');
process.stdout.write('STABLE_FEED_PINNED=PASS\n');
process.stdout.write('NO_PRIVATE_KEY_USED=PASS\n');
