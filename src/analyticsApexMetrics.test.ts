import {describe,expect,it} from 'vitest';
import {formatAnalyticsRevenue} from './analyticsApexMetrics';

describe('analytics revenue display',()=>{
 it('distinguishes missing access, unreported revenue and confirmed zero',()=>{
  expect(formatAnalyticsRevenue(false,15)).toBe('Нет доступа');
  expect(formatAnalyticsRevenue(true,undefined)).toBe('—');
  expect(formatAnalyticsRevenue(true,NaN)).toBe('—');
  expect(formatAnalyticsRevenue(true,0)).toBe('$0.00');
  expect(formatAnalyticsRevenue(true,12.5)).toBe('$12.50');
 });
});
