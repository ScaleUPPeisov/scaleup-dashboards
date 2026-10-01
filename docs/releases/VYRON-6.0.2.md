# VYRON 6.0.2 — macOS Materials Performance / Freeze Hotfix

Status: candidate only — NOT RELEASED.

## Root cause
Opening Production → Materials initiated an N×serial summary load across channels and then a global cleanup preview. The summary path scans ProductionManager/Batches/<channel> and reads batch.json/status.json. The cleanup path traverses project directories and recursively calculates directory sizes.

## Fix
- Materials shell paints before filesystem IPC.
- One aggregated production_materials_summaries IPC replaces N serial per-channel calls.
- Materials summary filesystem work runs in tokio::task::spawn_blocking.
- Global cleanup preview is removed from mount and runs only after explicit ПРОВЕРИТЬ.
- Global cleanup preview/execute traversal runs in spawn_blocking.
- Jobs counters are computed O(jobs) in React and no longer invalidate filesystem summaries.
- Per-channel mutations refresh only the affected channel.
- In-memory stale-while-revalidate summary cache keeps return navigation immediate.
- Generation token prevents stale refreshes from overwriting newer state.

## Protected areas
No changes to Google/OAuth/YouTube credential code, Keychain, migration credentials, application identifier, or updater endpoints.

## Release gate
Do not publish until a production build is tested on a real Apple Silicon M1 20/20 with connected/slow/sleep-wake external storage and updater validation is complete.
