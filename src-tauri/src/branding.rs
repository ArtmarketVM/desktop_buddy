//! Preserve installation identity while changing the visible macOS bundle name.
#[cfg(any(test, all(target_os = "macos", not(debug_assertions))))]
fn renamed_bundle(executable: &std::path::Path) -> Option<std::path::PathBuf> {
    use std::ffi::OsStr;
    let macos = executable.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    (executable.is_absolute()
        && macos.file_name() == Some(OsStr::new("MacOS"))
        && contents.file_name() == Some(OsStr::new("Contents"))
        && bundle.file_name() == Some(OsStr::new("Desktop Buddy.app")))
    .then(|| bundle.with_file_name("sumi.app"))
}

#[cfg(all(target_os = "macos", any(test, not(debug_assertions))))]
fn rename_exclusive(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    unsafe extern "C" {
        fn renamex_np(
            from: *const std::ffi::c_char,
            to: *const std::ffi::c_char,
            flags: u32,
        ) -> i32;
    }
    let from = CString::new(from.as_os_str().as_bytes())?;
    let to = CString::new(to.as_os_str().as_bytes())?;
    // SAFETY: both strings are NUL-terminated and remain alive during this call.
    // RENAME_EXCL atomically refuses any existing destination, including symlinks.
    if unsafe { renamex_np(from.as_ptr(), to.as_ptr(), 0x00000004) } == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(all(target_os = "macos", any(test, not(debug_assertions))))]
fn move_and_launch(
    from: &std::path::Path,
    to: &std::path::Path,
    launch: impl FnOnce(&std::path::Path) -> bool,
) -> bool {
    if rename_exclusive(from, to).is_err() {
        return false;
    }
    if launch(to) {
        return true;
    }
    // A failed relaunch must leave the original installation usable.
    if rename_exclusive(to, from).is_err() {
        eprintln!("sumi could not restore the previous bundle path after relaunch failed");
    }
    false
}

/// Runs before state/windows are initialized, so relaunch cannot discard a draft.
/// Standard updater extraction preserves the old directory even for a renamed archive.
pub(crate) fn relaunch_renamed_bundle() -> bool {
    #[cfg(all(target_os = "macos", not(debug_assertions), not(test)))]
    {
        use std::process::{Command, Stdio};
        let Ok(executable) = std::env::current_exe() else {
            return false;
        };
        let Some(destination) = renamed_bundle(&executable) else {
            return false;
        };
        let Some(source) = executable
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
        else {
            return false;
        };
        if !std::fs::symlink_metadata(source)
            .is_ok_and(|m| m.is_dir() && !m.file_type().is_symlink())
        {
            return false;
        }
        // Never relocate an unsigned or differently signed lookalike installation.
        let policy: serde_json::Value =
            match serde_json::from_str(include_str!("../macos-code-signing.json")) {
                Ok(p) => p,
                Err(_) => return false,
            };
        let Some(certificate) = policy["certificateSha1"].as_str() else {
            return false;
        };
        let requirement = format!("=identifier \"com.artmarketvm.desktopbuddy\" and certificate root = H\"{certificate}\"");
        if !Command::new("/usr/bin/codesign")
            .args(["--verify", "--deep", "--strict", "-R", &requirement])
            .arg(source)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
        {
            return false;
        }
        move_and_launch(source, &destination, |bundle| {
            Command::new("/usr/bin/open")
                .arg("-n")
                .arg(bundle)
                .arg("--args")
                .args(std::env::args_os().skip(1))
                .status()
                .is_ok_and(|s| s.success())
        })
    }
    #[cfg(any(not(target_os = "macos"), debug_assertions, test))]
    {
        false
    }
}

/// A release-artifact rehearsal exits before creating state, reading keys or opening windows.
pub(crate) fn report_migration_check() -> bool {
    if !std::env::args().any(|a| a == "--check-branding-migration") {
        return false;
    }
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        let report = std::env::args()
            .find_map(|a| a.strip_prefix("--branding-report=").map(str::to_owned))
            .ok_or("Missing branding report path")?;
        let executable = std::env::current_exe()?;
        let bundle = executable
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .and_then(|p| p.file_name())
            .and_then(|p| p.to_str());
        std::fs::write(
            report,
            serde_json::to_vec(
                &serde_json::json!({"bundle_name":bundle,"executable_name":executable.file_name().and_then(|p|p.to_str()),"user_state_opened":false}),
            )?,
        )?;
        Ok(())
    })();
    if result.is_err() {
        eprintln!("sumi branding rehearsal could not write its report");
        std::process::exit(1);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    #[test]
    fn only_the_exact_legacy_bundle_layout_is_renamed() {
        let parent = std::env::temp_dir();
        assert_eq!(
            renamed_bundle(&parent.join("Desktop Buddy.app/Contents/MacOS/sumi")),
            Some(parent.join("sumi.app"))
        );
        for p in [
            "/Applications/sumi.app/Contents/MacOS/sumi",
            "/Applications/Other.app/Contents/MacOS/sumi",
            "Desktop Buddy.app/Contents/MacOS/sumi",
            "/Applications/Desktop Buddy.app/not-contents/MacOS/sumi",
        ] {
            assert!(renamed_bundle(Path::new(p)).is_none());
        }
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn migration_preserves_contents_and_never_replaces_an_existing_destination() {
        let parent = std::env::temp_dir().join(format!(
            "sumi-branding-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&parent).unwrap();
        let source = parent.join("Desktop Buddy.app");
        let destination = parent.join("sumi.app");
        std::fs::create_dir(&source).unwrap();
        std::fs::write(source.join("marker"), "original").unwrap();
        std::fs::create_dir(&destination).unwrap();
        assert!(!move_and_launch(&source, &destination, |_| panic!(
            "must not launch"
        )));
        assert_eq!(
            std::fs::read_to_string(source.join("marker")).unwrap(),
            "original"
        );
        std::fs::remove_dir(&destination).unwrap();
        assert!(!move_and_launch(&source, &destination, |_| false));
        assert!(source.exists());
        assert!(!destination.exists());
        assert!(move_and_launch(&source, &destination, |_| true));
        assert!(!source.exists());
        assert_eq!(
            std::fs::read_to_string(destination.join("marker")).unwrap(),
            "original"
        );
        std::fs::remove_dir_all(parent).unwrap();
    }
}
