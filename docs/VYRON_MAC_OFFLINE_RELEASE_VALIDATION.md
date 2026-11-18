# VYRON Mac Ultimate — release validation on an OFFLINE copy

**Status:** Draft PR #22. No production release, no signed DMG, no in-place install.
**Baseline:** VYRON 6.1.15, commit \`51ba3f9e3f9526e101ec69e86c1bdd2fe496a7e2\`.
**Test isolation:** the working application, OAuth Vault, Keychain, accounts and video jobs are out of scope unless the owner grants fresh permission.

## 1. Offline, metadata-only audit (no Google APIs)

\`scripts/vyron_macos_offline_preflight.py\` uses Python stdlib only. It has no Google/Keychain/network calls and does not mutate the input snapshot or SQLite source. It refuses a live \`~/Library/Application Support\` path and requires an explicit marker.

Create a **consented, local, offline copy** in an encrypted location, ideally after VYRON is fully stopped or from a consistent APFS snapshot. Include only:

- \`state.json\` — local state metadata, which may still contain private operational content;
- \`youtube-oauth.json\` — **may include legacy inline credentials**: never upload this file or the snapshot to GitHub, ChatGPT, CI, ticketing, cloud storage or third parties;
- \`AIAnalytics/cache/UC.../\` — immutable published JSON generations, the pointer and SQLite database with associated WAL/SHM files, if present.

**Do not copy OAuth Vault or macOS Keychain.** Never copy the original \`Application Support\` directory directly into GitHub Actions. This tool is not authorized to read user data at development time.

Place a plain text file \`.vyron-offline-snapshot\` at the root of that copied folder as an explicit operator opt-in.

Run **on the owner's Mac only after permission**:

\`\`\`bash
python3 scripts/vyron_macos_offline_preflight.py \
  --snapshot "/path/to/encrypted/offline-snapshot" \
  --report "/path/to/encrypted/private-report.json" \
  --ai-zip "/path/to/previously/exported/AI.zip"
\`\`\`

The ZIP parameter is optional. The tool **validates** an existing ZIP; it does not create an archive, refresh Google credentials or connect to YouTube.

The report contains: state SHA256, count and IDs of connected channels, hashed profile identifiers, profile count, orphan/mismatched channel mapping counts, current JSON generation, SQLite integrity/foreign-key checks, source-digest match, **value parity** (per-channel, per-video, traffic, audience, events, retention, raw reach), ZIP CRC and per-file SHA256, CSV video count and explicit untested physical checks. It does **not** contain emails, OAuth client IDs, token values, video titles or raw metric payloads. Diagnostic errors are expressed as fixed labels rather than exceptions with sensitive paths.

Outputs are created privately (\`0600\`) **outside the input snapshot**, and an existing report is not overwritten. A source SHA256 is non-reversible but should still be treated as private metadata.

An offline snapshot missing the current verified SQLite marker is reported as NOT VERIFIED; the script does not replace it with a blank database. Errors are fail-closed.

## 2. Reversible SQLite migration acceptance

Must be run on an **additional writable copy**, never on original files. Use the same pinned version of the Rust application and database schema.

1. Confirm \`ui-current.json\` Channel ID and generation UUID, immutable source JSON, and expected source digest.
2. Capture initial file checksums and counts, including \`state.json\`; do not hash plaintext tokens into public logs.
3. Migrate A, then B, then A, then B. Verify each generation's exact channel-day and video-day values, and that receipts for prior generations remain.
4. Kill a disposable test process before COMMIT. Verify the last committed SQL remains valid and no blank history appears.
5. Simulate a corrupted JSON file, digest change and truncated SQLite **only on disposable copies**. Confirm explicit recovery errors and original source bytes unchanged.
6. Validate WAL reopen, \`foreign_key_check\`, \`integrity_check\`, schema version, no cross-channel rows, repeated import idempotency, concurrent readers and writers.
7. Compare source JSON to SQL **by value** for views, subscriber changes, retention curve metadata, raw CTR/reach, events, traffic and audience. The numeric CTR scale from Google Reporting remains **UNVERIFIED**, so no fabricated percentages.

Synthetic tests and GitHub runner PASS are necessary but not sufficient for a production migration.

## 3. Google profile / Keychain continuity test (requires owner approval)

No secrets may appear in test artifacts. Before/after metadata must include: profile count, distinct Channel ID count, hashed profile identity, binding status and per-profile status; **not** email, refresh/access token, OAuth client secret or Keychain item value.

Test app restart, token expiry, concurrent refresh for one Google profile, 35 independent profiles, 401/403/429/5xx/timeout, offline mode, VPN change and locked Keychain using mocked transport and disposable credentials first.

A real signed 6.1.15→candidate **in-place** upgrade is a **separate explicit-approval event**. Testing with a changed app bundle identifier is not equivalent to an in-place Keychain continuity test. Before any approved real upgrade: check full restorable backups and recovery, do not run a second production instance against the same state, record metadata-only inventory and verify zero unexpected reconnect requests. Never modify, rotate, export or log real refresh tokens during diagnostics.

## 4. Physical MacBook Air M1 performance protocol

Use existing \`M1PerformanceProbe\` only in its isolated synthetic mode (35 channels, 1,000 jobs, 5,000 metadata records, 3 rounds), and run the *same* test against stable 6.1.15 under comparable conditions. The GitHub macOS-15 runner **is not** the physical M1.

Capture on-device:
- Display refresh rate, power/thermal state, macOS and WebKit versions, RAM pressure, CPU usage, file system and external TOSHIBA status.
- For Dashboard, Channels, Fleet, Publisher, Analytics 360, video catalog, individual video page and AI export: FPS median, p50/p95/p99 frame time, % dropped, 50+ ms long tasks, route switch time and render counts if profiling instrumentation is available.
- SQLite: p50/p95/slowest query duration and row count; IPC: p50/p95 latency; React/Zustand: subscription/re-render counts; memory: RSS + allocation sampling; SVG: draw/DOM complexity; file system: scan duration and bytes on external TOSHIBA.
- Test both warm and cold caches, background sync active/inactive, 50 channels when available, and a sustained 5-minute interaction workload.

Target **FPS ≥59** and **dropped frames under 1%**, without suppressing expensive pages or removing features. A 60 FPS claim is forbidden until measured on the real M1 and compared with 6.1.15.

## 5. AI ZIP (real YouTube authorization requires separate owner approval)

The offline preflight can verify an **existing** ZIP's CRC, manifest SHA256, expected file set, CSV fields and declared-versus-exported video counts. It makes no Google API requests.

Physical, explicitly authorized end-to-end tests must cover one, selected, and all connected channels; every discovered video; available daily history; Reach/CTR; subscriber changes; retention; findings; Winner Engine; AI README and AI PROMPT. Missing API metrics remain null/unknown, and an unavailable channel is clearly marked as incomplete without blocking trustworthy results from other channels. Compare permitted samples with YouTube Studio by channel and date, accounting for YouTube Analytics time zone and reporting delays.

## 6. Release blocker matrix

| Gate | GitHub isolated CI can establish | Owner's physical Mac still must prove |
|---|---|---|
| SQLite/WAL | Transaction safety, schema, digest, FK, synthetic parity, 1M-row benchmark | Consistent snapshot parity, crash/restore on copy |
| OAuth | Mocked multi-profile semantics, vault tests | Signed in-place app upgrade preserves real authorizations |
| Publisher | Synthetic upload and schedule transport tests | No real uploads until separate approval |
| AI ZIP | Archive code tests, existing-ZIP integrity validator | One/selected/full network API completeness |
| FPS | Scenario coverage and compile | Actual sustained 60Hz foreground M1 metrics |
| Release | Draft PR and source CI | Owner approval, signed/notarized DMG, recoverable upgrade |

**Never merge PR #22, modify production 6.1.15, run live channel sync or publish a DMG solely because CI passes.**
