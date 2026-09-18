#!/bin/bash
set -Eeuo pipefail
umask 077

IDENTITY_NAME="${VYRON_SIGNING_IDENTITY:-VYRON Local Code Signing}"
REPO="${VYRON_GITHUB_REPO:-ScaleUPPeisov/scaleup-dashboards}"
OUT_DIR="${VYRON_SIGNING_DIR:-$HOME/Documents/VYRON-Signing}"
P12="$OUT_DIR/VYRON-Local-Code-Signing.p12"
B64="$OUT_DIR/VYRON-Local-Code-Signing.p12.base64"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: run this once on the user's Mac."
  exit 1
fi

command -v openssl >/dev/null || { echo "ERROR: openssl is required"; exit 1; }

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

identity_sha1() {
  security find-identity -v -p codesigning 2>/dev/null |
    grep -F "\"$IDENTITY_NAME\"" |
    awk '{print $2; exit}'
}

resolve_user_keychain() {
  local candidate

  candidate="$(security default-keychain -d user 2>/dev/null | tr -d '"' | sed -E 's/^[[:space:]]+//;s/[[:space:]]+$//' || true)"
  if [[ "$candidate" == "~/"* ]]; then
    candidate="$HOME/${candidate#~/}"
  fi
  if [[ -n "$candidate" && -e "$candidate" ]]; then
    printf '%s' "$candidate"
    return 0
  fi

  candidate="$HOME/Library/Keychains/login.keychain-db"
  if [[ -e "$candidate" ]]; then
    printf '%s' "$candidate"
    return 0
  fi

  while IFS= read -r candidate; do
    candidate="$(printf '%s' "$candidate" | tr -d '"' | sed -E 's/^[[:space:]]+//;s/[[:space:]]+$//')"
    if [[ "$candidate" == "~/"* ]]; then
      candidate="$HOME/${candidate#~/}"
    fi
    if [[ -n "$candidate" && -e "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done < <(security list-keychains -d user 2>/dev/null || true)

  return 1
}

verify_designated_requirement() {
  local sha1="$1"
  local tmp probe dr
  tmp="$(mktemp -d)"
  probe="$tmp/vyron-signing-probe"
  cp /bin/echo "$probe"
  codesign --force --sign "$sha1" "$probe"
  codesign --verify --strict --verbose=2 "$probe"
  dr="$(codesign -d -r- "$probe" 2>&1 | sed -n 's/^designated => //p')"
  rm -rf "$tmp"
  [[ -n "$dr" && "$dr" != cdhash* ]] || {
    echo "ERROR: designated requirement is still cdhash-only"
    exit 1
  }
  printf '%s' "$dr"
}

read_existing_p12_password() {
  read -r -s -p "Enter the password for the existing encrypted VYRON .p12: " P12_PASSWORD
  echo
  [[ -n "$P12_PASSWORD" ]] || { echo "ERROR: empty .p12 password"; exit 1; }
}

read_new_p12_password() {
  read -r -s -p "Create a strong password for the encrypted VYRON .p12: " P12_PASSWORD
  echo
  read -r -s -p "Repeat the .p12 password: " P12_PASSWORD_2
  echo
  [[ -n "$P12_PASSWORD" && "$P12_PASSWORD" == "$P12_PASSWORD_2" ]] || {
    echo "ERROR: passwords do not match"
    exit 1
  }
  unset P12_PASSWORD_2
}

p12_cert_sha1() {
  local tmp cert_sha1
  tmp="$(mktemp -d)"
  openssl pkcs12 -in "$P12" -nokeys -passin "pass:$P12_PASSWORD" -out "$tmp/certs.pem" >/dev/null 2>&1 || {
    rm -rf "$tmp"
    return 1
  }
  cert_sha1="$(
    openssl x509 -in "$tmp/certs.pem" -noout -fingerprint -sha1 2>/dev/null |
      sed 's/^sha1 Fingerprint=//I;s/://g'
  )"
  rm -rf "$tmp"
  [[ -n "$cert_sha1" ]] || return 1
  printf '%s' "$cert_sha1"
}

verify_p12_matches_identity() {
  local sha1="$1"
  local cert_sha1
  cert_sha1="$(p12_cert_sha1)" || {
    echo "ERROR: cannot open .p12 with the supplied password"
    exit 1
  }
  if [[ "${cert_sha1^^}" != "${sha1^^}" ]]; then
    echo "ERROR: the .p12 does not contain the exact existing VYRON signing identity"
    echo "LOCAL_CERT_SHA1=$sha1"
    echo "P12_CERT_SHA1=$cert_sha1"
    exit 1
  fi
}

rewrap_p12_for_macos() {
  local tmp bundle compat before_sha after_sha backup
  tmp="$(mktemp -d)"
  bundle="$tmp/vyron-bundle.pem"
  compat="$tmp/vyron-macos-compatible.p12"
  backup="$P12.openssl-default.bak"

  before_sha="$(p12_cert_sha1)" || {
    rm -rf "$tmp"
    echo "ERROR: cannot inspect existing .p12 before compatibility conversion"
    exit 1
  }

  # The original PKCS#12 may be perfectly readable by OpenSSL but rejected by
  # macOS Security.framework when OpenSSL 3 uses newer PBES2/AES defaults.
  # Re-export the SAME cert/private key with conservative PKCS#12 algorithms.
  openssl pkcs12 -in "$P12" -nodes -passin "pass:$P12_PASSWORD" -out "$bundle" >/dev/null 2>&1 || {
    rm -rf "$tmp"
    echo "ERROR: cannot extract the existing .p12 for macOS compatibility conversion"
    exit 1
  }

  openssl pkcs12 -export \
    -in "$bundle" \
    -name "$IDENTITY_NAME" \
    -out "$compat" \
    -passout "pass:$P12_PASSWORD" \
    -keypbe PBE-SHA1-3DES \
    -certpbe PBE-SHA1-3DES \
    -macalg sha1 \
    -iter 2048 >/dev/null 2>&1 || {
      rm -rf "$tmp"
      echo "ERROR: failed to create macOS-compatible PKCS#12 wrapper"
      exit 1
    }
  chmod 600 "$compat"

  openssl pkcs12 -in "$compat" -nokeys -passin "pass:$P12_PASSWORD" -out "$tmp/compat-certs.pem" >/dev/null 2>&1 || {
    rm -rf "$tmp"
    echo "ERROR: failed to verify converted PKCS#12"
    exit 1
  }
  after_sha="$(
    openssl x509 -in "$tmp/compat-certs.pem" -noout -fingerprint -sha1 2>/dev/null |
      sed 's/^sha1 Fingerprint=//I;s/://g'
  )"
  [[ -n "$after_sha" && "${after_sha^^}" == "${before_sha^^}" ]] || {
    rm -rf "$tmp"
    echo "ERROR: compatibility conversion changed certificate identity; refusing to continue"
    exit 1
  }

  if [[ ! -f "$backup" ]]; then
    cp -p "$P12" "$backup"
    chmod 600 "$backup"
  fi
  mv "$compat" "$P12"
  chmod 600 "$P12"
  rm -rf "$tmp"

  echo "P12_MACOS_COMPAT_REWRAP=PASS"
  echo "P12_CERT_SHA1=$before_sha"
}

import_p12_into_user_keychain() {
  local keychain="$1"
  local tmp cert import_err
  tmp="$(mktemp -d)"
  cert="$tmp/vyron-signing.crt"
  import_err="$tmp/security-import.err"

  openssl pkcs12 -in "$P12" -nokeys -passin "pass:$P12_PASSWORD" -out "$cert" >/dev/null 2>&1 || {
    rm -rf "$tmp"
    echo "ERROR: cannot open existing .p12 with the supplied password"
    exit 1
  }

  echo "Using macOS user keychain: $keychain"

  if ! security import "$P12" \
    -k "$keychain" \
    -P "$P12_PASSWORD" \
    -T /usr/bin/codesign \
    -T /usr/bin/security >/dev/null 2>"$import_err"; then
    # OpenSSL already proved the password is valid. A common remaining cause is
    # PKCS#12 algorithm compatibility between OpenSSL 3 defaults and macOS security.
    echo "macOS rejected the OpenSSL PKCS#12 wrapper; converting the SAME identity to a macOS-compatible PKCS#12..."
    rewrap_p12_for_macos

    openssl pkcs12 -in "$P12" -nokeys -passin "pass:$P12_PASSWORD" -out "$cert" >/dev/null 2>&1 || {
      rm -rf "$tmp"
      echo "ERROR: converted .p12 cannot be reopened"
      exit 1
    }

    if ! security import "$P12" \
      -k "$keychain" \
      -P "$P12_PASSWORD" \
      -T /usr/bin/codesign \
      -T /usr/bin/security >/dev/null; then
      echo "ERROR: macOS still rejected the verified compatible .p12."
      echo "The password was already validated by OpenSSL, so do NOT keep retrying passwords."
      rm -rf "$tmp"
      exit 1
    fi
  fi

  security add-trusted-cert \
    -r trustRoot \
    -p codeSign \
    -k "$keychain" \
    "$cert" >/dev/null

  rm -rf "$tmp"
}

configure_github_secrets() {
  base64 <"$P12" >"$B64"
  chmod 600 "$B64"

  if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    echo "Configuring repository Actions secrets without printing secret values..."
    gh secret set VYRON_MACOS_SIGNING_P12_BASE64 --repo "$REPO" <"$B64"
    printf '%s' "$P12_PASSWORD" | gh secret set VYRON_MACOS_SIGNING_P12_PASSWORD --repo "$REPO"
    printf '%s' "$IDENTITY_NAME" | gh secret set VYRON_MACOS_SIGNING_IDENTITY --repo "$REPO"
    rm -f "$B64"
    echo "GITHUB_P12_SECRET_CONFIGURED=YES"
  else
    echo "GITHUB_P12_SECRET_CONFIGURED=NO"
    echo "GitHub CLI is not authenticated. Configure these Actions secrets manually:"
    echo "  VYRON_MACOS_SIGNING_P12_BASE64  <- contents of $B64"
    echo "  VYRON_MACOS_SIGNING_P12_PASSWORD <- the .p12 password"
    echo "  VYRON_MACOS_SIGNING_IDENTITY <- $IDENTITY_NAME"
  fi
}

finish_existing_identity() {
  local sha1="$1"
  read_existing_p12_password
  verify_p12_matches_identity "$sha1"
  local dr
  dr="$(verify_designated_requirement "$sha1")"

  echo "LOCAL_SIGNING_IDENTITY=$IDENTITY_NAME"
  echo "LOCAL_CERT_SHA1=$sha1"
  echo "DESIGNATED_REQUIREMENT=$dr"
  echo "P12_BACKUP=$P12"
  configure_github_secrets
  unset P12_PASSWORD
  echo "IMPORTANT: preserve the encrypted .p12 and its password. All future VYRON macOS builds must reuse this same identity."
}

EXISTING_SHA1="$(identity_sha1 || true)"
if [[ -n "$EXISTING_SHA1" ]]; then
  echo "Identity already exists. Reusing it; a second certificate will NOT be generated."
  if [[ ! -f "$P12" ]]; then
    echo "ERROR: encrypted PKCS#12 backup is missing:"
    echo "  $P12"
    echo "Export THIS exact identity together with its private key from Keychain Access as PKCS#12 to that path, then rerun this script."
    exit 2
  fi
  finish_existing_identity "$EXISTING_SHA1"
  exit 0
fi

KEYCHAIN="$(resolve_user_keychain || true)"
if [[ -z "$KEYCHAIN" ]]; then
  echo "ERROR: could not resolve an existing user/login keychain."
  echo "Diagnostic output:"
  security default-keychain -d user 2>/dev/null || true
  security list-keychains -d user 2>/dev/null || true
  exit 1
fi

# Recovery path for a prior run that successfully created the persistent .p12
# but failed before importing it into the user's keychain.
if [[ -f "$P12" ]]; then
  echo "Existing VYRON .p12 backup found. Reusing it; a second certificate will NOT be generated."
  read_existing_p12_password
  CERT_SHA1="$(p12_cert_sha1)" || {
    echo "ERROR: cannot open existing .p12 with the supplied password"
    exit 1
  }
  import_p12_into_user_keychain "$KEYCHAIN"

  IDS="$(security find-identity -v -p codesigning "$KEYCHAIN" 2>/dev/null || true)"
  printf '%s\n' "$IDS"
  SHA1="$(printf '%s\n' "$IDS" | grep -F "\"$IDENTITY_NAME\"" | awk '{print $2; exit}')"
  [[ -n "$SHA1" ]] || {
    echo "ERROR: .p12 import completed but the expected signing identity is not valid for code signing."
    exit 1
  }
  if [[ "${CERT_SHA1^^}" != "${SHA1^^}" ]]; then
    echo "ERROR: imported identity SHA-1 does not match the existing .p12 certificate"
    echo "P12_CERT_SHA1=$CERT_SHA1"
    echo "LOCAL_CERT_SHA1=$SHA1"
    exit 1
  fi

  DR="$(verify_designated_requirement "$SHA1")"
  echo "LOCAL_SIGNING_IDENTITY=$IDENTITY_NAME"
  echo "LOCAL_CERT_SHA1=$SHA1"
  echo "DESIGNATED_REQUIREMENT=$DR"
  echo "P12_BACKUP=$P12"
  configure_github_secrets
  unset P12_PASSWORD
  echo "IMPORTANT: preserve the encrypted .p12 and its password. All future VYRON macOS builds must reuse this same identity."
  exit 0
fi

read_new_p12_password

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
KEY="$TMP/vyron-signing.key"
CERT="$TMP/vyron-signing.crt"
CONF="$TMP/openssl.cnf"

cat >"$CONF" <<EOF
[ req ]
distinguished_name = dn
x509_extensions = codesign
prompt = no

[ dn ]
CN = $IDENTITY_NAME
O = VYRON

[ codesign ]
basicConstraints = critical, CA:true
keyUsage = critical, digitalSignature, keyCertSign
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
EOF

echo "Creating ONE persistent self-signed code-signing identity..."
openssl req -new -newkey rsa:3072 -x509 -sha256 -days 3650 -nodes \
  -keyout "$KEY" -out "$CERT" -config "$CONF" -extensions codesign >/dev/null 2>&1

openssl pkcs12 -export \
  -inkey "$KEY" -in "$CERT" \
  -name "$IDENTITY_NAME" \
  -out "$P12" \
  -passout "pass:$P12_PASSWORD" \
  -keypbe PBE-SHA1-3DES \
  -certpbe PBE-SHA1-3DES \
  -macalg sha1 \
  -iter 2048 >/dev/null 2>&1
chmod 600 "$P12"

import_p12_into_user_keychain "$KEYCHAIN"

IDS="$(security find-identity -v -p codesigning "$KEYCHAIN" 2>/dev/null || true)"
printf '%s\n' "$IDS"
printf '%s\n' "$IDS" | grep -F "\"$IDENTITY_NAME\"" >/dev/null || {
  echo "ERROR: certificate exists but is not a valid codesigning identity."
  echo "Open Keychain Access and verify the certificate has its private key and is trusted for Code Signing."
  exit 1
}

SHA1="$(printf '%s\n' "$IDS" | grep -F "\"$IDENTITY_NAME\"" | awk '{print $2; exit}')"
[[ -n "$SHA1" ]] || { echo "ERROR: could not resolve certificate SHA-1"; exit 1; }

DR="$(verify_designated_requirement "$SHA1")"

echo "LOCAL_SIGNING_IDENTITY=$IDENTITY_NAME"
echo "LOCAL_CERT_SHA1=$SHA1"
echo "DESIGNATED_REQUIREMENT=$DR"
echo "P12_BACKUP=$P12"

configure_github_secrets
unset P12_PASSWORD

echo "IMPORTANT: preserve the encrypted .p12 and its password. All future VYRON macOS builds must reuse this same identity."
