# PR #22 stabilization — 2026-11-08

Continues `feature/vyron-macos-ultimate` from `be9acc0a`. Draft only; no production installation, Google account operations, Windows runtime changes, release or merge.

## Fixes

- `83bba2b5`: the baseline comparator blocks newly skipped/pending/todo/disabled tests, including failed-to-skipped transitions. Unknown statuses fail closed. Seven local Python policy tests passed. The full GitHub comparison passed with 63 inherited failures and no new failures.
- `484c61ac`: Analytics snapshots are scoped to channel, period, dates, page, sort, content type, video and sync revision before rendering. Delayed responses for another selection are rejected. Missing breakdown measurements stay unknown; percentages are withheld for incomplete denominators. Impossible calendar dates no longer normalize into other days. The GitHub comparison reported 1,146 baseline vs 1,165 candidate cases, 63 inherited failures, zero new failures and zero missing baseline cases.
- `15afd3eb`: native cache reads validate the requested Channel ID against the pointer before SQLite/JSON reads; JSON fallback also verifies overview identity/generation. Synthetic tests reject a foreign cache without mutating the source.
- `6eac377f`: malformed prior history no longer silently becomes an empty array during persistence. Missing required catalog/channel history and corrupt video history, metadata or retained curves stop publication of the new generation. Tests verify unchanged published pointer and original corrupt bytes. Mac ARM64, OAuth and Publisher jobs passed on this code commit; Linux was still running when this note was prepared.
- This commit: M1 probe records the complete interval series of every navigation round, including stalls >=1s. It no longer uses the FPS overlay's rolling 360-frame window or rounded FPS as release evidence. Every round must meet the target and remain visible. Raw intervals and measurement definitions are included in report schema 3. Pure synthetic tests cover early freezes, 58.7 FPS, valid 60Hz intervals and invalid samples. These are instrumentation tests, not physical M1 results.

## Verification limits

Source access and commits used the existing GitHub integration. Direct local git cloning was unavailable, and this local environment has no Rust toolchain. Local checks were Python unit tests and direct Node TypeScript assertions. Full npm/TypeScript/Vite/Vitest and Rust validation run in the existing GitHub Actions jobs; inspect the exact current HEAD before claiming PASS.

The full historical Vitest suite remains red. Its 63 inherited failures have not all been resolved or proven harmless. Examples include obsolete version/source-string contracts, an absent `react-test-renderer` dev dependency and an incomplete Zustand test mock. None were deleted, skipped or relabeled as passing.

## Still blocking release

Physical MacBook Air M1 performance; signed-upgrade Keychain continuity; real owner-data migration/crash recovery; authorized YouTube/Studio parity and CTR scale; complete real AI ZIP acceptance; remaining legacy test failures; Content Style Library/portability/UX scope; signed/notarized candidate and verified rollback.

No claim that the complete master specification or release candidate is finished. Installed 6.1.15, Google credentials, updater feed and production release remain unchanged.
