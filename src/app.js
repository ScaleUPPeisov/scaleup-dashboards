const invoke = window.__TAURI__.core.invoke;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const VERSION = '0.2.0';
let selectedVideo = null;
let lastOutput = null;
let selectedStyle = 'clean';
let frameMode = 'fit916';
let lang = localStorage.getItem('rf.lang') || 'ru';

const i18n = {
  ru: {
    navHome:'Главная',navProjects:'Проекты',navSettings:'Настройки',heroTitle:'Обычное видео → готовый Reels.',heroText:'Загрузи исходник, выбери стиль и получи вертикальный ролик с локальными субтитрами. Никаких скрытых действий.',createReel:'Создать Reels',dropTitle:'Перетащите исходное видео',dropSub:'MP4 · MOV · M4V · или выберите файл',chooseFile:'Выбрать видео',sourceVideo:'Исходное видео',replace:'Заменить',duration:'Длительность',resolution:'Разрешение',fileSize:'Размер',editStyle:'Стиль монтажа',editStyleSub:'Пресет реально меняет оформление результата',contentGoal:'Цель видео',contentGoalSub:'Будет включена вместе с семантическим Smart Cuts',goalSales:'Продажи',goalExpert:'Экспертный контент',goalPersonal:'Личный блог',goalEducational:'Обучение',goalStory:'История',goalEntertainment:'Развлекательный',frameMode:'Кадрирование',frameModeSub:'9:16 без скрытого crop',faceTrackingPending:'Face Tracking пока не включён: Apple Vision модуль ещё проходит интеграцию',captions:'Автосубтитры',captionsSub:'Whisper работает локально на Mac',highlightKeywords:'Выделять ключевые слова',engineNow:'Что реально работает в этой сборке',engineNowText:'Локальная транскрипция, 9:16 Fit/Center Crop, стили субтитров и аппаратный AVFoundation экспорт.',makeReel:'Сделать Reels',ready:'✓ Reels готов',preview:'Открыть',showFinder:'Показать в Finder',projectsTitle:'Проекты',projectsSub:'Только реальные локальные экспорты — без демо-данных.',projectsEmpty:'Пока нет готовых Reels',projectsEmptySub:'После первого экспорта проект появится здесь.',settingsTitle:'Настройки',language:'Язык',languageSub:'Переключает весь интерфейс приложения',performance:'Производительность',performanceSub:'Автоматически уменьшать эффекты интерфейса при просадке',exportDefault:'Экспорт по умолчанию',exportDefaultSub:'Профиль будет применяться после перехода на bitrate-controlled writer',updateCenter:'Центр обновлений',currentVersion:'Текущая версия',latestVersion:'Последняя версия',releaseDate:'Дата релиза',releaseTime:'Время релиза',checkUpdates:'Проверить обновления',statusIdle:'Готов к работе',statusIdleText:'Загрузите видео, чтобы начать',statusReady:'Готов к обработке',statusReadyText:'Исходник загружен. Настройте Reels и запускайте.',statusRendering:'Создаю Reels…',statusRenderingText:'Whisper и AVFoundation работают в фоне. Не закрывайте приложение.',statusDone:'Готово',statusDoneText:'Reels экспортирован.',statusError:'Ошибка обработки',updateAvailable:'Доступен ReelsFactory',installRestart:'Установить и перезапустить',checking:'Проверяю…',latestInstalled:'Установлена последняя версия',noUpdate:'Нет обновлений',styleClean:'Чистый деловой вид: спокойные субтитры и минимум визуального шума.',styleDynamic:'Более заметные captions для Instagram/Reels без дешёвого шаблона.',styleViral:'Крупные акценты и более энергичная типографика. Нарезка пока не ускоряется автоматически.'
  },
  en: {
    navHome:'Home',navProjects:'Projects',navSettings:'Settings',heroTitle:'Raw video → ready Reel.',heroText:'Drop a source video, choose a style and export a vertical clip with local captions. No hidden edits.',createReel:'Create Reel',dropTitle:'Drop your raw video here',dropSub:'MP4 · MOV · M4V · or choose a file',chooseFile:'Choose video',sourceVideo:'Source video',replace:'Replace',duration:'Duration',resolution:'Resolution',fileSize:'Size',editStyle:'Edit style',editStyleSub:'The preset really changes the exported look',contentGoal:'Content Goal',contentGoalSub:'Enabled together with semantic Smart Cuts',goalSales:'Sales',goalExpert:'Expert',goalPersonal:'Personal',goalEducational:'Educational',goalStory:'Storytelling',goalEntertainment:'Entertainment',frameMode:'Framing',frameModeSub:'9:16 with no hidden crop',faceTrackingPending:'Face Tracking is not enabled yet: Apple Vision integration is still being validated',captions:'Auto Captions',captionsSub:'Whisper runs locally on your Mac',highlightKeywords:'Highlight keywords',engineNow:'What actually works in this build',engineNowText:'Local transcription, 9:16 Fit/Center Crop, caption presets and hardware AVFoundation export.',makeReel:'Create Reel',ready:'✓ Reel ready',preview:'Open',showFinder:'Show in Finder',projectsTitle:'Projects',projectsSub:'Only real local exports — no demo data.',projectsEmpty:'No exported Reels yet',projectsEmptySub:'Your first completed export will appear here.',settingsTitle:'Settings',language:'Language',languageSub:'Changes the entire application language',performance:'Performance',performanceSub:'Automatically reduce UI effects if performance drops',exportDefault:'Default export',exportDefaultSub:'Applied after bitrate-controlled writer lands',updateCenter:'Update Center',currentVersion:'Current version',latestVersion:'Latest version',releaseDate:'Release date',releaseTime:'Release time',checkUpdates:'Check for updates',statusIdle:'Ready',statusIdleText:'Load a video to begin',statusReady:'Ready to process',statusReadyText:'Source loaded. Configure the Reel and start.',statusRendering:'Creating Reel…',statusRenderingText:'Whisper and AVFoundation are running in the background. Keep the app open.',statusDone:'Done',statusDoneText:'Reel exported.',statusError:'Processing error',updateAvailable:'ReelsFactory available',installRestart:'Install and restart',checking:'Checking…',latestInstalled:'Latest version installed',noUpdate:'No updates',styleClean:'Clean business look with calm captions and minimal visual noise.',styleDynamic:'More visible Instagram/Reels captions without a cheap template feel.',styleViral:'Larger accents and more energetic typography. Smart cutting is not enabled yet.'
  }
};

function t(k){ return i18n[lang][k] || k; }
function applyLanguage(){
  document.documentElement.lang = lang;
  $$('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  $$('#langPicker button').forEach(b => b.classList.toggle('active', b.dataset.value === lang));
  $('#goalSelect').disabled = true;
  updateStyleHint();
  if (!selectedVideo) setStatus(t('statusIdle'), t('statusIdleText'));
  renderProjects();
}

function setStatus(title,text,type='ok'){
  $('#statusTitle').textContent=title; $('#statusText').textContent=text;
  $('.status').className='status'+(type==='busy'?' busy':type==='error'?' error':'');
}

$$('.nav').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav').forEach(x=>x.classList.remove('active')); $$('.page').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active'); $('#'+btn.dataset.page).classList.add('active');
}));

async function chooseVideo(){
  try { const path=await invoke('pick_video'); if(path) await loadVideo(path); }
  catch(e){ setStatus(t('statusError'), String(e),'error'); }
}

async function loadVideo(path){
  selectedVideo=path; $('#videoName').textContent=path.split('/').pop(); $('#sourcePanel').classList.remove('hidden'); $('#render').disabled=false;
  try {
    const info=await invoke('probe_video',{input:path});
    $('#videoDuration').textContent=formatDuration(info.duration);
    $('#videoResolution').textContent=`${info.width}×${info.height}`;
    $('#videoFps').textContent=Number(info.fps||0).toFixed(info.fps%1?2:0);
    $('#videoSize').textContent=formatBytes(info.size);
    $('#sourcePreview').src=info.previewUrl || `asset://localhost/${encodeURIComponent(path)}`;
  } catch(e){
    $('#videoDuration').textContent='—'; $('#videoResolution').textContent='—'; $('#videoFps').textContent='—'; $('#videoSize').textContent='—';
  }
  setStatus(t('statusReady'),t('statusReadyText'));
}

$('#pickVideo').addEventListener('click',chooseVideo); $('#pickVideoTop').addEventListener('click',chooseVideo); $('#replaceVideo').addEventListener('click',chooseVideo);

const dropZone=$('#dropZone');
['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.add('dragging')}));
['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.remove('dragging')}));
dropZone.addEventListener('drop',e=>{const f=e.dataTransfer?.files?.[0]; const p=f?.path; if(p) loadVideo(p);});
(async()=>{try{const w=window.__TAURI__?.webview?.getCurrentWebview?.(); if(w?.onDragDropEvent) await w.onDragDropEvent(event=>{if(event.payload?.type==='drop'&&event.payload.paths?.[0]) loadVideo(event.payload.paths[0]);});}catch(e){console.warn('native drop',e)}})();

function selectSegment(root,value){ $$(root+' button').forEach(b=>b.classList.toggle('active',b.dataset.value===value)); }
$('#stylePicker').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;selectedStyle=b.dataset.value;selectSegment('#stylePicker',selectedStyle); const map={clean:'clean',dynamic:'dynamic',viral:'bold'}; $('#captionStyle').value=map[selectedStyle]; updateStyleHint();});
$('#framePicker').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;frameMode=b.dataset.value;selectSegment('#framePicker',frameMode);});
function updateStyleHint(){ $('#styleHint').textContent=t(selectedStyle==='clean'?'styleClean':selectedStyle==='dynamic'?'styleDynamic':'styleViral'); }

$('#langPicker').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;lang=b.dataset.value;localStorage.setItem('rf.lang',lang);applyLanguage();});
$('#reduceEffects').checked=localStorage.getItem('rf.reduceEffects')!=='false';
$('#reduceEffects').addEventListener('change',e=>{localStorage.setItem('rf.reduceEffects',String(e.target.checked));document.body.classList.toggle('reduced-effects',e.target.checked&&matchMedia('(prefers-reduced-motion: reduce)').matches)});
$('#exportDefault').value=localStorage.getItem('rf.exportDefault')||'balanced'; $('#exportDefault').disabled=true;

$('#render').addEventListener('click',async()=>{
  if(!selectedVideo)return;
  $('#render').disabled=true; $('#result').classList.add('hidden'); setStatus(t('statusRendering'),t('statusRenderingText'),'busy');
  try{
    const out=await invoke('process_video',{input:selectedVideo,aspect:frameMode,captions:$('#captions').checked,captionStyle:$('#captionStyle').value,highlightKeywords:$('#highlightKeywords').checked});
    lastOutput=out; $('#resultPath').textContent=out; $('#result').classList.remove('hidden'); setStatus(t('statusDone'),t('statusDoneText'));
    saveProject({name:selectedVideo.split('/').pop(),source:selectedVideo,output:out,status:'Ready',createdAt:new Date().toISOString(),style:selectedStyle,frame:frameMode});
  }catch(e){setStatus(t('statusError'),String(e),'error');}
  finally{$('#render').disabled=false;}
});
$('#showResult').addEventListener('click',()=>lastOutput&&invoke('reveal_file',{path:lastOutput}));
$('#previewResult').addEventListener('click',()=>lastOutput&&invoke('open_file',{path:lastOutput}));

function projects(){try{return JSON.parse(localStorage.getItem('rf.projects')||'[]')}catch{return[]}}
function saveProject(p){const items=projects();items.unshift(p);localStorage.setItem('rf.projects',JSON.stringify(items.slice(0,100)));renderProjects();}
function renderProjects(){
  const list=$('#projectsList'), items=projects(); list.innerHTML=''; $('#projectsEmpty').classList.toggle('hidden',items.length>0);
  items.forEach((p,i)=>{const el=document.createElement('article');el.className='project-row';el.innerHTML=`<div class="project-thumb">RF</div><div class="project-main"><b>${escapeHtml(p.name)}</b><span>${new Date(p.createdAt).toLocaleString(lang==='ru'?'ru-RU':'en-US')} · ${escapeHtml(p.style||'clean')}</span></div><span class="project-status">${p.status}</span><div class="project-actions"><button data-open="${i}" class="ghost">${t('preview')}</button><button data-find="${i}" class="ghost">Finder</button><button data-delete="${i}" class="ghost danger-text">×</button></div>`;list.appendChild(el)});
  $$('[data-open]').forEach(b=>b.onclick=()=>invoke('open_file',{path:items[+b.dataset.open].output}));
  $$('[data-find]').forEach(b=>b.onclick=()=>invoke('reveal_file',{path:items[+b.dataset.find].output}));
  $$('[data-delete]').forEach(b=>b.onclick=()=>{items.splice(+b.dataset.delete,1);localStorage.setItem('rf.projects',JSON.stringify(items));renderProjects()});
}
function escapeHtml(s=''){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function formatDuration(v){v=Math.max(0,Number(v)||0);const m=Math.floor(v/60),s=Math.floor(v%60);return `${m}:${String(s).padStart(2,'0')}`}
function formatBytes(n){n=Number(n)||0;if(!n)return'—';const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i<2?0:1)} ${u[i]}`}

async function checkUpdates(manual=false){
  if(manual)$('#updateState').textContent=t('checking');
  try{
    const info=await invoke('check_for_update'); $('#latestVersion').textContent=info.version||VERSION;
    if(info.releaseDate)$('#releaseDate').textContent=info.releaseDate; if(info.releaseTime)$('#releaseTime').textContent=info.releaseTime;
    if(info.available){$('#updateTitle').textContent=`${t('updateAvailable')} ${info.version}`;$('#updateNotes').textContent=info.notes||'';$('#updateBanner').classList.remove('hidden');$('#installUpdate').textContent=t('installRestart');$('#installUpdate').onclick=async()=>{await invoke('download_update',{url:info.url,sha256:info.sha256,filename:info.filename})};if(manual)$('#updateState').textContent=`${info.version}`;}
    else if(manual)$('#updateState').textContent=t('latestInstalled');
  }catch(e){if(manual)$('#updateState').textContent=String(e)}
}
$('#checkUpdate').addEventListener('click',()=>checkUpdates(true));
applyLanguage(); renderProjects(); checkUpdates(false);
