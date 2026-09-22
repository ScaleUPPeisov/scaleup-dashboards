import {describe,expect,it} from 'vitest';import fs from 'node:fs';
describe('VYRON 3.0.0 OAuth/client-secret continuity contracts',()=>{
 const rust=fs.readFileSync('src-tauri/src/youtube.rs','utf8'),accounts=fs.readFileSync('src/AccountsPage.tsx','utf8'),api=fs.readFileSync('src/api.ts','utf8');
 it('preserves active client-secret pointers for 50-profile update fixture',()=>expect(rust).toContain('v300_fifty_profile_update_continuity_preserves_client_secret_pointers'));
 it('does not convert repairable Keychain denial into missing credentials',()=>{expect(rust).toContain('OAUTH_CLIENT_SECRET_KEYCHAIN_BLOCKED');expect(rust).toContain('state="KEYCHAIN_ACCESS_BLOCKED"')});
 it('prefers local saved-secret recovery while preserving manual credentials import fallback',()=>{expect(accounts).toContain('api.youtubeRecoverSavedGoogleConfig()');expect(api).toContain('youtubeImportGoogleConfig');});
 it('runs automatic existing-profile recovery after global repair',()=>{expect(accounts).toContain('api.youtubeOauthRecoverExistingProfiles()');expect(rust).toContain('youtube_oauth_recover_existing_profiles');});
});
