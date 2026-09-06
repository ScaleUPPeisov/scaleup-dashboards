#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=ROOT/'src/ProductionOS.tsx'
s=p.read_text()

def need(x):
    if x not in s:
        raise SystemExit(f'v208 Production shortcut missing anchor: {x[:220]!r}')

# ONLY PRODUCT CHANGE IN 2.0.8:
# expose the already-existing Future Channel creation flow directly in
# Production -> Materials, next to the channel selector. No OAuth/Publisher/
# Downloads/ENDLUME behavior is modified.
import_anchor="import {sortChannelsAlphabetically} from './channelSort';"
need(import_anchor)
if "from './channelIdentity'" not in s:
    s=s.replace(import_anchor,import_anchor+"\nimport {hasChannelNameConflict} from './channelIdentity';",1)

old_store="const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),setJobs=useApp(s=>s.setJobs),patchJob=useApp(s=>s.patchJob),settings=useApp(s=>s.settings),toast=useApp(s=>s.toast),setPage=useApp(s=>s.setPage);"
need(old_store)
new_store="const channels=useApp(s=>s.channels),addChannel=useApp(s=>s.addChannel),jobs=useApp(s=>s.jobs),setJobs=useApp(s=>s.setJobs),patchJob=useApp(s=>s.patchJob),settings=useApp(s=>s.settings),toast=useApp(s=>s.toast),setPage=useApp(s=>s.setPage);"
s=s.replace(old_store,new_store,1)

old_state="const [filter,setFilter]=useState('all'),[busy,setBusy]=useState(false),[inbox,setInbox]=useState<any>(),[planOpen,setPlanOpen]=useState(false)"
need(old_state)
new_state="const [futureOpen,setFutureOpen]=useState(false),[futureName,setFutureName]=useState(''),[filter,setFilter]=useState('all'),[busy,setBusy]=useState(false),[inbox,setInbox]=useState<any>(),[planOpen,setPlanOpen]=useState(false)"
s=s.replace(old_state,new_state,1)

function_anchor=" async function chooseProjectRoot(scope:'global'|'channel')"
need(function_anchor)
create_fn=r''' function createFutureChannel(){
  const name=futureName.trim().replace(/\s+/g,' ');if(!name)return;
  if(hasChannelNameConflict(channels,name)){toast('Канал с таким названием уже есть в VYRON');return}
  const created=addChannel({name});
  setChannelId(created.id);setInbox(undefined);setFutureName('');setFutureOpen(false);
  toast(`Будущий канал ${name} создан — можно сразу собирать материалы и проекты`)
 }
'''
s=s.replace(function_anchor,create_fn+function_anchor,1)

old_toolbar='''{tab==='materials'&&<><section className="panel materialToolbar"><select value={channelId} onChange={e=>{setChannelId(e.target.value);setInbox(undefined)}}><option value="">— канал —</option>{sortChannelsAlphabetically(channels).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="primary" disabled={!c} onClick={importImages}>+ Импортировать изображения</button></section>'''
need(old_toolbar)
new_toolbar='''{tab==='materials'&&<><section className="panel materialToolbar"><select value={channelId} onChange={e=>{setChannelId(e.target.value);setInbox(undefined)}}><option value="">— канал —</option>{sortChannelsAlphabetically(channels).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><button onClick={()=>{setFutureName('');setFutureOpen(true)}}>+ Будущий канал</button><button className="primary" disabled={!c} onClick={importImages}>+ Импортировать изображения</button></section>'''
s=s.replace(old_toolbar,new_toolbar,1)

modal_anchor="  {planOpen&&<div className=\"modalBackdrop\""
need(modal_anchor)
future_modal=r'''  {futureOpen&&<div className="modalBackdrop" onMouseDown={()=>setFutureOpen(false)}><section className="confirmModal" onMouseDown={e=>e.stopPropagation()}><small>FUTURE CHANNEL</small><h2>Будущий канал</h2><p>Напиши название канала, который создашь позже на YouTube. Его можно использовать в Production и ENDLUME уже сейчас.</p><label>Название будущего канала<input autoFocus value={futureName} placeholder="Например: Deep House France 2026" onChange={e=>setFutureName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')createFutureChannel()}}/></label><div className="cacheNotice"><b>БЕЗ YOUTUBE</b><span>После создания канал сразу станет текущим здесь. Когда позже подключишь одноимённый YouTube-канал, VYRON привяжет его к этой же локальной сущности.</span></div><footer><button onClick={()=>setFutureOpen(false)}>Отмена</button><button className="primary" disabled={!futureName.trim()} onClick={createFutureChannel}>Создать будущий канал</button></footer></section></div>}
'''
s=s.replace(modal_anchor,future_modal+modal_anchor,1)

p.write_text(s)

# Narrow integration test. v207 already provides the node:fs test-only shim.
(ROOT/'src/productionFutureChannelShortcut.test.ts').write_text(r'''import {describe,expect,it} from 'vitest';import {readFileSync} from 'node:fs';
describe('Production future-channel shortcut',()=>{
 it('exists beside the Materials channel selector',()=>{const s=readFileSync('src/ProductionOS.tsx','utf8');const start=s.indexOf("tab==='materials'");const end=s.indexOf('<ProductionManager view="materials"/>',start);const block=s.slice(start,end);expect(block).toContain('+ Будущий канал');expect(block).toContain('+ Импортировать изображения');expect(block.indexOf('+ Будущий канал')).toBeLessThan(block.indexOf('+ Импортировать изображения'))});
 it('creates the existing local future-channel identity and selects it immediately',()=>{const s=readFileSync('src/ProductionOS.tsx','utf8');expect(s).toContain('const created=addChannel({name})');expect(s).toContain('setChannelId(created.id)');expect(s).toContain('hasChannelNameConflict(channels,name)')});
 it('does not add YouTube coupling to Production',()=>{const s=readFileSync('src/ProductionOS.tsx','utf8');expect(s).not.toContain('youtubeProfileId');expect(s).not.toContain('youtubeChannelId')});
});
''')
print('VYRON 2.0.8 Production future-channel shortcut: PASS')
