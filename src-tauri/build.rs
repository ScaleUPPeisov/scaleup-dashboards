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

fn main(){
    println!("cargo:rerun-if-env-changed=VYRON_BUILD_REVISION");
    println!("cargo:rerun-if-env-changed=VYRON_COMMIT_SHA");
    println!("cargo:rerun-if-env-changed=VYRON_UPDATE_CHANNEL");
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

    println!("cargo:rustc-env=VYRON_BUILD_REVISION={revision}");
    println!("cargo:rustc-env=VYRON_COMMIT_SHA={commit}");
    println!("cargo:rustc-env=VYRON_UPDATE_CHANNEL={channel}");
    tauri_build::build()
}
