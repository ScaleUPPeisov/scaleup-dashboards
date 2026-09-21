import {describe,expect,it} from 'vitest';import fs from 'node:fs';
describe('VYRON 3.0.0 Publisher/UI contracts',()=>{
 const p=fs.readFileSync('src/PublisherOS.tsx','utf8');
 const bar=fs.readFileSync('src/YouTubeChannelBar.tsx','utf8');
 const settings=fs.readFileSync('src/SettingsOS.tsx','utf8');
 const styles=fs.readFileSync('src/styles.css','utf8');
 const history=fs.readFileSync('src/releaseHistory.ts','utf8');
 it('Select All includes only canonical eligible NEW rows and Select None clears selection',()=>{
  expect(p).toContain("const selectableJobs=useMemo(()=>allChannelJobs.filter(j=>uploadStateById.get(j.id)==='NEW'&&!recoveryJobIds.has(j.id))");
  expect(p).toContain("channelJobs.filter(j=>selectableJobIds.has(j.id)).map(j=>j.id)");
  expect(p).toContain('>Выбрать все</button>');
  expect(p).toContain("setDraftPatch({selectedIds:[]})");
  expect(p).toContain('>Снять выбор</button>');
  expect(p).toContain('disabledReason');
 });
 it('keeps dual exact channel folders and safe discovery wiring',()=>{expect(p).toContain('projectsFolderPath');expect(p).toContain('discoverChannelFolders');expect(p).toContain('found.render.length===1');expect(p).toContain('found.projects.length===1')});
 it('shows fingerprint generation evidence and never fixes selection by forcing checkboxes',()=>{
  expect(p).toContain('Показать доказательство статуса');
  expect(p).toContain('Новая версия файла');
  expect(p).toContain('Проверить файл');
  expect(p).toContain('Считать текущий файл новой версией');
  expect(p).toContain("renderScan.summary.NEW_CANDIDATE+renderScan.summary.NEW_GENERATION");
  expect(p).toContain("disabled={!fresh||busy}");
 });
 it('does not allow verified same-channel fingerprint duplicates to bypass preflight',()=>{
  expect(p).toContain('duplicateIds:duplicates.map(x=>x.id)');
  expect(p).toContain('allowDuplicate:false');
  expect(p).toContain('Доказательство duplicate protection');
  expect(p).not.toContain('Я явно подтверждаю повторную загрузку как нового видео');
 });
 it('removes Recent strip from normal YouTube Channel Center rendering',()=>expect(bar).not.toContain('Недавние'));
 it('keeps updater engineering detail collapsed and user-facing status translated',()=>{
  expect(settings).toContain('<summary>Технические сведения</summary>');
  expect(settings).toContain('updaterStatusLabel(updaterStatus)');
  expect(settings).not.toContain('raw.githubusercontent.com');
 });
 it('keeps page-level horizontal overflow disabled at the 1360x880 desktop contract',()=>{
  expect(styles).toContain('.main{flex:1;min-width:0');
  expect(styles).toContain('.pageWrap{overflow-y:auto;overflow-x:hidden;min-width:0;max-width:100%');
 });
 it('uses one structured changelog source with factual 3.0.0 entry',()=>{
  expect(settings).toContain('VYRON_RELEASE_HISTORY.map');
  expect(history).toContain("version:'3.0.0'");
  expect(history).toContain("date:'21.09.2026'");
 });
});
