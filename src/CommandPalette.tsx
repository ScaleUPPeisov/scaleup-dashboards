import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ModalPortal} from './ModalPortal';
import {api} from './api';
import {useApp} from './store';
import type {Page,YoutubeProfile} from './types';
import {openTaskCenter} from './TaskCenter';
import {useUpdaterRuntime} from './updaterRuntime';

type PaletteItem={id:string;title:string;subtitle:string;keywords:string;run:()=>void};
const pages:Array<{page:Page;title:string;subtitle:string;keywords:string}>=[
 {page:'dashboard',title:'Главная',subtitle:'Control Center',keywords:'главная dashboard control'},
 {page:'channels',title:'Каналы',subtitle:'Fleet / Account registry',keywords:'каналы accounts fleet профили'},
 {page:'production',title:'Производство',subtitle:'Render / Projects / ENDLUME',keywords:'production render projects endlume'},
 {page:'youtube',title:'YouTube',subtitle:'Публикация / Загруженные / Метаданные',keywords:'youtube publisher publish existing metadata'},
 {page:'analytics',title:'Аналитика',subtitle:'Статистика каналов',keywords:'analytics statistics статистика'},
 {page:'competitors',title:'Конкуренты',subtitle:'Competitor radar',keywords:'competitors конкуренты'},
 {page:'settings',title:'Настройки',subtitle:'OAuth / Updater / Diagnostics',keywords:'settings oauth updater recovery diagnostics'}
];

export function CommandPalette(){
 const setPage=useApp(s=>s.setPage),channels=useApp(s=>s.channels),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[profiles,setProfiles]=useState<YoutubeProfile[]>([]),[index,setIndex]=useState(0),input=useRef<HTMLInputElement>(null),checkUpdate=useUpdaterRuntime(s=>s.check);
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(v=>!v)}else if(e.key==='Escape')setOpen(false)};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
 },[]);
 useEffect(()=>{if(!open)return;setQuery('');setIndex(0);window.setTimeout(()=>input.current?.focus(),0);void api.youtubeProfiles().then(setProfiles).catch(()=>setProfiles([]))},[open]);
 const items=useMemo<PaletteItem[]>(()=>{
  const profileByChannel=new Map(profiles.map(p=>[p.channelId||'',p]));
  const base=pages.map(x=>({id:'page:'+x.page,title:x.title,subtitle:x.subtitle,keywords:x.keywords,run:()=>{setPage(x.page);setOpen(false)}}));
  const channelItems=channels.map(c=>{const p=profiles.find(p=>p.id===c.youtubeProfileId)||profileByChannel.get(c.youtubeChannelId||'');return{id:'channel:'+c.id,title:c.name,subtitle:[p?.googleEmail,c.stats?.handle,c.youtubeChannelId].filter(Boolean).join(' • ')||'Канал VYRON',keywords:[c.name,p?.googleEmail,c.stats?.handle,c.youtubeChannelId,p?.id].filter(Boolean).join(' '),run:()=>{try{localStorage.setItem('vyron:command-palette-channel',c.id)}catch{}setPage('channels');setOpen(false)}}});
  const commands:PaletteItem[]=[
   {id:'cmd:tasks',title:'Открыть центр задач',subtitle:'Active / Queued / Attention / Failed',keywords:'tasks задачи очередь progress загрузки',run:()=>{openTaskCenter();setOpen(false)}},
   {id:'cmd:update',title:'Проверить обновление',subtitle:'Signed updater • YouTube API: 0',keywords:'update updater обновить обновление',run:()=>{setOpen(false);void checkUpdate({force:true})}},
   {id:'cmd:recovery',title:'Открыть Recovery / OAuth',subtitle:'Настройки → YouTube',keywords:'oauth recovery keychain google reconnect',run:()=>{try{localStorage.setItem('vyron:settings-target-tab','youtube')}catch{}setPage('settings');setOpen(false)}},
   {id:'cmd:publisher',title:'Открыть Publisher',subtitle:'YouTube → Публикация',keywords:'publisher upload публикация загрузка',run:()=>{setPage('publisher');setOpen(false)}}
  ];
  const all=[...commands,...base,...channelItems],q=query.trim().toLocaleLowerCase('ru-RU');
  if(!q)return all.slice(0,40);
  const tokens=q.split(/\s+/).filter(Boolean);
  return all.map(item=>{const hay=(item.title+' '+item.subtitle+' '+item.keywords).toLocaleLowerCase('ru-RU');const score=tokens.reduce((n,t)=>n+(hay.includes(t)?1:0),0);return{item,score}}).filter(x=>x.score===tokens.length).sort((a,b)=>b.score-a.score||a.item.title.localeCompare(b.item.title,'ru')).map(x=>x.item).slice(0,50)
 },[channels,profiles,query,setPage,checkUpdate]);
 useEffect(()=>{setIndex(i=>Math.min(i,Math.max(0,items.length-1)))},[items.length]);
 if(!open)return null;
 const keyboard=(e:React.KeyboardEvent)=>{if(e.key==='ArrowDown'){e.preventDefault();setIndex(i=>Math.min(items.length-1,i+1))}else if(e.key==='ArrowUp'){e.preventDefault();setIndex(i=>Math.max(0,i-1))}else if(e.key==='Enter'){e.preventDefault();items[index]?.run()}};
 return <ModalPortal className="modalBackdrop commandPaletteBackdrop" onClose={()=>setOpen(false)}><section className="commandPalette" onMouseDown={e=>e.stopPropagation()}>
  <div className="commandPaletteSearch"><span>⌘K</span><input ref={input} value={query} onChange={e=>{setQuery(e.target.value);setIndex(0)}} onKeyDown={keyboard} placeholder="Канал, Google email, YouTube ID, VIDEO, команда…"/></div>
  <div className="commandPaletteRows">{items.length?items.map((item,i)=><button key={item.id} className={i===index?'active':''} onMouseEnter={()=>setIndex(i)} onClick={item.run}><span><b>{item.title}</b><small>{item.subtitle}</small></span><em>↵</em></button>):<div className="empty compactEmpty"><i>⌕</i><h3>Ничего не найдено</h3><p>Поиск использует локальные каналы и безопасную OAuth metadata.</p></div>}</div>
  <footer><span>↑↓ выбрать</span><span>Enter открыть</span><span>Esc закрыть</span></footer>
 </section></ModalPortal>
}
