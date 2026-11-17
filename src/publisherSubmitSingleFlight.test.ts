import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runSingleFlight} from './publisherSubmitSingleFlight';

describe('Publisher batch add single-flight',()=>{
  it('prevents two rapid clicks from submitting same source metadata twice',async()=>{
    const lock={current:false};
    let done!:()=>void;
    const pending=new Promise<void>(resolve=>{done=resolve});
    const submission=vi.fn(async()=>{await pending;return 'ONE_BATCH'});
    const first=runSingleFlight(lock,submission);
    expect(lock.current).toBe(true);
    expect(await runSingleFlight(lock,submission)).toBeUndefined();
    expect(submission).toHaveBeenCalledTimes(1);
    done();
    expect(await first).toBe('ONE_BATCH');
    expect(lock.current).toBe(false);
    expect(await runSingleFlight(lock,submission)).toBe('ONE_BATCH');
    expect(submission).toHaveBeenCalledTimes(2);
  });
  it('releases lock after failures so a corrected batch can be submitted',async()=>{
    const lock={current:false};
    await expect(runSingleFlight(lock,async()=>{throw new Error('synthetic-disk-failure')})).rejects.toThrow('synthetic-disk-failure');
    expect(lock.current).toBe(false);
    expect(await runSingleFlight(lock,async()=>42)).toBe(42);
  });
  it('real Publisher entrypoint uses the single-flight wrapper',()=>{
    const s=readFileSync('src/PublisherOS.tsx','utf8');
    expect(s).toContain('return runSingleFlight(batchSubmitRef,()=>runBatchOnce(requested))');
  });
});
