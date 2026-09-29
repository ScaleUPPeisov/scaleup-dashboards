import {describe,expect,it} from 'vitest';
import {classifyStartupQuotaDelta,STARTUP_QUOTA_HARD_MAX,STARTUP_QUOTA_TARGET_MAX} from './startupQuotaProbe';

describe('VYRON 5 startup quota budget',()=>{
 it('classifies the exact owner budget',()=>{
  expect(STARTUP_QUOTA_TARGET_MAX).toBe(5);
  expect(STARTUP_QUOTA_HARD_MAX).toBe(50);
  expect(classifyStartupQuotaDelta(0)).toBe('TARGET');
  expect(classifyStartupQuotaDelta(5)).toBe('TARGET');
  expect(classifyStartupQuotaDelta(6)).toBe('ACCEPTABLE');
  expect(classifyStartupQuotaDelta(50)).toBe('ACCEPTABLE');
  expect(classifyStartupQuotaDelta(51)).toBe('FAIL');
  expect(classifyStartupQuotaDelta(777)).toBe('FAIL');
 });
});
