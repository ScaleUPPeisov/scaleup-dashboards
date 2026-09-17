import {describe,expect,it} from 'vitest';
import {UPDATER_CHECK_OPTIONS} from './updaterPolicy';

describe('VYRON updater discovery policy',()=>{
  it('forces every updater check to bypass stale HTTP caches',()=>{
    expect(UPDATER_CHECK_OPTIONS.timeout).toBe(30_000);
    expect(UPDATER_CHECK_OPTIONS.headers['Cache-Control']).toContain('no-cache');
    expect(UPDATER_CHECK_OPTIONS.headers['Cache-Control']).toContain('no-store');
    expect(UPDATER_CHECK_OPTIONS.headers.Pragma).toBe('no-cache');
  });
});
