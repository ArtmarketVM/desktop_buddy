use serde::Serialize;
use std::{collections::BTreeMap, path::Path};

#[derive(Serialize, serde::Deserialize)]
pub struct InstalledApp {
    pub process_name: String,
    pub name: String,
}

fn installer_helper(name: &str) -> bool {
    name.contains("unins")
        || name.contains("setup")
        || name.starts_with("vc_redist")
        || name.starts_with("vcredist")
        || name.starts_with("windowsdesktop-runtime-")
        || (name.starts_with("python-") && name.as_bytes().get(7).is_some_and(u8::is_ascii_digit))
        || name == "update.exe"
}

// Inventory only: never execute registry commands, follow folders or return installation paths.
fn executable(icon: &str) -> Option<String> {
    let value = icon.trim();
    let path = if value.starts_with('"') {
        value[1..].split('"').next()?
    } else {
        value
            .rsplit_once(',')
            .filter(|(_, index)| index.trim().parse::<i32>().is_ok())
            .map_or(value, |(path, _)| path)
    };
    let mut expanded = path.to_owned();
    for name in [
        "LOCALAPPDATA",
        "APPDATA",
        "ProgramFiles",
        "ProgramFiles(x86)",
        "SystemRoot",
        "USERPROFILE",
    ] {
        if let Ok(value) = std::env::var(name) {
            expanded = expanded.replace(&format!("%{name}%"), &value);
        }
    }
    let path = Path::new(&expanded);
    let name = path.file_name()?.to_str()?.to_ascii_lowercase();
    if name.len() > 100 || !name.ends_with(".exe") || installer_helper(&name) {
        return None;
    }
    path.is_file().then_some(name)
}

pub fn inventory() -> Vec<InstalledApp> {
    let mut apps = BTreeMap::new();
    #[cfg(windows)]
    windows_inventory(&mut apps);
    #[cfg(target_os = "macos")]
    if let Ok(inventory) = crate::macos::installed_apps() {
        for app in inventory {
            apps.entry(app.process_name.to_ascii_lowercase())
                .or_insert(app.name);
        }
    }
    apps.into_iter()
        .map(|(process_name, name)| InstalledApp { process_name, name })
        .collect()
}

#[cfg(windows)]
fn windows_inventory(apps: &mut BTreeMap<String, String>) {
    use windows::{
        core::{PCWSTR, PWSTR},
        Win32::{Foundation::ERROR_NO_MORE_ITEMS, System::Registry::*},
    };
    struct Key(HKEY);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }
    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }
    fn open(root: HKEY, path: &str, view: REG_SAM_FLAGS) -> Option<Key> {
        let mut key = HKEY::default();
        unsafe {
            RegOpenKeyExW(
                root,
                PCWSTR(wide(path).as_ptr()),
                None,
                KEY_READ | view,
                &mut key,
            )
            .ok()
            .ok()?;
        }
        Some(Key(key))
    }
    fn value(key: &Key, name: &str) -> Option<String> {
        let mut data = [0_u16; 4096];
        let mut size = (data.len() * 2) as u32;
        let mut kind = REG_VALUE_TYPE::default();
        unsafe {
            RegQueryValueExW(
                key.0,
                PCWSTR(wide(name).as_ptr()),
                None,
                Some(&mut kind),
                Some(data.as_mut_ptr().cast()),
                Some(&mut size),
            )
            .ok()
            .ok()?;
        }
        if ![REG_SZ, REG_EXPAND_SZ].contains(&kind) {
            return None;
        }
        let length = (size as usize / 2).min(data.len());
        Some(
            String::from_utf16_lossy(&data[..length])
                .trim_end_matches('\0')
                .to_owned(),
        )
    }
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            for branch in ["App Paths", "Uninstall"] {
                let Some(parent) = open(
                    root,
                    &format!("Software\\Microsoft\\Windows\\CurrentVersion\\{branch}"),
                    view,
                ) else {
                    continue;
                };
                for index in 0..4096 {
                    let mut name = [0_u16; 512];
                    let mut length = name.len() as u32;
                    let result = unsafe {
                        RegEnumKeyExW(
                            parent.0,
                            index,
                            Some(PWSTR(name.as_mut_ptr())),
                            &mut length,
                            None,
                            None,
                            None,
                            None,
                        )
                    };
                    if result == ERROR_NO_MORE_ITEMS {
                        break;
                    }
                    if result.is_err() {
                        continue;
                    }
                    let subkey = String::from_utf16_lossy(&name[..length as usize]);
                    let Some(key) = open(parent.0, &subkey, view) else {
                        continue;
                    };
                    let candidate = if branch == "App Paths" {
                        value(&key, "")
                    } else {
                        value(&key, "DisplayIcon")
                    };
                    if let Some(process) = candidate.as_deref().and_then(executable) {
                        let title = value(&key, "DisplayName")
                            .filter(|v| !v.trim().is_empty())
                            .unwrap_or_else(|| process.trim_end_matches(".exe").to_string());
                        apps.entry(process).or_insert_with(|| {
                            title
                                .chars()
                                .filter(|c| !c.is_control())
                                .take(120)
                                .collect()
                        });
                    }
                }
            }
        }
    }
    // Shared presets supply friendly names only for verified executables.
    if let Ok(config) = crate::profile::presets() {
        for preset in config.applications {
            if let Some(name) = apps.get_mut(&preset.process) {
                *name = preset.name;
            }
        }
    }
}

#[tauri::command(async)]
pub fn get_installed_apps() -> Vec<InstalledApp> {
    inventory()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn filters_registered_installer_entries_without_hiding_regular_apps() {
        for name in [
            "unins000.exe",
            "gpluninst.exe",
            "shelluninst.exe",
            "uninstallrgscredistributable.exe",
            "setupchipset.exe",
            "vsta_setup.exe",
            "vc_redist.x64.exe",
            "vcredist_x86.exe",
            "windowsdesktop-runtime-6.0.11-win-x64.exe",
            "python-3.13.5-amd64.exe",
        ] {
            assert!(installer_helper(name), "{name}");
        }
        for name in [
            "notion.exe",
            "python.exe",
            "python3.exe",
            "chrome.exe",
            "code.exe",
        ] {
            assert!(!installer_helper(name), "{name}");
        }
    }
    #[test]
    fn rejects_missing_files_icons_and_installer_helpers() {
        for value in [
            "C:\\missing\\app.exe,0",
            "C:\\missing\\app.ico",
            "\"C:\\missing\\update.exe\",0",
            "app.exe & malicious",
        ] {
            assert!(executable(value).is_none());
        }
        let exe = std::env::temp_dir().join(format!(
            "buddy-inventory-{} Test App.exe",
            std::process::id()
        ));
        std::fs::write(&exe, b"inventory fixture; never executed").unwrap();
        assert_eq!(
            executable(&format!("\"{}\",0", exe.display())),
            exe.file_name()
                .map(|v| v.to_string_lossy().to_ascii_lowercase())
        );
        std::fs::remove_file(exe).unwrap();
    }
}
