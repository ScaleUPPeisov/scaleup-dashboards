import {describe,expect,it} from 'vitest';
import {mobileSyncBridgeTestHooks} from './mobileSyncBridge';

const {mapProjectStatus,retryableEnqueueResult}=mobileSyncBridgeTestHooks();

describe('VYRON mobile sync bridge',()=>{
  it('maps render lifecycle without using upload progress as render progress',()=>{
    expect(mapProjectStatus('READY_RENDER')).toBe('READY_RENDER');
    expect(mapProjectStatus('RENDERING')).toBe('RENDERING');
    expect(mapProjectStatus('READY_UPLOAD')).toBe('COMPLETED');
    expect(mapProjectStatus('ERROR')).toBe('ERROR');
    expect(mapProjectStatus('NEED_IMAGE')).toBe('QUEUED');
  });
  it('retries only transient outbox persistence failures',()=>{
    expect(retryableEnqueueResult({ok:false,state:'queue_error'})).toBe(true);
    expect(retryableEnqueueResult({ok:false,state:'queue_full'})).toBe(true);
    expect(retryableEnqueueResult({ok:false,state:'blocked'})).toBe(false);
    expect(retryableEnqueueResult({ok:true,state:'unpaired'})).toBe(false);
    expect(retryableEnqueueResult(null)).toBe(false);
  });
});
