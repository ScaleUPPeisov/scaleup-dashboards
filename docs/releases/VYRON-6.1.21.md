# VYRON 6.1.21 — private owner evidence hotfix (macOS ARM64)

**Owner only. Never publish the public Stable update feed.**
This release fixes misleading confidence and incomplete diagnostics after the 6.1.20 fleet scan.

## Verified incident
- 33 channels processed, 18 scheduled confirmed, 13 partial, 2 mislabeled API_FAILED; 14 deep search attempts and 163 HTTP inventory calls.
- Mac persistence showed 18 CONFIRMED_SCHEDULE and 15 PARTIAL_DATA; no channel or OAuth loss.
- On the owner's Mac, uploadHistory has 1012 rows but **no video-ID history for Neon Drive FM**. This legacy channel needs owner-scoped search or already-known verified video IDs.
- General and Search Queries quotas are separate; General quota had plenty of remaining units.

## Code changes
- A successful authenticated owner response with non-exhaustive evidence is PARTIAL_DATA, **never** an API transport failure or a confirmed zero.
- Wrong Channel ID or cross-channel video evidence is still blocked.
- Persist allowlisted reason codes per channel, e.g. OWNER_SEARCH_PAGE_LIMIT, OWNER_SEARCH_NOT_EXHAUSTED, SCHEDULE_EMPTY_NOT_INDEPENDENTLY_VERIFIED.
- Preserve last fresh verified Scheduled lower-bound separately from the older cached deadline; display and sort using the same visible date.
- Targeted explicit owner search can inspect up to 12 pages, full-fleet up to 4 per channel, constrained by the actual remaining Search bucket with a 12-call reserve. No background search.
- Inventory General cost excludes Search bucket calls; API request count still includes all HTTP calls.
- Local HDD READY continues to be separate from confirmed YouTube scheduled dates.

## Safety and limitations
- Never claim 33/33 confirmed solely because 33 rows were processed.
- A bounded search may still fail to exhaust legacy channels with many uploaded videos; the status stays PARTIAL_DATA and no false zero is written.
- Frontend and native Rust gates, signed private ARM64 artifact, real Mac guarded backup/install, and read-only 33-channel postinstall checks are required before release.
- Keep user data, OAuth, Keychain, and public Stable feed unchanged.
