# VYRON 3.3.4 — Production Delta Manifest

## Bases

- macOS production app source: `97f045d7b3ca4fac4eaf981abc2f56f4ada54917` (VYRON 3.3.3).
- Windows production app source: `4c1d38eed09fa1b649aa483b044f38489e26b369` (VYRON 3.3.2).
- Common pre-hotfix ancestor: `98a5dd881c1f217d1fadc914129e7a169146e933`.
- Unified development branch: `feature/vyron-3.3.4-live-content-inventory`.

## macOS 3.3.3 product deltas preserved

The unified branch starts from the exact tested macOS 3.3.3 app source. Therefore the complete macOS product delta is inherited, including:

- AI/DOCX bare `PUBLISH` parsing;
- `DD.MM.YYYY` parsing;
- KRAT / UTC offset scheduling;
- independent per-video file time source for daily / 2/2 / 3/1;
- explicit `PUBLISH_TIME_REQUIRED` behavior;
- Publisher scheduling regression coverage;
- existing OAuth/channel/local-state continuity.

No macOS 3.3.3 product file was reverted to the 3.3.1 ancestor.

## Windows 3.3.2 production deltas merged

The Windows 3.3.2 delta relative to the common ancestor is intentionally small and is carried into 3.3.4:

1. `src-tauri/src/youtube.rs`
   - Windows OAuth browser launch uses `tauri_plugin_opener::open_url(url, None::<&str>)`.
   - `cmd /C start`, `cmd.exe`, PowerShell and shell URL rewriting are forbidden in this path.
   - OAuth URL generation, PKCE/state/callback/token/channel semantics remain unchanged.

2. `src-tauri/tauri.windows.conf.json`
   - Windows updater routing keeps `updates/windows-latest.json` as the first endpoint.
   - Shared/macOS `updates/latest.json` remains fallback only on Windows.

3. `src/v332WindowsOauthLauncher.test.ts`
   - The Windows OAuth launcher and updater-routing production contract remains executable in the 3.3.4 regression suite.

Version-only 3.3.2 files are superseded by the controlled 3.3.4 version bump.

## 3.3.4 inventory architecture

Render folders
→ native filesystem watcher / local render scan
→ `src/renderInventoryRuntime.ts`
→ existing `renderScanClassifier`
→ Publisher / Live Content Inventory / Dashboard / Production / Autopilot.

The runtime is operational/cache state only. It does not replace `uploadHistory`, trusted upload fingerprints, jobs, OAuth profiles, channel mappings or persistent app state.

## Frozen state/security contract

The Live Inventory scan path must not:

- log out or reconnect Google;
- open OAuth automatically;
- delete or rotate OAuth profiles, refresh tokens or client secrets;
- clear macOS Keychain or Windows Credential Manager;
- clear encrypted vault, localStorage, app state or database;
- delete channels, upload history, fingerprint history, resumable sessions or project lifecycle;
- mutate YouTube Channel IDs, Profile UUIDs or Google Project mappings;
- change render/project paths automatically;
- upload to YouTube or mutate YouTube metadata/schedule/thumbnails.

Local inventory scan is expected to cost exactly zero YouTube API requests.

## Release freeze

VYRON 3.3.4 development may produce signed macOS and Windows candidates only.

Production updater feeds and production releases/tags remain frozen until the owner explicitly says `ВЫПУСКАЕМ`.
