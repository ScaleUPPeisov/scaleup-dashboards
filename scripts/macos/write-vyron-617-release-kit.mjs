#!/usr/bin/env node
// Assemble a candidate release set from artifacts already signed and notarized by
// the guarded macOS release job. This tool cannot sign, notarize, or publish.
import {createHash} from 'node:crypto';
import {copyFileSync,mkdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';
const get=(key)=>{const v=process.env[key];if(!v)throw Error('RELEASE_KIT_INPUT_MISSING: '+key);return v};
const src=get('VYRON_RC_SOURCE_SHA');
const key=get('VYRON_RC_PUBKEY_SHA256').toLowerCase();
const team=get('VYRON_RC_TEAM_ID');
if(!/^[a-f0-9]{40}$/.test(src))throw Error('INVALID_SOURCE_SHA');
if(!/^[a-f0-9]{64}$/.test(key)||key==='aa6fb45ab082ef39279e841dc40b0f85e5b33f23746f77557b6f93e3e72c2c06')throw Error('INVALID_OR_LEGACY_UPDATER_KEY');
if(!/^[A-Z0-9]{10}$/.test(team))throw Error('INVALID_APPLE_TEAM_ID');
const dmg=get('VYRON_RC_DMG'),archive=get('VYRON_RC_ARCHIVE'),signature=archive+'.sig';
const evidence=get('VYRON_RC_EVIDENCE_DIR'),output=get('VYRON_RC_RELEASE_KIT_DIR');
if(basename(archive)!=='VYRON.app.tar.gz'||basename(dmg)!=='VYRON-6.1.17-one-time-GUI.dmg')throw Error('UNEXPECTED_RELEASE_ASSET_NAME');
if(resolve(output)===resolve(evidence))throw Error('RELEASE_KIT_MUST_BE_SEPARATE_FROM_EVIDENCE');
const gate=readFileSync(join(evidence,'gui-bridge-status.txt'),'utf8');
for(const claim of ['gui_bootstrap=BUILT_NOT_PUBLISHED','notarized_app_archive=NEW_KEY_MINISIGN_VERIFIED','dmg_notarization=ACCEPTED','release=HOLD_UNTIL_OWNER_APPROVAL']){
 if(!gate.split(/\r?\n/).includes(claim))throw Error('RELEASE_KIT_GATE_MISSING: '+claim);
}
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const paths=[dmg,archive,signature];
for(const path of paths)if(statSync(path).size<100)throw Error('RELEASE_ASSET_EMPTY: '+basename(path));
const sigB64=readFileSync(signature,'utf8').trim();
if(!/^[A-Za-z0-9+/]+={0,2}$/.test(sigB64))throw Error('INVALID_TAURI_SIGNATURE');
const sigText=Buffer.from(sigB64,'base64').toString('utf8');
if(Buffer.from(sigText).toString('base64')!==sigB64||!sigText.startsWith('untrusted comment: signature from tauri secret key\n')||!sigText.includes('\ntrusted comment:'))throw Error('INVALID_MINISIGN_SIGNATURE_CONTAINER');
const fileDigests=Object.fromEntries(paths.map(x=>[basename(x),digest(x)]));
const archiveSha=fileDigests['VYRON.app.tar.gz'];
const notes='VYRON 6.1.17 — production-identity Apple Silicon release candidate. The initial migration from installed 6.1.15 requires one separately authenticated notarized GUI replacement because its Tauri updater key was compromised. Following releases use the existing Settings updater with the NEW key. No app data is intentionally removed. Real-device migration of 33 channels, SQLite/WAL, OAuth/Keychain, queue and rollback remains REQUIRED before public release.';
const stagingFeed={version:'6.1.17',notes,pub_date:new Date().toISOString(),platforms:{'darwin-aarch64':{url:'https://github.com/ScaleUPPeisov/vyron-releases/releases/download/v6.1.17/VYRON.app.tar.gz',signature:sigB64,sha256:archiveSha}}};
const manifest={format:'vyron-617-release-kit-v1',status:'SIGNED_RC_PENDING_OWNER_M1_MIGRATION_AND_APPROVAL',source_sha:src,version:'6.1.17',bundle_id:'studio.channelflow.desktop',architecture:'arm64',apple_team_id:team,approved_new_tauri_pubkey_sha256:key,stable_feed_changed:false,owner_migration_verified:false,assets:fileDigests};
mkdirSync(join(output,'updates'),{recursive:true,mode:0o700});
for(const path of paths)copyFileSync(path,join(output,basename(path)));
for(const path of paths)writeFileSync(join(output,basename(path)+'.sha256'),fileDigests[basename(path)]+'  '+basename(path)+'\n');
writeFileSync(join(output,'updates/latest.staging.json'),JSON.stringify(stagingFeed,null,2)+'\n');
writeFileSync(join(output,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(join(output,'RELEASE-NOTES.md'),'# VYRON 6.1.17 — ARM64 RC\n\n'+notes+'\n\n## One-time GUI installation\n\nAfter separately authenticating the developer and digest: open the .dmg in Finder, drag VYRON.app onto Applications, confirm Replace, and launch. Keep the existing user data and do not erase old installation state.\n\n## Security and release state\n\nThis is NOT a stable release. The existing stable update feed is unchanged. App signing, notarization and new updater key must be verified independently; this builder only consumes evidence from the guarded CI job. Do not publish before 33-channel migration and rollback are tested on the owner Mac M1.\n');
process.stdout.write('VYRON_617_RELEASE_KIT_STAGED=PASS\nSIGNED_RELEASE_CANDIDATE_NOT_PUBLISHED=PASS\n');
