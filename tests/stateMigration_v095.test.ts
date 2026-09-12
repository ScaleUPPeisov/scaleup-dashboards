import {beforeEach,describe,expect,it} from 'vitest';
import {DEFAULT_SETTINGS,useApp} from '../src/store';

describe('VYRON 0.9.5 state migration',()=>{
 beforeEach(()=>{useApp.setState({channels:[],jobs:[],competitors:[],settings:{...DEFAULT_SETTINGS},logs:[],page:'dashboard',booted:false})});
 it('preserves existing user settings and supplies new defaults',()=>{
  useApp.getState().hydrate({
   version:6,channels:[],jobs:[],competitors:[],logs:[],uploadHistory:[],fingerprintCache:{},projectLifecycle:{},
   settings:{workspace:'/Users/test/VYRON',endlumePath:'/Applications/ENDLUME Studio.app',tracksPerVideo:12,youtubeIntelligenceRefreshMin:180} as any
  });
  const s=useApp.getState().settings;
  expect(s.workspace).toBe('/Users/test/VYRON');
  expect(s.endlumePath).toBe('/Applications/ENDLUME Studio.app');
  expect(s.tracksPerVideo).toBe(12);
  expect(s.youtubeIntelligenceRefreshMin).toBe(180);
  expect(s.competitorPoolSize).toBe(30);
  expect(s.endlumeTargetDurationMin).toBe(120);
  expect(s.endlumeTargetFileMinMb).toBe(700);
  expect(s.endlumeTargetFileMaxMb).toBe(1000);
  expect(s.endlumePreserveImageQuality).toBe(true);
 });
});
