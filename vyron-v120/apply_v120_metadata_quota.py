#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def r(p):return (ROOT/p).read_text()
def w(p,s):(ROOT/p).write_text(s)
def rep(p,a,b,count=1):
 s=r(p)
 if a not in s:raise SystemExit(f'v120 metadata missing anchor {p}: {a[:180]!r}')
 w(p,s.replace(a,b,count))

p='src/MetadataPage.tsx';s=r(p)
s=s.replace("import {isYoutubeQuotaError,markYoutubeQuotaExceeded,youtubeQuotaMessage,youtubeQuotaState} from './youtubeQuota';", "import {isYoutubeQuotaError,markYoutubeQuotaExceeded,planYoutubeQuota,releaseYoutubeQuotaReservation,reserveYoutubeQuota,subscribeYoutubeQuota,subscribeYoutubeQuotaClock,youtubeOperationActualCost,youtubeQuotaClockSnapshot,youtubeQuotaMessage,youtubeQuotaState,youtubeQuotaUsage} from './youtubeQuota';")
anchor=" const channel=channels.find(c=>c.id===channelId),profileId=channel?.youtubeProfileId||'';"
insert=anchor+"\n const [quotaRevision,setQuotaRevision]=useState(0),[quotaClock,setQuotaClock]=useState(()=>youtubeQuotaClockSnapshot());\n useEffect(()=>{const off=subscribeYoutubeQuota(()=>setQuotaRevision(x=>x+1)),offClock=subscribeYoutubeQuotaClock(setQuotaClock);return()=>{off();offClock()}},[]);"
if anchor not in s:raise SystemExit('metadata channel anchor missing')
s=s.replace(anchor,insert,1)
anchor=" const selectedYt=useMemo(()=>orderedExistingVideos(yt.filter(v=>v.selected),order),[yt,order]);"
insert=anchor+"\n const metadataQuotaPlan=useMemo(()=>planYoutubeQuota([{method:'videos.list',count:selectedYt.length?Math.ceil(selectedYt.length/50):0,label:'Backup выбранных видео'},{method:'videos.list',count:selectedYt.length,label:'Pre-read текущего состояния'},{method:'videos.update',count:selectedYt.length,label:'Title + description + tags + schedule'}]),[selectedYt.length,quotaRevision]);\n const metadataPlannedCalls=metadataQuotaPlan.operations.reduce((n,x)=>n+x.count,0),metadataGeneral=metadataQuotaPlan.buckets.general;"
if anchor not in s:raise SystemExit('selectedYt anchor missing')
s=s.replace(anchor,insert,1)
# Reserve exact baseline only after all schedule/docx guards pass.
old="""  if(strategy==='pattern'&&schedulePairs.length>0&&!channel?.patternAnchorDate){notifyWarning('Не задано начало цикла','Выберите дату начала графика публикаций.');return}if(strategy==='interval'&&scheduleMode==='auto'&&schedulePairs.length>0&&!effectiveStart){notifyWarning('Нет будущего расписания','На канале нет будущих отложенных публикаций. Выберите первую дату вручную.');return}
  setBusy(true);setApplyReport(null);let metadataOk=0,scheduleOk=0,scheduleTotal=0,failed=0,pausedByQuota=false;const issues:ApplyIssue[]=[];const completedIds=new Set<string>();const cacheUpdates:YoutubeExistingVideo[]=[];"""
new="""  if(strategy==='pattern'&&schedulePairs.length>0&&!channel?.patternAnchorDate){notifyWarning('Не задано начало цикла','Выберите дату начала графика публикаций.');return}if(strategy==='interval'&&scheduleMode==='auto'&&schedulePairs.length>0&&!effectiveStart){notifyWarning('Нет будущего расписания','На канале нет будущих отложенных публикаций. Выберите первую дату вручную.');return}
  if(!metadataQuotaPlan.affordable){notifyWarning('Недостаточно YouTube API quota',`Нужно ${metadataGeneral.required} units, доступно ${metadataGeneral.available}. Сброс через ${quotaClock.countdown}.`);return}const operationId=`metadata:${channelId}:${Date.now()}`;if(!reserveYoutubeQuota(operationId,metadataQuotaPlan)){notifyWarning('Quota reservation не создана','Операция не запущена.');return}
  setBusy(true);setApplyReport(null);let metadataOk=0,scheduleOk=0,scheduleTotal=0,failed=0,pausedByQuota=false;const issues:ApplyIssue[]=[];const completedIds=new Set<string>();const cacheUpdates:YoutubeExistingVideo[]=[];"""
if old not in s:raise SystemExit('metadata pre-try anchor missing')
s=s.replace(old,new,1)
s=s.replace("await api.youtubeBackupExisting(profileId,selectedYt);let done=0;", "await api.youtubeBackupExisting(profileId,selectedYt,operationId);let done=0;",1)
s=s.replace("const result=await api.youtubeUpdateExisting(profileId,v.id,title,description,tags,publishAt,v.privacyStatus);", "const result=await api.youtubeUpdateExisting(profileId,v.id,title,description,tags,publishAt,v.privacyStatus,operationId);",1)
# Capture operation-specific actual cost before reporting.
anchor="    const report:ApplyReport={metadataOk,total:matched,scheduleOk,scheduleTotal,failed,issues,pausedByQuota,pending,at:new Date().toISOString()};"
insert="    const actualQuota=youtubeOperationActualCost(operationId),quotaNow=youtubeQuotaUsage(),quotaRemaining=Math.max(0,quotaNow.limit-quotaNow.used);\n"+anchor
if anchor not in s:raise SystemExit('metadata report anchor missing')
s=s.replace(anchor,insert,1)
old="""notifySuccess(scheduleTotal?'Расписание применено':'Метаданные применены',`${metadataOk} из ${matched} видео успешно обновлены.${scheduleTotal&&graph?` Режим: ${graph}.`:''}${previewFirst?` Первая: ${scheduleDateLabel(previewFirst)}.`:''}${previewLast?` Последняя: ${scheduleDateLabel(previewLast)}.`:''}${after?.scheduledUntil?` Канал запланирован до ${scheduleDateLabel(after.lastScheduledAt)}.`:''}`,{operationId:`metadata-apply:${channelId}:${report.at}`})"""
new="""notifySuccess(scheduleTotal?'Расписание применено':'Метаданные применены',`${metadataOk} из ${matched} видео успешно обновлены.${scheduleTotal&&graph?` Режим: ${graph}.`:''}${previewFirst?` Первая: ${scheduleDateLabel(previewFirst)}.`:''}${previewLast?` Последняя: ${scheduleDateLabel(previewLast)}.`:''}${after?.scheduledUntil?` Канал запланирован до ${scheduleDateLabel(after.lastScheduledAt)}.`:''} Quota: −${actualQuota.buckets.general} units • осталось ${quotaRemaining}.`,{operationId:`metadata-apply:${channelId}:${report.at}`})"""
if old not in s:raise SystemExit('metadata success notify anchor missing')
s=s.replace(old,new,1)
old="""  finally{setApplyProgress('');setBusy(false)}"""
new="""  finally{releaseYoutubeQuotaReservation(operationId);setApplyProgress('');setBusy(false)}"""
if old not in s:raise SystemExit('metadata finally anchor missing')
s=s.replace(old,new,1)
# Apply button respects local preflight.
s=s.replace("disabled={busy||!rows.length||!matched||(target==='youtube'&&rows.length<selectedYt.length)}", "disabled={busy||!rows.length||!matched||(target==='youtube'&&(rows.length<selectedYt.length||!metadataQuotaPlan.affordable))}",1)
# Insert quota card after draft bar.
anchor="""  <div className=\"metadataDraftBar\"><span><b>Черновик сохраняется автоматически</b><small>{draftSavedAt?` • ${new Date(draftSavedAt).toLocaleString('ru-RU')}`:''}</small></span><span>{rows.length} записей • {selectedYt.length} выбранных</span>{youtubeQuotaState().blocked&&<strong>⏸ YouTube quota pause</strong>}</div>"""
card=anchor+"""
  {target==='youtube'&&selectedYt.length>0&&<section className={`panel metadataQuotaPreflight ${metadataQuotaPlan.affordable?'ready':'blocked'}`}><div className="panelHead"><div><small>YOUTUBE API — РАСЧЁТ ОПЕРАЦИИ</small><h3>{metadataQuotaPlan.affordable?'✓ QUOTA ДОСТАТОЧНО':'✕ НЕДОСТАТОЧНО QUOTA'}</h3><p>Локальный request plan. До нажатия «Применить» YouTube API requests: 0.</p></div><span>{selectedYt.length} видео</span></div><div className="quotaOperationNumbers"><span><small>Сейчас доступно</small><b>{metadataGeneral.available.toLocaleString('ru-RU')}</b></span><span><small>Эта операция потратит</small><b>−{metadataGeneral.required.toLocaleString('ru-RU')}</b></span><span><small>После операции останется</small><b>{metadataGeneral.remainingAfter.toLocaleString('ru-RU')}</b></span><span><small>Планируемых API calls</small><b>{metadataPlannedCalls}</b></span><span><small>Сброс quota</small><b>{quotaClock.localTime}</b></span><span><small>До сброса</small><b className="mono">{quotaClock.countdown}</b></span></div><details><summary>Показать расчёт</summary>{metadataQuotaPlan.operations.map((x,i)=><p key={i}>{x.count} × {x.method} × {x.unitCost} = {x.cost} units • {x.label}</p>)}<p className="quotaContingency">Если YouTube отклонит combined update или потребует дополнительную verify-проверку, fallback/retry calls учитываются фактически в operation ledger и показываются после операции. Они не скрываются.</p></details></section>}"""
if anchor not in s:raise SystemExit('metadata draft bar anchor missing')
s=s.replace(anchor,card,1)
# Correct outdated 1:1 copy.
s=s.replace("`Выбрано ${selectedYt.length}. Для применения должно быть точное 1:1.`", "`Выбрано ${selectedYt.length}. Word может содержать больше записей; применяются только строки для выбранных видео.`")
w(p,s)

p='src/styles.css';s=r(p);s+='''\n.metadataQuotaPreflight{margin:12px 0}.metadataQuotaPreflight.ready{border-color:rgba(73,229,167,.18)}.metadataQuotaPreflight.blocked{border-color:rgba(255,120,120,.2)}.quotaContingency{padding:9px 11px;border-radius:10px;background:rgba(255,174,91,.05);color:rgba(255,255,255,.68)}\n''';w(p,s)
print('VYRON 1.2 Metadata quota preflight patch applied')
