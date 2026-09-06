#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def r(p): return (ROOT/p).read_text()
def w(p,s): (ROOT/p).write_text(s)
def require(p,s,needle):
    if needle not in s: raise SystemExit(f'v207 future channels missing anchor {p}: {needle[:180]!r}')

# -----------------------------------------------------------------------------
# VYRON 2.0.7 — FUTURE CHANNELS
#
# A VYRON channel is a local production identity first. Channel.id remains the
# stable owner of music/images/jobs/batches/renders. youtubeProfileId and
# youtubeChannelId are optional bindings that may be attached later.
# -----------------------------------------------------------------------------
w('src/channelIdentity.ts',r'''import type {Channel} from './types';

export function normalizeChannelName(value?:string){
 return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()
}

export function isFutureChannel(channel:Pick<Channel,'youtubeProfileId'|'youtubeChannelId'>){
 return !channel.youtubeProfileId&&!channel.youtubeChannelId
}

export function findFutureChannelMatch(channels:Channel[],youtubeTitle?:string){
 const key=normalizeChannelName(youtubeTitle);if(!key)return undefined;
 const matches=channels.filter(c=>isFutureChannel(c)&&normalizeChannelName(c.name)===key);
 return matches.length===1?matches[0]:undefined
}

export function hasChannelNameConflict(channels:Channel[],name:string,exceptId?:string){
 const key=normalizeChannelName(name);return Boolean(key)&&channels.some(c=>c.id!==exceptId&&normalizeChannelName(c.name)===key)
}
''')

w('src/channelIdentity.test.ts',r'''import {describe,expect,it} from 'vitest';
import type {Channel} from './types';
import {findFutureChannelMatch,hasChannelNameConflict,isFutureChannel,normalizeChannelName} from './channelIdentity';

const ch=(id:string,name:string,extra:Partial<Channel>={}):Channel=>({id,name,...extra} as Channel);

describe('future channel identity',()=>{
 it('normalizes unicode, case and whitespace without fuzzy punctuation matching',()=>{
  expect(normalizeChannelName('  ＮＥＯＮ   Rain  ')).toBe('neon rain');
  expect(normalizeChannelName('NEON-Rain')).not.toBe(normalizeChannelName('NEON Rain'));
 });
 it('treats only completely unbound channels as future channels',()=>{
  expect(isFutureChannel(ch('a','A'))).toBe(true);
  expect(isFutureChannel(ch('b','B',{youtubeChannelId:'UC123'}))).toBe(false);
  expect(isFutureChannel(ch('c','C',{youtubeProfileId:'profile'}))).toBe(false);
 });
 it('finds one exact normalized future-channel name',()=>{
  const rows=[ch('draft','Neon Rain'),ch('other','Other')];
  expect(findFutureChannelMatch(rows,'  NEON   RAIN ')?.id).toBe('draft');
 });
 it('never silently merges an ambiguous duplicate name',()=>{
  const rows=[ch('a','Neon Rain'),ch('b',' neon   rain ')];
  expect(findFutureChannelMatch(rows,'NEON RAIN')).toBeUndefined();
 });
 it('does not steal an already linked channel during name matching',()=>{
  const rows=[ch('linked','Neon Rain',{youtubeChannelId:'UC1',youtubeProfileId:'p1'}),ch('draft','Other')];
  expect(findFutureChannelMatch(rows,'Neon Rain')).toBeUndefined();
 });
 it('detects duplicate local names before a future channel is created',()=>{
  const rows=[ch('a','Neon Rain')];
  expect(hasChannelNameConflict(rows,' NEON   RAIN ')).toBe(true);
  expect(hasChannelNameConflict(rows,'Other')).toBe(false);
 });
});
''')

# -----------------------------------------------------------------------------
# Account binding order:
# 1. Existing YouTube channel/profile binding (backward compatibility).
# 2. Exactly one unbound local future channel with the same normalized title.
# 3. Create a new local channel, preserving the previous behavior.
# No file/project migration is performed: the matched local Channel.id survives.
# -----------------------------------------------------------------------------
p='src/AccountsPage.tsx';s=r(p)
import_anchor="import type {YoutubeProfile} from './types';"
require(p,s,import_anchor)
if "from './channelIdentity'" not in s:
    s=s.replace(import_anchor,import_anchor+"\nimport {findFutureChannelMatch} from './channelIdentity';",1)
start=s.find(' function bindProfile(p:YoutubeProfile){')
end=s.find('\n async function refresh()',start)
if start<0 or end<0: raise SystemExit('v207 AccountsPage bindProfile anchors missing')
new_bind=r''' function bindProfile(p:YoutubeProfile){
  if(!p.channelId)return;
  const state=useApp.getState();
  const exact=state.channels.find(x=>x.youtubeChannelId===p.channelId||x.youtubeProfileId===p.id);
  if(exact){state.updateChannel(exact.id,{youtubeProfileId:p.id,youtubeChannelId:p.channelId,name:p.channelTitle||exact.name});return{channel:exact,mode:'existing' as const}}
  const future=findFutureChannelMatch(state.channels,p.channelTitle);
  if(future){state.updateChannel(future.id,{youtubeProfileId:p.id,youtubeChannelId:p.channelId});return{channel:future,mode:'future' as const}}
  const created=state.addChannel({name:p.channelTitle||'YouTube канал',youtubeProfileId:p.id,youtubeChannelId:p.channelId});return{channel:created,mode:'created' as const}
 }'''
s=s[:start]+new_bind+s[end:]
old_connect="async function connect(){setBrowserOpen(false);setBusy(true);try{localStorage.setItem('vyron:oauth-browser',browser);const p=await api.youtubeConnectGlobal(browser);bindProfile(p);await refresh();toast(`✓ ${p.channelTitle||p.channelId||'YouTube канал'} подключён и привязан автоматически`)}catch(e){toast(String(e))}finally{setBusy(false)}}"
require(p,s,old_connect)
new_connect="async function connect(){setBrowserOpen(false);setBusy(true);try{localStorage.setItem('vyron:oauth-browser',browser);const p=await api.youtubeConnectGlobal(browser);const binding=bindProfile(p);await refresh();toast(binding?.mode==='future'?`✓ ${p.channelTitle||p.channelId||'YouTube канал'} привязан к будущему каналу ${binding.channel.name}. Все готовые проекты сохранены.`:`✓ ${p.channelTitle||p.channelId||'YouTube канал'} подключён и привязан автоматически`)}catch(e){toast(String(e))}finally{setBusy(false)}}"
s=s.replace(old_connect,new_connect,1)
s=s.replace('При подключении VYRON YT PEISOV сам определяет YouTube channelId и привязывает канал — ручное связывание не требуется.','Можно заранее создать будущий канал и выпускать для него проекты без YouTube. При подключении VYRON YT PEISOV сначала ищет будущий канал с тем же названием и привязывает OAuth к нему.',1)
s=s.replace('VYRON YT PEISOV спросит браузер, откроет Google OAuth и после подтверждения сам создаст карточку реального канала.','VYRON YT PEISOV спросит браузер и после OAuth привяжет реальный канал к одноимённому будущему каналу. Если такого канала нет — создаст новый.',1)
w(p,s)

# -----------------------------------------------------------------------------
# Channels UI: creating a channel now asks for the intended future YouTube name.
# The card explicitly tells the user that Production/ENDLUME may be used before
# OAuth. Duplicate normalized names are rejected to keep later auto-binding safe.
# -----------------------------------------------------------------------------
p='src/ChannelsOS.tsx';s=r(p)
import_anchor="import type {Channel,VideoJob} from './types';"
require(p,s,import_anchor)
if "from './channelIdentity'" not in s:
    s=s.replace(import_anchor,import_anchor+"\nimport {hasChannelNameConflict,isFutureChannel} from './channelIdentity';",1)
old_state="const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),addChannel=useApp(s=>s.addChannel),updateChannel=useApp(s=>s.updateChannel),removeChannel=useApp(s=>s.removeChannel),setPage=useApp(s=>s.setPage);\n const [editing,setEditing]=useState<string|null>(null);\n const add=()=>{const c=addChannel({name:`Канал ${channels.length+1}`});setEditing(c.id)};"
require(p,s,old_state)
new_state="const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),addChannel=useApp(s=>s.addChannel),updateChannel=useApp(s=>s.updateChannel),removeChannel=useApp(s=>s.removeChannel),setPage=useApp(s=>s.setPage),toast=useApp(s=>s.toast);\n const [editing,setEditing]=useState<string|null>(null),[creating,setCreating]=useState(false),[futureName,setFutureName]=useState('');\n const add=()=>{setFutureName('');setCreating(true)};\n const createFuture=()=>{const name=futureName.trim().replace(/\\s+/g,' ');if(!name)return;if(hasChannelNameConflict(channels,name)){toast('Канал с таким названием уже есть в VYRON');return}const c=addChannel({name});setCreating(false);setFutureName('');setEditing(c.id);toast(`Будущий канал ${name} создан — YouTube пока не нужен`)};"
s=s.replace(old_state,new_state,1)
s=s.replace('<button className="primary" onClick={add}>+ Добавить канал</button>','<button className="primary" onClick={add}>+ Будущий канал</button>',1)
s=s.replace('Добавь локальный канал или подключи реальный аккаунт во вкладке YouTube.','Создай будущий канал по его планируемому названию. Музыку, изображения и проекты можно готовить до подключения YouTube.',1)
old_identity="<em className={c.youtubeProfileId?'good':'warn'}>{c.youtubeProfileId?'OAuth сохранён локально':'YouTube не привязан'}</em>"
require(p,s,old_identity)
s=s.replace(old_identity,"<em className={c.youtubeProfileId?'good':'warn'}>{c.youtubeProfileId?'YouTube подключён':'БУДУЩИЙ • YouTube не подключён'}</em>",1)
old_actions='<div className="channelActions"><button onClick={()=>setPage(\'youtube\')}>Открыть YouTube</button><button onClick={()=>setEditing(editing===c.id?null:c.id)}>{editing===c.id?\'Закрыть настройки\':\'Настроить канал\'}</button></div>'
require(p,s,old_actions)
new_actions='<div className="channelActions"><button onClick={()=>setPage(isFutureChannel(c)?\'accounts\':\'youtube\')}>{isFutureChannel(c)?\'Подключить YouTube позже\':\'Открыть YouTube\'}</button><button onClick={()=>setEditing(editing===c.id?null:c.id)}>{editing===c.id?\'Закрыть настройки\':\'Настроить канал\'}</button></div>'
s=s.replace(old_actions,new_actions,1)
modal=r'''  {creating&&<div className="modalBackdrop" onMouseDown={()=>setCreating(false)}><section className="confirmModal" onMouseDown={e=>e.stopPropagation()}><small>FUTURE CHANNEL</small><h2>Будущий канал</h2><p>Укажи название, под которым позже создашь канал на YouTube. Уже сейчас VYRON сможет собирать для него музыку, изображения, VIDEO-проекты и рендеры.</p><label>Название будущего канала<input autoFocus value={futureName} placeholder="Например: Veloura Rain" onChange={e=>setFutureName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')createFuture()}}/></label><div className="cacheNotice"><b>БЕЗ YOUTUBE</b><span>OAuth и channelId для производства не нужны. При будущем подключении название будет сопоставлено автоматически.</span></div><footer><button onClick={()=>setCreating(false)}>Отмена</button><button className="primary" disabled={!futureName.trim()} onClick={createFuture}>Создать будущий канал</button></footer></section></div>}
'''
end_anchor=' </>\n}'
if end_anchor not in s: raise SystemExit('v207 ChannelsOS component end anchor missing')
s=s.replace(end_anchor,modal+end_anchor,1)
w(p,s)

# Source-level integration gate. This complements behavior tests above and makes
# accidental reversion of the binding order visible during every release build.
w('src/futureChannelFlow.test.ts',r'''import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('VYRON future-channel integration',()=>{
 it('binds existing id first, then a unique future name, then creates',()=>{const s=readFileSync('src/AccountsPage.tsx','utf8');const a=s.indexOf('youtubeChannelId===p.channelId');const b=s.indexOf('findFutureChannelMatch');const c=s.indexOf("mode:'created'");expect(a).toBeGreaterThan(-1);expect(b).toBeGreaterThan(a);expect(c).toBeGreaterThan(b)});
 it('exposes explicit future-channel creation in Channels',()=>{const s=readFileSync('src/ChannelsOS.tsx','utf8');expect(s).toContain('+ Будущий канал');expect(s).toContain('Создать будущий канал');expect(s).toContain('БУДУЩИЙ • YouTube не подключён')});
 it('keeps Production independent from YouTube OAuth',()=>{const s=readFileSync('src/ProductionManager.tsx','utf8');expect(s).not.toContain('youtubeProfileId');expect(s).not.toContain('youtubeChannelId')});
});
''')

print('VYRON 2.0.7 future channels applied')
