#!/usr/bin/env python3
from pathlib import Path
import re

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.14 UI: '+msg)

# Domain helpers used consistently by Metadata, Command Center and Plan Channels.
p=Path('src/channelSchedule.ts');s=p.read_text()
marker="export function patternFor(channel:Channel):SchedulePattern|undefined{if(scheduleModeFor(channel)!=='pattern')return;const anchor=channel.patternAnchorDate;return anchor?{publishDays:Math.max(1,Math.floor(channel.publishDays||3)),pauseDays:Math.max(1,Math.floor(channel.pauseDays||1)),anchorDate:anchor}:undefined}\n"
must(marker in s,'channelSchedule patternFor marker missing')
extra="""export function scheduleLabel(channel:Channel){return scheduleModeFor(channel)==='pattern'?`${Math.max(1,Math.floor(channel.publishDays||3))} / ${Math.max(1,Math.floor(channel.pauseDays||1))}`:intervalDaysFor(channel)===1?'каждый день':intervalDaysFor(channel)===2?'через день':`каждые ${intervalDaysFor(channel)} дн.`}\nexport function scheduleDescription(channel:Channel){return scheduleModeFor(channel)==='pattern'?`${Math.max(1,Math.floor(channel.publishDays||3))} дня публикаций / ${Math.max(1,Math.floor(channel.pauseDays||1))} день пауза`:scheduleLabel(channel)}\nexport function scheduleAverageIntervalDays(channel:Channel){if(scheduleModeFor(channel)==='pattern'){const p=Math.max(1,Math.floor(channel.publishDays||3)),q=Math.max(1,Math.floor(channel.pauseDays||1));return(p+q)/p}return intervalDaysFor(channel)}\n"""
s=s.replace(marker,marker+extra,1);p.write_text(s)

# Metadata imports the pattern engine.
p=Path('src/MetadataPage.tsx');s=p.read_text()
old="import {getChannelScheduleState,mergeExistingCacheVideos,replaceExistingCacheFromSync,scheduleDateLabel,toKratLocalInput} from './channelSchedule';"
new="import {dateKeyLabel,generatePatternSchedule,getChannelScheduleState,krasDateKey,mergeExistingCacheVideos,replaceExistingCacheFromSync,scheduleDateLabel,scheduleDescription,scheduleModeFor,toKratLocalInput} from './channelSchedule';"
must(old in s,'Metadata channelSchedule import missing');s=s.replace(old,new,1)

# Extend local UI state only; schedule strategy itself persists in Channel.
old="[cadence,setCadence]=useState(2),[scheduleMode,setScheduleMode]=useState<'auto'|'manual'>('auto'),[scheduleRevision,setScheduleRevision]=useState(0),[syncStatus,setSyncStatus]"
new="[cadence,setCadence]=useState(2),[scheduleMode,setScheduleMode]=useState<'auto'|'manual'>('auto'),[customPattern,setCustomPattern]=useState(false),[scheduleRevision,setScheduleRevision]=useState(0),[syncStatus,setSyncStatus]"
must(old in s,'Metadata local schedule state marker missing');s=s.replace(old,new,1)

# Replace 1.0.13 schedule derivation with strategy-aware preview.
pat=re.compile(r" const scheduleState=useMemo\(\(\)=>channel\?getChannelScheduleState\(channelId,channel\):undefined,\[.*?\n function changeDefaultTime\(value:string\)\{.*?\}\n",re.S)
m=pat.search(s);must(m is not None,'Metadata 1.0.13 schedule derivation block missing')
block=r''' const scheduleState=useMemo(()=>channel?getChannelScheduleState(channelId,channel):undefined,[channelId,channel?.id,channel?.cadenceDays,channel?.scheduleMode,channel?.publishIntervalDays,channel?.publishDays,channel?.pauseDays,channel?.patternAnchorDate,channel?.publishHour,channel?.publishMinute,scheduleRevision,yt.length]);
 const strategy=channel?scheduleModeFor(channel):'interval';
 const patternPublishDays=Math.max(1,Math.floor(channel?.publishDays||3)),patternPauseDays=Math.max(1,Math.floor(channel?.pauseDays||1));
 const schedulePairs=useMemo(()=>selectedYt.map((v,i)=>({v,row:rows[i]})).filter(x=>scheduleMode==='manual'||!x.v.publishAt),[selectedYt,rows,scheduleMode]);
 const schedulePairIds=useMemo(()=>schedulePairs.map(x=>x.v.id),[schedulePairs]);
 const effectiveStart=scheduleMode==='auto'?(scheduleState?.nextAvailableAt?toKratLocalInput(scheduleState.nextAvailableAt):''):start;
 const patternGenerated=useMemo(()=>strategy==='pattern'&&channel?.patternAnchorDate?generatePatternSchedule(channel,yt,schedulePairs.length,schedulePairIds):{dates:[],calendar:[]},[strategy,channel?.id,channel?.patternAnchorDate,channel?.publishDays,channel?.pauseDays,channel?.publishHour,channel?.publishMinute,yt,schedulePairs.length,schedulePairIds.join('|'),scheduleRevision]);
 const schedulePreview=useMemo(()=>strategy==='pattern'?schedulePairs.map((x,i)=>({...x.v,publishAt:patternGenerated.dates[i]})).filter(v=>Boolean(v.publishAt)):effectiveStart?buildExistingScheduleFromLocal(schedulePairs.map(x=>x.v),effectiveStart,cadence,schedulePairs.map(x=>x.row)):[],[strategy,schedulePairs,effectiveStart,cadence,patternGenerated.dates]);
 const previewFirst=schedulePreview[0]?.publishAt,previewLast=schedulePreview.length?schedulePreview[schedulePreview.length-1]?.publishAt:undefined;
 const defaultPublishTime=scheduleState?.defaultPublishTime||`${String(channel?.publishHour||0).padStart(2,'0')}:${String(channel?.publishMinute||0).padStart(2,'0')}`;
 function changeCadence(value:number){const next=Math.max(1,Math.min(30,Math.floor(value||1)));setCadence(next);if(channel)updateChannel(channel.id,{scheduleMode:'interval',publishIntervalDays:next,cadenceDays:next});setCustomPattern(false);setScheduleRevision(x=>x+1)}
 function selectInterval(days:number){if(!channel)return;setCadence(days);setCustomPattern(false);updateChannel(channel.id,{scheduleMode:'interval',publishIntervalDays:days,cadenceDays:days});setScheduleRevision(x=>x+1)}
 function selectPattern(publishDays=3,pauseDays=1,custom=false){if(!channel)return;const before=getChannelScheduleState(channelId,channel);const anchor=channel.patternAnchorDate||krasDateKey(before.nextAvailableAt)||start.slice(0,10);updateChannel(channel.id,{scheduleMode:'pattern',publishDays:Math.max(1,publishDays),pauseDays:Math.max(1,pauseDays),patternAnchorDate:anchor});setCustomPattern(custom);setScheduleRevision(x=>x+1)}
 function changePattern(publishDays:number,pauseDays:number){if(!channel)return;updateChannel(channel.id,{scheduleMode:'pattern',publishDays:Math.max(1,Math.min(30,Math.floor(publishDays||1))),pauseDays:Math.max(1,Math.min(30,Math.floor(pauseDays||1))),patternAnchorDate:channel.patternAnchorDate||start.slice(0,10)});setCustomPattern(true);setScheduleRevision(x=>x+1)}
 function changePatternAnchor(value:string){if(!channel||!value)return;updateChannel(channel.id,{scheduleMode:'pattern',patternAnchorDate:value});setScheduleRevision(x=>x+1)}
 function changeDefaultTime(value:string){const m=value.match(/^(\d{2}):(\d{2})$/);if(!m||!channel)return;updateChannel(channel.id,{publishHour:+m[1],publishMinute:+m[2]});setScheduleRevision(x=>x+1)}
'''
s=pat.sub(block,s,count=1)

# Pattern schedule is used for the actual YouTube write, not preview-only.
old="const scheduled=effectiveStart?buildExistingScheduleFromLocal(schedulePairs.map(x=>x.v),effectiveStart,cadence,schedulePairs.map(x=>x.row)):[];const scheduleById=new Map(scheduled.map(v=>[v.id,v.publishAt]));"
new="const scheduled=strategy==='pattern'?schedulePairs.map((x,i)=>({...x.v,publishAt:patternGenerated.dates[i]})).filter(v=>Boolean(v.publishAt)):effectiveStart?buildExistingScheduleFromLocal(schedulePairs.map(x=>x.v),effectiveStart,cadence,schedulePairs.map(x=>x.row)):[];const scheduleById=new Map(scheduled.map(v=>[v.id,v.publishAt]));"
must(old in s,'Metadata actual schedule construction marker missing');s=s.replace(old,new,1)

# Validation differentiates interval-with-no-last-date from pattern-with-no-anchor.
old="if(scheduleMode==='auto'&&schedulePairs.length>0&&!effectiveStart){notifyWarning('Нет будущего расписания','На канале нет будущих отложенных публикаций. Выберите первую дату вручную.');return}"
new="if(strategy==='pattern'&&schedulePairs.length>0&&!channel?.patternAnchorDate){notifyWarning('Не задано начало цикла','Выберите дату начала графика публикаций.');return}if(strategy==='interval'&&scheduleMode==='auto'&&schedulePairs.length>0&&!effectiveStart){notifyWarning('Нет будущего расписания','На канале нет будущих отложенных публикаций. Выберите первую дату вручную.');return}"
must(old in s,'Metadata schedule validation marker missing');s=s.replace(old,new,1)

# Rich success notification includes the actual pattern and batch endpoints.
old="else if(metadataOk===matched&&scheduleOk===scheduleTotal&&failed===0){const after=channel?getChannelScheduleState(channelId,channel):undefined;notifySuccess(scheduleTotal?'Метаданные и расписание применены':'Метаданные применены',`${metadataOk} из ${matched} видео успешно обновлены.${after?.scheduledUntil?` Канал запланирован до ${scheduleDateLabel(after.lastScheduledAt)}.`:''}`,{operationId:`metadata-apply:${channelId}:${report.at}`})}"
new="else if(metadataOk===matched&&scheduleOk===scheduleTotal&&failed===0){const after=channel?getChannelScheduleState(channelId,channel):undefined;const graph=channel?scheduleDescription(channel):'';notifySuccess(scheduleTotal?'Расписание применено':'Метаданные применены',`${metadataOk} из ${matched} видео успешно обновлены.${scheduleTotal&&graph?` Режим: ${graph}.`:''}${previewFirst?` Первая: ${scheduleDateLabel(previewFirst)}.`:''}${previewLast?` Последняя: ${scheduleDateLabel(previewLast)}.`:''}${after?.scheduledUntil?` Канал запланирован до ${scheduleDateLabel(after.lastScheduledAt)}.`:''}`,{operationId:`metadata-apply:${channelId}:${report.at}`})}"
must(old in s,'Metadata success notification marker missing');s=s.replace(old,new,1)

# Insert schedule strategy buttons into the existing 1.0.13 smart schedule card.
needle='<div className="scheduleModeButtons"><button className={scheduleMode===\'auto\'?\'active\':\'\'} onClick={()=>setScheduleMode(\'auto\')}>Продолжить расписание автоматически</button><button className={scheduleMode===\'manual\'?\'active\':\'\'} onClick={()=>setScheduleMode(\'manual\')}>Указать первую дату вручную</button></div>'
must(needle in s,'Metadata schedule mode buttons missing')
strategy_ui=r'''<div className="scheduleStrategy"><small>ГРАФИК ПУБЛИКАЦИЙ</small><div className="schedulePresetButtons"><button className={strategy==='interval'&&cadence===1?'active':''} onClick={()=>selectInterval(1)}>Каждый день</button><button className={strategy==='interval'&&cadence===2?'active':''} onClick={()=>selectInterval(2)}>Через день</button><button className={strategy==='pattern'&&patternPublishDays===3&&patternPauseDays===1&&!customPattern?'active':''} onClick={()=>selectPattern(3,1,false)}>3 дня / 1 пауза</button><button className={strategy==='pattern'&&customPattern?'active':''} onClick={()=>selectPattern(patternPublishDays,patternPauseDays,true)}>Настроить</button></div>{strategy==='pattern'&&<><p>{patternPublishDays} дня подряд публикуем видео, {patternPauseDays} день без публикаций, затем цикл повторяется.</p><div className="patternSettings">{customPattern&&<><label>Дней с видео<input type="number" min="1" max="30" value={patternPublishDays} onChange={e=>changePattern(+e.target.value||1,patternPauseDays)}/></label><label>Дней паузы<input type="number" min="1" max="30" value={patternPauseDays} onChange={e=>changePattern(patternPublishDays,+e.target.value||1)}/></label></>}<label>Начало цикла<input type="date" value={channel?.patternAnchorDate||''} onChange={e=>changePatternAnchor(e.target.value)}/></label></div></>}</div>'''
s=s.replace(needle,strategy_ui+needle,1)

# Make schedule facts strategy-aware.
old='<span><small>Интервал</small><b>каждые {cadence} дн.</b></span>'
new='<span><small>График</small><b>{channel?scheduleDescription(channel):`каждые ${cadence} дн.`}</b></span>'
must(old in s,'Metadata interval fact missing');s=s.replace(old,new,1)

# Pattern preview explicitly renders pause and occupied days.
needle='{schedulePreview.length>0&&<div className="scheduleBatchPreview"><b>Новая партия: {scheduleDateLabel(previewFirst)} → {scheduleDateLabel(previewLast)}</b><small>{schedulePreview.length} видео • первая свободная дата выбрана автоматически</small><div>{schedulePreview.slice(0,6).map((v,i)=><span key={v.id}>{String(i+1).padStart(3,\'0\')} → {scheduleDateLabel(v.publishAt)}</span>)}{schedulePreview.length>6&&<span>… ещё {schedulePreview.length-6}</span>}</div></div>}'
must(needle in s,'Metadata batch preview marker missing')
replacement=needle+r'''{strategy==='pattern'&&patternGenerated.calendar.length>0&&<div className="patternCalendarPreview"><b>Календарь цикла</b><div>{patternGenerated.calendar.slice(0,20).map((d,i)=><span key={`${d.date}-${i}`} className={d.kind}>{dateKeyLabel(d.date)} — {d.kind==='pause'?'ПАУЗА':d.kind==='occupied'?'ЗАНЯТО':`VIDEO ${String(patternGenerated.calendar.slice(0,i+1).filter(x=>x.kind==='video').length).padStart(3,'0')}`}</span>)}{patternGenerated.calendar.length>20&&<span>… ещё {patternGenerated.calendar.length-20} дней</span>}</div></div>}'''
s=s.replace(needle,replacement,1);p.write_text(s)

# Command Center shows the per-channel publishing graph.
p=Path('src/CommandCenter.tsx');s=p.read_text()
old="import {getChannelScheduleState,scheduleDateLabel} from './channelSchedule';"
new="import {getChannelScheduleState,scheduleDateLabel,scheduleDescription} from './channelSchedule';"
must(old in s,'CommandCenter schedule import missing');s=s.replace(old,new,1)
needle="<span>Рекомендация<b>{next.record?.runwayDays!==undefined&&next.record.runwayDays<=14?'Готовить в первую очередь':next.record?.runwayDays!==undefined&&next.record.runwayDays<=45?'Продолжить производство':'Запас пока достаточный'}</b></span>"
must(needle in s,'CommandCenter recommendation fact missing');s=s.replace(needle,needle+"<span>График<b>{scheduleDescription(next.channel)}</b></span>",1)
old="<span><b>{channel.name}</b><small>{localSchedule.lastScheduledAt?`Запланировано до ${scheduleDateLabel(localSchedule.lastScheduledAt)}`:record?.scheduledUntil?`Запланировано до ${dateLabel(record.scheduledUntil)}`:'Расписание ещё не подтверждено'}</small></span>"
new="<span><b>{channel.name}</b><small>{localSchedule.lastScheduledAt?`Запланировано до ${scheduleDateLabel(localSchedule.lastScheduledAt)}`:record?.scheduledUntil?`Запланировано до ${dateLabel(record.scheduledUntil)}`:'Расписание ещё не подтверждено'}</small><small>График: {scheduleDescription(channel)}</small></span>"
must(old in s,'CommandCenter channel schedule cell missing');s=s.replace(old,new,1);p.write_text(s)

# Plan Channels / Channel Runway gets a Graph column and correct average cadence math.
p=Path('src/ChannelRunway.tsx');s=p.read_text()
marker="import {\n  buildYoutubeQuotaPlan,"
must(marker in s,'ChannelRunway import anchor missing');s=s.replace(marker,"import {scheduleAverageIntervalDays,scheduleDescription} from './channelSchedule';\n"+marker,1)
s=s.replace("const signature=channels.map(c=>`${c.id}:${c.name}:${c.enabled}:${c.cadenceDays}:${c.youtubeProfileId||''}`).join('|');","const signature=channels.map(c=>`${c.id}:${c.name}:${c.enabled}:${c.cadenceDays}:${c.scheduleMode||'interval'}:${c.publishIntervalDays||''}:${c.publishDays||''}:${c.pauseDays||''}:${c.patternAnchorDate||''}:${c.youtubeProfileId||''}`).join('|');",1)
s=s.replace("const effectiveIntervals=rows.map(({channel,record})=>record.averagePublishIntervalDays||channel.cadenceDays).filter(x=>Number.isFinite(x)&&x>0);","const effectiveIntervals=rows.map(({channel,record})=>record.averagePublishIntervalDays||scheduleAverageIntervalDays(channel)).filter(x=>Number.isFinite(x)&&x>0);",1)
s=s.replace("<span>Канал</span><span>Запланировано до</span><span>Осталось</span><span>Видео</span><span>Интервал</span><span>Готовить с</span><span>Статус</span><span>Действие</span>","<span>Канал</span><span>Запланировано до</span><span>Осталось</span><span>Видео</span><span>График публикаций</span><span>Готовить с</span><span>Статус</span><span>Действие</span>",1)
old="<span>{record.runwayDays===undefined?'—':record.averagePublishIntervalDays?`1 / ${String(record.averagePublishIntervalDays).replace('.',',')} дн.`:`≈ 1 / ${channel.cadenceDays} дн.`}</span>"
new="<span>{record.runwayDays===undefined?'—':scheduleDescription(channel)}</span>"
must(old in s,'ChannelRunway interval cell missing');s=s.replace(old,new,1);p.write_text(s)

# Additive UI styling only.
p=Path('src/styles.css');s=p.read_text();s+=r'''
/* VYRON 1.0.14 — publishing schedule strategies */
.scheduleStrategy{border:1px solid #17384b;background:#06141e;border-radius:11px;padding:10px;display:grid;gap:8px}.scheduleStrategy>small{color:#6e8da0;font-size:7px;font-weight:900;letter-spacing:.12em}.scheduleStrategy>p{margin:0;color:#849eac;font-size:8px}.schedulePresetButtons{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.schedulePresetButtons button{border:1px solid #1b3b4e;background:#081823;color:#86a0af;border-radius:8px;padding:9px 7px;font-size:8px;font-weight:800}.schedulePresetButtons button.active{border-color:rgba(84,226,185,.48);background:rgba(84,226,185,.08);color:#6fe2bf}.patternSettings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.patternSettings label{font-size:8px;color:#738f9f}.patternSettings input{margin-top:4px;width:100%}.patternCalendarPreview{border:1px solid rgba(95,222,190,.2);background:rgba(95,222,190,.025);border-radius:10px;padding:10px}.patternCalendarPreview>b{font-size:9px;color:#dff4ed}.patternCalendarPreview>div{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:7px}.patternCalendarPreview span{font-size:7px;padding:5px 6px;border-radius:6px;background:#0a1a24;color:#8ca6b4}.patternCalendarPreview span.pause{color:#8e96a1;background:#111a20}.patternCalendarPreview span.occupied{color:#ffc26b;background:rgba(255,194,107,.06)}.patternCalendarPreview span.video{color:#65dfbf;background:rgba(101,223,191,.055)}.commandTodayFacts{grid-template-columns:repeat(4,minmax(0,1fr))!important}@media(max-width:900px){.schedulePresetButtons{grid-template-columns:repeat(2,minmax(0,1fr))}.patternSettings{grid-template-columns:1fr}.patternCalendarPreview>div{grid-template-columns:repeat(2,minmax(0,1fr))}.commandTodayFacts{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:600px){.schedulePresetButtons,.patternCalendarPreview>div,.commandTodayFacts{grid-template-columns:1fr!important}}
''';p.write_text(s)

print('VYRON 1.0.14 schedule UI/planner patch applied')
