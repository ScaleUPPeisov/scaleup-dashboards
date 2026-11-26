"""Verify exactly one SHA-256 manifest entry, with GNU text or binary markers."""
import hashlib
import pathlib
import re
import sys
import tempfile

def expected_hash(manifest, filename):
    matches = []
    for line in manifest.splitlines():
        match = re.fullmatch(r"([0-9a-fA-F]{64})[ \t]+\*?([^\r\n]+)", line)
        if match and match.group(2) == filename:
            matches.append(match.group(1).lower())
    if len(matches) != 1:
        raise ValueError(f"Expected one manifest entry for {filename}; got {len(matches)}")
    return matches[0]

def verify(manifest, archive):
    expected = expected_hash(manifest.read_text(encoding="utf-8"), archive.name)
    with archive.open("rb") as f:
        actual = hashlib.file_digest(f, "sha256").hexdigest()
    if actual != expected:
        raise ValueError("Electron archive SHA-256 mismatch")
    pathlib.Path("verified.sha256").write_text(f"{expected}  {archive.name}\n")
    print(f"Verified {archive.name}: {actual}", flush=True)

def self_test():
    h = "a" * 64
    n = "electron-v45.5.0-darwin-arm64.zip"
    for separator in ("  ", " *", " ", "\t"):
        assert expected_hash(h + separator + n, n) == h
    for invalid in ("", h + "  " + n + ".bak", (h + "  " + n + "\n") * 2, "x" * 64 + "  " + n):
        try:
            expected_hash(invalid, n)
        except ValueError:
            continue
        raise AssertionError("Invalid manifest accepted")
    print("Checksum manifest regression cases: PASS")

if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        verify(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
