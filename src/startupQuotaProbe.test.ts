import {describe,expect,it} from 'vitest';
import {classifyStartupQuotaDelta,STARTUP_QUOTA_HARD_MAX,STARTUP_QUOTA_TARGET_MAX} from './startupQuotaProbe';

describe('VYRON 5 startup quota budget',()=>{
 it('classifies the exact owner budget',()=>{
  expect(STARTUP_QUOTA_TARGET_MAX).toBe(0);
  expect(STARTUP_QUOTA_HARD_MAX).toBe(0);
  expect(classifyStartupQuotaDelta(0)).toBe('TARGET');
  expect(classifyStartupQuotaDelta(1)).toBe('FAIL');
  expect(classifyStartupQuotaDelta(5)).toBe('FAIL');
  expect(classifyStartupQuotaDelta(50)).toBe('FAIL');
  expect(classifyStartupQuotaDelta(777)).toBe('FAIL');
 });
});
