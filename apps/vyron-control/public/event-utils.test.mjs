import test from 'node:test';
import assert from 'node:assert/strict';
import { compactProgressEvents } from './event-utils.mjs';

test('repeated upload progress for one project collapses to the latest update',()=>{
  const rows=compactProgressEvents([
    {type:'upload_progress',projectId:'job_12345678',percent:82,detectedAt:'2026-11-14T15:03:00.000Z'},
    {type:'upload_progress',projectId:'job_12345678',percent:63,detectedAt:'2026-11-14T15:02:00.000Z'},
    {type:'upload_started',projectId:'job_12345678',detectedAt:'2026-11-14T15:01:00.000Z'}
  ]);
  assert.equal(rows.length,2);
  const progress=rows.find(row=>row.event.type==='upload_progress');
  assert.equal(progress.count,2);
  assert.equal(progress.event.percent,82);
  assert.equal(rows[0].event.type,'upload_progress');
});

test('different projects and different progress stages remain separate',()=>{
  const rows=compactProgressEvents([
    {type:'upload_progress',projectId:'job_A',percent:20,detectedAt:'2026-11-14T15:03:00.000Z'},
    {type:'upload_progress',projectId:'job_B',percent:40,detectedAt:'2026-11-14T15:02:00.000Z'},
    {type:'render_progress',projectId:'job_A',percent:60,detectedAt:'2026-11-14T15:01:00.000Z'}
  ]);
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(row=>row.event.type),[
    'upload_progress','upload_progress','render_progress'
  ]);
});

test('repeated YouTube processing notices collapse but ready transitions remain visible',()=>{
  const rows=compactProgressEvents([
    {type:'agent_info',title:'YOUTUBE PROCESSING · Silent Black Room',projectId:'job_X',
      detectedAt:'2026-11-14T15:03:00.000Z'},
    {type:'agent_info',title:'YOUTUBE PROCESSING · Silent Black Room',projectId:'job_X',
      detectedAt:'2026-11-14T15:02:00.000Z'},
    {type:'agent_info',title:'YOUTUBE READY · Silent Black Room',projectId:'job_X',
      detectedAt:'2026-11-14T15:01:00.000Z'}
  ]);
  assert.equal(rows.length,2);
  assert.equal(rows.find(row=>row.event.title.startsWith('YOUTUBE PROCESSING')).count,2);
  assert.equal(rows.find(row=>row.event.title.startsWith('YOUTUBE READY')).count,1);
});

test('events without a project ID are not merged and output stays newest-first',()=>{
  const rows=compactProgressEvents([
    {type:'upload_progress',percent:10,detectedAt:'2026-11-14T15:01:00.000Z'},
    {type:'upload_progress',percent:20,detectedAt:'2026-11-14T15:03:00.000Z'},
    {type:'subscriber_milestone',milestone:100,detectedAt:'2026-11-14T15:02:00.000Z'}
  ]);
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(row=>row.event.detectedAt),[
    '2026-11-14T15:03:00.000Z','2026-11-14T15:02:00.000Z','2026-11-14T15:01:00.000Z'
  ]);
});
