//! Experimental, test-only transaction primitive. Not wired to the application.
//! The caller supplies trusted hashes for a *complete, independently verified*
//! source snapshot; this module does not establish its provenance or freshness.
//! It transfers only the four files below, not a complete application restore.

use std::{ffi::{CString, OsStr}, fs::File, io::{Read, Write}, os::{fd::{AsRawFd, FromRawFd}, unix::{ffi::OsStrExt, fs::MetadataExt}}, path::{Component, Path}};
use sha2::{Digest, Sha256};

const SOURCE_FILES: [&str; 4] = ["state.json", "youtube-oauth.json", "oauth-vault.enc", "vault.key"];
const MAX_BYTES: [u64; 4] = [128 * 1024 * 1024, 32 * 1024 * 1024, 32 * 1024 * 1024, 4096];

#[derive(Debug, PartialEq, Eq)]
enum ImportError { InvalidPath, Source, HashMismatch, InvalidSnapshot, Destination, Io, CommitDurabilityUnknown, Injected }
type Result<T> = std::result::Result<T, ImportError>;

fn name(value: &OsStr) -> Result<CString> { CString::new(value.as_bytes()).map_err(|_| ImportError::InvalidPath) }
fn open_at(dir: &File, part: &OsStr, flags: i32, mode: u32) -> Result<File> {
    let name = name(part)?;
    // File owns the returned descriptor; all operations remain relative to a pinned directory.
    let fd = unsafe { libc::openat(dir.as_raw_fd(), name.as_ptr(), flags | libc::O_CLOEXEC | libc::O_NOFOLLOW, mode as libc::c_uint) };
    if fd < 0 { return Err(ImportError::Io); }
    Ok(unsafe { File::from_raw_fd(fd) })
}
fn directory_at(dir: &File, component: &OsStr) -> Result<File> {
    open_at(dir, component, libc::O_RDONLY | libc::O_DIRECTORY, 0)
}
fn open_directory(path: &Path) -> Result<File> {
    if !path.is_absolute() { return Err(ImportError::InvalidPath); }
    let mut current = File::open("/").map_err(|_| ImportError::Io)?;
    for component in path.components() {
        match component {
            Component::RootDir => {},
            Component::Normal(part) => current = directory_at(&current, part)?,
            _ => return Err(ImportError::InvalidPath),
        }
    }
    Ok(current)
}
fn private_directory(dir: &File) -> Result<()> {
    let m = dir.metadata().map_err(|_| ImportError::Io)?;
    if !m.is_dir() || m.uid() != unsafe { libc::geteuid() } || m.mode() & 0o077 != 0 { return Err(ImportError::Destination); }
    Ok(())
}
fn mkdir_at(parent: &File, part: &str) -> Result<File> {
    let c = name(OsStr::new(part))?;
    if unsafe { libc::mkdirat(parent.as_raw_fd(), c.as_ptr(), 0o700) } != 0 { return Err(ImportError::Io); }
    let dir = directory_at(parent, OsStr::new(part))?;
    private_directory(&dir)?;
    Ok(dir)
}
fn read_bounded(dir: &File, part: &str, max: u64) -> Result<Vec<u8>> {
    let file = open_at(dir, OsStr::new(part), libc::O_RDONLY | libc::O_NONBLOCK, 0).map_err(|_| ImportError::Source)?;
    let metadata = file.metadata().map_err(|_| ImportError::Source)?;
    if !metadata.is_file() || metadata.len() > max { return Err(ImportError::Source); }
    let mut bytes = Vec::new();
    file.take(max + 1).read_to_end(&mut bytes).map_err(|_| ImportError::Source)?;
    if bytes.len() as u64 > max { return Err(ImportError::Source); }
    Ok(bytes)
}
fn write_file(dir: &File, part: &str, bytes: &[u8]) -> Result<()> {
    let mut file = open_at(dir, OsStr::new(part), libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL, 0o600)?;
    file.write_all(bytes).map_err(|_| ImportError::Io)?;
    file.sync_all().map_err(|_| ImportError::Io)?;
    // On macOS request a device-level flush as well; unsupported volumes fail
    // closed instead of silently claiming equivalent durability.
    if unsafe { libc::fcntl(file.as_raw_fd(), libc::F_FULLFSYNC) } != 0 { return Err(ImportError::Io); }
    Ok(())
}
fn same_hash(data: &[u8], expected: &[u8; 32]) -> bool { <[u8; 32]>::from(Sha256::digest(data)) == *expected }

/// Source is an isolated four-file snapshot directory; the trusted hashes must
/// be established separately. No secret values are returned or logged.
/// Destination parent must already exist and be private; destination must not.
fn import(source: &Path, destination: &Path, trusted_hashes: [[u8; 32]; 4], fault: Fault) -> Result<()> {
    let source = open_directory(source).map_err(|_| ImportError::Source)?;
    let parent_path = destination.parent().ok_or(ImportError::InvalidPath)?;
    let target = destination.file_name().ok_or(ImportError::InvalidPath)?;
    let target_name = name(target)?;
    let parent = open_directory(parent_path)?;
    private_directory(&parent)?;
    let mut blobs = Vec::new();
    for i in 0..SOURCE_FILES.len() {
        let bytes = read_bounded(&source, SOURCE_FILES[i], MAX_BYTES[i])?;
        if !same_hash(&bytes, &trusted_hashes[i]) { return Err(ImportError::HashMismatch); }
        blobs.push(bytes);
    }
    let key = std::str::from_utf8(&blobs[3]).map_err(|_| ImportError::InvalidSnapshot)?;
    let report = crate::oauth_vault::assess_oauth_import(&blobs[0], &blobs[1], &blobs[2], key).map_err(|_| ImportError::InvalidSnapshot)?;
    let state: serde_json::Value = serde_json::from_slice(&blobs[0]).map_err(|_| ImportError::InvalidSnapshot)?;
    let mut distinct_channels = std::collections::HashSet::new();
    for channel in state.get("channels").and_then(|v| v.as_array()).ok_or(ImportError::InvalidSnapshot)? {
        let id = channel.get("youtubeChannelId").and_then(|v| v.as_str()).map(str::trim).filter(|v| !v.is_empty()).ok_or(ImportError::InvalidSnapshot)?;
        if !distinct_channels.insert(id) { return Err(ImportError::InvalidSnapshot); }
    }
    if report.channels != 33 || report.metadata_profiles != 33 || report.vault_profiles != 33 || report.bound_channels != 33 ||
        report.unlinked_channels != 0 || report.missing_profiles != 0 || report.missing_refresh_tokens != 0 ||
        report.missing_local_client_configuration != 0 || report.identity_conflicts != 0 || report.unverified_identities != 0 ||
        report.unreferenced_profiles != 0 || report.unreferenced_vault_profiles != 0 { return Err(ImportError::InvalidSnapshot); }

    // Distinct transactions can run concurrently; only the exclusive rename
    // below can publish one. Interrupted staging directories are not deleted.
    let stage_name = format!(".apex-import-{}", uuid::Uuid::new_v4());
    let stage = mkdir_at(&parent, &stage_name)?;
    parent.sync_all().map_err(|_| ImportError::Io)?;
    let docs = mkdir_at(&stage, "Documents")?;
    let auth = mkdir_at(&docs, "Auth")?;
    write_file(&stage, "state.json", &blobs[0])?;
    write_file(&stage, "youtube-oauth.json", &blobs[1])?;
    write_file(&stage, "oauth-vault.enc", &blobs[2])?;
    write_file(&stage, "oauth-vault.key", &blobs[3])?;
    write_file(&auth, "oauth-vault.enc", &blobs[2])?;
    write_file(&auth, "vault.key", &blobs[3])?;
    // Reopen every copy and authenticate the exact bytes before publication.
    for (dir, part, i) in [(&stage, "state.json", 0), (&stage, "youtube-oauth.json", 1), (&stage, "oauth-vault.enc", 2), (&stage, "oauth-vault.key", 3), (&auth, "oauth-vault.enc", 2), (&auth, "vault.key", 3)] {
        if !same_hash(&read_bounded(dir, part, MAX_BYTES[i])?, &trusted_hashes[i]) { return Err(ImportError::HashMismatch); }
    }
    auth.sync_all().map_err(|_| ImportError::Io)?;
    docs.sync_all().map_err(|_| ImportError::Io)?;
    stage.sync_all().map_err(|_| ImportError::Io)?;
    if fault == Fault::BeforeCommit { return Err(ImportError::Injected); }
    let stage_c = name(OsStr::new(&stage_name))?;
    let rc = unsafe { libc::renameatx_np(parent.as_raw_fd(), stage_c.as_ptr(), parent.as_raw_fd(), target_name.as_ptr(), libc::RENAME_EXCL) };
    if rc != 0 { return Err(ImportError::Destination); }
    // Failure here means the atomic rename occurred, but its crash durability
    // is unknown; caller must inspect the root offline and must not retry over it.
    if fault == Fault::AfterCommit { return Err(ImportError::CommitDurabilityUnknown); }
    parent.sync_all().map_err(|_| ImportError::CommitDurabilityUnknown)?;
    Ok(())
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Fault { None, BeforeCommit, AfterCommit }

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    use chacha20poly1305::{aead::{Aead, KeyInit, Payload}, XChaCha20Poly1305, XNonce};
    use std::{fs, os::unix::fs::{symlink, PermissionsExt}, path::PathBuf};

    struct Fixture { root: PathBuf, source: PathBuf, target: PathBuf, hashes: [[u8; 32]; 4] }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().canonicalize().unwrap().join(format!("apex-oauth-test-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&root).unwrap();
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
            let source = root.join("source");
            fs::create_dir(&source).unwrap();
            fs::set_permissions(&source, fs::Permissions::from_mode(0o700)).unwrap();
            let key = [42u8; 32];
            let nonce = [17u8; 24];
            let mut channels = Vec::new(); let mut metadata = Vec::new(); let mut profiles = serde_json::Map::new();
            for i in 0..33 {
                let p = format!("fake-profile-{i}"); let c = format!("fake-channel-{i}");
                channels.push(serde_json::json!({"id":format!("row-{i}"),"youtubeProfileId":p,"youtubeChannelId":c}));
                metadata.push(serde_json::json!({"id":p,"channel_id":c,"client_id":"fake-client"}));
                profiles.insert(p.clone(), serde_json::json!({"profileUuid":p,"expectedChannelId":c,"refreshToken":"fake-refresh"}));
            }
            let plaintext = serde_json::to_vec(&serde_json::json!({"schemaVersion":1,"globalClientId":"fake-client","globalClientSecret":"fake-secret","profiles":profiles})).unwrap();
            let encrypted = XChaCha20Poly1305::new((&key).into()).encrypt(XNonce::from_slice(&nonce), Payload { msg: &plaintext, aad: b"VYRON-OAUTH-VAULT-v1" }).unwrap();
            let blobs = [serde_json::to_vec(&serde_json::json!({"channels":channels})).unwrap(), serde_json::to_vec(&serde_json::json!({"profiles":metadata})).unwrap(), serde_json::to_vec(&serde_json::json!({"schemaVersion":1,"nonce":B64.encode(nonce),"ciphertext":B64.encode(encrypted)})).unwrap(), B64.encode(key).into_bytes()];
            let mut hashes = [[0; 32]; 4];
            for i in 0..4 { fs::write(source.join(SOURCE_FILES[i]), &blobs[i]).unwrap(); hashes[i] = Sha256::digest(&blobs[i]).into(); }
            let target = root.join("apex");
            Self { root, source, target, hashes }
        }
        fn run(&self, fault: Fault) -> Result<()> { import(&self.source, &self.target, self.hashes, fault) }
    }
    impl Drop for Fixture { fn drop(&mut self) { fs::remove_dir_all(&self.root).unwrap(); } }

    #[test]
    fn imports_33_bound_profiles_and_preserves_source() {
        let f = Fixture::new();
        assert_eq!(f.run(Fault::None), Ok(()));
        for (src, dst) in [("state.json", "state.json"), ("youtube-oauth.json", "youtube-oauth.json"), ("oauth-vault.enc", "Documents/Auth/oauth-vault.enc"), ("vault.key", "Documents/Auth/vault.key")] {
            assert_eq!(fs::read(f.source.join(src)).unwrap(), fs::read(f.target.join(dst)).unwrap());
        }
        assert_eq!(fs::metadata(&f.target).unwrap().mode() & 0o777, 0o700);
        assert_eq!(fs::metadata(f.target.join("oauth-vault.key")).unwrap().mode() & 0o777, 0o600);
    }
    #[test]
    fn existing_destination_is_never_overwritten() {
        let f = Fixture::new(); fs::create_dir(&f.target).unwrap(); fs::write(f.target.join("keep"), b"original").unwrap();
        assert_eq!(f.run(Fault::None), Err(ImportError::Destination));
        assert_eq!(fs::read(f.target.join("keep")).unwrap(), b"original");
        assert!(!f.target.join("state.json").exists());
    }
    #[test]
    fn concurrent_imports_have_exactly_one_commit() {
        let f = Fixture::new();
        let (a, b) = std::thread::scope(|s| {
            let first = s.spawn(|| f.run(Fault::None));
            let second = s.spawn(|| f.run(Fault::None));
            (first.join().unwrap(), second.join().unwrap())
        });
        assert!(matches!((&a, &b), (Ok(()), Err(ImportError::Destination)) | (Err(ImportError::Destination), Ok(()))));
        assert_eq!(fs::read(f.target.join("state.json")).unwrap(), fs::read(f.source.join("state.json")).unwrap());
    }
    #[test]
    fn symlink_source_files_and_ancestors_are_rejected() {
        let f = Fixture::new();
        let moved = f.source.join("real-state"); fs::rename(f.source.join("state.json"), &moved).unwrap(); symlink(&moved, f.source.join("state.json")).unwrap();
        assert_eq!(f.run(Fault::None), Err(ImportError::Source));
        let link = f.root.join("source-link"); symlink(&f.source, &link).unwrap();
        assert_eq!(import(&link, &f.target, f.hashes, Fault::None), Err(ImportError::Source));
        assert!(!f.target.exists());
    }
    #[test]
    fn symlink_destination_and_parent_are_rejected() {
        let f = Fixture::new();
        let outside = f.root.join("outside"); fs::create_dir(&outside).unwrap();
        symlink(&outside, &f.target).unwrap();
        assert_eq!(f.run(Fault::None), Err(ImportError::Destination));
        assert!(!outside.join("state.json").exists());
        let linked_parent = f.root.join("parent-link"); symlink(&outside, &linked_parent).unwrap();
        assert!(import(&f.source, &linked_parent.join("apex"), f.hashes, Fault::None).is_err());
        assert!(!outside.join("apex").exists());
    }
    #[test]
    fn invalid_mac_or_binding_never_commits_even_with_updated_hash() {
        let mut f = Fixture::new();
        let path = f.source.join("oauth-vault.enc"); let mut envelope: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        let mut ciphertext = B64.decode(envelope["ciphertext"].as_str().unwrap()).unwrap(); ciphertext[0] ^= 1;
        envelope["ciphertext"] = serde_json::json!(B64.encode(ciphertext)); let bytes = serde_json::to_vec(&envelope).unwrap(); fs::write(&path, &bytes).unwrap(); f.hashes[2] = Sha256::digest(&bytes).into();
        assert_eq!(f.run(Fault::None), Err(ImportError::InvalidSnapshot)); assert!(!f.target.exists());
        let f = Fixture::new(); let path = f.source.join("state.json"); let mut state: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        state["channels"][0]["youtubeChannelId"] = serde_json::json!("different"); let bytes = serde_json::to_vec(&state).unwrap(); fs::write(&path, &bytes).unwrap();
        let mut hashes = f.hashes; hashes[0] = Sha256::digest(&bytes).into();
        assert_eq!(import(&f.source, &f.target, hashes, Fault::None), Err(ImportError::InvalidSnapshot)); assert!(!f.target.exists());
    }
    #[test]
    fn interrupted_before_commit_never_exposes_partial_root_and_can_retry() {
        let f = Fixture::new(); assert_eq!(f.run(Fault::BeforeCommit), Err(ImportError::Injected)); assert!(!f.target.exists());
        assert_eq!(f.run(Fault::None), Ok(()));
    }
    #[test]
    fn interruption_after_commit_is_reported_and_cannot_overwrite() {
        let f = Fixture::new(); assert_eq!(f.run(Fault::AfterCommit), Err(ImportError::CommitDurabilityUnknown));
        assert_eq!(fs::read(f.target.join("state.json")).unwrap(), fs::read(f.source.join("state.json")).unwrap());
        assert_eq!(f.run(Fault::None), Err(ImportError::Destination));
    }
    #[test]
    fn hash_mismatch_never_commits() {
        let f = Fixture::new(); fs::write(f.source.join("state.json"), b"changed").unwrap();
        assert_eq!(f.run(Fault::None), Err(ImportError::HashMismatch)); assert!(!f.target.exists());
    }
}
