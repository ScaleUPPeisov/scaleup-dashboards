# VYRON 6.1.10 — Protected Functional Diff

SAFE_BASE: `588e2070877512daa637077223c678af6a216831`
CURRENT_HEAD: `2d865d0f0de635668d89ed25d7a6f91ff335f861`

Function-aware comparison was performed against SAFE_BASE.

Allowed 6.1.10 metadata-only differences in shared files:
- `src/api.ts`: `YoutubeExistingMutationPatch`
- `src/api.ts`: `api.youtubeUpdateExisting`
- `src-tauri/src/youtube.rs`: `youtube_update_existing_video`

Protected files in the exact-file gate are byte-identical to SAFE_BASE. In the two shared files above, everything outside the allowlisted metadata-only symbols is identical after normalization.

| Protected subsystem | Functional change |
|---|---|
| OAuth transport | NO |
| refresh-token storage | NO |
| native OAuth vault | NO |
| Google credential handling | NO |
| resumable YouTube upload transport | NO |
| account mapping | NO |
| channel identity mapping | NO |
| Publisher transport | NO |
| upload success fingerprints | NO |
| upload completion identity | NO |
| Global Counter persistence | NO |
| Today Counter persistence | NO |

PROTECTED_FUNCTIONAL_DIFF=0
