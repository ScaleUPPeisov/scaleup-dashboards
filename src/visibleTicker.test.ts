import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {startVisibleTicker} from './visibleTicker';

class Visibility extends EventTarget{
 visibilityState:DocumentVisibilityState='visible';
 change(state:DocumentVisibilityState){this.visibilityState=state;this.dispatchEvent(new Event('visibilitychange'))}
}
const timers={setInterval:(fn:()=>void,ms:number)=>setInterval(fn,ms) as unknown as number,clearInterval:(id:number)=>clearInterval(id)} as Pick<Window,'setInterval'|'clearInterval'>;

describe('visible presentation ticker',()=>{
 beforeEach(()=>vi.useFakeTimers());
 afterEach(()=>vi.useRealTimers());
 it('suspends while hidden, refreshes immediately on return and cleans up',()=>{
  const doc=new Visibility(),tick=vi.fn();
  const stop=startVisibleTicker(doc,timers,tick,1000);
  expect(tick).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(2000);expect(tick).toHaveBeenCalledTimes(3);
  doc.change('hidden');vi.advanceTimersByTime(5000);expect(tick).toHaveBeenCalledTimes(3);
  doc.change('visible');expect(tick).toHaveBeenCalledTimes(4);
  vi.advanceTimersByTime(1000);expect(tick).toHaveBeenCalledTimes(5);
  stop();doc.change('hidden');doc.change('visible');vi.advanceTimersByTime(2000);expect(tick).toHaveBeenCalledTimes(5);
 });
 it('does not start while initially hidden',()=>{
  const doc=new Visibility();doc.visibilityState='hidden';const tick=vi.fn();
  const stop=startVisibleTicker(doc,timers,tick,1000);vi.advanceTimersByTime(2000);
  expect(tick).not.toHaveBeenCalled();doc.change('visible');expect(tick).toHaveBeenCalledTimes(1);stop();
 });
});
