import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const dashboard=fs.readFileSync('src/DashboardOS.tsx','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const types=fs.readFileSync('src/types.ts','utf8');

describe('VYRON 4.0.0 estimated RPM / revenue truth',()=>{
  it('requires explicit configured RPM before showing estimated revenue',()=>{
    expect(types).toContain('estimatedRpmUsd?:number');
    expect(dashboard).toContain('settings.estimatedRpmUsd');
    expect(dashboard).toContain('RPM не настроен');
    expect(dashboard).toContain('Настроить RPM')
  });

  it('uses only 28-day views for the estimate',()=>{
    expect(dashboard).toContain('x.periodDays===28');
    expect(dashboard).toContain('analyticsViews/1000*configuredRpm')
  });

  it('does not use YouTube monetary analytics as the configured-RPM estimate',()=>{
    const revenueBlock=dashboard.slice(dashboard.indexOf('const analyticsRows'),dashboard.indexOf('const attention'));
    expect(revenueBlock).not.toMatch(/\.(estimatedRevenue|estimatedAdRevenue|estimatedRedPartnerRevenue)\b/);
    expect(dashboard).toContain('const estimatedRevenue28=configuredRpm!=null&&analyticsViews>0?analyticsViews/1000*configuredRpm:undefined');
    expect(app).toContain('Расчётный RPM');
    expect(app).toContain('Это не подтверждённый YouTube revenue')
  });
});
