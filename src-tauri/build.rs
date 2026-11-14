fn main(){
    println!("cargo:rerun-if-env-changed=VYRON_BUILD_REVISION");
    println!("cargo:rerun-if-env-changed=VYRON_COMMIT_SHA");
    println!("cargo:rerun-if-env-changed=VYRON_UPDATE_CHANNEL");

    let revision=std::env::var("VYRON_BUILD_REVISION").unwrap_or_else(|_|"0".into());
    revision.parse::<u64>().unwrap_or_else(|_|panic!("VYRON_BUILD_REVISION must be an unsigned integer"));

    let commit=std::env::var("VYRON_COMMIT_SHA").unwrap_or_else(|_|"development".into());
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
