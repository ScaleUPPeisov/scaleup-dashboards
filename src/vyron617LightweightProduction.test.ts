import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>fs.readFileSync(path,'utf8');

describe('VYRON 6.1.17 lightweight Production contracts',()=>{
  it('keeps configured music separate from its optional index',()=>{
    const rust=read('src-tauri/src/production_manager.rs');
    expect(rust).toContain('let index_matches_settings = idx.library_path == settings.music_library');
    expect(rust).toContain('library_path: settings.music_library.clone()');
    expect(rust).toContain('available: Path::new(&settings.music_library).is_dir()');
    expect(rust).toContain('batches: Vec::new()');
  });

  it('stores per-channel recent music folders and only indexes on manual refresh',()=>{
    const prefs=read('src/productionPrefs.ts');
    const manager=read('src/ProductionManager.tsx');
    expect(prefs).toContain('musicLibraryHistory?:string[]');
    expect(manager).toContain('musicLibraryHistory:[libraryPath');
    const choose=manager.split('async function selectMusicLibrary',2)[1].split('async function reindexMusic',1)[0];
    expect(choose).toContain('setMusicLibrary');
    expect(choose).not.toContain('indexMusic');
    expect(manager).toContain('ОТКРЫТЬ В FINDER');
    expect(manager).toContain('ДИСК НЕДОСТУПЕН');
  });

  it('does not load batch history for Materials',()=>{
    const manager=read('src/ProductionManager.tsx');
    expect(manager).toContain("async function refreshState(loadHistory=view!=='materials')");
    expect(manager).toContain('if(!loadHistory){setBatches([]);return}');
  });

  it('uses cached inventory and targeted watcher/reconnect scans',()=>{
    const bridge=read('src/LiveInventoryBridge.tsx');
    expect(bridge).not.toContain('scanAllInventories');
    expect(bridge).toContain("scanInventoryChannel(channelId,'watcher')");
    expect(bridge).toContain("scanInventoryChannel(row.channelId,'reconnect')");
  });

  it('polls render facts only for actively tracked channels',()=>{
    const bridge=read('src/ProductionStatusBridge.tsx');
    expect(bridge).toContain('trackedChannels');
    expect(bridge).toContain("job.status==='RENDERING'");
    expect(bridge).toContain('scanFactualRenderRuntime(workspace,candidates)');
    expect(bridge).toContain('20_000');
  });
});
