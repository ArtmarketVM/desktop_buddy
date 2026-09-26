use super::{process_basename, ActivityCollector, DurationTracker};
use crate::models::ActivitySnapshot;
use chrono::Utc;
use windows::{
    core::PWSTR,
    Win32::{
        Foundation::CloseHandle,
        System::{
            SystemInformation::GetTickCount,
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
        UI::{
            Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
            WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId},
        },
    },
};

#[derive(Default)]
pub struct WindowsCollector {
    tracker: DurationTracker,
    previous_window: usize,
}
impl ActivityCollector for WindowsCollector {
    fn collect(&mut self) -> Result<ActivitySnapshot, String> {
        // Handles and buffers remain local; the process handle is closed before returning.
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return Err("No foreground window is available".into());
            }
            if self.previous_window != hwnd.0 as usize {
                self.tracker = DurationTracker::default();
                self.previous_window = hwnd.0 as usize;
            }
            let mut title = [0u16; 1024];
            let title_len = GetWindowTextW(hwnd, &mut title);
            let window_title = String::from_utf16_lossy(&title[..title_len.max(0) as usize]);
            let mut pid = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            let process_name =
                if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                    let mut path = [0u16; 32768];
                    let mut size = path.len() as u32;
                    let result = QueryFullProcessImageNameW(
                        handle,
                        PROCESS_NAME_WIN32,
                        PWSTR(path.as_mut_ptr()),
                        &mut size,
                    );
                    let _ = CloseHandle(handle);
                    if result.is_ok() {
                        process_basename(&String::from_utf16_lossy(&path[..size as usize]))
                    } else {
                        "Protected process".into()
                    }
                } else {
                    "Protected process".into()
                };
            let mut last = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };
            if !GetLastInputInfo(&mut last).as_bool() {
                return Err("Could not read idle time".into());
            }
            let idle_seconds = GetTickCount().wrapping_sub(last.dwTime) as u64 / 1000;
            let active_seconds = self
                .tracker
                .update(&process_name, &window_title, idle_seconds);
            Ok(ActivitySnapshot {
                timestamp: Utc::now().to_rfc3339(),
                process_name,
                window_title,
                idle_seconds,
                active_seconds,
            })
        }
    }
}

pub fn foreground_fullscreen() -> bool {
    use windows::Win32::{
        Foundation::RECT,
        Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        },
        UI::WindowsAndMessaging::{GetDesktopWindow, GetShellWindow, GetWindowRect},
    };
    unsafe {
        let window = GetForegroundWindow();
        if window.0.is_null() || window == GetDesktopWindow() || window == GetShellWindow() {
            return false;
        }
        let mut rect = RECT::default();
        if GetWindowRect(window, &mut rect).is_err() {
            return false;
        }
        let monitor = MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return false;
        }
        rect.left <= info.rcMonitor.left
            && rect.top <= info.rcMonitor.top
            && rect.right >= info.rcMonitor.right
            && rect.bottom >= info.rcMonitor.bottom
    }
}
