#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
MODE="automated"
OUTPUT=""
SNAPSHOT=""
AI_ZIP=""
CANDIDATE_APP=""
BASELINE_REPORT=""
TIMEOUT_SECONDS=900
OFFLINE_CONFIRMED=0

usage() {
  sed -n '18,40p' "$0" | sed -n 's/^# //p'
}

# VYRON PR #22 release validation (never publishes, installs or modifies Keychain).
#
# Automated source gates:
#   scripts/macos/vyron-pr22-release-validation.sh --automated
#
# One-command owner/M1 run: it prepares the isolated probe, then asks the owner
# to disconnect every network interface before it launches anything:
#   scripts/macos/vyron-pr22-release-validation.sh --owner-run --output /private/tmp/vyron-pr22-evidence
#
# Optional read-only evidence:
#   --snapshot PATH       operator-marked OFFLINE COPY, never live app data
#   --ai-zip PATH         already-created AI ZIP to verify
#   --candidate-app PATH  inspect bundle/signing/notarization without launching it
#   --baseline-report P   schema-3 physical 6.1.15 probe report for comparison
#   --timeout SECONDS     physical probe timeout (default 900)

while (($#)); do
  case "$1" in
    --automated) MODE="automated" ;;
    --owner-run) MODE="owner" ;;
    --physical-probe) MODE="physical" ;;
    --offline-confirmed) OFFLINE_CONFIRMED=1 ;;
    --output|--snapshot|--ai-zip|--candidate-app|--baseline-report|--timeout)
      (($# >= 2)) || { echo "BLOCKER=MISSING_VALUE:$1" >&2; exit 2; }
      case "$1" in
        --output) OUTPUT="$2" ;;
        --snapshot) SNAPSHOT="$2" ;;
        --ai-zip) AI_ZIP="$2" ;;
        --candidate-app) CANDIDATE_APP="$2" ;;
        --baseline-report) BASELINE_REPORT="$2" ;;
        --timeout) TIMEOUT_SECONDS="$2" ;;
      esac
      shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "BLOCKER=UNKNOWN_ARGUMENT:$1" >&2; exit 2 ;;
  esac
  shift
done

if [[ -z "$OUTPUT" ]]; then
  OUTPUT="$(mktemp -d "${TMPDIR:-/tmp}/vyron-pr22-validation.XXXXXX")"
else
  mkdir -p "$OUTPUT"
fi
OUTPUT="$(cd "$OUTPUT" && pwd -P)"
chmod 700 "$OUTPUT"
exec > >(tee "$OUTPUT/run.log") 2>&1

echo "EVIDENCE_DIR=$OUTPUT"
echo "SOURCE_HEAD=$(git -C "$ROOT" rev-parse HEAD)"

python3 - "$ROOT" <<'PY'
import json, pathlib, sys
root=pathlib.Path(sys.argv[1])
package=json.loads((root/'package.json').read_text())
tauri=json.loads((root/'src-tauri/tauri.conf.json').read_text())
probe=json.loads((root/'src-tauri/tauri.pr22-probe.conf.json').read_text())
assert package['version']==tauri['version']=='6.1.15', 'PRODUCTION_VERSION_CHANGED'
assert tauri['identifier']=='studio.channelflow.desktop', 'PRODUCTION_BUNDLE_ID_CHANGED'
assert tauri['bundle']['createUpdaterArtifacts'] is True, 'UPDATER_ARTIFACTS_DISABLED'
assert probe['identifier']=='studio.channelflow.desktop.pr22probe', 'PROBE_NOT_ISOLATED'
assert probe['bundle']['createUpdaterArtifacts'] is False, 'PROBE_UPDATER_ENABLED'
assert probe['plugins']['updater']['endpoints']==[], 'PROBE_NETWORK_ENDPOINT_PRESENT'
print('CONFIG_CONTRACT=PASS')
PY

run_automated() {
  cd "$ROOT"
  npm ci
  npm run build
  npx vitest run src/m1FrameMetrics.test.ts src/v610PerformanceProbeIsolation.test.ts
  python3 -m unittest scripts.macos.test_verify_vyron_pr22_performance scripts.test_vyron_macos_offline_preflight
  cargo test --locked --manifest-path src-tauri/Cargo.toml performance_probe::tests -- --nocapture
  cargo check --locked --manifest-path src-tauri/Cargo.toml
  echo "AUTOMATED_RC_TOOLING=PASS"
}

inspect_candidate() {
  [[ -d "$CANDIDATE_APP" ]] || { echo "BLOCKER=CANDIDATE_APP_NOT_FOUND"; return 2; }
  local plist="$CANDIDATE_APP/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist" | tee "$OUTPUT/candidate-bundle-id.txt"
  /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist" | tee "$OUTPUT/candidate-version.txt"
  codesign --verify --deep --strict --verbose=2 "$CANDIDATE_APP" 2>&1 | tee "$OUTPUT/candidate-codesign.txt" || true
  spctl --assess --type execute --verbose=4 "$CANDIDATE_APP" 2>&1 | tee "$OUTPUT/candidate-gatekeeper.txt" || true
  xcrun stapler validate "$CANDIDATE_APP" 2>&1 | tee "$OUTPUT/candidate-notarization.txt" || true
  echo "CANDIDATE_INSPECTION=RECORDED_NOT_RELEASED"
}

require_offline() {
  if route -n get default >/dev/null 2>&1; then
    echo "BLOCKER=ACTIVE_DEFAULT_NETWORK_ROUTE" >&2
    echo "Disconnect Wi-Fi/Ethernet/VPN and run again. The probe will not launch online." >&2
    exit 2
  fi
  echo "OFFLINE_ROUTE_CHECK=PASS"
}

run_physical_probe() {
  [[ "$(uname -s)" == "Darwin" ]] || { echo "BLOCKER=PHYSICAL_PROBE_REQUIRES_MACOS" >&2; exit 2; }
  [[ "$(uname -m)" == "arm64" ]] || { echo "BLOCKER=PHYSICAL_PROBE_REQUIRES_APPLE_SILICON" >&2; exit 2; }
  [[ "$OFFLINE_CONFIRMED" == 1 ]] || { echo "BLOCKER=OFFLINE_CONFIRMATION_REQUIRED" >&2; exit 2; }
  require_offline
  cd "$ROOT"
  [[ -d node_modules ]] || { echo "BLOCKER=RUN_OWNER_PREPARE_BEFORE_DISCONNECTING" >&2; exit 2; }
  cargo metadata --locked --offline --manifest-path src-tauri/Cargo.toml --no-deps >/dev/null
  VYRON_NON_DISTRIBUTABLE_PROBE=studio.channelflow.desktop.pr22probe CARGO_NET_OFFLINE=true npx tauri build --target aarch64-apple-darwin --bundles app --config src-tauri/tauri.pr22-probe.conf.json
  local app="$ROOT/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/VYRON PR22 Probe.app"
  [[ -d "$app" ]] || { echo "BLOCKER=ISOLATED_PROBE_APP_MISSING" >&2; exit 2; }
  local executable
  executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")"
  local probe_root
  probe_root="$(mktemp -d "${TMPDIR:-/private/tmp}/vyron-pr22-probe.XXXXXX")"
  mkdir -p "$probe_root/home" "$probe_root/tmp"
  local report="$OUTPUT/m1-performance.json" resources="$OUTPUT/m1-resources.csv"
  echo "epoch,pid,cpu_percent,rss_kib" > "$resources"
  env -i PATH="$PATH" HOME="$probe_root/home" TMPDIR="$probe_root/tmp" LANG="${LANG:-en_US.UTF-8}" \
    VYRON_M1_PERF_PROBE=1 VYRON_M1_PERF_ROOT="$probe_root/data" VYRON_M1_PERF_REPORT="$report" \
    "$app/Contents/MacOS/$executable" >"$OUTPUT/m1-app.log" 2>&1 &
  local pid=$! started=$SECONDS
  trap 'kill -TERM '"$pid"' >/dev/null 2>&1 || true' EXIT INT TERM
  while [[ ! -s "$report" ]] && kill -0 "$pid" >/dev/null 2>&1; do
    if (( SECONDS - started > TIMEOUT_SECONDS )); then
      echo "BLOCKER=PHYSICAL_PROBE_TIMEOUT" >&2
      kill -TERM "$pid" >/dev/null 2>&1 || true
      exit 2
    fi
    ps -o pid=,%cpu=,rss= -p "$pid" | awk -v t="$(date +%s)" '{print t "," $1 "," $2 "," $3}' >> "$resources"
    sleep 1
  done
  kill -TERM "$pid" >/dev/null 2>&1 || true
  wait "$pid" 2>/dev/null || true
  trap - EXIT INT TERM
  rm -rf "$probe_root"
  [[ -s "$report" ]] || { echo "BLOCKER=PHYSICAL_PROBE_REPORT_MISSING" >&2; exit 2; }
  local args=(--report "$report" --resources "$resources" --output "$OUTPUT/m1-summary.json")
  [[ -z "$BASELINE_REPORT" ]] || args+=(--baseline-report "$BASELINE_REPORT")
  python3 scripts/macos/verify-vyron-pr22-performance.py "${args[@]}"
  echo "PHYSICAL_M1_PROBE=PASS"
}

if [[ "$MODE" == automated || "$MODE" == owner ]]; then
  run_automated
fi

if [[ "$MODE" == owner ]]; then
  [[ -t 0 ]] || { echo "BLOCKER=OWNER_RUN_REQUIRES_INTERACTIVE_TERMINAL" >&2; exit 2; }
  echo "Preparation passed. Now disconnect Wi-Fi, Ethernet and VPN."
  read -r -p "Type OFFLINE to continue with the isolated physical probe: " answer
  [[ "$answer" == OFFLINE ]] || { echo "BLOCKER=OWNER_ABORTED_BEFORE_PHYSICAL_PROBE"; exit 2; }
  OFFLINE_CONFIRMED=1
  run_physical_probe
elif [[ "$MODE" == physical ]]; then
  run_physical_probe
fi

if [[ -n "$SNAPSHOT" ]]; then
  preflight=(--snapshot "$SNAPSHOT" --report "$OUTPUT/offline-preflight.json")
  [[ -z "$AI_ZIP" ]] || preflight+=(--ai-zip "$AI_ZIP")
  python3 "$ROOT/scripts/vyron_macos_offline_preflight.py" "${preflight[@]}"
  echo "OFFLINE_SNAPSHOT_PREFLIGHT=PASS"
elif [[ -n "$AI_ZIP" ]]; then
  echo "BLOCKER=AI_ZIP_REQUIRES_OPERATOR_MARKED_SNAPSHOT" >&2
  exit 2
fi

if [[ -n "$CANDIDATE_APP" ]]; then
  inspect_candidate
fi

echo "VALIDATION_COMPLETE=AVAILABLE_GATES_ONLY"
echo "EVIDENCE_DIR=$OUTPUT"
