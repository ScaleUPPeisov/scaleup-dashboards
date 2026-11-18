# VYRON PR #22 — one-command Mac owner validation

This validates the available release-candidate gates without merging, releasing,
installing over VYRON 6.1.15, reading Keychain secrets or publishing a video.

## One command on the MacBook Air M1

From the PR #22 source checkout, run:

```bash
scripts/macos/vyron-pr22-release-validation.sh --owner-run \
  --output /private/tmp/vyron-pr22-evidence
```

The launcher first performs source tests while dependencies can be fetched. It
then asks the owner to disconnect Wi-Fi, Ethernet and VPN. It refuses to launch
the physical probe while a default network route exists.

The physical build is deliberately not the production bundle:

- bundle ID: `studio.channelflow.desktop.pr22probe`;
- updater endpoints: empty;
- updater artifacts: disabled;
- HOME, TMPDIR and performance storage: disposable temporary directories;
- workload: 35 synthetic channels, 1,000 jobs and 5,000 metadata rows;
- evidence: every full foreground frame interval, FPS, p50/p95/p99, dropped
  intervals, long frames, route timing, CPU samples and RSS samples.

It never installs the app or changes the stable updater feed. A result is PASS
only if every complete foreground round meets the target. The GitHub runner is
never accepted as physical M1 evidence.

## Optional owner-approved evidence

An existing offline snapshot and AI ZIP can be audited in the same command:

```bash
scripts/macos/vyron-pr22-release-validation.sh --owner-run \
  --output /private/tmp/vyron-pr22-evidence \
  --snapshot /Volumes/Encrypted/VYRON-offline-copy \
  --ai-zip /Volumes/Encrypted/VYRON_AI_ALL_CHANNELS.zip
```

The snapshot must be a copy with `.vyron-offline-snapshot` at its root. Never
pass the live `~/Library/Application Support` directory. The validator is
read-only and does not refresh OAuth.

To compare identical physical runs, supply the stable 6.1.15 schema-3 report:

```bash
scripts/macos/vyron-pr22-release-validation.sh --physical-probe \
  --offline-confirmed --baseline-report /private/path/6.1.15-m1-report.json \
  --output /private/tmp/vyron-pr22-evidence
```

## Signed candidate and rollback gate

Inspecting a candidate does not launch or install it:

```bash
scripts/macos/vyron-pr22-release-validation.sh --automated \
  --candidate-app /private/path/VYRON.app \
  --output /private/tmp/vyron-pr22-evidence
```

The evidence directory records bundle ID/version, `codesign`, Gatekeeper and
notarization/staple results. Signing secrets are never requested by this script.

The following still require explicit owner approval and cannot be certified by
source CI:

1. Make a restorable backup and metadata-only before inventory. Do not export
   token or Keychain item values.
2. Install the signed/notarized RC over 6.1.15 without changing
   `studio.channelflow.desktop` or its signing requirement.
3. After restart and sleep/wake, compare profile count, hashed profile identity,
   Channel ID bindings and reconnect-required count. Any unexpected reconnect is
   a blocker.
4. Compare permitted Analytics samples with YouTube Studio using the same
   Channel ID, date range, timezone and reporting-delay cutoff. Raw Reporting
   CTR remains unverified until its unit is confirmed.
5. Roll back by quitting VYRON, restoring the verified 6.1.15 application and
   the restorable pre-test state copy. Never run two versions on the same state.
6. Re-run the offline preflight. Source hashes, channel history, publication
   history and profile bindings must remain present.

No production release is allowed solely because this launcher passes.
