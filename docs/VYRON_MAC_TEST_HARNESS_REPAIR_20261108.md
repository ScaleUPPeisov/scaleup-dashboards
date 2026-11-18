# PR #22 — historical test harness repair

Continues verified code HEAD `d5e33c7c3459456a41ea21c0eb07a226ecabdeaf`.
Its GitHub macOS ARM64, Linux, OAuth, Publisher, Privacy, Offline and baseline comparison jobs passed. The historical full suite remained red.

## Root causes and changes

1. Two Publisher UI tests could not import `react-test-renderer`. Declare the existing harness as an exact dev dependency matching the locked React 19.2.8 version, with an npm-generated lockfile. Product React and runtime dependencies are unchanged. Configure React act and unmount inside act; no assertions removed.
2. The five global-channel selector tests could not execute because their selector-only fake lacked Zustand's `subscribe`. Use the real Zustand hook implementation around synthetic fixture data, restoring subscription/getState behavior.
3. The quota project-isolation test still expected a fictional default upload limit. Current quota code intentionally uses `unknown` and null until configured. Assert that all limit/remaining fields for the other project stay null while the configured project retains 500.
4. The regression comparator treated the disappearance of a synthetic suite-import-error marker as deletion of a test. Classify it as recovered only when actual cases from the exact same file execute without failures or skipped statuses. Genuine missing/renamed tests still fail. Two added Python tests cover recovery, failed/skipped/empty/different-file cases and real deletions.
5. Include these harness tests in both strict platform jobs and trigger the workflows on package manifest/lock changes.

## Local evidence

- `npm ci`: completed before changes; new dev dependency installed using npm with generated integrity entries.
- TypeScript + Vite production build: passed. Existing large-chunk warning remains.
- Focused Vitest: 16/16 passed across all three repaired files.
- Python comparator: 9/9 passed.
- Full Vitest before (d5e33c7c): 1,168 assertions plus one failed-suite placeholder; 62 failed assertions plus one suite error (63 failure entries).
- Full Vitest after: 1,173 assertions, 59 failures, zero skipped. Five previously unimportable assertions now execute.
- Local before/after comparison: four failure entries resolved, zero new failures, zero real baseline cases removed. This local comparison is against d5e33c7c; the GitHub workflow separately compares the exact stable 6.1.15 source.

The remaining 59 failures are not waived. No production data, Google credentials, updater, Windows runtime or application version changed. No merge, DMG or physical-M1 claim. The full master specification remains unfinished.

## Follow-up: exercise the Autopilot entry point

Commit `377b1d69` passed the exact 6.1.15 GitHub baseline comparison: 1,146 baseline cases vs 1,173 candidate cases; 59 inherited failures, zero new failures, zero missing real cases, one recovered import-error suite.

The legacy OAuth-gate test matched an obsolete boolean expression that rejected an explicit zero limit. Current behavior deliberately supports explicit unlimited mode (zero), while missing configuration blocks work. Replace the source-text assertion with calls to `runYoutubeAutopilotForChannel` using mocked transport. Verify missing OAuth, disabled autopilot, disabled safe mode and missing daily limit each prevent session lookup, upload and resume. Existing eligibility tests separately cover explicit zero.

After this follow-up: 8/8 focused Autopilot tests and TypeScript passed. Full local Vitest: 1,173 assertions, 58 failures, no skips; comparison against d5e33c7c resolves five failure entries with no new failures and no real test deletions. The remaining 58 failures are still release blockers; they have not been waived.
