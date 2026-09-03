import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {useProductionPrefs} from './productionPrefs';

type Pref={project:string;target:number;reviewed:boolean;updatedAt:string};
type State={version:1;selectedChannelId?:string;byChannel:Record<string,Pref>};
const KEY='vyron:production-workspace:v1';
const month=()=>new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date());
function read():State{try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x?.version===1)return x}catch{}return{version:1,byChannel:{}}}
function write(s:State){try{localStorage.setItem(KEY,JSON.stringify(s))}catch{}}

export function ProductionWorkspace(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs);
 const [state,setState]=useState<State>(()=>read());
 const [prefs,patchPrefs]=useProductionPrefs();
 const selected=channels.find(c=>c.id===prefs.selectedChannelId)||channels.find(c=>c.id===state.selectedChannelId)||channels[0];
 useEffect(()=>{if(!selected)return;if(prefs.selectedChannelId!==selected.id)patchPrefs({selectedChannelId:selected.id});if(state.selectedChannelId===selected.id&&state.byChannel[selected.id])return;const next:State={...state,selectedChannelId:selected.id,byChannel:{...state.byChannel,[selected.id]:state.byChannel[selected.id]||{project:month(),target:30,reviewed:false,updatedAt:new Date().toISOString()}}};setState(next);write(next)},[selected?.id]);
 const pref:Pref|undefined=selected?state.byChannel[selected.id]:undefined;
 const rows=useMemo(()=>selected?jobs.filter(j=>j.channelId===selected.id):[],[jobs,selected?.id]);
 if(!selected||!pref)return <section className="panel productionWorkspace"><div className="empty"><b>Нет каналов</b><p>Добавь канал, чтобы создать локальный production workspace.</p></div></section>;
 const target=Math.max(1,pref.target||30),images=rows.filter(j=>Boolean(j.coverPath)).length,music=rows.filter(j=>j.tracksCount>=j.minTracks).length,videos=rows.filter(j=>Boolean(j.finalPath)).length,seo=rows.filter(j=>Boolean(j.title&&j.description&&j.tags?.length)).length,schedule=rows.filter(j=>Boolean(j.publishAt)).length,sent=rows.filter(j=>Boolean(j.youtubeVideoId)||j.status==='SCHEDULED').length,errors=rows.filter(j=>j.status==='ERROR').length;
 const ready=[images,music,videos,seo,schedule].every(n=>n>=target)&&pref.reviewed&&!errors;
 const patch=(p:Partial<Pref>)=>{const next:State={...state,selectedChannelId:selected.id,byChannel:{...state.byChannel,[selected.id]:{...pref,...p,updatedAt:new Date().toISOString()}}};setState(next);write(next)};
 const meter=(label:string,n:number)=><div><span><b>{label}</b><em>{Math.min(n,target)} / {target}</em></span><i><em style={{width:`${Math.min(100,n/target*100)}%`}}/></i></div>;
 return <section className="panel productionWorkspace"><div className="workspaceHead"><div><small>LOCAL PRODUCTION WORKSPACE</small><h3>{selected.name}</h3><p>Подготовка полностью локальная. YouTube API здесь не используется.</p></div><div className={`workspaceStatus ${ready?'good':'work'}`}>{ready?'ГОТОВО К YOUTUBE':'В РАБОТЕ'}</div></div><div className="workspaceControls"><label>Канал<select value={selected.id} onChange={e=>{const id=e.target.value;patchPrefs({selectedChannelId:id});const next:State={...state,selectedChannelId:id,byChannel:{...state.byChannel,[id]:state.byChannel[id]||{project:month(),target:30,reviewed:false,updatedAt:new Date().toISOString()}}};setState(next);write(next)}}>{channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Проект<input value={pref.project} onChange={e=>patch({project:e.target.value})}/></label><label>Цель<input type="number" min="1" max="1000" value={target} onChange={e=>patch({target:Math.max(1,Math.min(1000,+e.target.value||1)),reviewed:false})}/></label></div><div className="workspaceMetrics">{meter('Обложки',images)}{meter('Музыка',music)}{meter('Видео',videos)}{meter('SEO',seo)}{meter('Расписание',schedule)}</div><div className="pipelineFive"><span className={images>=target&&music>=target?'done':''}><i>1</i><b>Материалы</b></span><span className={videos>=target?'done':''}><i>2</i><b>Рендер</b></span><span className={seo>=target?'done':''}><i>3</i><b>SEO</b></span><button className={pref.reviewed?'done':''} onClick={()=>patch({reviewed:!pref.reviewed})}><i>4</i><b>{pref.reviewed?'Проверено ✓':'Проверка'}</b></button><span className={ready?'done':''}><i>5</i><b>Готово к YouTube</b></span></div><div className="workspacePaths"><code>/images</code><code>/music</code><code>/videos</code><code>/seo</code><code>/metadata</code><code>/schedule</code><span>Отправлено в YouTube: <b>{sent}</b>{errors?` • Ошибок: ${errors}`:''}</span></div></section>
}
