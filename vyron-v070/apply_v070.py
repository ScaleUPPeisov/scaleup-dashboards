from pathlib import Path
import json,re,shutil
root=Path('.vyron-v051')
# Visual layer only: copy CSS and import it last.
shutil.copyfile('vyron-v070/v070.css', root/'src/v070.css')
p=root/'src/main.tsx'; s=p.read_text()
if "./v070.css" not in s:
    s=s.replace("import './v060.css';", "import './v060.css';\nimport './v070.css';")
p.write_text(s)

# UI copy only — event handlers and component structure stay untouched.
repls={
 'src/ExistingVideos.tsx':{
  "'РАБОТАЮ…':'↻ СИНХРОНИЗИРОВАТЬ'":"'Работаю…':'↻ Синхронизировать'",
  '>ПРИМЕНИТЬ ВЫБРАННЫЕ<':'>Применить выбранные<',
  '>РАССТАВИТЬ ДАТЫ<':'>Расставить даты<',
  '>+ МЕТАДАННЫЕ GPT<':'>✦ Метаданные GPT<',
  '>ВЫБРАТЬ PRIVATE<':'>Выбрать Private<',
  '>СНЯТЬ ВСЕ<':'>Снять все<',
  "{open?'СВЕРНУТЬ':'РЕДАКТИРОВАТЬ'}":"{open?'Свернуть':'Редактировать'}",
 },
 'src/MetadataPage.tsx':{
  "{busy?'ПРИМЕНЯЮ…':`ПРИМЕНИТЬ ${matched}`}":"{busy?'Применяю…':`Применить ${matched}`}",
  '>ЗАГРУЗИТЬ ФАЙЛ<':'>Загрузить файл<',
  '>РАЗОБРАТЬ ТЕКСТ GPT<':'>Разобрать текст GPT<',
  '>ОЧИСТИТЬ<':'>Очистить<',
  '>↻ ПОДТЯНУТЬ<':'>↻ Подтянуть<',
 },
 'src/AnalyticsPage.tsx':{
  "{busy?'ОБНОВЛЯЮ…':'↻ ОБНОВИТЬ'}":"{busy?'Обновляю…':'↻ Обновить'}",
 },
 'src/CompetitorsPage.tsx':{
  '>↻ ОБНОВИТЬ ВСЕ<':'>↻ Обновить все<',
  '>ДОБАВИТЬ<':'>Добавить<',
  '>ОТКРЫТЬ<':'>Открыть<',
  "{busy===c.id?'…':'↻ ОБНОВИТЬ'}":"{busy===c.id?'…':'↻ Обновить'}",
 },
}
for rel,mapping in repls.items():
    p=root/rel; s=p.read_text()
    for old,new in mapping.items():
        s=s.replace(old,new)
    p.write_text(s)

# Version metadata only.
for rel in ['package.json','src-tauri/tauri.conf.json']:
    p=root/rel; d=json.loads(p.read_text()); d['version']='0.7.0'; p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=root/'package-lock.json'; d=json.loads(p.read_text()); d['version']='0.7.0'; d.setdefault('packages',{}).setdefault('',{})['version']='0.7.0'; p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=root/'src-tauri/Cargo.toml'; s=p.read_text(); s,n=re.subn(r'^version = "0\.6\.1"$', 'version = "0.7.0"', s, count=1, flags=re.M); assert n==1; p.write_text(s)
p=root/'src-tauri/Cargo.lock'; s=p.read_text()
s=s.replace('name = "channelflow"\nversion = "0.6.1"','name = "channelflow"\nversion = "0.7.0"',1)
p.write_text(s)
# Visible version labels where present.
for rel in ['src/App.tsx','src/api.ts']:
    p=root/rel; s=p.read_text().replace('0.6.1','0.7.0'); p.write_text(s)
print('VYRON 0.7.0 Premium Compact UI applied')
