# VYRON Mac Ultimate — PR #22 release-readiness report
**Date:** 2026-11-07  
**Pull request:** https://github.com/ScaleUPPeisov/scaleup-dashboards/pull/22  
**Branch:** \`feature/vyron-macos-ultimate\` (DRAFT, not merged)  
**Last profile-CI-verified CODE commit:** \`e9dd05a2922b356a93eb8fdce4b04100ee210a75\`  
**Stable production base:** \`51ba3f9e3f9526e101ec69e86c1bdd2fe496a7e2\` / 6.1.15  
**Production installed app, updater, signed DMG, Google credentials, real channel data:** UNCHANGED.

## 1. Fixed blocking SQLite regression

Root cause: on A→B→A, \`analytics_migrations\` intentionally removed the no-longer-current A marker, but generation-keyed \`analytics_overviews\`, \`metadata_history\`, \`sync_jobs\`, \`data_coverage\`, \`traffic_sources\`, \`audience_demographics\`, \`devices\` kept their A rows. A new ordinary INSERT violated the generation primary key.

Resolution (commits \`8d385702\`, \`5d9183ee\`):
- The previously committed \`sync_jobs\` source digest serves as a historical receipt. It must match newly computed source digest **before any SQL replacement**; a corrupted/reused generation fails explicitly.
- In ONE SQLite transaction, delete rows only for the matching \`channel_id\` AND \`generation\` from the seven generation-keyed tables, then import exact immutable JSON values. Other generations and channels are retained.
- SQL readers use the current verified \`analytics_migrations\` marker only, so rolling the JSON pointer to a previous generation does not expose newer SQL metrics until a validated reimport.
- Any late error rolls back deletions, row writes and verification markers. No \`INSERT OR IGNORE\` used to conceal the generation conflict. Immutable JSON generations are retained.
- Repeated same-generation sync skips cleanly; A→B→A→B reimport remains idempotent.

Tests: historical digest mutation; malformed JSON; bad per-video identity after partial SQL writes; failed import rollback; unrelated-channel isolation; no duplicate generation-table rows; repeated migration.

**Both macOS ARM64 and Linux passed** the blocker fix: https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/42394099369

## 2. SQLite/WAL data-integrity audit

Commit \`a8b1dae8\` adds value-level comparisons rather than row-count-only assertions:
- exact JSON payload equality for channel views, watch time and subscribers gained/lost;
- video daily metrics, audience breakdowns, metadata, traffic, event journal and Reach/CTR raw values;
- complete retention source curve and its fetch/provenance metadata;
- reopening an SQLite/WAL database, PASSIVE WAL checkpoint, \`integrity_check\`, \`foreign_key_check\`, schema version, failed transaction rollback, concurrent readers.
- protection against silent replacement of a corrupted database with a blank one.

**Both macOS ARM64 and Linux passed** these tests:
https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/42394648811

Limitations: Rust unit tests simulate interruption by dropping an uncommitted transaction; a real power-loss/SIGKILL recovery test on a disposable Mac snapshot is **NOT YET PERFORMED**. Numeric CTR scale from YouTube Reporting is **UNVERIFIED**. Current schema is SQLite v2; no production migration occurred.

Previous isolated GitHub Mac benchmark: 50 channels, 10,000 videos, 1,000,000 video-day rows, 250,000 retention points; sum migration 65.8 seconds, sum SQL-page queries 0.30 seconds, aggregated SQLite size 488 MB, recorded process RSS sample 18.6 MB, total fixture 89.6 seconds. This is **NOT an M1 physical FPS result**. Benchmark run: https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/42381829058

## 3. Latest complete GitHub CI matrix

Verified code SHA \`e9dd05a2922b356a93eb8fdce4b04100ee210a75\`:

| Gate | Status | Evidence |
|---|---|---|
| macOS ARM64 \`cargo test --locked\`, \`cargo check --locked\` + TS/Vite | **PASS** | https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/42396856763 |
| Linux compile sanity, Rust/TS/Analytics | **PASS** | Same run |
| OAuth/Data Safety | **PASS** | Same run |
| Publisher Safety | **PASS** | Same run |
| Privacy Gate | **PASS** | https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/42396856718 |
| Bundled SQLite/Cargo.lock maintenance | **PASS** | https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/42396856822 |
| Offline preflight synthetic-only | **PASS** | https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/42396856777 |
| Full Vitest *comparative* regression gate | **PASS** | https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/42396856756 |
| Historical full Vitest | **FAIL (inherited)** | 63 existing baseline failures; same main CI run |

### Exact full Vitest counts

- Stable 6.1.15: **1,146** test cases.
- Candidate PR #22: **1,162** test cases.
- Failed in both (inherited): **63**.
- New failed test cases: **0**.
- Baseline cases missing/renamed: **0**.
- New cases: **16**.
- New critical OAuth/Publisher/storage tests failed: **0**.

The independent full suite remains RED; the 6.1.15 comparison shows no *new* test failures. It does **not** prove every inherited failure is harmless.

## 4. Owner-consent offline diagnostic kit

- \`scripts/vyron_macos_offline_preflight.py\`: requires an operator-marked OFFLINE COPY, refuses live Application Support, and only reads selected source metadata. It never reads Keychain or OAuth Vault, calls Google, or modifies source data.
- \`scripts/test_vyron_macos_offline_preflight.py\`: synthetic inline-secret redaction, Channel ID counts/mapping, digest parity, ZIP CRC/SHA and fake secret-field regression.
- \`docs/VYRON_MAC_OFFLINE_RELEASE_VALIDATION.md\`: reproducible owner-approval procedure for isolated JSON/SQLite, M1 and OAuth tests.

The diagnostic output reports hashed profile IDs and Channel IDs but never tokens, email, titles or API keys. Do not upload a real copied state or \`youtube-oauth.json\` to CI/third parties. Real owner data has **NOT** been accessed or tested.

## 5. M1 performance changes and evidence

Commits \`c3c8d694\`, \`e39440c1\`:
- Removed full \`uploadHistory\` and entire \`settings\` object subscriptions from the root React \`App\`; a dedicated ledger observer and scalar subscriptions prevent unnecessary root route rerenders on frequent Publisher patches.
- The already implemented Fleet subtree isolates rapid job/metadata subscription changes; Analytics reads indexed SQLite pages and aggregates and no longer retains massive JSON lifecycle buffers.
- In explicit isolated synthetic M1 Performance Probe mode, capture supported WebKit Long Tasks API durations and isolated IPC latency; unsupported APIs report \`null\`, not zero.

**FPS=60 has NOT been demonstrated** on the owner's physical MacBook Air M1. React render counts, p95 IPC/query latency, CPU/RSS under a real 50-channel network, WebKit long-task availability, external TOSHIBA scan latency and power/thermal behavior still need physical measurements with owner consent.

## 6. OAuth continuity

Existing encrypted vault/Keychain implementation, OAuth client identity, app bundle ID and production accounts were not altered. Synthetic OAuth gate tests independent profile refresh single-flight, mock/transient 401/403/429/5xx and invalid_grant semantics, existing vault and storage continuity.

Still **NOT PROVEN** on a real signed in-place 6.1.15→candidate upgrade: all 35 profiles remain authorized without reconnect after restart/sleep/VPN changes and while the real Keychain is locked. Such verification requires separate owner approval and a verified reversible backup.

## 7. AI ZIP and secret protection

Commits \`22ec7ba4\`, \`1f683507\`, \`412ecbc3\`, \`e9dd05a2\`:
- Before publishing a generated ZIP, Rust checks CRC **and SHA256 for every manifest entry** and verifies exact archive file set. Incorrect archives remain unpublished; \`.partial\` is removed.
- Rust and offline validator reject recognizable serialized OAuth secret fields without logging their values. This is a defense-in-depth heuristic, not an absolute proof against arbitrary secrets hidden in video descriptions.
- Tests inject synthetic byte tampering and fake \`refresh_token\` keys.
- The UI already exposes **«Экспорт всех каналов для ИИ»**. Per-channel API failure is recorded in coverage; available history and partial coverage remain labeled.

Not completed: physical export one/selected/full 35–50 connected channels, all available historical video inventory reconciliation with YouTube Studio, true Google Reporting CTR units, end-to-end AI ZIP completeness under quota/timeouts, and Keychain continuity after a signed update.

## 8. Release decision

**NOT READY FOR PRODUCTION RELEASE.** Draft PR remains unmerged, unsigned/notarized DMG not built or deployed, updater/installed 6.1.15 unchanged. No real YouTube publications or real account operations performed.

**Required owner-approved physical gates:** (1) restorable state + Analytics snapshots; (2) disposable-copy SQLite crash/recovery and parity dry-run; (3) signed app upgrade and per-profile OAuth continuity; (4) actual M1 FPS≥59 and dropped<1% under the full workload; (5) one/selected/full YouTube AI ZIP export and Studio comparison; (6) rollback verification; (7) review all 63 inherited historical test failures before signing/merging.
