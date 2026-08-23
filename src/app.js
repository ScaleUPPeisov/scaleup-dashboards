const invoke = window.__TAURI__.core.invoke;
let selectedVideo = null;
let lastOutput = null;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

$$('.nav').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav').forEach(x => x.classList.remove('active'));
  $$('.page').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  $('#' + btn.dataset.page).classList.add('active');
}));

$('#pickVideo').addEventListener('click', async () => {
  try {
    const path = await invoke('pick_video');
    if (!path) return;
    selectedVideo = path;
    $('#videoPath').textContent = path.split('/').pop();
    $('#render').disabled = false;
    setStatus('Готов к обработке', 'Исходник будет сохранён полностью', 'ok');
  } catch (e) { setStatus('Не удалось выбрать файл', String(e), 'error'); }
});

function setStatus(title, text, type='ok') {
  $('#statusTitle').textContent = title;
  $('#statusText').textContent = text;
  const el = $('.status');
  el.className = 'status' + (type === 'busy' ? ' busy' : type === 'error' ? ' error' : '');
}

$('#render').addEventListener('click', async () => {
  if (!selectedVideo) return;
  const aspect = $('input[name="aspect"]:checked').value;
  const captions = $('#captions').checked;
  $('#render').disabled = true;
  $('#result').classList.add('hidden');
  setStatus(captions ? 'Создаю субтитры…' : 'Экспортирую видео…', captions ? 'Первый запуск может скачать локальную Whisper-модель' : 'Полная длительность, без скрытой нарезки', 'busy');
  try {
    const out = await invoke('process_video', { input: selectedVideo, aspect, captions });
    lastOutput = out;
    $('#resultPath').textContent = out;
    $('#result').classList.remove('hidden');
    setStatus('Готово', 'Видео экспортировано без скрытой обрезки', 'ok');
  } catch (e) {
    console.error(e);
    setStatus('Ошибка обработки', String(e), 'error');
  } finally { $('#render').disabled = false; }
});

$('#showResult').addEventListener('click', () => lastOutput && invoke('reveal_file', { path: lastOutput }));

async function checkUpdates(manual=false) {
  if (manual) $('#updateState').textContent = 'Проверяю…';
  try {
    const info = await invoke('check_for_update');
    if (info && info.available) {
      $('#updateTitle').textContent = `Доступен ReelsFactory ${info.version}`;
      $('#updateNotes').textContent = info.notes || 'Новая версия готова к установке';
      $('#updateBanner').classList.remove('hidden');
      $('#installUpdate').textContent = 'Установить и перезапустить';
      $('#installUpdate').onclick = async () => {
        $('#installUpdate').disabled = true;
        $('#installUpdate').textContent = 'Готовлю обновление…';
        try {
          await invoke('download_update', { url: info.url, sha256: info.sha256, filename: info.filename });
        } catch(e) {
          alert('Не удалось установить обновление: ' + e);
          $('#installUpdate').disabled = false;
          $('#installUpdate').textContent = 'Установить и перезапустить';
        }
      };
      if (manual) $('#updateState').textContent = `Доступна версия ${info.version}`;
    } else if (manual) {
      $('#updateState').textContent = 'Установлена последняя версия';
    }
  } catch(e) {
    if (manual) $('#updateState').textContent = 'Не удалось проверить: ' + e;
    console.warn('update check', e);
  }
}

$('#checkUpdate').addEventListener('click', () => checkUpdates(true));
checkUpdates(false);
