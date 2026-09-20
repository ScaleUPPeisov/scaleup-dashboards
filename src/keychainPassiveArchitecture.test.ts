import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
const rust=fs.readFileSync(decodeURIComponent(new URL('../src-tauri/src/youtube.rs',import.meta.url).pathname),'utf8');
const storage=fs.readFileSync(decodeURIComponent(new URL('../src-tauri/src/storage.rs',import.meta.url).pathname),'utf8');
const security=fs.readFileSync(decodeURIComponent(new URL('../src-tauri/src/security.rs',import.meta.url).pathname),'utf8');
function body(src:string,start:string,end:string){return src.slice(src.indexOf(start),src.indexOf(end,src.indexOf(start)));}
describe('VYRON passive Keychain architecture',()=>{
 it('OAuth profile listing is metadata-only',()=>{const x=body(rust,'pub fn youtube_oauth_profiles','pub fn youtube_oauth_disconnect');expect(x).toContain('load_store_metadata');expect(x).not.toMatch(/get_secret|hydrate_profile|recover_store/)});
 it('Google config status performs one no-UI operational readiness read',()=>{const x=body(rust,'pub fn youtube_google_config_status','fn validate_imported_client_id');expect(x).toContain('load_google_config_metadata');expect(x).toContain('canonical_get_secret_cached');expect(x).toContain('google_config_operational_status_value');expect(x).not.toMatch(/reqwest|valid_access_token|refresh_token/)});
 it('Google project diagnostics stays zero API and zero Keychain',()=>{const x=body(rust,'pub fn youtube_google_project_diagnostic','fn load_or_migrate_google_config');for(const token of ['get_secret','valid_access_token','reqwest','refresh_token','access_token','client_secret'])expect(x).not.toContain(token)});
 it('startup load_state never hydrates/migrates secrets',()=>{const x=body(storage,'pub fn load_state','pub fn save_state');expect(x).not.toMatch(/get_secret|set_secret|hydrate_state|secure_state_for_disk/)});
 it('passive OAuth inventory never reads secret values',()=>{const x=body(security,'pub fn security_oauth_inventory','Ok(serde_json::json!({',);expect(x).not.toContain('get_secret(');expect(x).not.toContain('inventory_read_status(')});
});
