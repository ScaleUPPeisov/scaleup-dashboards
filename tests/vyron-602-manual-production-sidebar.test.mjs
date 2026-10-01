import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const productionOS=read('src/ProductionOS.tsx');
const manager=read('src/ProductionManager.tsx');
const backend=read('src-tauri/src/production_manager.rs');
const materialsBackend=read('src-tauri/src/materials_manager.rs');
const app=read('src/App.tsx');
const layout=read('src/ui-layout-contract.css');
const tauri=read('src-tauri/tauri.conf.json');

describe('VYRON 6.0.2 manual Production restore',()=>{
  it('routes Materials and Builder through the VYRON 4-compatible ProductionManager',()=>{
    expect(productionOS).toContain('<ProductionManager view="materials"/>');
    expect(productionOS).toContain('<ProductionManager view="builder"/>');
    expect(productionOS).not.toContain("import {MaterialsManager");
    expect(productionOS).not.toContain("<MaterialsManager");
  });

  it('keeps the old manual controls and three distribution modes',()=>{
    expect(manager).toContain("const projectCount=");
    expect(manager).toContain("tracksPerProject=");
    expect(manager).toContain("title:'Равномерно'");
    expect(manager).toContain("title:'Случайно'");
    expect(manager).toContain("title:'По порядку'");
    expect(manager).toContain('Разрешить повтор изображений');
    expect(manager).toContain('СОЗДАТЬ ${projectCount} ПРОЕКТОВ');
  });

  it('connects the visible Import Images button to the selected-channel Materials library',()=>{
    expect(productionOS).toContain('productionManagerApi.importMaterialImages(workspace,c.id,c.name,files)');
    expect(productionOS).toContain("vyron:production-materials-changed");
    expect(manager).toContain("window.addEventListener('vyron:production-materials-changed'");
  });

  it('honors explicit image reuse for both legacy and Materials Library sources',()=>{
    expect(backend).toContain('if req.project_count > available_images && !req.allow_image_reuse');
    expect(backend).toContain('if request.project_count > available && !request.allow_image_reuse');
    expect(backend).toContain('material_images[i % material_images.len()]');
    expect(backend).toContain('if req.allow_image_reuse { None } else { Some(image.asset_id.clone()) }');
  });

  it('keeps ENDLUME handoff, selection and validation in the restored builder',()=>{
    expect(manager).toContain('validateProjects(batch.manifestPath,endlumePath,ids)');
    expect(manager).toContain('openInEndlume(endlumePath,batch.manifestPath,ids,forceResend)');
    expect(manager).toContain('selectedProjectIds');
    expect(manager).toContain('handoffConsumed(requestPath)');
  });

  it('copies imported source images instead of deleting or moving the originals',()=>{
    expect(materialsBackend).toContain('fs::copy(&src, &tmp)');
    expect(materialsBackend).toContain('source_path: raw');
  });
});

describe('VYRON 6.0.2 sidebar icon contract',()=>{
  const navStart=app.indexOf('const nav:');
  const navEnd=app.indexOf('function SidebarIcon',navStart);
  const navSource=app.slice(navStart,navEnd);

  it('contains no Unicode/font glyph sidebar icons',()=>{
    for(const glyph of ['⌂','▣','◆','▤','▶','⌁','◎','⚙'])expect(navSource).not.toContain(glyph);
  });

  it('renders every sidebar icon through the shared SVG component',()=>{
    expect(app).toContain('function SidebarIcon');
    expect(app).toContain('<SidebarIcon name={n.icon}/>');
    expect(app).toContain("viewBox:'0 0 24 24'");
    expect(app).toContain("stroke:'currentColor'");
    expect(app).toContain('strokeWidth:1.8');
  });

  it('uses one fixed icon slot and one footer grid for Owner and Local Core',()=>{
    expect(layout).toContain('.sidebarIconSlot svg');
    expect(layout).toContain('width:18px;height:18px');
    expect(layout).toContain('.sidebarFooter .ownerProfileCompact,.sidebarFooter .sideFoot');
    expect(layout).toContain('grid-template-columns:32px minmax(0,1fr)');
    expect(layout).toContain('grid-template-columns:24px minmax(0,1fr)');
  });

  it('preserves app identity and updater configuration',()=>{
    expect(tauri).toContain('"identifier": "studio.channelflow.desktop"');
    expect(tauri).toContain('ScaleUPPeisov/vyron-releases/main/updates/latest.json');
    expect(tauri).toContain('ScaleUPPeisov/vyron-releases/main/updates/windows-latest.json');
  });
});
