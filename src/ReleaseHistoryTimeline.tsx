import React,{useMemo,useState} from 'react';
import {groupReleaseHistoryByDay,VYRON_CURRENT_RELEASE,VYRON_FIRST_RELEASE,VYRON_RELEASE_HISTORY,type ReleaseHistoryEntry,type ReleaseSectionKey} from './releaseHistory';

type Filter='all'|'features'|'fixes'|'interface'|'reliability';
const filters:Array<[Filter,string]>=[['all','Все'],['features','Функции'],['fixes','Исправления'],['interface','Интерфейс'],['reliability','Надёжность']];
const sectionMeta:Record<ReleaseSectionKey,{title:string;icon:string}>={features:{title:'Новые функции',icon:'⚡'},fixes:{title:'Исправления',icon:'✓'},interface:{title:'Интерфейс',icon:'◇'},reliability:{title:'Надёжность',icon:'↻'},security:{title:'Безопасность',icon:'◈'},technical:{title:'Технические изменения',icon:'⌘'}};
const dateFmt=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'});
function releaseText(x:ReleaseHistoryEntry){return [x.version,x.title,...x.highlights,...Object.values(x.sections).flat()].join(' ').toLocaleLowerCase('ru-RU')}
function daysOfDevelopment(){
 const a=Date.parse(VYRON_FIRST_RELEASE.date+'T00:00:00Z'),b=Date.now();
 return Number.isFinite(a)?Math.max(1,Math.floor((b-a)/86400000)+1):0
}
function categoryHas(x:ReleaseHistoryEntry,f:Filter){return f==='all'||Boolean(x.sections[f]?.length)}
function ReleaseCard({row,expanded,onToggle}:{row:ReleaseHistoryEntry;expanded:boolean;onToggle:()=>void}){
 const visibleSections=(Object.keys(sectionMeta) as ReleaseSectionKey[]).filter(k=>k!=='technical'&&row.sections[k]?.length);
 const tech=[...(row.sections.technical||[]),...(row.technicalItems||[])].filter((x,i,a)=>a.indexOf(x)===i);
 return <article className={'releaseTimelineCard '+(expanded?'expanded':'')}>
  <div className="releaseTimelineDot"/>
  <div className="releaseTimelineHead"><div><span className="releaseVersion">VYRON {row.version}</span><span className={'releaseType '+row.type.toLowerCase()}>{row.type}</span></div>{row.prerelease&&row.type==='RC'&&<small>release candidate</small>}</div>
  <h4>{row.title}</h4>
  <ul className="releaseHighlights">{row.highlights.slice(0,4).map((x,i)=><li key={i}>{x}</li>)}</ul>
  <button className="releaseExpand" onClick={onToggle}>{expanded?'Скрыть':'Все изменения'}</button>
  {expanded&&<div className="releaseExpanded">
    {visibleSections.map(k=><section key={k}><h5><span>{sectionMeta[k].icon}</span>{sectionMeta[k].title}</h5><ul>{row.sections[k]!.map((x,i)=><li key={i}>{x}</li>)}</ul></section>)}
    {(tech.length>0||row.technicalBuilds?.length)?<details className="releaseTechnical"><summary>Технические сведения</summary>{row.technicalBuilds?.length?<p>Owner Preview builds: <b>{row.technicalBuilds.join(' → ')}</b></p>:null}{tech.length?<ul>{tech.map((x,i)=><li key={i}>{x}</li>)}</ul>:null}{row.tag&&<p>Release tag: <code>{row.tag}</code></p>}</details>:null}
  </div>}
 </article>
}
export function ReleaseHistoryTimeline(){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState<Filter>('all'),[expanded,setExpanded]=useState('');
 const rows=useMemo(()=>{const q=query.trim().toLocaleLowerCase('ru-RU');return VYRON_RELEASE_HISTORY.filter(x=>categoryHas(x,filter)&&(!q||releaseText(x).includes(q)))},[query,filter]);
 const grouped=useMemo(()=>groupReleaseHistoryByDay(rows),[rows]);
 const generations=[...new Set(VYRON_RELEASE_HISTORY.map(x=>x.version.split('.')[0]+'.x'))].sort((a,b)=>Number(a)-Number(b));
 return <section className="settingsCard releaseHistoryCard releaseHistoryV320">
  <div className="historyHero"><div><small>ИСТОРИЯ VYRON</small><h3>Путь от первого релиза до автономной системы</h3><p>Продуктовая история без шума CI: версии и RC — в timeline, технические preview-сборки спрятаны в деталях.</p></div><span className="historyCurrent">VYRON {VYRON_CURRENT_RELEASE.version}</span></div>
  <div className="historySummary">
   <span><small>Первый релиз</small><b>{dateFmt.format(new Date(VYRON_FIRST_RELEASE.date+'T12:00:00Z'))}</b></span>
   <span><small>Текущая версия</small><b>{VYRON_CURRENT_RELEASE.version}</b></span>
   <span><small>Дней разработки</small><b>{daysOfDevelopment()}</b></span>
   <span><small>Релизов</small><b>{VYRON_RELEASE_HISTORY.length}</b></span>
   <span><small>Поколения</small><b>{generations.join(' → ')}</b></span>
  </div>
  <div className="historyTools"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти изменение..."/><div className="historyFilters">{filters.map(([id,label])=><button key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}</div></div>
  {grouped.length?<div className="releaseTimeline">{grouped.map(([date,releases])=><section className="releaseDay" key={date}><div className="releaseDayLabel">{dateFmt.format(new Date(date+'T12:00:00Z'))}</div><div className="releaseDayRows">{releases.map(row=><ReleaseCard key={row.version} row={row} expanded={expanded===row.version} onToggle={()=>setExpanded(x=>x===row.version?'':row.version)}/>)}</div></section>)}</div>:<div className="historyEmpty">По этому запросу изменений не найдено.</div>}
 </section>
}