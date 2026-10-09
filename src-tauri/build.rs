fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        build_macos_speech();
        cc::Build::new()
            .file("native/macos.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .flag("-mmacosx-version-min=14.5")
            .compile("buddy_macos");
        for framework in [
            "AppKit",
            "ApplicationServices",
            "Security",
            "Carbon",
            "Speech",
            "CoreAudio",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rerun-if-changed=native/macos.m");
    }
    tauri_build::build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        // Mock-runtime tests also import Common Controls v6. Tauri links its manifest
        // only to bins by default; include those resources in the backend test EXE too.
        let resources =
            std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("resource.lib");
        println!("cargo:rustc-link-arg-tests={}", resources.display());
    }
}

fn build_macos_speech() {
    use std::{path::PathBuf, process::Command};
    println!("cargo:rerun-if-changed=native/speech.m");
    println!("cargo:rerun-if-env-changed=MACOSX_DEPLOYMENT_TARGET");
    let output = PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
    let object = output.join("speech.o");
    let architecture = match std::env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        _ => panic!("Unsupported macOS speech architecture"),
    };
    let compiled = Command::new("xcrun")
        .args([
            "clang",
            "-fobjc-arc",
            "-fblocks",
            "-O2",
            "-Wall",
            "-Wextra",
            "-mmacosx-version-min=12.0",
            "-arch",
            architecture,
            "-c",
            "native/speech.m",
            "-o",
        ])
        .arg(&object)
        .status()
        .expect("Install Xcode Command Line Tools to compile macOS speech support");
    assert!(compiled.success(), "Could not compile macOS speech support");
    let archived = Command::new("xcrun")
        .args(["ar", "crs"])
        .arg(output.join("libbuddy_speech.a"))
        .arg(&object)
        .status()
        .expect("Could not archive macOS speech support");
    assert!(archived.success(), "Could not archive macOS speech support");
    println!("cargo:rustc-link-search=native={}", output.display());
    println!("cargo:rustc-link-lib=static=buddy_speech");
    for framework in ["Foundation", "AVFoundation", "Speech"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
}
