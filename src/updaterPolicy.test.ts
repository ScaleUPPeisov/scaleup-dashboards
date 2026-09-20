import {describe,expect,it} from 'vitest';
import {compareUpdaterVersions,UPDATER_CHECK_OPTIONS} from './updaterPolicy';

describe('VYRON updater discovery policy',()=>{
  it('forces every updater check to bypass stale HTTP caches',()=>{
    expect(UPDATER_CHECK_OPTIONS.timeout).toBe(30_000);
    expect(UPDATER_CHECK_OPTIONS.headers['Cache-Control']).toContain('no-cache');
    expect(UPDATER_CHECK_OPTIONS.headers['Cache-Control']).toContain('no-store');
    expect(UPDATER_CHECK_OPTIONS.headers.Pragma).toBe('no-cache');
    it('orders RC3 < RC4 < RC5 with semver prerelease rules',()=>{
    expect(compareUpdaterVersions('2.1.15-rc.3','2.1.15-rc.4')).toBeLessThan(0);
    expect(compareUpdaterVersions('2.1.15-rc.4','2.1.15-rc.5')).toBeLessThan(0);
    expect(compareUpdaterVersions('2.1.15-rc.5','2.1.15')).toBeLessThan(0);
  });
});
});
