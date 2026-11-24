import {describe,expect,it} from 'vitest';
import {renderCompletionsToNotify} from './productionRenderNotification';
import type {RenderObservation} from './productionRenderTransitions';
const row=(phase:RenderObservation['phase']):RenderObservation=>({rootPath:'/fixture',batchId:'batch',projectId:'project',phase});
describe('production render notifications',()=>{
 it('reports direct safe completions when cleanup is automatic or disabled',()=>{
  for(const policy of ['auto3d','afterUpload','never'])expect(renderCompletionsToNotify([row('SAFE_TO_CLEAN')],policy)).toHaveLength(1);
  expect(renderCompletionsToNotify([row('SAFE_TO_CLEAN')],undefined)).toHaveLength(1);
 });
 it('avoids a duplicate completion when the cleanup prompt covers the same transition',()=>{
  expect(renderCompletionsToNotify([row('SAFE_TO_CLEAN')],'prompt')).toHaveLength(0);
  expect(renderCompletionsToNotify([row('RENDERED')],'prompt')).toHaveLength(1);
 });
});
