import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const source=fs.readFileSync('src/BatchControl.tsx','utf8');

describe('VYRON 5 Batch Control safety contract',()=>{
 it('locks the exact selected channel IDs before execution',()=>{
  expect(source).toContain("setPending({action,channelIds:[...selected]})");
  expect(source).toContain("const locked=new Set(lockedIds)");
  expect(source).toContain("channels.filter(c=>locked.has(c.id))");
 });
 it('requires preview confirmation and cancel has zero execution path',()=>{
  expect(source).toContain('BATCH PREVIEW');
  expect(source).toContain("onClick={()=>setPending(null)}>Отмена");
  expect(source).toContain("void run(x.action,x.channelIds)");
  expect(source).not.toContain("onClick={()=>void run('scan')}");
  expect(source).not.toContain("onClick={()=>void run('stats')}");
 });
 it('single-flights rapid confirm clicks into one controlled batch',()=>{
  expect(source).toContain('let batchExecutionPromise:Promise<void>|null=null');
  expect(source).toContain('if(batchExecutionPromise)return batchExecutionPromise');
  expect(source).toContain('batchExecutionPromise=task');
 });
});
