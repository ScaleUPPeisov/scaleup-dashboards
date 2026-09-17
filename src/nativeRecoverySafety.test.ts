import {describe,expect,it} from 'vitest';import {readFileSync} from 'node:fs';
describe('native Keychain recovery contracts',()=>{
 it('uses Security.framework enumeration and no dump-keychain shell recovery',()=>{const s=readFileSync('src-tauri/src/security.rs','utf8');expect(s).toContain('ItemSearchOptions');expect(s).toContain('ItemClass::generic_password()');expect(s).toContain('load_attributes(true)');expect(s).toContain('Limit::All');expect(s).not.toContain('dump-keychain');});
 it('never exposes secret fields in diagnostic UI type',()=>{const a=readFileSync('src/api.ts','utf8'),y=readFileSync('src-tauri/src/youtube.rs','utf8');expect(a).toContain('OAuthRecoveryDiagnostic');expect(y).toContain('youtube_oauth_recovery_diagnostic');expect(y).not.toContain('"refreshToken"');expect(y).not.toContain('"accessToken"');expect(y).not.toContain('"clientSecret"');});
});
