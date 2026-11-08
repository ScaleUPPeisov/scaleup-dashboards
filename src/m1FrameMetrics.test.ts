import {describe,it,expect} from 'vitest';
import {summarizeFrameIntervals,meetsM1FrameTarget} from './m1FrameMetrics';

describe('M1 full-round frame evidence',()=>{
 it('retains an early multi-second freeze after more than 360 smooth frames',()=>{
  const samples=[2000,...Array(720).fill(1000/60)];
  const metrics=summarizeFrameIntervals(samples)!;
  expect(metrics.worst).toBe(2000);
  expect(metrics.long100).toBe(1);
  expect(metrics.fps).toBeLessThan(59);
  expect(meetsM1FrameTarget(metrics)).toBe(false);
 });
 it('does not round a sub-target FPS up to a passing 59',()=>{
  const metrics=summarizeFrameIntervals(Array(600).fill(1000/58.7))!;
  expect(metrics.fps).toBeCloseTo(58.7);
  expect(meetsM1FrameTarget(metrics)).toBe(false);
 });
 it('keeps valid smooth samples unchanged and passes a true 60Hz fixture',()=>{
  const samples=Array(600).fill(1000/60),before=[...samples];
  const metrics=summarizeFrameIntervals(samples)!;
  expect(samples).toEqual(before);
  expect(metrics.fps).toBeCloseTo(60);
  expect(metrics.dropped).toBe(0);
  expect(meetsM1FrameTarget(metrics)).toBe(true);
 });
 it('rejects empty, invalid and nonpositive measurements',()=>{
  for(const samples of [[],[NaN],[Infinity],[0],[-1],[16,NaN]]){
   expect(summarizeFrameIntervals(samples)).toBeNull();
  }
  expect(meetsM1FrameTarget(null)).toBe(false);
 });
});
