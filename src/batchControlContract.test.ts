import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const source=fs.readFileSync('src/BatchControl.tsx','utf8');

describe('VYRON 5 Batch Control safety contract',()=>{
 it('locks the exact selected channel IDs before execution',()=>{
  expect(source).toContain("const channelIds=[...selected]");
  expect(source).toContain("const snapshot=chosenJobs.map(j=>({...j,tags:[...j.tags]}))");
  expect(source).toContain("setPending({action,channelIds,jobs:snapshot,bindings,checking:true})");
  expect(source).toContain("setPending({action,channelIds,jobs:snapshot.filter(j=>files.has(j.id)),bindings,files,blocked,checking:false,planned})");
  expect(source).toContain("const locked=new Set(lockedIds)");
  expect(source).toContain("channels.filter(c=>locked.has(c.id))");
 });
 it('requires preview confirmation and cancel has zero execution path',()=>{
  expect(source).toContain('ПРОВЕРКА ДЕЙСТВИЯ');
  expect(source).toContain("onClick={closePreview}>Отмена");
  expect(source).toContain("const closePreview=()=>{previewGeneration.current++;setPending(null);setQueueConfirmed(false)}");
  expect(source).toContain("if(generation!==previewGeneration.current)return");
  expect(source).toContain("void run(x.action,x.channelIds,x.jobs||[],confirmed,x.bindings||[],x.files,x.planned)");
  expect(source).toContain("if(x.action==='queue'&&(!queueConfirmed||x.checking||!x.jobs?.length))return");
  expect(source).not.toContain("onClick={()=>void run('scan')}");
  expect(source).not.toContain("onClick={()=>void run('stats')}");
 });
 it('single-flights rapid confirm clicks into one controlled batch',()=>{
  expect(source).toContain('let batchExecutionPromise:Promise<void>|null=null');
  expect(source).toContain('if(batchExecutionPromise)return batchExecutionPromise');
  expect(source).toContain('batchExecutionPromise=task');
 });
 it('labels the expandable controls and keeps the quota estimate explicit',()=>{
  expect(source).toContain('aria-expanded={expanded}');
  expect(source).toContain('Оценка расхода квоты появится перед запуском');
  expect(source).toContain('ед. квоты + ');
 });
});
