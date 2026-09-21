fn main(){
    let revision=std::env::var("VYRON_BUILD_REVISION").unwrap_or_else(|_|"0".into());
    let commit=std::env::var("VYRON_COMMIT_SHA").unwrap_or_else(|_|"development".into());
    let channel=std::env::var("VYRON_UPDATE_CHANNEL").unwrap_or_else(|_|"stable".into());
    println!("cargo:rustc-env=VYRON_BUILD_REVISION={revision}");
    println!("cargo:rustc-env=VYRON_COMMIT_SHA={commit}");
    println!("cargo:rustc-env=VYRON_UPDATE_CHANNEL={channel}");
    tauri_build::build()
}
