from pathlib import Path
import json,re,shutil
root=Path('.vyron-v051')
shutil.copyfile('vyron-v061/MetadataPage.tsx',root/'src/MetadataPage.tsx')
p=root/'src/styles.css'; s=p.read_text(); add=Path('vyron-v061/styles.add.css').read_text();
if '/* VYRON 0.6.1 Metadata Hub */' not in s: s += '\n\n'+add+'\n'
p.write_text(s)
p=root/'src/types.ts'; s=p.read_text(); old="'analytics'|'existing'|'publisher'|'settings'"; new="'analytics'|'metadata'|'existing'|'publisher'|'settings'"; assert old in s; p.write_text(s.replace(old,new,1))
p=root/'src/App.tsx'; s=p.read_text(); old="import { AnalyticsPage } from './AnalyticsPage';"; assert old in s; s=s.replace(old,old+"\nimport { MetadataPage } from './MetadataPage';",1); old="{page:'analytics',icon:'⌁',label:'Аналитика'},{page:'existing'"; assert old in s; s=s.replace(old,"{page:'analytics',icon:'⌁',label:'Аналитика'},{page:'metadata',icon:'✦',label:'Метаданные'},{page:'existing'",1); old="page==='analytics'?<AnalyticsPage/>:page==='existing'"; assert old in s; s=s.replace(old,"page==='analytics'?<AnalyticsPage/>:page==='metadata'?<MetadataPage/>:page==='existing'",1); s=s.replace('VYRON 0.6.0','VYRON 0.6.1').replace('Версия 0.6.0','Версия 0.6.1').replace("update.current||'0.6.0'","update.current||'0.6.1'"); p.write_text(s)
for rel in ['package.json','src-tauri/tauri.conf.json']:
 p=root/rel; d=json.loads(p.read_text()); d['version']='0.6.1'; p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=root/'package-lock.json'; d=json.loads(p.read_text()); d['version']='0.6.1'; d.setdefault('packages',{}).setdefault('',{})['version']='0.6.1'; p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=root/'src-tauri/Cargo.toml'; s=p.read_text(); s,n=re.subn(r'^version = "0\.6\.0"$', 'version = "0.6.1"', s, count=1, flags=re.M); assert n==1; p.write_text(s)
p=root/'src-tauri/Cargo.lock'; s=p.read_text(); old='name = "channelflow"\nversion = "0.6.0"'; assert old in s; p.write_text(s.replace(old,'name = "channelflow"\nversion = "0.6.1"',1))
print('VYRON 0.6.1 Metadata Hub applied')
