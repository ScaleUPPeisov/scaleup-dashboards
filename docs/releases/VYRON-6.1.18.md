# VYRON 6.1.18 — targeted Mac M1 bugfix candidate

Target: macOS ARM64, bundle ID `studio.channelflow.desktop`.
Scope: changes already reviewed in PR #22; no Windows/Cloudflare release changes.

## Fixed
- **YouTube Runway:** a failed/partial owner-video refresh cannot masquerade as zero scheduled videos. Verify OAuth owner Channel ID, the uploads playlist, `videos.list(part=status,snippet,contentDetails)`, `status.privacyStatus`, `status.publishAt`, a complete scan and last verified cache. Unknown/stale/OAuth-failed statuses remain distinct from confirmed empty. Dates and priority ordering use the Krasnoyarsk calendar; local rendered files do not inflate remote inventory.
- **Production navigation:** batch history is loaded on demand, and historical batch results are not treated as newly completed. In-process build completion and completed-render reconciliation are handled once, while an active build continues to report progress.

## Release candidate security and compatibility
- Build an isolated 6.1.18 ARM64 Tauri overlay (actual app Info.plist reports 6.1.18) using the **already established new Tauri signing key** from the protected `vyron-rotated-key-rc` environment; reject the known compromised legacy public key.
- Public key SHA-256 must match the independently approved fingerprint `1c97657fd2a7ba4c2a0ce5b5361518eeacf76da274521b1977d57a55b8dbcec9` from the successful 6.1.17 personal ARM64 build.
- Personal app may carry a local ad-hoc macOS signature. This is **not Apple Developer ID notarization**; macOS Gatekeeper can refuse normal GUI launch. Do not advise disabling Gatekeeper.
- Upload a **private Actions artifact only** with candidate DMG, updater archive, Minisign signature, SHA-256, and synthetic-launch evidence. No public release, no stable feed publication and no forced updater.
- Actual installed 6.1.17 binary, owner OAuth/Keychain/SQLite and 33 real channels require on-device verification. The CI synthetic launch does not prove a real upgrade.

## Acceptance
1. TypeScript/Vitest and ARM64 compile, signing, archive signature verification and preservation of synthetic App Support sentinel: CI required.
2. Live Neon Drive FM Scheduled count and exact last publish date: **NOT VERIFIED ON LIVE CHANNEL** until authorized owner API returns trustworthy inventory.
3. Full 6.1.17 → 6.1.18 in-app install/restart: **NOT TESTED** until a disposable Mac/isolated feed demonstrates it without switching production latest.json.
4. Owner approval required before any stable release/feed change.
