import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {normalizeFolderSelectionPath,renderChannelFolderPath,validateRenderFolderSelection,validateRenderRootSelection} from './renderFolderSelection';

describe('VYRON 3.3.5 render folder picker safety',()=>{
  it('accepts the exact channel folder inside Render',()=>{
    expect(validateRenderFolderSelection('/Volumes/TOSHIBA EXT/ВАЙРОН/Render/Aether Riff','Aether Riff')).toEqual({
      ok:true,path:'/Volumes/TOSHIBA EXT/ВАЙРОН/Render/Aether Riff'
    })
  });

  it('rejects the Projects twin of the same channel',()=>{
    const x=validateRenderFolderSelection('/Volumes/TOSHIBA EXT/ВАЙРОН/Projects/Aether Riff','Aether Riff');
    expect(x.ok).toBe(false);
    if(!x.ok)expect(x.reason).toBe('PROJECTS_PATH')
  });

  it('rejects the generic Render root to prevent cross-channel recursive scan',()=>{
    const x=validateRenderFolderSelection('/Volumes/TOSHIBA EXT/ВАЙРОН/Render','Aether Riff');
    expect(x.ok).toBe(false);
    if(!x.ok)expect(x.reason).toBe('RENDER_ROOT')
  });

  it('rejects another channel folder',()=>{
    const x=validateRenderFolderSelection('/Volumes/TOSHIBA EXT/ВАЙРОН/Render/Black Coast Sessions','Aether Riff');
    expect(x.ok).toBe(false);
    if(!x.ok)expect(x.reason).toBe('CHANNEL_NAME_MISMATCH')
  });

  it('rejects an existing projectsFolderPath even with Windows separators',()=>{
    const selected='D:\\VYRON\\Projects\\Aether Riff';
    const x=validateRenderFolderSelection(selected,'Aether Riff','D:\\VYRON\\Projects\\Aether Riff');
    expect(x.ok).toBe(false)
  });

  it('normalizes Windows drive letter and trailing separators',()=>{
    expect(normalizeFolderSelectionPath('D:\\Render\\Aether Riff\\')).toBe('d:/Render/Aether Riff')
  })

  it('accepts one global Render root and maps exact channel children',()=>{
    expect(validateRenderRootSelection('/Volumes/TOSHIBA EXT/ВАЙРОН/Render')).toEqual({ok:true,path:'/Volumes/TOSHIBA EXT/ВАЙРОН/Render'});
    expect(renderChannelFolderPath('/Volumes/TOSHIBA EXT/ВАЙРОН/Render','Aether Riff')).toBe('/Volumes/TOSHIBA EXT/ВАЙРОН/Render/Aether Riff')
  });

  it('global root rejects Projects and any non-Render folder',()=>{
    expect(validateRenderRootSelection('/Volumes/TOSHIBA EXT/ВАЙРОН/Projects').ok).toBe(false);
    expect(validateRenderRootSelection('/Volumes/TOSHIBA EXT/ВАЙРОН').ok).toBe(false)
  });

  it('inventory global picker saves Render root, maps channels and never writes Projects bindings',()=>{
    const source=fs.readFileSync('src/LiveContentInventory.tsx','utf8');
    expect(source).toContain('api.chooseRenderRoot(');
    expect(source).toContain('patchSettings({renderRootPath:rootValidation.path})');
    expect(source).toContain('renderChannelFolderPath(rootValidation.path,channel.name)');
    expect(source).toContain('updateChannel(row.channel.id,{renderFolderPath:row.candidate})');
    expect(source).not.toContain('projectsFolderPath:row.candidate');
    expect(source).toContain("await scanAllInventories('manual-all')")
  });

  it('inventory picker persists only renderFolderPath and immediately rescans',()=>{
    const source=fs.readFileSync('src/LiveContentInventory.tsx','utf8');
    expect(source).toContain("updateChannel(channel.id,{renderFolderPath:validation.path})");
    expect(source).not.toContain("projectsFolderPath:validation.path");
    expect(source).toContain('await useApp.getState().persist()');
    expect(source).toContain("await scanInventoryChannel(channel.id,'manual-channel')");
  });
});
