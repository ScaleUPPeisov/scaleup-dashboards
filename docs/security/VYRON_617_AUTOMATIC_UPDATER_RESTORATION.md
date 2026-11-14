# VYRON 6.1.17 — restoring automatic updates for the owner and future public users

**Status:** implementation prepared; release NOT authorized, signing key NOT rotated,
no installer published. This note does not override
`VYRON_617_UPDATER_KEY_INCIDENT_2026-11-12.md`.

## Product goal

A user installs VYRON once. Subsequent releases appear in **VYRON → Settings →
Updates** and install over the existing application without sending links, logging
back into YouTube or deleting local data. Keep the existing GitHub updater service:

`https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/latest.json`

Keep the production bundle identifier `studio.channelflow.desktop`.
The updater code in `src-tauri/src/updater_bridge.rs` already implements
check → download → signature verification → installation → relaunch.
No wholesale updater rewrite is needed.

## Why the installed 6.1.16 cannot be silently switched

6.1.16 contains the **old** Tauri public key. Its private key was disclosed in
public CI. A release signed **only** with a new private key fails verification in
6.1.16; a release signed **only** with the old key has no trustworthy provenance.
An editable GitHub JSON manifest plus SHA-256 is not an independent authentication
factor. The current installed 6.1.16 is not known to contain an independent
pre-install validation anchor. Consequently zero-touch upgrade to a new trusted
root is **not established**. Do not turn the old signer back on to bypass this.

This is a **one-time key-trust migration for existing installations**, not a
need to redistribute installers for every future release. New installations
can start directly with the rotated public key.

## Code prepared in PR #22

`scripts/macos/prepare-vyron-rotated-updater.mjs` accepts an independently
generated **public** minisign key and writes a temporary Tauri config overlay
with version >= 6.1.17, the unchanged bundle ID, original stable GitHub update
endpoint, `createUpdaterArtifacts: true`, and **the new public key**.
It rejects the old public key and never accesses the signing private key or
modifies the tracked `src-tauri/tauri.conf.json`.

Synthetic-only tests:
`node --test scripts/macos/test-vyron-rotated-updater.mjs`

## Release operator gate: only after separate approval to rotate the key

1. In an approved secure environment, generate a fresh Tauri updater key pair.
   Encrypt and retain the private key and backup **outside the public repo,
   CI logs, artifacts and chats**. Record the independently verified public-key
   fingerprint; obtain explicit ownership approval. Do not reuse the leaked key.
2. Prepare a candidate config (example paths are placeholders):
   `node scripts/macos/prepare-vyron-rotated-updater.mjs --public-key-file /private/approved/new.pub --output /private/tmp/vyron-617-rotated.json --version 6.1.17`.
   The tool prints a *public-key* fingerprint, not the private material.
3. Build an ARM64 candidate with that overlay and sign its updater archive
   **with the matching new private key** in a controlled signing environment.
   Never include the private key in a source commit, PR, workflow debug output,
   artifact, or broad repository-scoped secret.
4. Independently verify the new `.sig` against the **new** public key,
   SHA-256, executable/app identity, version, archive contents, Gatekeeper
   outcome, and exact GitHub release digest **before** offering the installer.
   Test an intentionally tampered archive (must reject), a previously
   old-key-signed archive (must reject), no-network and interrupted installs.
5. On a disposable Mac with a verified copy of a real 6.1.16 state,
   test the one-time trusted GUI replacement. Preserve bundle ID,
   application support and Keychain identity; verify the channel count,
   OAuth continuity, SQLite integrity, analytics snapshots and ENDLUME paths.
   Without Apple Developer notarization, Gatekeeper may require an explicit
   macOS **Privacy & Security → Open Anyway** user action, and the
   self-signed app may be rejected. Do not disable Gatekeeper globally.
6. **Only after** provenance and installation have been proven, publish the
   immutable new-key-signed release assets to `vyron-releases` and atomically
   update `updates/latest.json` to the new version, SHA-256 and signature.
   Secure release-token permissions and protect deployment approvals.
   An archive built in CI without a trustworthy signing step is NOT a release.

## Once the new root of trust is installed

Every subsequent version (6.1.18, 6.1.19, 6.2.0...) can use the same public
key and the SAME `updates/latest.json` endpoint. The release pipeline signs
with the corresponding secured private key and publishes the manifest only
after successful integrity and installation checks. VYRON automatically
detects new versions and offers the normal in-app download/install workflow.
Users do not need a new link for each update.

## Gatekeeper and distribution

Tauri update signatures and Apple code signing/notarization are separate
systems. A Tauri-signature-valid archive is not automatically trusted by
macOS Gatekeeper. If the owner will not enroll in Apple Developer Program,
do not promise seamless first launch for every public user. Existing-owner
migration and independent GUI installation must be validated, not assumed.

## Rollback

Before replacing 6.1.16: preserve a restorable application copy and encrypted
snapshot of app-data/SQLite/OAuth metadata without exposing secrets. Never
launch two different versions against the same mutable database. A rollback
that crosses a migration boundary must restore the matching state snapshot,
not only an older .app file. Verify old/new bundle identity, channels, jobs,
profile mappings and user media references before any release approval.

## Current blockers

- New cryptographic key pair and independently authenticated public fingerprint
  are NOT supplied. No newly signed 6.1.17 archive exists.
- The installed 6.1.16 cannot be modified in place from GitHub, and no
  pre-existing independent 6.1.16 trust anchor has been proven.
- Gatekeeper acceptance and one-time GUI migration on the real M1 not tested.
- Historic legacy signer remains quarantined. PR #22 Draft and stable feed
  remain unchanged; owner data untouched.

## 2026-11-14 PR #22 follow-up — release remains frozen

The previously tracked `tauri.617-rotated.conf.json` and `tauri.618-rotated.conf.json`
files contained a candidate public-key value, but their presence and matching
fingerprints do **not** prove that a fresh private/public key pair was generated
offline or that the public fingerprint was independently authenticated.
They are not release authority and must not be used to sign or publish an update.

The previous `vyron-6118-macos-new-key-release.yml` workflow contained
fallbacks to legacy repository signing secrets and could publish to the Stable
feed after a branch push. It is frozen: no push trigger, no signing secrets,
no build, no artifact publication and no Stable feed mutation. The stable feed
remains at 6.1.15.

The updater diagnostics now report the embedded Tauri configuration's actual
endpoint, public-key format, key ID and SHA-256 fingerprint. A structurally
valid public key is **not** a statement that its trust has been independently
verified. The UI must explicitly show that distinction.

The build script accepts an explicit numeric build revision, exact Git commit
and update channel. When explicit build metadata is absent, it derives the commit
and a numeric revision from the checked-out Git repository (using the commit
timestamp for shallow clones). Only source archives without Git metadata fall
back to revision 0 / commit `development`.

No key generation, private-key upload, release, merge or production update is
authorized by this code change.

A future build must also set `VYRON_TRUSTED_UPDATER_PUBLIC_KEY_SHA256` to the
independently authenticated SHA-256 fingerprint of the decoded 42-byte Minisign
public-key payload. Without that explicit build-time trust anchor, VYRON reports
`NOT_INDEPENDENTLY_VERIFIED` and blocks Stable/Owner Preview update checks and
downloads. A valid key format or pinned feed URL alone never authorizes an update.
