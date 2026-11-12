# VYRON 6.1.17 — updater signing-key security incident

**Status:** SEV-1 / key presumed compromised / release freeze. **Not an installation instruction.**
**Date:** 2026-11-12. **Scope:** PR #22 (`feature/vyron-macos-ultimate`), Tauri v2 macOS updater.
**Independent customer protection:** Do not publish `v6.1.17`, modify `vyron-releases/main/updates/latest.json`, or re-enable the legacy signing jobs while this incident is unresolved.

## Verified evidence — no secret values reproduced

| GitHub Actions run | Finding | Evidence disposal required |
| --- | --- | --- |
| [43162697963](https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/43162697963) | Unmasked normalized updater private-key representation in public job logs; 6.1.16 production-identity candidate job succeeded | Delete **all logs**; quarantine [artifact 13919076920](https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/43162697963/artifacts/13919076920) |
| [43177013254](https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/43177013254) | Same class of exposure; 6.1.16 candidate signed | Delete **all logs**; quarantine [artifact 13925320276](https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/43177013254/artifacts/13925320276) |
| [43182381655](https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/43182381655) | Same class of exposure; 6.1.17 candidate signed | Delete **all logs**; quarantine [artifact 13927306027](https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/43182381655/artifacts/13927306027) |
| [43182946587](https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/43182946587) | Normalization executed; scanned public job log did not show the same long unmasked form; cancelled before artifact | Preserve metadata; confirm no other secrets |
| [43183179896](https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/43183179896) | Cancelled; detailed job log unavailable when checked | **Not cleared**; investigate GitHub security/audit log |
| [43183333106](https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/43183333106) | Normalization and candidate build passed; no repeated long unmasked key form found in available log | Quarantine [artifact 13926804169](https://github.com/ScaleUPPeisov/scaleup-dashboards/actions/runs/43183333106/artifacts/13926804169), despite clean logging |

Additional failed push runs 43161462119, 43161334527, 43161249594, 43161201017 and cancelled 43160922326 were reviewed for the same indicator: no exposed long normalized key form observed; most did not complete the normalization step. This is a **targeted sample**, not proof that all historic runs are clean. Runs and artifacts are public; copies may exist after GitHub log deletion.

**Classification:** Treat the old updater signing private key as irrevocably compromised. The old public key in already installed VYRON is not secret but still authenticates anything signed with the leaked private key. Existing hashes and a matching old Minisign signature prove file integrity relative to that key, **not trusted provenance after compromise**.

## Delivery and credential exposure surface

- Source repository `ScaleUPPeisov/scaleup-dashboards`: public. Release repository `ScaleUPPeisov/vyron-releases`: public. Connected account reports admin/push rights to both.
- `vyron-releases/main/updates/latest.json` remains on 6.1.15; published release assets exist for v6.1.15; there is no verified published v6.1.16 or v6.1.17 release.
- GitHub branch-protection endpoint returned 403 to the current integration. **Branch protection, token scope and real write workflow permissions are NOT verified.** Do not use a mutation as a 'test'.
- Other historical production release workflows (e.g. `vyron-614-exact-sha-release.yml`, `vyron-335-fast-stable-release.yml`, `vyron-618-macos-release.yml`) reference the legacy updater Actions secret. Freezing only PR22 is not sufficient; revoke the repository-wide secret and audit those jobs before any dispatch.
- No evidence in these targeted checks that the macOS `.p12` certificate's private key or OAuth/Keychain/SQLite data was disclosed. Absence of evidence does not prove safety.
- A self-signed code-signing certificate with a stable designated requirement is **a separate cryptographic identity**, but not the same as Apple Gatekeeper trust. The CI Gatekeeper assessment for the local-signed 6.1.17 app was **REJECTED_OR_UNTRUSTED**. It was not notarized.

## Immediate containment — OWNER ACTIONS, no secrets in chat or logs

1. **Freeze releases and distribution:** keep PR #22 Draft, do not merge or publish; stable feed remains 6.1.15. PR22 signing jobs and the unsigned isolated RC job are set to `if: ${{ false }}`. Neither production-signing nor downloadable RC jobs should be restarted during the incident.
2. In source repository **Settings → Secrets and variables → Actions**, **delete/disable** the existing `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. **Do not upload new key into the same repository-scoped secret** or restore the old key for a bridge build. This cuts off other historic workflows as well.
3. In GitHub Actions, remove **all logs** for runs **43162697963**, **43177013254**, **43182381655**. Delete the associated legacy-signed artifacts, including candidate artifacts **13919076920**, **13925320276**, **13927306027** and **13926804169**, using the Actions UI/API with an authorized owner. If available, export only sanitized metadata and incident evidence, never the private key. Removing logs does not undo prior copies.
4. Check repository Actions permissions, current workflow allowlist, branch protections, environment approvals, and any cross-repository `VYRON_RELEASES_TOKEN`; constrain tokens to minimum permissions and require owner approvals for publishing. Rotate publishing tokens **if exposed or their integrity cannot be established**. Do not modify `updates/latest.json` as a containment test.
5. Read the GitHub organization/repository security and audit events for suspicious workflow runs, artifacts, release writes, secret reads (where available), and changes to `vyron-releases` since the first known exposure. Private-key retrieval itself may leave no usable audit trace.
6. Notify all VYRON maintainers: **do not click/install a 6.1.17 GitHub Artifact**. Block old-key update distribution and annotate legacy release artifacts as untrusted candidates.

## Offline new-key rotation (operator-only, never a CI job)

1. On a trusted, access-controlled Mac **with network disconnected**, create an encrypted new Tauri v2 Ed25519 updater key pair using the project's pinned CLI (`npm run tauri signer generate -- -w <secure-offline-directory>/vyron-updater-2026-rotated.key`). Prompt for a strong unique passphrase interactively, not as a command-line argument. The generated `.pub` is the public portion.
2. Store the new private key and recovery copy in **separate encrypted offline storage**, restricted to designated release owners. Never put its bytes in GitHub, repository files, artifacts, chat, screenshots, logs, shell history, or Actions `GITHUB_ENV`. Store the passphrase separately.
3. Verify the public key independently on another trusted device; record its fingerprint, creation date, and owner authorization in a signed release record. Only this **public** key should eventually be embedded in the new VYRON binary.
4. Build release packages in a controlled environment and **sign offline with the new private key**. Verify the new `.sig` using the new public key, SHA-256, correct `CFBundleIdentifier`, app code signature, designated requirement, and archive contents before any owner-facing candidate is considered.
5. Publish immutable archive digest and release attestation through an **independent authenticated channel** before installation; the old key and editable GitHub manifest do not constitute independent verification.
6. **No blind key swap in `tauri.conf.json` or GitHub Secrets.** Old VYRON 6.1.16 embeds the former key. It cannot authenticate an archive signed only with the new one.

## Bootstrapping pre-existing installations (6.1.16)

The current PR code verifies the downloaded archive with the configured Tauri updater key. For the stable update path, it checks the new on-disk `.app` using `codesign --verify` **after** `update.install(&staged.bytes)`, rather than performing an independently authenticated **pre-install** check. This is not a safe key-migration defense against a compromised old updater key. The actual installed 6.1.16 binary was not available for examination; do not assume that it has a second trusted verification channel.

**Approved only with independently verified handoff:**
- First, obtain a trusted independent owner-signed announcement/fingerprint and verify the physical 6.1.16 app's certificate identity, designated requirement, version, and binary against known-good owner evidence. A code-signature identity and old Tauri signature are two different checks. The presence of the same local self-signed certificate in CI is not by itself a strong out-of-band trust anchor.
- A transitional 6.1.17 bridge may be built which contains the **new public updater key** and fail-closed installation verification. It is eligible for installation only **after** independent verification of its archive and code signature **before the old updater installs it**, using a verifier already trusted by the owner. Merely adding extra checks to the new bridge binary is too late to secure its own installation.
- If the existing 6.1.16 app cannot independently enforce the extra verification before replacement, or if Gatekeeper rejects the bundle, **in-app zero-touch migration is BLOCKED**. Do not quietly fall back to a legacy-key-only update.
- A potential **no-Terminal recovery path** requires a separately trusted, owner-approved GUI installer/verifier plus independently authenticated expected hashes and identity. It must preserve the existing Bundle ID and app-data paths and must pass actual Gatekeeper acceptance on the user's Mac; none of those gates has yet been demonstrated. If it fails, do not instruct users to disable Gatekeeper or clear quarantine.
- After independently verified installation of the bridge, new versions authenticate solely using the rotated key; old key is rejected. Prove replay/downgrade prevention, manifest-URL pinning, explicit version/identity checks, and rollback safety on a disposable replica before production.

## User data and recovery gate

- Keep `studio.channelflow.desktop` exactly; never touch Keychain/OAuth client IDs, channel credentials, 33 channels, original JSON/SQLite, or media.
- Confirm 6.1.16 installed app's **actual** signed bundle and executable identity before any attempt.
- Validate upgrade on a test Mac with a copy of user data first. Compare local SQLite/JSON hashes, project directory hashes, Google account bindings and Keychain references before/after. No live OAuth refresh or channel publishing.
- Test online/offline updater checks, interruption and rollback, Gatekeeper result, and one intentionally tampered old-key-signed payload that the **independent pre-install verifier** rejects.
- Publish only after explicit owner approval, independently verified migration and distribution plan, new-key `.sig` verification, and final protected branch/release review.

## Current candidate verdict

- **Legacy 6.1.17 production-identity artifacts:** QUARANTINED / CRYPTOGRAPHICALLY OLD-KEY SIGNED / NOT RELEASE ELIGIBLE.
- **Rotated-key 6.1.17 artifact:** NOT BUILT (new key intentionally not generated in public CI).
- **Production feed and release:** FROZEN at 6.1.15.
- **No-Terminal, in-app 6.1.16 → 6.1.17:** NOT PROVEN and must not be promised.
- **Independent bootstrap validation:** REQUIRED.
- **Case closure:** only after log/artifact removal, repo-wide old-secret revocation, inspection of release-authority credentials, new offline key and demonstrated physical-device migration or an approved alternative installation path.
