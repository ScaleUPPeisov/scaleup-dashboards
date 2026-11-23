# VYRON Studio — design release acceptance / rollback

**Status:** DRAFT UI release candidate; PR #68. **Not approved for production installation.**

## Source and non-negotiable preservation

- Design is based on historical source snapshot `aba416bf`, corresponding to the 6.1.17 period, **not** a bit-for-bit copy of the owner's installed DMG. The repository's underlying `package.json` / Tauri config still report 6.1.15; the isolated preview override sets the app version label to 6.1.17. Never claim that these bits are the original binary 6.1.17.
- User's known-good installed `/Applications/VYRON.app` version **6.1.17** stays in place until an explicit acceptance decision after tests.
- Local state, SQLite databases, sidecar files, macOS Keychain, OAuth credentials, all 33 channels, rendered-video paths, upload history, schedules and previous backups are out of scope. **Do not read, migrate, reset or write their production copies during UI testing.**
- Do not merge PR #68, publish the stable feed, ship a signed release or replace the installed app as part of CI.
- The GUI review candidate uses separate Tauri identifier `studio.channelflow.preview`, the `owner-preview` update channel, empty update endpoints and disabled updater artifacts. It is a **debug app**, not an Apple notarized release.
- **Separate bundle identifier is insufficient data isolation.** Native paths (including `~/Documents/VYRON`) and Keychain implementation may still overlap. The owner's normal macOS account is **not an acceptable test environment**.
- Use an ephemeral macOS CI runner and/or a dedicated disposable local macOS user account, with internet disabled and only synthetic fixtures. Never import actual OAuth tokens.

## UI work areas (nine navigation destinations)

| Area | UI requirements | Functional baseline |
| --- | --- | --- |
| Dashboard | KPI hierarchy, no unnecessary borders; readable controls and quota | Real statuses and counters remain untouched |
| Channels | Compact channel cards, filters and legible scheduling numbers | Full channel bindings, sort/filter/actions |
| Production | Source controls, render queue, per-video actions, errors | No deleted output files or changed scheduling |
| Inventory | Scannable stock table, clear status typography | Never change actual file ownership/evidence |
| History | Distinguish recorded evidence, errors, uploaded and audit events | No altered event interpretation |
| YouTube | Publishing, metadata, schedule, uploaded, command, runway, statistics, history, accounts tabs | Every original action and warning remains present |
| Analytics | Chart grouping, readable legends and tables | Real data remains authoritative; never render unknown as zero |
| Competitors | Legible comparisons and consistent card hierarchy | Existing API calls, quotas and filters unchanged |
| Settings | Clear tabs, toggles and advanced technical details | Never change encryption/OAuth/updater behavior |

## Visual and accessibility acceptance

- Test **1360×880**, **1200×800**, **980×700** desktop windows.
- Sidebar collapses to approximately 74 px and reopens; icon-only mode has hover titles and `aria-label`, keyboard focus visible. No stored business-data preference changes.
- Every menu and subtab reachable via mouse and keyboard. Nothing is hidden by `display:none`/opacity-only rules.
- Typography is readable; 10–13 px secondary labels do not make vital actions unreadable.
- All channel counts, Scheduled/partial statuses, final YouTube dates and local-video queue counts retain their original meaning.
- Workspaces scroll without horizontal clipping or content trapped behind overlays.
- Test reduced-motion OS preference.
- The Publisher keeps source selection, metadata, thumbnails, schedule mode, preview, preflight and upload/cleanup safeguards.
- A live API sync and real upload **must not** occur in synthetic design review.

## Automated evidence

1. `npm ci --no-audit --no-fund`
2. `npm test -- src/vyronStudio.test.ts`
3. `npm run build` (TypeScript and Vite)
4. Existing full historical Vitest regression, publisher-safety, OAuth continuity, Linux Rust and macOS ARM64 jobs.
5. `npx tauri build --debug --target aarch64-apple-darwin --bundles app --config ...` with separate bundle identity; preflight verifies bundle ID, version label and ARM64.
6. Optional disposable runner launch: reports **process-alive** only, NOT visual or 33-channel integration verification.
7. Artifact `VYRON-Studio-6.1.17-M1-DEBUG-ISOLATED-PREVIEW-NOT-PRODUCTION` with a README and truthful smoke-result evidence.

**A green CI does not prove that the old binary reads the owner's current data correctly.**

## Gates for any future production candidate (not part of this PR)

- Real visual screenshots and manual review from isolated user; log any clipped Russian labels.
- Verify exact nine navigation destinations and every YouTube Publisher action with **synthetic** sources.
- Review a diff against known-good functional state. UI-only by design; any Rust/SQLite/API change requires separate PR and acceptance.
- Prepare a signed/notarized, **distinct version and trusted updater key** using an owner-controlled trust chain. Do not reuse exposed legacy signing material or disable build.rs production trust checks.
- Make a fresh verified full backup of the current user's application and data, without overwriting existing backup.
- Explicit release approval **after** owner sees the interface and all tests are complete.
- Physical rollback instructions must restore both binary and schema-compatible user data as a consistent snapshot.

## Rollback of source-only design

- Drop the two Studio CSS imports in `src/main.tsx`.
- Drop the `vyronStudio` class, `studioSidebarCollapsed` state and `studioSidebarToggle` button in `src/App.tsx`.
- The design change is contained in new CSS and these few `App.tsx` UI lines; the original functional modules are not modified.
