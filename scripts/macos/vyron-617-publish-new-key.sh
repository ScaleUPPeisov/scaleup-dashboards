#!/usr/bin/env bash
# Intentionally frozen. No new updater key has been generated and authenticated.
# This script must not publish a prerelease or mutate any release repository.
set -Eeuo pipefail
echo "BLOCKER=UPDATER_KEY_ROTATION_NOT_AUTHORIZED" >&2
echo "No independently generated updater key, authenticated public fingerprint, trusted bootstrap, or owner release approval is present." >&2
echo "Do not place private key material in GitHub, CI, this repository, chat, or shell history." >&2
exit 2
