# VYRON 2.1.9 — WINDOWS PORT AUDIT

Source of truth: `d7d53691a4a2d8ce6d2f9ed39337c73b68b111e5` (`2.1.9-rc.7` production source).
Stable release line: `2.1.9` (stable tag only changed version/release metadata after RC7).
Windows branch: `windows/vyron-219-production-port`.
Target: `x86_64-pc-windows-msvc`.

| FILE | FUNCTION / MODULE | CURRENT PLATFORM DEPENDENCY | macOS BEHAVIOR | WINDOWS REQUIREMENT | ACTION | RISK |
|---|---|---|---|---|---|---|
| src-tauri/src/security.rs | OAuth/API secret storage | Security.framework / SecItem / Keychain | Native Keychain, UI-skip protection | Native secure credential storage | Added Windows Credential Manager backend; macOS code remains cfg-gated | High |
| src-tauri/src/license.rs | application license | local owner hash + license.json | Local owner activation | per-customer server validated license + device binding | Added Supabase-backed Windows activation/session flow; full keys not stored locally | High |
| src-tauri/src/storage.rs | state.json | global app data | one local state | tenant-separated local state | Windows state stored below users/<license_user_id>/ | High |
| src-tauri/src/youtube.rs | OAuth metadata, Google config, upload recovery, backups | global app data + Keychain | profile UUID + Keychain | same OAuth model, isolated by customer | Windows paths tenant-scoped; secure secrets use tenant-aware Credential Manager namespace | High |
| src/App.tsx | app bootstrap | state loaded before license | legacy local license | license must resolve tenant before hydration | Boot now validates license first, then hydrates tenant state | High |
| src/*WorkspaceState.ts / caches | WebView localStorage | global browser storage | single-user local UI state | no cross-customer UI cache leakage | Added tenantStorage namespace keyed by license userId | High |
| src-tauri/src/production_manager.rs | free space | Unix `df -Pk` | parses df | native Windows disk API | Added GetDiskFreeSpaceExW | Medium |
| src-tauri/src/production_manager.rs | Downloads | HOME/Downloads | POSIX home | Windows Known Folder path | Uses Tauri `download_dir()` | Medium |
| src-tauri/src/production_manager.rs | audio duration | /usr/bin/afinfo | afinfo | ffprobe | Non-mac uses existing FFprobe pipeline | Medium |
| src-tauri/src/production_manager.rs | ENDLUME handoff | ~/Library/Application Support + open | request file + launch app | %APPDATA% inbox + launch exe | Added Windows inbox request and executable launch | Medium |
| src-tauri/src/shorts_factory.rs | ffmpeg / ffprobe | POSIX binary names and Homebrew paths | bundled/PATH/Homebrew | .exe resources | Added Windows filename/resource resolution | High |
| src-tauri/src/local_delete.rs | root/home safety | "/" and HOME | POSIX root/home | drive roots + USERPROFILE | Added Windows root and USERPROFILE guards | Medium |
| src-tauri/tauri.windows.conf.json | bundle | none | macOS config only | NSIS + WebView2 + resources | Added Windows-only Tauri config, mainBinaryName VYRON | High |
| .github/workflows/vyron-219-windows.yml | CI/build | macOS release workflows | Apple Silicon DMG | Windows x64 production build | Added windows-latest/MSVC/NSIS workflow | High |
| source-contract tests | file URL conversion | URL.pathname assumed POSIX | works on macOS/Linux | Windows drive path normalization | Added testFilePath helper; assertions preserved | Low |

## Secure storage contract

macOS canonical service remains:

`com.scaleup.vyron.security.v2`

Windows uses Credential Manager and preserves logical account names including:

`oauth.<profile_uuid>.refresh_token`

For customer isolation, Windows storage adds an internal tenant namespace resolved from the validated license user id. License session credentials use a separate pre-tenant namespace so license validation can occur before loading customer data.

## License backend

Isolated Supabase objects:

- `vyron_licenses`
- `vyron_devices`
- `vyron_sessions`
- `vyron-client-api`
- `vyron-admin-licenses`

Stored database key material is SHA-256 key hash + masked metadata/last4, not plaintext license keys.

Server-side status supports active / paused / revoked / expired and device limits. Sessions are hashed server-side and revocable.

## FFmpeg policy

Windows CI provisions pinned FFmpeg 8.1.2 x64 resources and verifies the downloaded ZIP SHA-256 before bundling. The installer does not rely solely on a user-installed FFmpeg.

## Current test truth

Frontend test suite: PASS on Windows CI (83 files / 455 tests).
TypeScript + Vite build: PASS on Windows CI.
Full repository `cargo fmt --check`: BASELINE FAIL because pre-existing untouched Rust files are not rustfmt-clean; recorded as a non-blocking audit and not represented as GREEN.
Rust tests / Windows compilation / NSIS: pending current CI result.
Physical Windows 10 runtime: NOT TESTED.
Physical Windows 11 runtime: NOT TESTED.
