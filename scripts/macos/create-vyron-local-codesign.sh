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

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

if security find-identity -v -p codesigning 2>/dev/null | grep -F ""$IDENTITY_NAME"" >/dev/null; then
  SHA1="$(security find-identity -v -p codesigning 2>/dev/null | awk -v n="$IDENTITY_NAME" '$0 ~ """ n """ {print $2; exit}')"
  echo "LOCAL_SIGNING_IDENTITY=$IDENTITY_NAME"
  echo "LOCAL_CERT_SHA1=$SHA1"
  echo "Identity already exists. Reuse it; do NOT generate another certificate."
  if [[ ! -f "$P12" ]]; then
    echo "Encrypted PKCS#12 backup not found at: $P12"
    echo "Export this exact identity + private key from Keychain Access as PKCS#12, then rerun with VYRON_UPLOAD_EXISTING_P12=1."
  fi
  exit 0
fi

command -v openssl >/dev/null || { echo "ERROR: openssl is required"; exit 1; }

read -r -s -p "Create a strong password for the encrypted VYRON .p12: " P12_PASSWORD
echo
read -r -s -p "Repeat the .p12 password: " P12_PASSWORD_2
echo
[[ -n "$P12_PASSWORD" && "$P12_PASSWORD" == "$P12_PASSWORD_2" ]] || { echo "ERROR: passwords do not match"; exit 1; }
unset P12_PASSWORD_2

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
openssl req -new -newkey rsa:3072 -x509 -sha256 -days 3650 -nodes   -keyout "$KEY" -out "$CERT" -config "$CONF" -extensions codesign >/dev/null 2>&1

openssl pkcs12 -export   -inkey "$KEY" -in "$CERT"   -name "$IDENTITY_NAME"   -out "$P12"   -passout "pass:$P12_PASSWORD" >/dev/null 2>&1
chmod 600 "$P12"

KEYCHAIN="$(security default-keychain -d user | tr -d '"')"
[[ -n "$KEYCHAIN" ]] || { echo "ERROR: no default user keychain"; exit 1; }

security import "$P12"   -k "$KEYCHAIN"   -P "$P12_PASSWORD"   -T /usr/bin/codesign   -T /usr/bin/security >/dev/null

# Trust only this certificate for code signing. This may show one macOS authentication dialog.
security add-trusted-cert   -r trustRoot   -p codeSign   -k "$KEYCHAIN"   "$CERT" >/dev/null

IDS="$(security find-identity -v -p codesigning "$KEYCHAIN" 2>/dev/null || true)"
printf '%s\n' "$IDS"
printf '%s\n' "$IDS" | grep -F ""$IDENTITY_NAME"" >/dev/null || {
  echo "ERROR: certificate exists but is not a valid codesigning identity."
  echo "Open Keychain Access and verify the certificate has its private key and is trusted for Code Signing."
  exit 1
}

SHA1="$(printf '%s\n' "$IDS" | awk -v n="$IDENTITY_NAME" '$0 ~ """ n """ {print $2; exit}')"
[[ -n "$SHA1" ]] || { echo "ERROR: could not resolve certificate SHA-1"; exit 1; }

PROBE="$TMP/vyron-signing-probe"
cp /bin/echo "$PROBE"
codesign --force --sign "$SHA1" "$PROBE"
codesign --verify --strict --verbose=2 "$PROBE"
DR="$(codesign -d -r- "$PROBE" 2>&1 | sed -n 's/^designated => //p')"
[[ -n "$DR" && "$DR" != cdhash* ]] || { echo "ERROR: designated requirement is still cdhash-only"; exit 1; }

base64 <"$P12" >"$B64"
chmod 600 "$B64"

echo "LOCAL_SIGNING_IDENTITY=$IDENTITY_NAME"
echo "LOCAL_CERT_SHA1=$SHA1"
echo "DESIGNATED_REQUIREMENT=$DR"
echo "P12_BACKUP=$P12"

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

echo "IMPORTANT: preserve the encrypted .p12 and its password. All future VYRON macOS builds must reuse this same identity."
