import {describe,expect,it} from 'vitest';
import {mobileSyncBridgeTestHooks} from './mobileSyncBridge';

const {deterministicSyncUuid,mapProjectStatus}=mobileSyncBridgeTestHooks();

describe('VYRON mobile sync bridge',()=>{
  it('creates stable idempotency ids for identical facts',()=>{
    const a=deterministicSyncUuid('channel:c1:state');
    const b=deterministicSyncUuid('channel:c1:state');
    const c=deterministicSyncUuid('channel:c1:changed');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('maps render lifecycle without using upload progress as render progress',()=>{
    expect(mapProjectStatus('READY_RENDER')).toBe('READY_RENDER');
    expect(mapProjectStatus('RENDERING')).toBe('RENDERING');
    expect(mapProjectStatus('READY_UPLOAD')).toBe('COMPLETED');
    expect(mapProjectStatus('ERROR')).toBe('ERROR');
    expect(mapProjectStatus('NEED_IMAGE')).toBe('QUEUED');
  });
});
