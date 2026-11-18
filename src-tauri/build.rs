use std::{path::Path,process::Command};

fn git_output(args:&[&str])->Option<String>{
    let repository=Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let output=Command::new("git").arg("-C").arg(repository).args(args).output().ok()?;
    if !output.status.success(){return None}
    let value=String::from_utf8(output.stdout).ok()?.trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn git_build_revision()->Option<String>{
    let shallow=git_output(&["rev-parse","--is-shallow-repository"]).as_deref()==Some("true");
    if shallow{
        git_output(&["show","-s","--format=%ct","HEAD"])
    }else{
        git_output(&["rev-list","--count","HEAD"])
    }
}


const COMPROMISED_LEGACY_UPDATER_KEY_SHA256:&str="aa6fb45ab082ef39279e841dc40b0f85e5b33f23746f77557b6f93e3e72c2c06";
const ISOLATED_PROBE_ID:&str="studio.channelflow.desktop.pr22probe";

fn verified_non_distributable_probe_overlay()->bool{
    let Ok(raw)=std::env::var("TAURI_CONFIG") else{return false};
    let Ok(value)=serde_json::from_str::<serde_json::Value>(&raw) else{return false};
    let exact_probe_id=value.get("identifier").and_then(|v|v.as_str())==Some(ISOLATED_PROBE_ID);
    let updater_artifacts_off=value.pointer("/bundle/createUpdaterArtifacts").and_then(|v|v.as_bool())==Some(false);
    let app_only_bundle=value.pointer("/bundle/targets").and_then(|v|v.as_array())
        .map(|targets|targets.len()==1&&targets[0].as_str()==Some("app")).unwrap_or(false);
    let updater_endpoints_empty=value.pointer("/plugins/updater/endpoints").and_then(|v|v.as_array())
        .map(|endpoints|endpoints.is_empty()).unwrap_or(false);
    exact_probe_id&&updater_artifacts_off&&app_only_bundle&&updater_endpoints_empty
}

fn main(){
    println!("cargo:rerun-if-env-changed=VYRON_BUILD_REVISION");
    println!("cargo:rerun-if-env-changed=VYRON_COMMIT_SHA");
    println!("cargo:rerun-if-env-changed=VYRON_UPDATE_CHANNEL");
    println!("cargo:rerun-if-env-changed=VYRON_TRUSTED_UPDATER_PUBLIC_KEY_SHA256");
    println!("cargo:rerun-if-env-changed=VYRON_NON_DISTRIBUTABLE_PROBE");
    println!("cargo:rerun-if-env-changed=TAURI_CONFIG");
    println!("cargo:rerun-if-changed=../.git/HEAD");

    let revision=std::env::var("VYRON_BUILD_REVISION").ok()
        .or_else(git_build_revision)
        .unwrap_or_else(||"0".into());
    revision.parse::<u64>().unwrap_or_else(|_|panic!("VYRON_BUILD_REVISION must be an unsigned integer"));

    let commit=std::env::var("VYRON_COMMIT_SHA").ok()
        .or_else(||git_output(&["rev-parse","HEAD"]))
        .unwrap_or_else(||"development".into());
    if commit!="development" && !(commit.len()>=7 && commit.len()<=64 && commit.chars().all(|c|c.is_ascii_hexdigit())){
        panic!("VYRON_COMMIT_SHA must be a hexadecimal Git commit SHA or development");
    }

    let channel=std::env::var("VYRON_UPDATE_CHANNEL").unwrap_or_else(|_|"stable".into());
    if channel!="stable" && channel!="owner-preview"{
        panic!("VYRON_UPDATE_CHANNEL must be stable or owner-preview");
    }

    let trusted_key_sha256=std::env::var("VYRON_TRUSTED_UPDATER_PUBLIC_KEY_SHA256").unwrap_or_else(|_|"unverified".into());
    if trusted_key_sha256!="unverified" && !(trusted_key_sha256.len()==64 && trusted_key_sha256.chars().all(|c|c.is_ascii_hexdigit())){
        panic!("VYRON_TRUSTED_UPDATER_PUBLIC_KEY_SHA256 must be 64 hexadecimal characters or unverified");
    }
    if trusted_key_sha256.eq_ignore_ascii_case(COMPROMISED_LEGACY_UPDATER_KEY_SHA256){
        panic!("COMPROMISED_UPDATER_KEY_FORBIDDEN: refusing the exposed legacy Minisign trust root");
    }
    let profile=std::env::var("PROFILE").unwrap_or_else(|_|"debug".into());
    let requested_probe=std::env::var("VYRON_NON_DISTRIBUTABLE_PROBE").ok().as_deref()==Some(ISOLATED_PROBE_ID);
    let approved_isolated_probe=requested_probe&&verified_non_distributable_probe_overlay();
    if profile=="release" && trusted_key_sha256=="unverified" && !approved_isolated_probe{
        panic!("UPDATER_TRUST_FINGERPRINT_REQUIRED_FOR_RELEASE: a distributable binary needs an approved updater-key fingerprint; the probe marker alone never grants an exemption");
    }

    println!("cargo:rustc-env=VYRON_BUILD_REVISION={revision}");
    println!("cargo:rustc-env=VYRON_COMMIT_SHA={commit}");
    println!("cargo:rustc-env=VYRON_UPDATE_CHANNEL={channel}");
    println!("cargo:rustc-env=VYRON_TRUSTED_UPDATER_PUBLIC_KEY_SHA256={trusted_key_sha256}");
    tauri_build::build()
}
