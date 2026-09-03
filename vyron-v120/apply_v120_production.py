#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def r(p):return (ROOT/p).read_text()
def w(p,s):(ROOT/p).write_text(s)
def rep(p,a,b,count=1):
 s=r(p)
 if a not in s:raise SystemExit(f'v120 production missing anchor: {a[:180]!r}')
 w(p,s.replace(a,b,count))

p='src/ProductionOS.tsx';s=r(p)
old="""const [section,setSection]=useState<'overview'|'materials'|'builder'|'render'|'publish'>(()=>tab==='materials'?'materials':tab==='manager'?'builder':'overview');const scopedJobs=section==='render'?jobs.filter(j=>['READY_RENDER','RENDERING','ERROR'].includes(j.status)):section==='publish'?jobs.filter(j=>['READY_UPLOAD','UPLOADING','SCHEDULED','ERROR'].includes(j.status)):jobs;const filtered=scopedJobs.filter(j=>filter==='all'||j.channelId===filter||j.status===filter).sort((a,b)=>a.number-b.number);"""
new="""const [section,setSection]=useState<'overview'|'materials'|'builder'|'endlume'>(()=>tab==='materials'?'materials':tab==='manager'?'builder':'overview');const scopedJobs=jobs;const filtered=scopedJobs.filter(j=>filter==='all'||j.channelId===filter||j.status===filter).sort((a,b)=>a.number-b.number);"""
if old not in s:raise SystemExit('production section anchor missing')
s=s.replace(old,new,1)
s=s.replace('Понятная цепочка от материалов до YouTube. Backend-очередь и ENDLUME остаются прежними — меняется только управление.','Материалы → проекты → ENDLUME. YouTube-публикация вынесена в YouTube Center и не дублируется внутри Production.')
old="""<div className=\"youtubeTabs productionTabs productionNavFive\"><button className={section==='overview'?'active':''} onClick={()=>{setSection('overview');setTab('queue');setFilter('all')}}>Обзор</button><button className={section==='materials'?'active':''} onClick={()=>{setSection('materials');setTab('materials')}}>Материалы</button><button className={section==='builder'?'active':''} onClick={()=>{setSection('builder');setTab('manager')}}>Сборка проектов</button><button className={section==='render'?'active':''} onClick={()=>{setSection('render');setTab('queue');setFilter('all')}}>Рендер</button><button className={section==='publish'?'active':''} onClick={()=>{setSection('publish');setTab('queue');setFilter('all')}}>Публикация</button></div>"""
new="""<div className=\"youtubeTabs productionTabs productionNavFour\"><button className={section==='overview'?'active':''} onClick={()=>{setSection('overview');setTab('queue');setFilter('all')}}>Обзор</button><button className={section==='materials'?'active':''} onClick={()=>{setSection('materials');setTab('materials')}}>Материалы</button><button className={section==='builder'?'active':''} onClick={()=>{setSection('builder');setTab('manager')}}>Сборка проектов</button><button className={section==='endlume'?'active':''} onClick={()=>{setSection('endlume');setTab('manager');setFilter('all')}}>ENDLUME</button></div>"""
if old not in s:raise SystemExit('production tabs anchor missing')
s=s.replace(old,new,1)
old="""  {tab==='manager'&&<ProductionManager view=\"builder\"/>}"""
new="""  {tab==='manager'&&<>{section==='endlume'&&<section className=\"panel endlumeProductionSummary\"><div><small>ENDLUME STATUS</small><h3>Рендер — это состояние, а не отдельный этап управления</h3><p>Выберите хоть 1 проект из 1000 ниже и передайте только его. VYRON YT PEISOV локально увидит SENT → RENDERING → READY_UPLOAD.</p></div><div className=\"endlumeSummaryKpis\"><span><small>Готово к ENDLUME</small><b>{jobs.filter(j=>j.status==='READY_RENDER').length}</b></span><span><small>Рендерится</small><b>{jobs.filter(j=>j.status==='RENDERING').length}</b></span><span><small>Видео готово</small><b>{jobs.filter(j=>j.status==='READY_UPLOAD').length}</b></span></div></section>}<ProductionManager view=\"builder\"/></>}"""
if old not in s:raise SystemExit('production manager render anchor missing')
s=s.replace(old,new,1);w(p,s)

p='src/styles.css';s=r(p);s+='''\n.productionNavFour{grid-template-columns:repeat(4,minmax(0,1fr))}.endlumeProductionSummary{display:flex;justify-content:space-between;gap:20px;align-items:center}.endlumeProductionSummary h3{margin:4px 0}.endlumeProductionSummary p{max-width:700px}.endlumeSummaryKpis{display:flex;gap:8px}.endlumeSummaryKpis span{display:flex;min-width:105px;flex-direction:column;padding:10px;border-radius:12px;background:rgba(255,255,255,.035)}.endlumeSummaryKpis b{font-size:20px}@media(max-width:1000px){.endlumeProductionSummary{align-items:flex-start;flex-direction:column}.endlumeSummaryKpis{width:100%}}\n''';w(p,s)
print('VYRON 1.2 Production simplification patch applied')
