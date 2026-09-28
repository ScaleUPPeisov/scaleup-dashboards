import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {normalizeFolderSelectionPath,validateRenderFolderSelection} from './renderFolderSelection';

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

  it('inventory picker persists only renderFolderPath and immediately rescans',()=>{
    const source=fs.readFileSync('src/LiveContentInventory.tsx','utf8');
    expect(source).toContain("updateChannel(channel.id,{renderFolderPath:validation.path})");
    expect(source).not.toContain("projectsFolderPath:validation.path");
    expect(source).toContain('await useApp.getState().persist()');
    expect(source).toContain("await scanInventoryChannel(channel.id,'manual-channel')");
  });
});
