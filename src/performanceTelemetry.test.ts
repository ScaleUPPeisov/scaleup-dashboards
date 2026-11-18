import {beforeEach,describe,expect,it} from 'vitest';
import {performanceTelemetryDelta,performanceTelemetrySnapshot,recordPerformanceOperation,resetPerformanceTelemetryForTests} from './performanceTelemetry';

describe('owner performance telemetry',()=>{
  beforeEach(()=>resetPerformanceTelemetryForTests());

  it('counts actual operations and reason deltas without paths',()=>{
    const before=performanceTelemetrySnapshot();
    recordPerformanceOperation('inventory.scanAll','manual-all');
    recordPerformanceOperation('inventory.scanChannel','watcher',2);
    recordPerformanceOperation('music.index','manual');
    const after=performanceTelemetrySnapshot();
    expect(performanceTelemetryDelta(before,after)).toMatchObject({
      'inventory.scanAll':1,
      'inventory.scanChannel':2,
      'music.index':1,
    });
    expect(after.reasons).toEqual({
      'inventory.scanAll:manual-all':1,
      'inventory.scanChannel:watcher':2,
      'music.index:manual':1,
    })
  });
});

