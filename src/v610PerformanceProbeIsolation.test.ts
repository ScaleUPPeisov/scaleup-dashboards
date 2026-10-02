import {describe,expect,it} from 'vitest';
import {isPerformanceChannelFixture,isPerformanceJobFixture,performanceFixtureCounts,stripPerformanceFixtures} from './performanceFixtures';

function baseState(){
  return{
    version:10,
    channels:[],
    jobs:[],
    competitors:[],
    settings:{workspace:'keep'},
    logs:[{at:'now',level:'info',message:'keep'}],
    uploadHistory:[{id:'history-keep'}],
    activityJournal:[{eventId:'activity-keep'}],
    statisticsHistory:{real:[{snapshotId:'stats-keep'}]},
    fingerprintCache:{keep:{sha256:'x'}},
    projectLifecycle:{keep:{status:'NEW'}}
  } as any
}

describe('VYRON 6.1.0 performance probe isolation',()=>{
  it('removes only strict synthetic channels/jobs and preserves all real state',()=>{
    const state=baseState();
    state.channels=[
      {id:'real-1',name:'Real Channel'},
      {id:'real-2',name:'Performance Channel 01'},
      ...Array.from({length:35},(_,i)=>({id:'perf-channel-'+String(i+1).padStart(2,'0'),name:'Performance Channel '+String(i+1).padStart(2,'0')}))
    ];
    state.jobs=[
      ...Array.from({length:100},(_,i)=>({id:'real-job-'+i,channelId:'real-1'})),
      ...Array.from({length:1000},(_,i)=>({id:'perf-job-'+String(i+1).padStart(4,'0'),channelId:'perf-channel-'+String(i%35+1).padStart(2,'0')}))
    ];
    const before={uploadHistory:state.uploadHistory,activityJournal:state.activityJournal,statisticsHistory:state.statisticsHistory,fingerprintCache:state.fingerprintCache,projectLifecycle:state.projectLifecycle};
    const result=stripPerformanceFixtures(state);
    expect(result.removedChannels).toBe(35);
    expect(result.removedJobs).toBe(1000);
    expect(result.state.channels.map((x:any)=>x.id)).toEqual(['real-1','real-2']);
    expect(result.state.jobs).toHaveLength(100);
    expect(result.state.uploadHistory).toBe(before.uploadHistory);
    expect(result.state.activityJournal).toBe(before.activityJournal);
    expect(result.state.statisticsHistory).toBe(before.statisticsHistory);
    expect(result.state.fingerprintCache).toBe(before.fingerprintCache);
    expect(result.state.projectLifecycle).toBe(before.projectLifecycle);
    expect(performanceFixtureCounts(result.state)).toEqual({channels:0,jobs:0});
  });

  it('requires simultaneous markers and never deletes by the word Performance alone',()=>{
    expect(isPerformanceChannelFixture({id:'real-channel',name:'Performance Channel 01'} as any)).toBe(false);
    expect(isPerformanceChannelFixture({id:'perf-channel-01',name:'Real Performance Work'} as any)).toBe(false);
    expect(isPerformanceChannelFixture({id:'perf-channel-01',name:'Performance Channel 01'} as any)).toBe(true);
    expect(isPerformanceJobFixture({id:'perf-job-0001',channelId:'real-channel'} as any)).toBe(false);
    expect(isPerformanceJobFixture({id:'real-job',channelId:'perf-channel-01'} as any)).toBe(false);
    expect(isPerformanceJobFixture({id:'perf-job-0001',channelId:'perf-channel-01'} as any)).toBe(true);
  });

  it('mixed state keeps every real channel and removes every confirmed fixture',()=>{
    const state=baseState();
    state.channels=[
      ...Array.from({length:8},(_,i)=>({id:'real-'+i,name:'Real '+i})),
      ...Array.from({length:35},(_,i)=>({id:'perf-channel-'+String(i+1).padStart(2,'0'),name:'Performance Channel '+String(i+1).padStart(2,'0')}))
    ];
    state.jobs=[];
    const result=stripPerformanceFixtures(state);
    expect(result.state.channels).toHaveLength(8);
    expect(result.state.channels.every((x:any)=>x.id.startsWith('real-'))).toBe(true);
  });
});
