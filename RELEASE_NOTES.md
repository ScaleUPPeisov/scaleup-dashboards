# VYRON 2.1.14 — Windows Stability Release

## Scope

Windows-only stability and recovery release based on the verified VYRON 2.1.13 Windows source.

- Source base: `63247f2e559217c56c60f12e0b3ae9ec0644fdd7`
- Candidate branch: `windows/vyron-214-stability-fix`
- Target: Windows 10/11 x64
- Previous Windows release: 2.1.13

## Fixed

- Safe `state.json` persistence without intentionally deleting the primary state before replacement.
- Automatic recovery from a valid `state.bak` when `state.json` is missing or corrupt.
- Corrupt state files are preserved for diagnostics instead of being silently treated as a normal empty app.
- Successful state recovery is recorded explicitly in local recovery metadata/history.
- ENDLUME handoff is transactional: selected projects are revalidated and the SENT ledger is committed only after a successful ENDLUME launch.
- False `ENDLUME_ALREADY_SENT` after failed request/spawn is fixed; failed handoffs remain retryable.
- Windows-native platform text, Windows Credential Manager diagnostics, ENDLUME Studio.exe wording and Explorer wording.
- Real ENDLUME diagnostics for file existence/type/access and writable VYRON Inbox.
- Real read-only updater manifest diagnostics: endpoint reachability, JSON parse, schema, `windows-x86_64`, semver, HTTPS download URL and signature presence. The diagnostics do not download the installer.
- Transient license backend failures (network/TLS/timeouts, HTTP 5xx, invalid JSON and unknown infrastructure responses) no longer destroy the last-known-good cache.
- Offline grace is bounded to 72 hours and requires an active cached license/device that is not authoritatively expired.
- Local session/secure-storage unavailability inside valid offline grace does not masquerade as an authoritative server denial.
- Legacy duplicate Settings implementation was removed from the production UI.
- Windows path coverage includes spaces and Cyrillic paths.
- Production/checkpoint and secure-cache atomic persistence were hardened for Windows power-loss scenarios.
- Regression coverage expanded for the Windows 2.1.14 stability contracts.

## Preserved

The release is required to preserve the existing Windows 2.1.13 working core:

- Google/YouTube OAuth profiles and channel bindings
- Windows Credential Manager secrets
- tenant isolation
- Publisher and resumable YouTube uploads
- uploadHistory and fingerprintCache
- Production Manager and recovery checkpoints
- ENDLUME handoff
- bundled FFmpeg/FFprobe
- signed Tauri updater flow and update blockers

## Signing truth

Tauri updater/minisign verification and Windows Authenticode are separate mechanisms.

- Updater signature: must be independently verified by the Windows candidate gate.
- Authenticode: report the actual Windows signature status from the built EXE/installer.
- If no real Authenticode certificate is configured, report `AUTHENTICODE = NOT_CONFIGURED`. Do not claim that Tauri updater signing is Authenticode.

## Physical acceptance truth

The CI candidate gate is not a substitute for a real installed-app acceptance run.

Until physically executed, these remain:

- Windows 10 physical: NOT_TESTED
- Windows 11 physical: NOT_TESTED
- Actual OAuth browser flow: NOT_TESTED
- Actual YouTube upload: NOT_TESTED
- Actual ENDLUME launch: NOT_TESTED
- Actual update 2.1.13 → 2.1.14 and relaunch: NOT_TESTED

No item may be reported as PASS merely because code review or CI looks correct.
