import {describe,expect,it} from 'vitest';
import fs from 'node:fs';

describe('VYRON 6.1.10 metadata schedule opt-in wiring',()=>{
  const page=fs.readFileSync(new URL('./MetadataPage.tsx',import.meta.url).pathname,'utf8');
  const api=fs.readFileSync(new URL('./api.ts',import.meta.url).pathname,'utf8');
  const native=fs.readFileSync(new URL('../src-tauri/src/youtube.rs',import.meta.url).pathname,'utf8');
  it('defaults schedule edit OFF and removes schedule pairs while off',()=>{
    expect(page).toContain("[changeSchedule,setChangeSchedule]=useState(false)");
    expect(page).toContain("changeSchedule?selectedYt.map");
    expect(page).toContain('Изменить дату и время публикации');
  });
  it('sends an exact patch object instead of full existing state',()=>{
    expect(page).toContain('api.youtubeUpdateExisting(profileId,v.id,patch,operationId)');
    expect(api).toContain('{profileId,videoId,...patch,operationId}');
  });
  it('native missing publishAt is not inferred as a schedule edit',()=>{
    expect(native).toContain('title: Option<String>');
    expect(native).toContain('description: Option<String>');
    expect(native).toContain('tags: Option<Vec<String>>');
    expect(native).toContain('let publish_changed = publish_requested && !same_publish_time(publish, old_publish);');
    expect(native).toContain('let schedule_requested = publish_changed || privacy_changed;');
  });
});
