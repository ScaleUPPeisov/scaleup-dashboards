import type {AppState,Channel,VideoJob} from './types';

export const PERFORMANCE_CHANNEL_ID_RE=/^perf-channel-\d{2}$/;
export const PERFORMANCE_CHANNEL_NAME_RE=/^Performance Channel \d{2}$/;
export const PERFORMANCE_JOB_ID_RE=/^perf-job-\d{4}$/;

export function isPerformanceChannelFixture(channel:Pick<Channel,'id'|'name'>){
  return PERFORMANCE_CHANNEL_ID_RE.test(String(channel.id||''))&&PERFORMANCE_CHANNEL_NAME_RE.test(String(channel.name||''))
}

export function isPerformanceJobFixture(job:Pick<VideoJob,'id'|'channelId'>){
  return PERFORMANCE_JOB_ID_RE.test(String(job.id||''))&&PERFORMANCE_CHANNEL_ID_RE.test(String(job.channelId||''))
}

export function performanceFixtureCounts(state:Pick<AppState,'channels'|'jobs'>){
  return{
    channels:(state.channels||[]).filter(isPerformanceChannelFixture).length,
    jobs:(state.jobs||[]).filter(isPerformanceJobFixture).length
  }
}

export function stripPerformanceFixtures(state:AppState){
  const before=performanceFixtureCounts(state);
  if(!before.channels&&!before.jobs)return{state,removedChannels:0,removedJobs:0,changed:false};
  const next:AppState={
    ...state,
    channels:(state.channels||[]).filter(channel=>!isPerformanceChannelFixture(channel)),
    jobs:(state.jobs||[]).filter(job=>!isPerformanceJobFixture(job))
  };
  return{state:next,removedChannels:before.channels,removedJobs:before.jobs,changed:true}
}
