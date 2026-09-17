import {describe,expect,it} from 'vitest';
import {classifyUpdaterError,UPDATER_ENDPOINTS,updaterFailureMessage,updaterVersionStatus} from './updaterPolicy';

describe('VYRON 2.1.3 updater hotfix',()=>{
  it('uses canonical raw feed first and release latest as fallback',()=>{
    expect(UPDATER_ENDPOINTS[0]).toBe('https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json');
    expect(UPDATER_ENDPOINTS[1]).toBe('https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json');
  });
  it('reports same-version semantics explicitly',()=>expect(updaterVersionStatus('2.1.2','2.1.2')).toBe('current == latest'));
  it('classifies manifest fetch failures',()=>expect(classifyUpdaterError('network timeout','check').code).toBe('UPDATER_MANIFEST_FETCH_FAILED'));
  it('classifies archive download failures',()=>expect(classifyUpdaterError('connection reset','download').code).toBe('UPDATER_ARCHIVE_DOWNLOAD_FAILED'));
  it('rejects signature failures distinctly',()=>expect(classifyUpdaterError('signature verification failed','download').code).toBe('UPDATER_SIGNATURE_INVALID'));
  it('classifies relaunch failure distinctly',()=>expect(classifyUpdaterError('restart failed','relaunch').code).toBe('UPDATER_RESTART_FAILED'));
  it('shows a concrete GitHub download failure message',()=>expect(updaterFailureMessage('UPDATER_ARCHIVE_DOWNLOAD_FAILED','HTTP 503')).toContain('GitHub'));
});
