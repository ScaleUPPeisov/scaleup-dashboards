import {describe,expect,it} from 'vitest';
import {shouldDisplayLiveBatch,shouldReconcileLiveBatch} from './productionNavigationGuards';
import type {ProductionBuildRuntimeSnapshot} from './productionManagerApi';

const task=(state:ProductionBuildRuntimeSnapshot['state'],id='batch-1'):ProductionBuildRuntimeSnapshot=>({
 channelId:'neon',requestId:'request-1',state,progress:null,
 result:{status:'ready',availableImages:12,requestedProjects:1,batch:{
  batchId:id,channelId:'neon',channelName:'Neon Drive FM',createdAt:'2026-11-18T06:00:00Z',projectCount:1,
  tracksAssigned:10,status:'ready',manifestPath:'/tmp/test.json',rootPath:'/tmp/batch',completedProjects:1,errorProjects:0
 }}
});

describe('Production navigation regression',()=>{
 it('entering a section with no active build never surfaces a generated result',()=>{
  for(let i=0;i<20;i++)expect(shouldDisplayLiveBatch(null,new Set())).toBe(false);
 });
 it('an active real build is not misreported as already complete',()=>{
  expect(shouldDisplayLiveBatch(task('RUNNING'),new Set())).toBe(false);
  expect(shouldReconcileLiveBatch(task('RUNNING'),'batch-1',new Set())).toBe(false);
 });
 it('completion can be surfaced once only, including across 20 re-entries',()=>{
  const shown=new Set<string>();
  expect(shouldDisplayLiveBatch(task('COMPLETED'),shown)).toBe(true);
  shown.add('batch-1');
  for(let i=0;i<20;i++)expect(shouldDisplayLiveBatch(task('COMPLETED'),shown)).toBe(false);
 });
 it('never launches or reconciles a historical batch when user changes channels',()=>{
  const completed=task('COMPLETED','live-new');
  expect(shouldReconcileLiveBatch(completed,'historic-old',new Set())).toBe(false);
  expect(shouldReconcileLiveBatch(completed,'live-new',new Set())).toBe(true);
  expect(shouldReconcileLiveBatch(completed,'live-new',new Set(['live-new']))).toBe(false);
 });
 it('failed operations do not replay a stale success',()=>{
  expect(shouldDisplayLiveBatch(task('FAILED'),new Set())).toBe(false);
  expect(shouldReconcileLiveBatch(task('FAILED'),'batch-1',new Set())).toBe(false);
 });
});
