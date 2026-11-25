import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

describe('APEX application-data routing',()=>{
 it('does not fall back to a bundle identifier owned by the installed app',()=>{
  const root='src-tauri/src';
  const offenders=readdirSync(root).filter(name=>name.endsWith('.rs')).filter(name=>
   /\b(?:app_data_dir|app_cache_dir)\s*\(/.test(readFileSync(join(root,name),'utf8'))
  );
  expect(offenders).toEqual([]);
  const paths=readFileSync(join(root,'apex_paths.rs'),'utf8');
  expect(paths).toContain('private_data_dir(&base)');
  expect(readFileSync(join(root,'apex_paths_fs.rs'),'utf8')).toContain('studio.channelflow.apex');
 });
});
