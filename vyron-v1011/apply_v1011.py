#!/usr/bin/env python3
from pathlib import Path
import json,re

VERSION='1.0.11'

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.11: '+msg)

# Version sync from exact released 1.0.10 source.
p=Path('package.json'); package=json.loads(p.read_text()); must(package.get('version')=='1.0.10','expected package 1.0.10'); package['version']=VERSION; p.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/tauri.conf.json'); conf=json.loads(p.read_text()); must(conf.get('version')=='1.0.10','expected tauri 1.0.10'); conf['version']=VERSION; p.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/Cargo.toml'); cargo=p.read_text(); must('version = "1.0.10"' in cargo,'expected Cargo 1.0.10'); p.write_text(cargo.replace('version = "1.0.10"','version = "1.0.11"',1))
p=Path('package-lock.json')
if p.exists():
    lock=json.loads(p.read_text())
    if lock.get('version')=='1.0.10': lock['version']=VERSION
    if isinstance(lock.get('packages'),dict) and isinstance(lock['packages'].get(''),dict) and lock['packages'][''].get('version')=='1.0.10': lock['packages']['']['version']=VERSION
    p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n')

# A single resolver becomes the source of truth for all Production project folders.
p=Path('src/productionPrefs.ts'); s=p.read_text()
marker="export function patchProductionPrefs(p:Partial<ProductionPrefs>|((s:ProductionPrefs)=>ProductionPrefs)){"
must(marker in s,'productionPrefs marker missing')
resolver="""export function resolveProductionRootFromPrefs(prefs:ProductionPrefs,channelId:string|undefined,fallback:string):string{\n  const channelRoot=channelId?prefs.byChannel[channelId]?.productionRoot:undefined;\n  return (channelRoot||prefs.productionRoot||fallback||'').trim();\n}\nexport function resolveProductionRoot(channelId:string|undefined,fallback:string):string{\n  return resolveProductionRootFromPrefs(readProductionPrefs(),channelId,fallback);\n}\n\n"""
must('resolveProductionRootFromPrefs' not in s,'resolver already present')
s=s.replace(marker,resolver+marker,1); p.write_text(s)

# Autopilot must create Video_XXX in the same selected Production root, while
# Inbox/RenderQueue control state stays in the stable VYRON workspace.
p=Path('src/autopilotRuntime.ts'); s=p.read_text()
must("import { api } from './api';" in s,'autopilot api import missing')
s=s.replace("import { api } from './api';","import { api } from './api';\nimport {productionManagerApi} from './productionManagerApi';\nimport {resolveProductionRoot} from './productionPrefs';",1)
old="""async function ensureFolder(channel:Channel,job:VideoJob,workspace:string){\n  if(job.folder)return job.folder;\n  const prepared=await api.prepareJob(workspace,channel.id,channel.name,job.number,channel.minTracks);"""
new="""async function ensureFolder(channel:Channel,job:VideoJob,projectRoot:string){\n  if(job.folder)return job.folder;\n  const storage=await productionManagerApi.storageStatus(projectRoot);\n  if(!storage.exists||!storage.writable)throw new Error(storage.error||`Папка проектов недоступна: ${projectRoot}`);\n  const prepared=await api.prepareJob(projectRoot,channel.id,channel.name,job.number,channel.minTracks);"""
must(old in s,'ensureFolder marker missing'); s=s.replace(old,new,1)
old="const state=useApp.getState(),s=state.settings,workspace=s.workspace;\n  if(!workspace)return;\n  await api.ensureChannelInbox(workspace,channel.name);"
new="const state=useApp.getState(),s=state.settings,workspace=s.workspace;\n  if(!workspace)return;\n  const projectRoot=resolveProductionRoot(channel.id,workspace);\n  await api.ensureChannelInbox(workspace,channel.name);"
must(old in s,'processChannel workspace marker missing'); s=s.replace(old,new,1)
must('ensureFolder(channel,job,workspace)' in s,'autopilot ensureFolder call missing'); s=s.replace('ensureFolder(channel,job,workspace)','ensureFolder(channel,job,projectRoot)',1)
p.write_text(s)

# Production UI: make storage location visible on every Production tab and use it
# for manual image-import project folders too.
p=Path('src/ProductionOS.tsx'); s=p.read_text()
must("import {useProductionPrefs} from './productionPrefs';" in s,'ProductionOS prefs import missing')
s=s.replace("import {useProductionPrefs} from './productionPrefs';","import {patchChannelProductionPrefs,resolveProductionRootFromPrefs,useProductionPrefs} from './productionPrefs';",1)
old="const selectedJobIds=(prefs.selectedJobIds||[]).filter(id=>jobs.some(j=>j.id===id));"
new="const selectedJobIds=(prefs.selectedJobIds||[]).filter(id=>jobs.some(j=>j.id===id));const projectRoot=resolveProductionRootFromPrefs(prefs,channelId,settings.workspace);"
must(old in s,'ProductionOS selected jobs marker missing'); s=s.replace(old,new,1)

old=""" const toggleJob=(id:string)=>patchPrefs({selectedJobIds:selectedJobIds.includes(id)?selectedJobIds.filter(x=>x!==id):[...selectedJobIds,id]});\n const visibleJobIds=filtered.map(j=>j.id);"""
new=""" const toggleJob=(id:string)=>patchPrefs({selectedJobIds:selectedJobIds.includes(id)?selectedJobIds.filter(x=>x!==id):[...selectedJobIds,id]});\n async function chooseProjectRoot(scope:'global'|'channel'){const path=await productionManagerApi.chooseProductionRoot();if(!path)return;const st=await productionManagerApi.storageStatus(path);if(!st.exists||!st.writable){toast(st.error||'Выбранная папка проектов недоступна для записи');return}if(scope==='channel'&&c){patchChannelProductionPrefs(c.id,{productionRoot:path});toast(`Папка проектов для ${c.name} сохранена`)}else{patchPrefs({productionRoot:path});toast('Основная папка проектов сохранена')}}\n function inferJobRoot(folder:string){const clean=folder.replace(/\\/+$/,'');const m=clean.match(/^(.*)\\/[^/]+\\/Video_\\d+$/i);return m?.[1]||''}\n const visibleJobIds=filtered.map(j=>j.id);"""
must(old in s,'ProductionOS toggle marker missing'); s=s.replace(old,new,1)

old="async function deleteJobs(ids:string[],label:string){const unique=[...new Set(ids)].filter(id=>useApp.getState().jobs.some(j=>j.id===id));if(!unique.length)return;if(!confirm(label))return;setBusy(true);try{const rows=useApp.getState().jobs.filter(j=>unique.includes(j.id));for(const j of rows){if(j.folder)await productionManagerApi.deleteJobFolder(settings.workspace,j.folder)}setJobs(useApp.getState().jobs.filter(j=>!unique.includes(j.id)));patchPrefs({selectedJobIds:selectedJobIds.filter(id=>!unique.includes(id))});toast(`Удалено проектов: ${unique.length}`)}catch(e){toast(`Не удалось удалить проекты: ${String(e)}`)}finally{setBusy(false)}}"
new="async function deleteJobs(ids:string[],label:string){const unique=[...new Set(ids)].filter(id=>useApp.getState().jobs.some(j=>j.id===id));if(!unique.length)return;if(!confirm(label))return;setBusy(true);try{const rows=useApp.getState().jobs.filter(j=>unique.includes(j.id));for(const j of rows){if(!j.folder)continue;const roots=[resolveProductionRootFromPrefs(prefs,j.channelId,settings.workspace),inferJobRoot(j.folder),settings.workspace].filter((x,i,a)=>x&&a.indexOf(x)===i);let done=false,last:unknown;for(const root of roots){try{await productionManagerApi.deleteJobFolder(root,j.folder);done=true;break}catch(e){last=e}}if(!done)throw last||new Error('Не удалось определить хранилище проекта')}setJobs(useApp.getState().jobs.filter(j=>!unique.includes(j.id)));patchPrefs({selectedJobIds:selectedJobIds.filter(id=>!unique.includes(id))});toast(`Удалено проектов: ${unique.length}`)}catch(e){toast(`Не удалось удалить проекты: ${String(e)}`)}finally{setBusy(false)}}"
must(old in s,'deleteJobs marker missing'); s=s.replace(old,new,1)

old="async function importImages(){if(!c)return;const files=await api.chooseImages();if(!files.length)return;const pending=jobs.filter(j=>j.channelId===c.id&&j.status==='NEED_IMAGE').sort((a,b)=>a.number-b.number);const nums=pending.slice(0,files.length).map(j=>j.number);if(!nums.length){toast('Нет проектов, ожидающих изображение');return}const imported=await api.importImages(settings.workspace,c.id,c.name,files,c.minTracks,nums);"
new="async function importImages(){if(!c)return;let root=projectRoot;if(!root){root=await api.defaultWorkspace();useApp.getState().patchSettings({workspace:root})}const storage=await productionManagerApi.storageStatus(root);if(!storage.exists||!storage.writable){toast(storage.error||`Папка проектов недоступна: ${root}`);return}const files=await api.chooseImages();if(!files.length)return;const pending=jobs.filter(j=>j.channelId===c.id&&j.status==='NEED_IMAGE').sort((a,b)=>a.number-b.number);const nums=pending.slice(0,files.length).map(j=>j.number);if(!nums.length){toast('Нет проектов, ожидающих изображение');return}const imported=await api.importImages(root,c.id,c.name,files,c.minTracks,nums);"
must(old in s,'importImages marker missing'); s=s.replace(old,new,1)

old='''   <ProductionWorkspace/>\n   <div className="youtubeTabs productionTabs">'''
new='''   <ProductionWorkspace/>\n   <section className="panel materialToolbar"><div className="jobMain" style={{minWidth:0,flex:1}}><small>ХРАНИЛИЩЕ ФАЙЛОВ ПРОЕКТОВ</small><b title={projectRoot}>{projectRoot||'Папка не выбрана'}</b><span>Новые VIDEO_XXX и batch создаются здесь. {projectRoot.startsWith('/Volumes/')?'Внешний диск':'Локальное хранилище'}.</span></div><button onClick={()=>void chooseProjectRoot('global')}>Выбрать основную папку</button>{c&&<button onClick={()=>void chooseProjectRoot('channel')}>Для этого канала</button>}{projectRoot&&<button onClick={()=>void productionManagerApi.openFolder(projectRoot)}>Открыть</button>}</section>\n   <div className="youtubeTabs productionTabs">'''
must(old in s,'ProductionWorkspace JSX marker missing'); s=s.replace(old,new,1)
p.write_text(s)

# Pure resolver regression test; no browser/localStorage dependency.
Path('tests/productionRoot_v1011.test.ts').write_text("""import {describe,expect,it} from 'vitest';\nimport {resolveProductionRootFromPrefs,type ProductionPrefs} from '../src/productionPrefs';\n\nconst base:ProductionPrefs={version:2,tab:'queue',byChannel:{},selectedJobIds:[]};\ndescribe('VYRON 1.0.11 production project root',()=>{\n  it('uses fallback when no Production root is configured',()=>expect(resolveProductionRootFromPrefs(base,'c1','/internal')).toBe('/internal'));\n  it('uses global Production root',()=>expect(resolveProductionRootFromPrefs({...base,productionRoot:'/Volumes/PROJECTS'},'c1','/internal')).toBe('/Volumes/PROJECTS'));\n  it('channel override wins over global',()=>expect(resolveProductionRootFromPrefs({...base,productionRoot:'/Volumes/ALL',byChannel:{c1:{projectCount:30,tracksPerProject:15,mode:'even',allowImageReuse:false,selectedProjectIds:[],productionRoot:'/Volumes/NEON'}}},'c1','/internal')).toBe('/Volumes/NEON'));\n});\n""")

print('VYRON 1.0.11 project storage routing applied')
