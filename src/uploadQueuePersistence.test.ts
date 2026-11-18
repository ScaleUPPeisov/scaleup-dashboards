import {describe,it,expect} from 'vitest';
import {selectDurableQueueSnapshot} from './uploadQueuePersistence';

describe('two-generation localStorage upload-queue recovery',()=>{
  const primary=JSON.stringify({version:1,entries:[{queueId:'saved',submittedSequence:1}]});
  const staging=JSON.stringify({version:1,entries:[{queueId:'newer',submittedSequence:2}]});
  it('recovers a completed staging generation after interrupted primary write',()=>{
    expect((selectDurableQueueSnapshot(staging,primary) as any).entries[0].queueId).toBe('newer');
  });
  it('falls back to good primary when staging is malformed',()=>{
    expect((selectDurableQueueSnapshot('broken{',primary) as any).entries[0].queueId).toBe('saved');
  });
  it('refuses to erase two corrupt generations by treating them as an empty queue',()=>{
    expect((selectDurableQueueSnapshot('broken{','{bad') as any).recoveryIntegrityError).toBe('CORRUPT_PERSISTED_QUEUE');
  });
  it('treats a genuinely new installation as an empty queue',()=>{
    expect(selectDurableQueueSnapshot(null,null)).toBeUndefined();
  });
  it('rejects unknown envelope formats instead of overwriting their bytes',()=>{
    expect((selectDurableQueueSnapshot('{"version":2,"entries":[]}',null) as any).recoveryIntegrityError).toBe('CORRUPT_PERSISTED_QUEUE');
  });
});
