#[cfg(any(test, all(windows, not(debug_assertions))))]
fn command(path: &std::path::Path) -> Result<String, String> {
    let path = path
        .to_str()
        .ok_or("The application path is not valid Unicode")?;
    if path.contains(['"', '\n', '\r']) {
        return Err("Invalid application path".into());
    }
    let value = format!("\"{path}\" --background");
    if value.encode_utf16().count() > 260 {
        return Err("The application path is too long for Windows startup".into());
    }
    Ok(value)
}

/// Development/test builds never register a checkout or test executable.
pub fn sync(enabled: bool) -> Result<(), String> {
    #[cfg(all(windows, not(debug_assertions)))]
    {
        register(enabled)
    }
    #[cfg(all(target_os = "macos", not(debug_assertions)))]
    {
        crate::macos::autostart(enabled)
    }
    #[cfg(any(not(any(windows, target_os = "macos")), debug_assertions))]
    {
        let _ = enabled;
        Ok(())
    }
}

#[cfg(all(windows, not(debug_assertions)))]
fn register(enabled: bool) -> Result<(), String> {
    use windows::{
        core::w,
        Win32::{Foundation::ERROR_FILE_NOT_FOUND, System::Registry::*},
    };
    let value = command(
        &std::env::current_exe().map_err(|_| "Could not locate the installed application")?,
    )?;
    unsafe {
        let mut key = HKEY::default();
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
            None,
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut key,
            None,
        )
        .ok()
        .map_err(|_| "Could not open Windows startup settings")?;
        let result = if enabled {
            let bytes: Vec<u8> = value
                .encode_utf16()
                .chain(Some(0))
                .flat_map(u16::to_le_bytes)
                .collect();
            RegSetValueExW(key, w!("DesktopBuddy"), None, REG_SZ, Some(&bytes)).ok()
        } else {
            let status = RegDeleteValueW(key, w!("DesktopBuddy"));
            if status == ERROR_FILE_NOT_FOUND {
                Ok(())
            } else {
                status.ok()
            }
        };
        let _ = RegCloseKey(key);
        result.map_err(|_| "Could not update Windows startup settings".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quotes_the_installed_path_and_rejects_invalid_commands() {
        assert_eq!(
            command(std::path::Path::new(r"C:\Program Files\Buddy\buddy.exe")).unwrap(),
            r#""C:\Program Files\Buddy\buddy.exe" --background"#
        );
        assert!(command(std::path::Path::new("bad\"path")).is_err());
    }
}
