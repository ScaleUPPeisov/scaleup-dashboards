from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"FINALIZER_GUARD_FAIL:{label}:expected=1:actual={count}")
    return text.replace(old, new, 1)

# -----------------------------------------------------------------------------
# Inventory owner semantics: keep legacy folderState contract, add exact owner state.
# -----------------------------------------------------------------------------
p = Path('src/dailyOperations.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "  folderState:'NOT_CONFIGURED'|'AVAILABLE'|'UNAVAILABLE'|'ERROR'|'UNKNOWN';nextAction:string;\n  events:UploadHistoryRecord[];",
    "  folderState:'NOT_CONFIGURED'|'AVAILABLE'|'UNAVAILABLE'|'ERROR'|'UNKNOWN';\n  inventoryState:'ONLINE'|'OFFLINE'|'STALE'|'ERROR'|'NOT_CONFIGURED'|'EMPTY';stale:boolean;lastConfirmedAt?:string;nextAction:string;\n  events:UploadHistoryRecord[];",
    'inventory-owner-state-shape',
)
s = replace_once(
    s,
    "  onlineChannels:number;offlineChannels:number;attentionChannels:number;errors:number;lastUploadAt?:string;rows:DailyChannelOperation[];",
    "  onlineChannels:number;offlineChannels:number;staleChannels:number;attentionChannels:number;errors:number;lastUploadAt?:string;rows:DailyChannelOperation[];",
    'inventory-summary-stale-shape',
)
anchor = "function nextAction(channel:Channel,snapshot:ChannelInventorySnapshot|undefined,uploadedToday:number,target:number|undefined,state:DailyChannelOperation['folderState']){"
helper = """function ownerInventoryState(state:DailyChannelOperation['folderState'],snapshot?:ChannelInventorySnapshot):DailyChannelOperation['inventoryState']{
  if(state==='NOT_CONFIGURED')return'NOT_CONFIGURED';
  if(state==='ERROR')return'ERROR';
  if(state==='UNAVAILABLE')return'OFFLINE';
  if(state==='UNKNOWN')return'STALE';
  if(snapshot?.stale)return'STALE';
  if((snapshot?.readyVideos??0)<=0)return'EMPTY';
  return'ONLINE'
}
""" + anchor
s = replace_once(s, anchor, helper, 'inventory-owner-state-helper')
s = replace_once(
    s,
    "      folderState:state,nextAction:nextAction(channel,snapshot,uploadedToday,dailyTarget,state),events",
    "      folderState:state,inventoryState:ownerInventoryState(state,snapshot),stale:Boolean(snapshot?.stale),lastConfirmedAt:snapshot?.lastConfirmedAt||snapshot?.lastScanAt,nextAction:nextAction(channel,snapshot,uploadedToday,dailyTarget,state),events",
    'inventory-row-owner-state',
)
s = replace_once(
    s,
    "    offlineChannels:rows.filter(x=>x.folderState==='UNAVAILABLE').length,\n    attentionChannels:rows.filter(x=>x.folderState==='NOT_CONFIGURED'||x.folderState==='UNKNOWN').length,",
    "    offlineChannels:rows.filter(x=>x.folderState==='UNAVAILABLE').length,\n    staleChannels:rows.filter(x=>x.inventoryState==='STALE').length,\n    attentionChannels:rows.filter(x=>x.folderState==='NOT_CONFIGURED'||x.folderState==='UNKNOWN'||x.inventoryState==='STALE').length,",
    'inventory-summary-stale-count',
)
p.write_text(s, encoding='utf-8')

p = Path('src/DailyOperationsCenter.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "      <span><small>ДИСКИ ОТКЛЮЧЕНЫ</small><b>{summary.offlineChannels}</b></span>\n      <span><small>ТРЕБУЮТ ВНИМАНИЯ</small><b>{summary.attentionChannels}</b></span>",
    "      <span><small>ДИСКИ ОТКЛЮЧЕНЫ</small><b>{summary.offlineChannels}</b></span>\n      <span><small>УСТАРЕВШИЕ ДАННЫЕ</small><b>{summary.staleChannels}</b></span>\n      <span><small>ТРЕБУЮТ ВНИМАНИЯ</small><b>{summary.attentionChannels}</b></span>",
    'inventory-ui-stale-kpi',
)
s = replace_once(
    s,
    "          <span><b>{row.localReady==null?'—':row.localReady}</b><small>{row.folderState==='UNAVAILABLE'?'Диск отключён • последний подтверждённый запас':row.folderState==='NOT_CONFIGURED'?'Render не выбран':row.folderState==='ERROR'?'Ошибка чтения Render':'готово к загрузке'}</small></span>",
    "          <span><b>{row.localReady==null?'—':row.localReady}</b><small>{row.folderState==='UNAVAILABLE'?'Диск отключён • по последней синхронизации':row.inventoryState==='STALE'?'Данные устарели • последний подтверждённый запас':row.folderState==='NOT_CONFIGURED'?'Render не выбран':row.folderState==='ERROR'?'Ошибка чтения Render':row.inventoryState==='EMPTY'?'Render доступен • видео нет':'готово к загрузке'}</small>{row.lastConfirmedAt&&row.stale&&<small>Последняя проверка: {date(row.lastConfirmedAt)} {time(row.lastConfirmedAt)}</small>}</span>",
    'inventory-ui-cache-copy',
)
p.write_text(s, encoding='utf-8')

p = Path('src/dailyOperations.test.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "const offline={...snapshot('a',10),folderState:'OFFLINE' as const,stale:true,lastSuccessAt:'2026-10-10T10:00:00.000Z'};",
    "const offline={...snapshot('a',10),folderState:'OFFLINE' as const,stale:true,lastConfirmedAt:'2026-10-10T10:00:00.000Z'};",
    'inventory-test-confirmed-timestamp',
)
s = replace_once(
    s,
    "   expect(result.rows[0].folderState).toBe('UNAVAILABLE');\n   expect(result.rows[0].localReady).toBe(10);",
    "   expect(result.rows[0].folderState).toBe('UNAVAILABLE');\n   expect(result.rows[0].inventoryState).toBe('OFFLINE');\n   expect(result.rows[0].stale).toBe(true);\n   expect(result.rows[0].lastConfirmedAt).toBe('2026-10-10T10:00:00.000Z');\n   expect(result.rows[0].localReady).toBe(10);",
    'inventory-test-offline-owner-state',
)
insert = """
 it('reconnects the same channel mapping without duplicate rows and refreshes stock',()=>{
   const now=new Date(2026,9,11,12,0,0);
   const offline={...snapshot('a',10),folderState:'OFFLINE' as const,stale:true,lastConfirmedAt:'2026-10-10T10:00:00.000Z'};
   const disconnected=buildDailyOperations([channel()],[],{a:offline},now);
   expect(disconnected.rows).toHaveLength(1);
   expect(disconnected.rows[0].inventoryState).toBe('OFFLINE');
   const connected=buildDailyOperations([channel()],[],{a:{...snapshot('a',12),lastConfirmedAt:'2026-10-11T11:59:00.000Z'}},now);
   expect(connected.rows).toHaveLength(1);
   expect(connected.rows[0].channelId).toBe('a');
   expect(connected.rows[0].inventoryState).toBe('ONLINE');
   expect(connected.rows[0].localReady).toBe(12);
 });

 it('separates EMPTY and NOT_CONFIGURED from ERROR',()=>{
   const now=new Date(2026,9,11,12,0,0);
   const empty=buildDailyOperations([channel()],[],{a:snapshot('a',0)},now);
   expect(empty.rows[0].inventoryState).toBe('EMPTY');expect(empty.errors).toBe(0);
   const missing=channel();delete (missing as any).renderFolderPath;
   const noConfig=buildDailyOperations([missing],[],{},now);
   expect(noConfig.rows[0].inventoryState).toBe('NOT_CONFIGURED');expect(noConfig.errors).toBe(0);
 });
"""
idx = s.rfind('\n});')
if idx < 0: raise SystemExit('FINALIZER_GUARD_FAIL:daily-test-tail')
s = s[:idx] + insert + s[idx:]
p.write_text(s, encoding='utf-8')

# -----------------------------------------------------------------------------
# Changelog: prepend 6.1.10, preserve every existing entry byte-for-byte after it.
# -----------------------------------------------------------------------------
p = Path('src/releaseHistory.ts')
s = p.read_text(encoding='utf-8')
anchor = "export const VYRON_RELEASE_HISTORY:ReleaseHistoryEntry[]=[\n"
entry = r'''  {
    "date":"2026-10-11","version":"6.1.10","title":"Product Correctness & Safe Metadata PATCH","type":"PATCH","platforms":["macOS"],
    "highlights":[
      "Изменение метаданных больше не требует выбирать дату/время публикации.",
      "Metadata update и scheduling разделены: неизменённые пользователем поля не входят в mutation payload.",
      "OFFLINE Render-диски больше не считаются настоящими ошибками, а последний подтверждённый запас сохраняется."
    ],
    "sections":{
      "fixes":[
        "Изменение названия, описания или тегов не меняет существующий privacyStatus.",
        "Existing publishAt сохраняется, если пользователь явно не включил изменение расписания.",
        "Metadata-only batch не требует schedule validation и не создаёт MISSING_SCHEDULE.",
        "OFFLINE Render-диски отделены от ERROR."
      ],
      "reliability":[
        "Запас видео продолжает показывать последние подтверждённые данные, если диск временно отключён.",
        "Разделены ONLINE / OFFLINE / STALE / ERROR / NOT_CONFIGURED / EMPTY состояния.",
        "OAuth transport, refresh-token logic, resumable upload transport и account mappings не изменялись."
      ],
      "interface":[
        "Перед массовым metadata update показывается точный список изменяемых и неизменяемых полей.",
        "Добавлен явный выключенный по умолчанию переключатель «Изменить дату и время публикации».",
        "Иконка не восстановлена автоматически: требуется отдельное owner selection после forensic review."
      ],
      "technical":[
        "Safe base: 588e2070877512daa637077223c678af6a216831.",
        "Release remains blocked until physical candidate regression is explicitly authorized and passed."
      ]
    },
    "prerelease":true
  },
'''
s = replace_once(s, anchor, anchor + entry, 'changelog-prepend-6110')
p.write_text(s, encoding='utf-8')

# -----------------------------------------------------------------------------
# Version guard and exact 6.1.10 bump (allowed now because dev gates are green).
# -----------------------------------------------------------------------------
Path('scripts/check-vyron-release-history.mjs').write_text(r'''import fs from 'node:fs';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const tauri=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));
const cargo=fs.readFileSync('src-tauri/Cargo.toml','utf8');
const history=fs.readFileSync('src/releaseHistory.ts','utf8');
const cargoVersion=cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const latestHistory=history.match(/VYRON_RELEASE_HISTORY:[^=]*=\[\s*\{[\s\S]*?"version":"([^"]+)"/)?.[1];
const values={package:pkg.version,packageLock:lock.version,packageLockRoot:lock.packages?.['']?.version,cargo:cargoVersion,tauri:tauri.version,changelog:latestHistory};
const unique=new Set(Object.values(values));
if(unique.size!==1||!latestHistory){console.error('VYRON_VERSION_GUARD=FAIL',values);process.exit(1)}
console.log('VYRON_VERSION_GUARD=PASS',values);
''', encoding='utf-8')

p=Path('package.json'); s=p.read_text(encoding='utf-8')
s=replace_once(s,'"version": "6.1.9"','"version": "6.1.10"','package-version')
s=replace_once(s,'"scripts": {\n    "dev":','"scripts": {\n    "prebuild": "node scripts/check-vyron-release-history.mjs",\n    "dev":','package-prebuild-guard')
p.write_text(s,encoding='utf-8')

p=Path('package-lock.json'); s=p.read_text(encoding='utf-8')
if s.count('"version": "6.1.9"') < 2: raise SystemExit('FINALIZER_GUARD_FAIL:package-lock-version-count')
s=s.replace('"version": "6.1.9"','"version": "6.1.10"',2)
p.write_text(s,encoding='utf-8')

p=Path('src-tauri/Cargo.toml'); s=p.read_text(encoding='utf-8')
s=replace_once(s,'version = "6.1.9"','version = "6.1.10"','cargo-toml-version')
p.write_text(s,encoding='utf-8')

p=Path('src-tauri/Cargo.lock'); s=p.read_text(encoding='utf-8')
s=replace_once(s,'name = "channelflow"\nversion = "6.1.9"','name = "channelflow"\nversion = "6.1.10"','cargo-lock-root-version')
p.write_text(s,encoding='utf-8')

p=Path('src-tauri/tauri.conf.json'); s=p.read_text(encoding='utf-8')
s=replace_once(s,'"version": "6.1.9"','"version": "6.1.10"','tauri-version')
p.write_text(s,encoding='utf-8')

Path('src/vyron6110ReleaseHistoryVersion.test.ts').write_text(r'''import {describe,expect,it} from 'vitest';
import fs from 'node:fs';

describe('VYRON 6.1.10 release history/version guard',()=>{
  const read=(p:string)=>fs.readFileSync(new URL(p,import.meta.url).pathname,'utf8');
  it('keeps application and latest changelog versions identical',()=>{
    const pkg=JSON.parse(read('../package.json'));
    const tauri=JSON.parse(read('../src-tauri/tauri.conf.json'));
    const cargo=read('../src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    const history=read('./releaseHistory.ts');
    const latest=history.match(/VYRON_RELEASE_HISTORY:[^=]*=\[\s*\{[\s\S]*?"version":"([^"]+)"/)?.[1];
    expect(pkg.version).toBe('6.1.10');expect(tauri.version).toBe(pkg.version);expect(cargo).toBe(pkg.version);expect(latest).toBe(pkg.version);
  });
  it('documents exact 6.1.10 correctness guarantees without claiming icon restoration',()=>{
    const history=read('./releaseHistory.ts');
    expect(history).toContain('Изменение метаданных больше не требует выбирать дату/время публикации');
    expect(history).toContain('OFFLINE Render-диски отделены от ERROR');
    expect(history).toContain('Иконка не восстановлена автоматически');
  });
});
''',encoding='utf-8')

# -----------------------------------------------------------------------------
# Icon forensic record. No icon bytes are changed.
# -----------------------------------------------------------------------------
Path('VYRON_ICON_FORENSICS.md').write_text(r'''# VYRON Icon Forensics — 6.1.10 candidate

Status: `ICON_STATUS=OWNER_SELECTION_REQUIRED`

This report is intentionally conservative. No icon was restored automatically.

## CANDIDATE current-generic-v

- **CANDIDATE_ID:** `current-generic-v`
- **Visual preview:** ![Current generic V](https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/588e2070877512daa637077223c678af6a216831/src-tauri/icons/icon.png)
- **Source file:** `src-tauri/icons/icon.icns` / generated PNG family
- **Blob SHA:** `9ae975a36e1677e2c49060f13b8651d446dabaf2` (`icon.icns`)
- **First verified lineage evidence:** commit `298af54db2322e50de4a7d5dbfab45031c5fb07e`, 2026-09-17, `chore: freeze verified VYRON 2.1.6 source`
- **Known later use:** exact 6.1.9 source `588e2070877512daa637077223c678af6a216831`
- **Actually packaged:** **YES**. `src-tauri/tauri.conf.json` includes `icons/icon.icns` in the macOS bundle icon list.
- **Owner approval inference:** **REJECTED by current owner statement.** Historical presence/production packaging does not override explicit owner rejection.
- **Decision:** `CURRENT_GENERIC_V=REJECTED`

## CANDIDATE owner-ui-artwork-20260928

- **CANDIDATE_ID:** `owner-ui-artwork-20260928`
- **Visual preview:** ![Owner-provided VYRON 4 artwork](https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/39662c2aa6fe1cc352d435463692e1d255860c76/src/assets/vyron-4-artwork.webp)
- **Source file:** `src/assets/vyron-4-artwork.webp`
- **Source commit:** `39662c2aa6fe1cc352d435463692e1d255860c76`
- **Date:** 2026-09-28
- **Introduction evidence:** commit message `feat(vyron-4): add owner-provided UI artwork`
- **Versions/releases where present:** VYRON 4 development lineage.
- **Actually packaged as macOS app icon:** **NOT PROVEN**. The known macOS bundle config points at the `src-tauri/icons/*` family, not this WEBP.
- **Owner approval inference:** strong evidence that the artwork itself was owner-provided, but insufficient evidence that it was the approved Dock/Finder application icon.
- **Decision:** credible visual candidate, but not safe to auto-restore.

## Additional historical checks

- `feature/vyron-4.0.0` history was inspected around icon/artwork introduction and production publication.
- `vyron-rebrand` branch/tree was inspected for a distinct `src-tauri/icons/icon.icns`; no distinct packaged app-icon candidate was established from the available repository evidence.
- Current 6.1.9 `icon.icns` is the same known `9ae975...` generic lineage; “old” and “shipped” therefore do not establish approval.

## Decision

`CANDIDATES_FOUND=2`

`HISTORICAL_CANDIDATES=current-generic-v,owner-ui-artwork-20260928`

`ICON_FORENSIC_WINNER=NONE`

`ICON_STATUS=OWNER_SELECTION_REQUIRED`

`OWNER_SELECTION_REQUIRED=YES`

`ICON_RESTORED=NO`

No icon file is modified by the 6.1.10 candidate freeze.
''', encoding='utf-8')

print('VYRON_6110_FINALIZER=APPLIED')
