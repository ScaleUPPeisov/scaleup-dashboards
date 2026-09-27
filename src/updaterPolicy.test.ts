import {describe,expect,it} from 'vitest';
import {MACOS_UPDATER_PLATFORM,UPDATER_CHECK_OPTIONS,UPDATER_ENDPOINTS,updaterEndpointsForUserAgent,updaterFailureMessage,WINDOWS_UPDATER_PLATFORM} from './updaterPolicy';

describe('VYRON updater discovery policy',()=>{
  it('forces every updater check to bypass stale HTTP caches',()=>{
    expect(UPDATER_CHECK_OPTIONS.timeout).toBe(30_000);
    expect(UPDATER_CHECK_OPTIONS.headers['Cache-Control']).toContain('no-cache');
    expect(UPDATER_CHECK_OPTIONS.headers['Cache-Control']).toContain('no-store');
    expect(UPDATER_CHECK_OPTIONS.headers.Pragma).toBe('no-cache');
  });

  it('uses the exact Tauri static-manifest platform keys',()=>{
    expect(WINDOWS_UPDATER_PLATFORM).toBe('windows-x86_64');
    expect(MACOS_UPDATER_PLATFORM).toBe('darwin-aarch64');
  });

  it('selects the real configured feed order for Windows and macOS',()=>{
    const win=updaterEndpointsForUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const mac=updaterEndpointsForUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)');
    expect(win[0]).toContain('/vyron-updates/windows-latest.json');
    expect(win[1]).toContain('/vyron-updates/latest.json');
    expect(mac[0]).toContain('/vyron-updates/latest.json');
    expect(mac[0]).not.toContain('windows-latest');
    expect(mac[1]).toContain('/releases/latest/download/latest.json');
  });

  it('prefers the dedicated Windows feed and keeps the shared feed as fallback',()=>{
    expect(UPDATER_ENDPOINTS[0]).toContain('/vyron-updates/windows-latest.json');
    expect(UPDATER_ENDPOINTS[1]).toContain('/vyron-updates/latest.json');
  });

  it('keeps platform-missing diagnostics without hardcoding macOS in user-facing text',()=>{
    const message=updaterFailureMessage('UPDATER_PLATFORM_NOT_FOUND','platform not found');
    expect(message).toContain('Для этой платформы обновление пока не опубликовано');
    expect(message).not.toContain('darwin-aarch64');
  });
});
