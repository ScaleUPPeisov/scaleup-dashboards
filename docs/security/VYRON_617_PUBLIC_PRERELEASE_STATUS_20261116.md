# VYRON 6.1.17 public prerelease — security status clarification

**Checked:** 2026-11-16  
**Disposition:** public prerelease exists; do not treat it as a stable or approved installer.

## Verified public release state

GitHub release: https://github.com/ScaleUPPeisov/vyron-releases/releases/tag/v6.1.17

- Tag: `v6.1.17`
- Published: `2026-11-12T10:28:39Z`
- `draft=false`, `prerelease=true`
- Assets present: `VYRON-6.1.17-arm64.dmg`, `VYRON.app.tar.gz`, `VYRON.app.tar.gz.sig`, their SHA-256 files, and `source-head.txt`.
- Public stable feed `updates/latest.json` remains at **6.1.15**. The prerelease is not the stable updater target.

This release is distinct from the earlier GitHub Actions candidate runs that exposed the legacy updater signing key:
- Run 43162697963 — 2026-11-12 05:38:11Z
- Run 43177013254 — 2026-11-12 07:40:37Z
- Run 43182381655 — 2026-11-12 08:22:19Z
- Run 43183333106 — 2026-11-12 08:29:15Z

The 6.1.17 prerelease was published later, at 10:28:39Z.

## Evidence that the prerelease used the rotated updater public key

The release notes publish this updater public-key SHA-256 fingerprint:

`6f95fd039839eaa94cb378a67a0205e42e449a84c978674e20c5fb5abcfdfb19`

The PR #22 source at commit `e65bae680637f5c2a8cc60a886a17691d5694263` contains:
- `src-tauri/tauri.617-rotated.conf.json` with the replacement Minisign public key;
- `scripts/macos/test-vyron-617-rotated-public-key.mjs`, which asserts the same fingerprint and rejects the legacy public key;
- `scripts/macos/vyron-617-publish-new-key.sh`, which uses a local owner-held private-key file, prompts for the passphrase without echoing it, builds with the rotated config, and runs `minisign -Vm` against the archive before upload.

The public key embedded in that config hashes to the release-note fingerprint above. The `source-head.txt` asset metadata reports size 41 bytes and SHA-256 `fdaa43ea3e93141c955bbc519359ba1397bb69f6c3998fbffa36e4fc4b8e888b`; this digest matches the 40-character commit SHA `e65bae680637f5c2a8cc60a886a17691d5694263` followed by a newline.

**Evidence boundary:** the connected GitHub interface exposed release-asset metadata and digests, but not the bytes of the uploaded archive or `.sig` file. Therefore this review did not independently re-run Minisign verification against the downloaded public artifact. The source and publication script provide corroborating evidence of local verification before upload; they are not a substitute for an independent verification of the released bytes.

## Why 6.1.17 is still not approved for installation

The release itself explicitly states:
- no Gatekeeper acceptance or notarization is claimed;
- installed 6.1.16 trusts the compromised legacy updater key and cannot safely auto-upgrade to 6.1.17;
- a separately authenticated one-time installation is required.

The publishing script also checks the existing app's bundle identifier and designated requirement, but it does not establish Apple notarization or Gatekeeper acceptance. The replacement updater key authenticates updater archives; it does not make a locally self-signed macOS app trusted by Gatekeeper.

Accordingly:
- Keep stable `updates/latest.json` at 6.1.15.
- Do not enable automatic 6.1.16 → 6.1.17 migration.
- Do not describe the public prerelease as a production-ready or notarized installer.
- Do not use the leaked legacy private key for a bridge release.
- Before any installation recommendation, independently verify the actual release archive signature and SHA-256, verify the macOS code-signing identity, and demonstrate a separately trusted pre-install/bootstrap path on a test Mac with copied user data.

## Correction to earlier incident wording

Any earlier statement that “the rotated-key 6.1.17 artifact was not built” is stale and must not be used as the current release inventory. A public 6.1.17 prerelease exists and its source/configuration evidence indicates use of the replacement updater key. Its installation and production eligibility remain blocked for the reasons above.


## 2026-11-16: independent public-asset verification completed

The read-only verifier workflow passed on the supported `macos-15` runner:

- Run: https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/43888029560
- Release metadata and exact asset allowlist: PASS.
- `source-head.txt` matched `e65bae680637f5c2a8cc60a886a17691d5694263`: PASS.
- Both public asset SHA-256 values: PASS.
- Minisign signature on `VYRON.app.tar.gz` verified against the pinned rotated public key: PASS.
- Mounted DMG app bundle version and identifier `studio.channelflow.desktop`: PASS.
- macOS code-signature integrity check: PASS.
- Signing authority reported by the bundle: `VYRON Local Code Signing`; `TeamIdentifier=not set`.
- Gatekeeper assessment: **REJECTED_OR_UNTRUSTED**.
- Notarization staple validation: **NOT_VERIFIED**.

This resolves the earlier evidence gap: the public updater archive is signed by the rotated updater key and its downloaded bytes match the published checksums. It does **not** make the app installable under normal macOS Gatekeeper policy. The app uses a local code-signing identity with no Team ID, and Gatekeeper rejects it. Do not tell the user to bypass Gatekeeper, remove quarantine, or install this prerelease.

**Disposition unchanged:** keep the stable feed at 6.1.15; do not enable automatic 6.1.16 → 6.1.17 migration. A production-ready installation path still requires a separately trusted bootstrap and an accepted Apple signing/notarization strategy, or another owner-approved installation method proven on a test Mac without weakening platform security.
