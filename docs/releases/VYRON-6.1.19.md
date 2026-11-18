# VYRON 6.1.19 — macOS M1 Private Release Candidate

## Included fixes
- Distinguish incomplete YouTube Scheduled coverage from transport/API failures.
- Preserve the last independently verified positive scheduled-video evidence as **historical cache** after later inconclusive syncs, without claiming current schedule is complete.
- Present Scheduled quantity as unknown rather than asserting a false zero.
- Prevent repeated clicks from resubmitting already durable PAUSED/QUEUED/RUNNING upload jobs or rewriting their queued metadata.
- Move video and project Trash operations off the synchronous Tauri handler; keep all canonical-root and project safeguards.

## Provenance and safety
- The installed VYRON 6.1.18 binary on the owner's M1 matches the authenticated source artifact from 8fc66eb85779bae5c8e22f9f7fa4156c7b687c47.
- Source history is an ancestor of this integrated candidate; all changes require full frontend and Rust regression gates.
- This private build uses the independently pinned rotated Tauri updater public key with SHA-256 1c97657fd2a7ba4c2a0ce5b5361518eeacf76da274521b1977d57a55b8dbcec9.
- App bundle is locally ad-hoc signed. This is **not** Apple Developer ID signed or notarized and may be rejected by Gatekeeper when installed as a download.
- Personal candidate artifacts and local test manifests are not production releases and are not published to the stable update feed.

## Outstanding verification
- Real owner's YouTube OAuth/Studio Scheduled coverage across all 33 channels.
- True external HDD throughput and crash-free GUI deletion.
- Durable WebView localStorage queue status and end-to-end no-publish dry runs.
- GUI updater installation with recovery/rollback; no automatic deployment until verified.

No YouTube videos are published, deleted, or modified by this candidate's CI.
