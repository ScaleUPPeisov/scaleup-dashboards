# VYRON Mac Ultimate — Stage 4 Winner Engine / Offline AI ZIP verification

**PR:** #22, Draft, no merge/release. **Stable:** installed 6.1.15 is untouched.  
**Scope:** development branch `feature/vyron-macos-ultimate`. This document describes implementation intent; no physical or real-owner acceptance is implied by source presence.

## Winner Engine 2.0 — traceable heuristic

- Source: current verified Analytics 360 generation, either read-only local Tauri command `analytics360_winners` or merged data while creating an AI ZIP. Reads only channel IDs explicitly passed by UI.
- A daily view total is known only with exactly one valid, nonnegative observation for every calendar day. Missing or duplicated days invalidate that window. The last three potentially incomplete days are excluded.
- Analyze views for previous/current 7-day windows and most recent complete 28-day window. Optional watch minutes, mean view duration, average percentage viewed and net subscribers remain null if incomplete. True first 24h view count is **not reconstructed** from calendar daily reports.
- Each video is compared with its own channel's age cohort: 0–28, 29–180 or 181+ completed days since publication, based on UTC date. Median baseline excludes the candidate; at least 3 other videos in the same channel/cohort are needed.
- Eligibility: both 7-day windows complete, candidate's current 7-day views >=20, own-cohort median >=20. Otherwise `winnerScore=null`, `scoreStatus=INSUFFICIENT_DATA`.
- **Score (0–100):** `0.70 × clamp(50 + 22 × log2(current7 / peerMedian7), 0, 100) + 0.30 × clamp(50 + 20 × log2((current7+10)/(previous7+10)), 0, 100)`, rounded to integer. This is an interpretable prioritization heuristic, **not** a calibrated significance test or proof of causation.
- Labels: BREAKOUT (relative >=2 and trend >=1.4), RISING (trend >=1.35), DECLINING (trend <=0.55), UNDERPERFORMER (relative <0.55), STABLE_PERFORMER, INSUFFICIENT_DATA.
- Signals: unusual view surge (relative >=2.5 and trend >=1.5), unusual view drop (trend <=0.4), old-video resurgence (age >180 and relative >=2). Signals require eligible complete data.
- Reporting CTR units remain unverified, therefore CTR is **not** converted to percent and **not used** in the score. Retention is also excluded from the score; no implied CTR/retention anomalies are asserted. Per-video traffic-source shift is not currently available from this collector.
- The new UI displays rankings, reasons, statuses, channel and publication-date filters, sortable video table (first 100 rows), and links into the existing Video Passport. The analytics scan runs in a Rust blocking worker, not on the React main thread.

## Offline AI ZIP — hard boundary

- Frontend mode `offline` invokes the existing export command with `exportMode=offline`, while legacy/missing mode remains online for backwards compatibility.
- The offline backend branches **before** creating the HTTP client and never enters `collect_channel`; therefore it never calls OAuth, Keychain refresh, YouTube APIs or uses Google API quota.
- It validates channel IDs and existing local caches, reads published Analytics 360 snapshots and exports into a new staging/output ZIP. It does not call `persist` or `migrate_generation` and does not write to source JSON, current generation pointers, or SQLite.
- A channel without local data is reported as missing in `DATA_COVERAGE.json` and is not silently fabricated or treated as zero.
- Offline exports explicitly require `period=all` because the archive contains all locally saved history; the UI disables a misleading partial-period selection. Offline mode is the default in the export dialog. The online mode remains available and retains old command compatibility.
- The online export can be cancelled through `youtube_ai_export_cancel`; requests check cancellation before subsequent API calls and between longer loops. The operation aborts before publishing a partial ZIP; previous confirmed cache generations are not rolled back.
- Source provenance includes `exportMode`, `lastSuccessfulSyncAt`, `archiveHistorySource`, and `offlineApiRequests=0`.
- Existing archive contract remains intact: ALL_VIDEOS.csv, VIDEOS_DAILY.csv, CHANNELS_DAILY.csv, VIDEO_LIFECYCLE.csv, REACH_DAILY.csv, CHANNEL_EVENTS.json, WINNER_ENGINE.json, AI_README.md, AI_PROMPT.md, and the SHA-256 manifest. Added WINNER_ANOMALIES.csv and WINNER_ENGINE.md.
- Existing ZIP CRC, full manifest SHA-256 verification, formula-injection neutralization, path restrictions and sensitive-key guards remain active.

## SQLite fault-injection contract

- Test-only thread-local migration failure stages 1–5 cover replacement setup, video rows, channel rows/reach boundary, marker verification and pre-commit.
- Verify after every failure: original JSON bytes unchanged; pointer unchanged; no verified marker for the new generation; the previous generation still reads correctly. Finally migrate cleanly and compare data.
- Previous tests already cover WAL, corrupted header, foreign-key checks, exact payload parity, cross-channel isolation, duplicate prevention and repeat migrations.
- Fault injection is limited to synthetic test directories. No live user database is used.

## Targeted validation

```bash
npm ci
npx vitest run src/Analytics360Winners.test.ts src/analytics360Core.test.ts src/Analytics360Fleet.test.ts
npm test
npm run build
cd src-tauri
cargo test --locked --lib analytics_ai_export -- --nocapture
# Includes synthetic Winner Engine 50-channel / 10,000-video load test
cargo test --locked --lib analytics_sqlite -- --nocapture
cargo test --locked --lib analytics360_cache -- --nocapture
cargo check --locked
```

Check macOS ARM64 / Linux / OAuth / Publisher / Privacy / SQLite lock / offline preflight and 6.1.15 regression comparison **on the final HEAD**. A successful compile is not an end-to-end verification of real YouTube accounts.

## Release gates — still open

**BLOCKER:** pass all CI jobs at the final SHA; perform safe owner-approved offline snapshot/SQLite recovery parity; signed in-place OAuth/Keychain continuity and rollback; owner-approved online YouTube export against Studio to establish CTR scale; real MacBook Air M1 frame-timing and sustained 33–50-channel workloads; notarized candidate validation. No real accounts or production installations have been touched by this stage.

**IMPORTANT:** implement additional video-level traffic-source and CTR/retention anomaly signals only after obtaining confirmed compatible API data; add real offline network-denial integration tests, full ZIP integrity checks for 50-channel snapshots, and perform a physical M1 benchmark of Winner UI/SQLite reads. A new synthetic Rust test exercises 50 channels and 10,000 video evidence rows; its elapsed time is logged without claiming physical M1 performance. Cancellation is now requested through a dedicated Tauri command; no unfinished ZIP is published, but an in-flight HTTP request can run until its existing timeout and requires supervised acceptance.

**OPTIONAL:** richer Winner Score experiments, larger virtualized result pages, additional charts, contextual explanations, configurable analytic thresholds.

**No merge, release, production upgrade, real video publication or OAuth reset until explicitly authorized.**
