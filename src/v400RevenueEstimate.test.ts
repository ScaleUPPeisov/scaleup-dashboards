import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const dashboard=fs.readFileSync('src/DashboardOS.tsx','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const types=fs.readFileSync('src/types.ts','utf8');
const card=fs.readFileSync('src/RpmCoverageCard.tsx','utf8');
const coverage=fs.readFileSync('src/rpmCoverage.ts','utf8');

describe('VYRON 4.0.0 estimated RPM / revenue truth',()=>{
  it('requires explicit configured RPM before showing estimated revenue',()=>{
    expect(types).toContain('estimatedRpmUsd?:number');
    expect(dashboard).toContain('settings.estimatedRpmUsd');
    expect(dashboard).toContain('<RpmCoverageCard channels={enabled} profiles={profiles} rpm={configuredRpm}');
    expect(card).toContain('RPM не настроен');
    expect(card).toContain('Настроить RPM')
  });

  it('uses only 28-day views for the estimate',()=>{
    expect(coverage).toContain('!analytics.allTime&&analytics.periodDays===28');
    expect(coverage).toContain('return totalViews/1000*rpm')
  });

  it('does not use YouTube monetary analytics as the configured-RPM estimate',()=>{
    const revenueBlock=coverage.slice(coverage.indexOf('export function buildRpmCoverage'),coverage.indexOf('export function estimateRevenueFromRpm'));
    expect(revenueBlock).not.toMatch(/\.(estimatedRevenue|estimatedAdRevenue|estimatedRedPartnerRevenue)\b/);
    expect(card).toContain('estimateRevenueFromRpm(coverage.totalViews,rpm)');
    expect(card).toContain('Это не подтверждённый доход YouTube/AdSense');
    expect(app).toContain('Расчётный RPM');
    expect(app).toContain('Это не подтверждённый YouTube revenue')
  });
});
