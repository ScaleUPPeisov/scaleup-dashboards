import {describe,expect,it} from 'vitest';
import {mobileSyncBridgeTestHooks} from './mobileSyncBridge';

const {mapProjectStatus}=mobileSyncBridgeTestHooks();

describe('VYRON mobile sync bridge',()=>{
  it('maps render lifecycle without using upload progress as render progress',()=>{
    expect(mapProjectStatus('READY_RENDER')).toBe('READY_RENDER');
    expect(mapProjectStatus('RENDERING')).toBe('RENDERING');
    expect(mapProjectStatus('READY_UPLOAD')).toBe('COMPLETED');
    expect(mapProjectStatus('ERROR')).toBe('ERROR');
    expect(mapProjectStatus('NEED_IMAGE')).toBe('QUEUED');
  });
});
