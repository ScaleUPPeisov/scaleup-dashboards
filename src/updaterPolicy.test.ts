import {describe,expect,it} from 'vitest';
import {classifyUpdaterError,compareUpdaterVersions,updaterFailureMessage,UPDATER_CHECK_OPTIONS} from './updaterPolicy';

describe('VYRON updater discovery policy',()=>{
  it('forces every updater check to bypass stale HTTP caches',()=>{
    expect(UPDATER_CHECK_OPTIONS.timeout).toBe(30_000);
    expect(UPDATER_CHECK_OPTIONS.headers['Cache-Control']).toContain('no-cache');
    expect(UPDATER_CHECK_OPTIONS.headers['Cache-Control']).toContain('no-store');
    expect(UPDATER_CHECK_OPTIONS.headers.Pragma).toBe('no-cache');
  });

  it('distinguishes compromised-key rollover from transient network errors',()=>{
    const failure=classifyUpdaterError('UPDATER_TRUST_MIGRATION_REQUIRED: legacy trust root compromised','check');
    expect(failure.code).toBe('UPDATER_TRUST_MIGRATION_REQUIRED');
    const message=updaterFailureMessage(failure.code,failure.detail);
    expect(message).toContain('однократная');
    expect(message).toContain('Настройки');
    expect(message).toContain('6.1.15');
  });

  it('orders RC3 < RC4 < RC5 with semver prerelease rules',()=>{
    expect(compareUpdaterVersions('2.1.15-rc.3','2.1.15-rc.4')).toBeLessThan(0);
    expect(compareUpdaterVersions('2.1.15-rc.4','2.1.15-rc.5')).toBeLessThan(0);
    expect(compareUpdaterVersions('2.1.15-rc.5','2.1.15')).toBeLessThan(0);
  });
});
