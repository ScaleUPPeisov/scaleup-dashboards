import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {VYRON_CURRENT_RELEASE} from './releaseHistory';

const read=(p:string)=>fs.readFileSync(p,'utf8');
const oauth=read('src-tauri/src/oauth_vault.rs');
const migration=read('src-tauri/src/migration.rs');
const pkg=JSON.parse(read('package.json'));
const tauri=JSON.parse(read('src-tauri/tauri.conf.json'));

describe('VYRON 6.0.3 Windows OAuth vault migration hotfix',()=>{
  it('uses 6.0.3 candidate identity without publishing/updater changes',()=>{
    expect(pkg.version).toBe('6.0.3');
    expect(tauri.version).toBe('6.0.3');
    expect(tauri.identifier).toBe('studio.channelflow.desktop');
    expect(VYRON_CURRENT_RELEASE.version).toBe('6.0.3');
    expect(VYRON_CURRENT_RELEASE.prerelease).toBe(true);
    expect(tauri.plugins.updater.endpoints).toEqual([
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json',
      'https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json'
    ]);
  });

  it('uses Windows Credential Manager current key instead of vault.key file existence',()=>{
    expect(oauth).toContain('WINDOWS_VAULT_KEY_ACCOUNT');
    expect(oauth).toContain('"oauth.vault.master_key"');
    expect(oauth).toContain('persistent_local_key_probe');
    expect(oauth).toContain('local_key_probe_from_material');
    const readStart=oauth.indexOf('fn read(app:&AppHandle');
    const readEnd=oauth.indexOf('fn read_for_lookup',readStart);
    const block=oauth.slice(readStart,readEnd);
    expect(block).toContain('local_key(app,false)');
    expect(block).not.toContain('p.doc_key.exists()||p.app_key.exists()');
    expect(block).toContain('StartupKeyPlan::LocalPersistent');
  });

  it('tries current local vault first and does not let legacy backup force migration',()=>{
    expect(oauth).toContain('windows_canonical_key_without_key_files_selects_current_local_vault');
    expect(oauth).toContain('failed_602_state_current_vault_wins_even_when_legacy_backup_exists');
    expect(oauth).toContain('read_local_with_key');
  });

  it('makes OAuth rollback snapshot read-only against live storage',()=>{
    const start=oauth.indexOf('pub fn copy_encrypted_snapshot');
    const end=oauth.indexOf('fn parse_snapshot_meta',start);
    const block=oauth.slice(start,end);
    expect(block).toContain('persistent_local_key_probe');
    expect(block).toContain('snapshot_from_paths');
    expect(block).not.toContain('write(app');
    expect(block).not.toContain('local_key(app,true)');
    expect(oauth).toContain('migration_backup_is_zero_side_effects_on_live_oauth_storage');
    expect(oauth).toContain('migration_backup_of_absent_vault_creates_no_live_or_snapshot_vault');
  });

  it('restores current-local and opaque-legacy snapshots without wrong-key assumptions',()=>{
    expect(oauth).toContain('"current-local"');
    expect(oauth).toContain('"opaque-legacy"');
    expect(oauth).toContain('rollback_current_local_snapshot_uses_current_key_not_legacy_key');
    expect(oauth).toContain('rollback_opaque_legacy_snapshot_restores_raw_bytes_without_current_key_validation');
    const start=oauth.indexOf('fn restore_snapshot_to_paths');
    const end=oauth.indexOf('pub fn restore_encrypted_snapshot',start);
    const block=oauth.slice(start,end);
    expect(block).not.toContain('read_legacy_with_keychain');
    expect(block).not.toContain('OAUTH_VAULT_LEGACY_MASTER_KEY_MISSING');
  });

  it('covers real-size deterministic import without deletion',()=>{
    expect(oauth).toContain('portable_merge_31_profiles_into_clean_windows_state_is_complete_and_non_destructive');
    expect(migration).toContain('windows_clean_import_35_channels_is_non_destructive_and_idempotent');
    expect(migration).toContain('deleted_channels,0');
  });

  it('retains the 6.0.2 migration-package crypto implementation',()=>{
    expect(migration).toContain('Argon2::new(Algorithm::Argon2id');
    expect(migration).toContain('Params::new(64 * 1024, 3, 1, Some(32))');
    expect(migration).toContain('XChaCha20Poly1305');
    expect(migration).toContain('const BUNDLE_SCHEMA: u32 = 2');
    expect(migration).toContain('passphrase_compatibility_candidates');
    expect(migration).toContain('"NFD"');
  });
});
