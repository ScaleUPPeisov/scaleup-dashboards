# VYRON Mac Ultimate — evidence and release gates (Draft PR #22)

**Branch:** \`feature/vyron-macos-ultimate\`  
**Stable installation:** VYRON 6.1.15 — unchanged.  
**Base/rollback:** \`backup/vyron-macos-6.1.15-before-ultimate-20261107\`  
**Rule:** no merge, no production DMG, no signed in-place upgrade without explicit owner approval.

## Gate 1 — SQLite / WAL migration

- SQLite: bundled \`rusqlite = "=0.36.0"\`, generated \`Cargo.lock\`, no hand-authored checksums.
- Per-channel store: \`AIAnalytics/cache/UC.../analytics-v1.sqlite3\`. File name retained across schema versions; current \`PRAGMA user_version=2\`.
- 15 domain tables: channels, videos, channel_daily, video_daily, reach_daily, video_reach_daily, audience_demographics, traffic_sources, devices, subtitles, retention_points, channel_events, metadata_history, sync_jobs, data_coverage. Plus analytics_overviews and analytics_migrations.
- Connection contract: WAL, foreign keys, busy timeout, FULL synchronous, indexed date/video lookups.
- Startup/current source is immutable JSON pointer+generation. Verify channel identity, UUID, JSON integrity, unique video IDs, daily rows and content before creating/updating SQLite.
- Backup: preserve all source JSON generations, additional pre-SQLite pointer backup. Never automatically prune legacy JSON while migrating.
- Transaction: insert normalized records, compare row counts and sample JSON values, run FK check, then insert verified migration marker; rollback on any error.
- Read switch: only current verified generation may supply SQLite UI/ZIP values. Other cases fall back to JSON; a corrupt existing SQLite file triggers explicit recovery error, not a fresh empty database.
- Bounded contention: per-channel WAL transactions, 5 s busy timeout, connections owned by background tasks.
- **Synthetic benchmark completed on GitHub macOS runner (not physical M1):** 50 channels, 10,000 videos, 1,000,000 video-day rows, 250,000 retention points. 65,802 ms migration sum; 300 ms summed UI query; 488,038,400 SQLite file bytes; observed process RSS 18,576 KB; total test 89,614 ms. CI run \`42381829058\`, performance job PASS. RSS is sampled and is not a guaranteed peak.
- Still required: owner-data migration dry run with consent, crash injection under power loss, source/SQLite parity checks on real channel data.

## Gate 2 — Google OAuth / Keychain continuity

- Keep bundle identifier, signing identity, OAuth client mapping, existing Vault/Keychain and canonical service unchanged.
- New in-memory per-profile Tokio lock serializes token refresh for the same profile while other profiles proceed.
- Tests cover 35 independent lock identities and transient error classifications; \`invalid_grant\` alone is eligible to mark reconnect-required.
- Existing vault tests cover encrypted local key, migration, preservation of secrets and 1,000-profile decryption.
- **Not yet established:** real signed 6.1.15→candidate upgrade preserving 35 Google authorizations. CI tests cannot prove Keychain access across app-signing changes.
- On a physical test Mac: capture safe metadata-only profile inventory before and after; do not export tokens; ensure zero forced logins; test wake-from-sleep, network/VPN changes, 401/403/429/5xx and locked Keychain.
- Restore or reconnect profiles only when invalid-grant/revocation is confirmed for the exact profile.

## Gate 3 — M1 performance

Existing \`M1PerformanceProbe\` exercises 35 synthetic channels, 1,000 jobs, 5,000 metadata records, multiple navigation rounds, modal operations and scrolling.

Physical MacBook Air M1 targets:
- FPS ≥59, dropped frames <1%, p95 frame interval ideally ≤16.7 ms at 60 Hz.
- Capture actual WKWebView foreground frame pacing, memory, CPU, disk I/O, and external TOSHIBA scan; GitHub runner values are **not** physical M1 evidence.
- Compare performance with 6.1.15 under same test fixture, power mode, free storage and external disk.
- Do not disable functions, change video quality, or omit slow pages to claim PASS.

## Gate 4 — YouTube Analytics 360 and AI ZIP

- Confirm the source-of-truth for each available metric; no inferred zeros or 24h values.
- Check channel ID isolation, complete inventory pagination, missing/older videos, retroactive API limitations, weighted CTR, sample dates, retention, traffic and demographics.
- Reporting API CTR numeric scale is still UNVERIFIED: raw values must not be represented as percentages until checked against a real report.
- Verify export JSON/CSV header parity, counts and SHA256; secrets must be absent. Run for one, selected and 50 channels.
- Delayed or missing channel must appear as explicit partial coverage.

## Gate 5 — Publisher/Regression/Release Candidate

- Before any real upload, test exact OAuth Channel ID, duplicate guard, resumable upload recovery, schedule timezone correctness and quota handling using synthetic/isolated accounts only.
- Keep historical Vitest audit visible. Classify baseline 6.1.15 failures separately from new PR failures; never delete assertions to force a green build.
- Release candidate requires green TypeScript build, targeted + critical Rust/Vitest, OAuth continuity, migration/fault injection, export integrity and approved physical M1 tests.
- Production \`6.1.15\`, updater feed, signed DMG and merge remain unchanged while any critical gate is unverified.

## Physical test procedure (requires explicit approval before touching working VYRON)

1. Export a non-secret metadata-only manifest of existing channel IDs, connected profile IDs, job counts, video inventory and state file checksums.
2. Verify a restorable backup of the application state, immutable Analytics JSON generations and OAuth Vault **without exposing or printing tokens**.
3. Use an isolated snapshot/test environment. Do not overwrite the user's installed \`6.1.15\` or use production Keychain without permission.
4. Test clean candidate startup, database migration and shutdown, sudden force-quit recovery, repeat migration idempotency, and rollback to the previous app on a copy.
5. Test profile refresh behavior for 35 separate accounts, including wake, VPN change, temporary Google failures and invalid_grant (mocked first).
6. Run \`M1PerformanceProbe\` with its full scenarios and capture FPS/p95/dropped/memory results.
7. Export one channel and full network ZIP, validate SHA256 and coverage, compare counts with YouTube Studio where API permits.
8. Stop on any storage corruption, unexpected reconnect request, incorrect channel identity, duplicate upload intent or FPS regression. No merge or release until reviewed.
