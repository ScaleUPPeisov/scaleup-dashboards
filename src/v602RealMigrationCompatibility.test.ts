import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {VYRON_CURRENT_RELEASE} from './releaseHistory';

const read=(p:string)=>fs.readFileSync(p,'utf8');
const migration=read('src-tauri/src/migration.rs');
const panel=read('src/MigrationPanel.tsx');
const lib=read('src-tauri/src/lib.rs');
const pkg=JSON.parse(read('package.json'));
const tauri=JSON.parse(read('src-tauri/tauri.conf.json'));

describe('VYRON 6.0.3 real migration compatibility candidate',()=>{
  it('uses 6.0.3 candidate identity without changing updater endpoints',()=>{
    expect(pkg.version).toBe('6.0.3');
    expect(tauri.version).toBe('6.0.3');
    expect(tauri.identifier).toBe('studio.channelflow.desktop');
    expect(tauri.plugins.updater.endpoints).toEqual([
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json',
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json'
    ]);
    expect(VYRON_CURRENT_RELEASE.version).toBe('6.0.3');
    expect(VYRON_CURRENT_RELEASE.prerelease).toBe(true);
  });

  it('keeps legacy raw password first and adds explicit canonical candidates',()=>{
    expect(migration).toContain('push_unique_candidate(&mut out, "RAW"');
    expect(migration).toContain('"LEGACY_CANON"');
    expect(migration).toContain('"NFC"');
    expect(migration).toContain('"NFD"');
    const raw=migration.indexOf('push_unique_candidate(&mut out, "RAW"');
    const legacy=migration.indexOf('"LEGACY_CANON"',raw);
    const nfc=migration.indexOf('"NFC"',legacy);
    const nfd=migration.indexOf('"NFD"',nfc);
    expect(raw).toBeGreaterThanOrEqual(0);
    expect(raw).toBeLessThan(legacy);
    expect(legacy).toBeLessThan(nfc);
    expect(nfc).toBeLessThan(nfd);
    expect(migration).toContain('canonical_passphrase_v2');
    expect(migration).toContain('.nfc().collect()');
    expect(migration).toContain('.nfd().collect()');
  });

  it('never trims ordinary spaces from migration passwords',()=>{
    const start=migration.indexOf('fn legacy_canonical_passphrase');
    const end=migration.indexOf('fn derive_key',start);
    const block=migration.slice(start,end);
    expect(block).toContain('trim_end_matches');
    expect(block).not.toContain('.trim()');
    expect(block).not.toContain('to_lowercase');
  });

  it('classifies auth attempts without logging secrets',()=>{
    expect(migration).toContain('MIGRATION_AUTH_DIAGNOSTIC');
    expect(migration).toContain('RAW_FAILED');
    expect(migration).toContain('MIGRATION_AUTHENTICATION_FAILED: {}');
    expect(migration).not.toContain('derived key=');
    expect(migration).not.toContain('passphrase={}');
  });

  it('adds safe package diagnostics and SHA-256 before decrypt',()=>{
    expect(lib).toContain('migration::migration_package_diagnostics');
    expect(migration).toContain('fn envelope_diagnostics');
    expect(migration).toContain('"bundleSha256"');
    expect(panel).toContain('PACKAGE DIAGNOSTICS • SAFE • BEFORE DECRYPT');
    expect(panel).toContain('Created with VYRON');
    expect(panel).toContain('Salt');
    expect(panel).toContain('Nonce');
    expect(panel).toContain('Ciphertext');
    expect(panel).toContain('Bundle SHA-256');
  });

  it('retains secure failure and non-destructive merge tests',()=>{
    expect(migration).toContain('encryption_rejects_tamper_and_wrong_password');
    expect(migration).toContain('channel_merge_is_idempotent_and_never_deletes');
    expect(migration).toContain('legacy_v600_unicode_nfd_password_is_readable_from_nfc_input');
    expect(migration).toContain('intentional_password_spaces_are_never_trimmed');
  });
});
