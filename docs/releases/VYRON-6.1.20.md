# VYRON 6.1.20 — private Apple Silicon hotfix candidate

This is a PERSONAL RC, not a public stable release.

## User-facing corrections
- Channel Runway sort uses **ascending displayed YouTube Scheduled days**. Known positive historical counts are shown in numerical order with a clear historical caveat; an unknown number is always last.
- Restore red/orange/yellow/green risk styling for verified schedules. Incomplete evidence is displayed separately with dashed amber/grey markers and cannot be misinterpreted as fresh verified stock.
- `Обновить все каналы` audits every enabled local channel including inaccessible/OAuth-blocked ones. It reports the actual rows verified / partial / blocked, progress done/total and bounded deep-check count.
- An explicit manual fleet audit may reconcile missing Scheduled inventory using owner-authenticated read-only `search.list` and `videos.list` within the separate search quota (max 33 channel deep checks, 2 pages each, 12 search calls held in reserve). Background refresh never performs search.
- Manually queued YouTube video IDs are hydrated through `videos.list` with exact owner Channel-ID checks. An incomplete owner inventory NEVER means zero remaining videos.

## QA and release guardrails
- Frontend: 1,284 tests passed, production TypeScript/Vite build passed.
- Baseline regression diff vs 6.1.15 passed, all old tests retained.
- This RC's private CI must also run all Rust library tests and build a signed ARM64 app from its exact source SHA before any installation.
- Uses already-approved rotated updater key fingerprint (SHA-256): `1c97657fd2a7ba4c2a0ce5b5361518eeacf76da274521b1977d57a55b8dbcec9`.
- The app bundle is locally signed ad-hoc, NOT Apple Developer ID notarized. Gatekeeper may reject downloaded bundles.
- No publish, videos.update, videos.delete, OAuth reset, database clear, or YouTube channel write action is part of CI.
- **Installed VYRON 6.1.19 remains in place until a physical M1 guarded backup + install check.**
- Public stable update feed remains pinned and UNCHANGED.

## Still needs live owner validation
- Exact completeness of YouTube Scheduled for all 33 owner channels; partial/unlinked/OAuth statuses must remain explicit.
- Neon Drive FM / After Dark Voice against current YouTube Studio scheduled dates.
- GUI visual inspection of traffic-light colors and ascending sort at the owner's window size.
- Real HDD trash/project delete duration and persistence of queue state after release.

Do not claim full YouTube verification until real read-only owner sync succeeds and 33 per-channel statuses are inspected.
