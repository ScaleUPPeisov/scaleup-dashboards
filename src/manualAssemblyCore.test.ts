import {describe,expect,it} from 'vitest';
import {nextManualProjectNumber} from './manualAssemblyCore';

describe('manual project numbering',()=>{
 it('uses the next number for the selected channel without spreading a large history',()=>{
  const jobs=Array.from({length:200000},(_,i)=>({channelId:i%2?'other':'selected',number:i+1}));
  expect(nextManualProjectNumber(jobs,'selected')).toBe(200000);
  expect(nextManualProjectNumber(jobs,'missing')).toBe(1);
  expect(nextManualProjectNumber(jobs,'')).toBe(1);
 });
});
