import {describe,expect,it} from 'vitest';import fs from 'node:fs';
describe('VYRON 3.0.0 OAuth/client-secret continuity contracts',()=>{
 const rust=fs.readFileSync('src-tauri/src/youtube.rs','utf8'),accounts=fs.readFileSync('src/AccountsPage.tsx','utf8');
 it('preserves active client-secret pointers for 50-profile update fixture',()=>expect(rust).toContain('v300_fifty_profile_update_continuity_preserves_client_secret_pointers'));
 it('does not convert repairable Keychain denial into credentials reimport',()=>{expect(rust).toContain('OAUTH_CLIENT_SECRET_KEYCHAIN_BLOCKED');expect(rust).toContain('state="KEYCHAIN_ACCESS_BLOCKED"')});
 it('offers safe no-UI retry instead of credentials file for blocked global secret',()=>{expect(accounts).toContain('api.youtubeRetryGoogleConfig()');expect(accounts).toContain('credentials.json заново не нужен')});
});
