import {describe,expect,it} from 'vitest';
import {recommendedWeeklyLoad} from '../src/commandCenterCore';

describe('VYRON 1.0.12 local command-center contract',()=>{
  it('keeps local planning math deterministic without any network dependency',()=>{
    expect(recommendedWeeklyLoad(7)).toBe(1);
    expect(recommendedWeeklyLoad(3.5)).toBe(2);
  });
});
