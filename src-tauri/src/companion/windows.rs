use std::{
    sync::{mpsc, Mutex, OnceLock},
    time::{Duration, Instant},
};
use windows::{
    core::Interface,
    Win32::{
        Foundation::HWND,
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_MULTITHREADED,
        },
        UI::{Accessibility::*, WindowsAndMessaging::GetForegroundWindow},
    },
};

struct Request {
    window: usize,
    selected: bool,
}
struct Reply {
    window: usize,
    selected: bool,
    text: String,
}
struct Sampler {
    sender: mpsc::SyncSender<Request>,
    receiver: mpsc::Receiver<Reply>,
    pending: bool,
}
impl Sampler {
    fn new() -> Self {
        let (sender, requests) = mpsc::sync_channel::<Request>(1);
        let (output, receiver) = mpsc::sync_channel::<Reply>(1);
        std::thread::spawn(move || unsafe {
            if CoInitializeEx(None, COINIT_MULTITHREADED).is_err() {
                return;
            }
            {
                let automation: Option<IUIAutomation2> =
                    CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER).ok();
                if let Some(a) = &automation {
                    let _ = a.SetConnectionTimeout(120);
                    let _ = a.SetTransactionTimeout(120);
                }
                while let Ok(request) = requests.recv() {
                    let hwnd = HWND(request.window as *mut _);
                    let text = automation
                        .as_ref()
                        .and_then(|a| sample(a, hwnd, request.selected))
                        .unwrap_or_default();
                    let text = if GetForegroundWindow() == hwnd {
                        text
                    } else {
                        String::new()
                    };
                    if output
                        .send(Reply {
                            window: request.window,
                            selected: request.selected,
                            text,
                        })
                        .is_err()
                    {
                        break;
                    }
                }
            }
            CoUninitialize();
        });
        Self {
            sender,
            receiver,
            pending: false,
        }
    }
}
/// A single bounded COM worker is shared by manual selection and opted-in sampling.
/// A hung provider cannot create unlimited workers or retain an application lock.
pub fn context(window: usize, selected: bool) -> Result<String, String> {
    static SAMPLER: OnceLock<Mutex<Sampler>> = OnceLock::new();
    let mut worker = SAMPLER
        .get_or_init(|| Mutex::new(Sampler::new()))
        .try_lock()
        .map_err(|_| "Screen context is busy")?;
    while worker.receiver.try_recv().is_ok() {
        worker.pending = false;
    }
    if worker.pending {
        return Err("The application has not returned accessible text yet".into());
    }
    worker
        .sender
        .try_send(Request { window, selected })
        .map_err(|_| "Screen context unavailable")?;
    worker.pending = true;
    let reply = worker
        .receiver
        .recv_timeout(Duration::from_millis(300))
        .map_err(|_| "This application does not expose accessible text")?;
    worker.pending = false;
    if reply.window != window || reply.selected != selected {
        return Err("Screen context changed")?;
    }
    Ok(reply.text)
}
unsafe fn sample(automation: &IUIAutomation2, window: HWND, selected: bool) -> Option<String> {
    if GetForegroundWindow() != window {
        return None;
    }
    let automation: IUIAutomation = automation.cast().ok()?;
    let root = automation.ElementFromHandle(window).ok()?;
    let walker = automation.ControlViewWalker().ok()?;
    let deadline = Instant::now() + Duration::from_millis(200);
    let mut stack = vec![(root, 0usize)];
    let mut visited = 0;
    let mut pieces = vec![];
    // Manual selection reads one extra character so goal intake can reject oversize text.
    let mut remaining = if selected { 4001usize } else { 3000usize };
    while let Some((element, depth)) = stack.pop() {
        visited += 1;
        if visited > 80 || Instant::now() > deadline || remaining == 0 {
            break;
        }
        // Do not inspect password or editable controls. Document text depends on its provider.
        if element.CurrentIsPassword().ok()?.as_bool()
            || element.CurrentIsOffscreen().ok()?.as_bool()
        {
            continue;
        }
        let control = element.CurrentControlType().ok()?;
        if control == UIA_EditControlTypeId && !selected {
            continue;
        }
        if let Ok(pattern) =
            element.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
        {
            let ranges = if selected {
                pattern.GetSelection()
            } else {
                pattern.GetVisibleRanges()
            };
            if let Ok(ranges) = ranges {
                for index in 0..ranges.Length().ok()?.min(3) {
                    if let Ok(range) = ranges.GetElement(index) {
                        if let Ok(text) = range.GetText(remaining as i32) {
                            let text: String = text.to_string().chars().take(remaining).collect();
                            if !text.trim().is_empty() {
                                remaining = remaining.saturating_sub(text.chars().count());
                                pieces.push(text);
                            }
                        }
                    }
                }
                if !pieces.is_empty() {
                    break;
                }
            }
        }
        if depth >= 7 {
            continue;
        }
        let mut child = walker.GetFirstChildElement(&element).ok();
        let mut siblings = 0;
        while let Some(element) = child {
            if siblings >= 25 || Instant::now() > deadline {
                break;
            }
            child = walker.GetNextSiblingElement(&element).ok();
            stack.push((element, depth + 1));
            siblings += 1;
        }
    }
    Some(pieces.join("\n"))
}

pub fn voice_typing() -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    let input = |key: VIRTUAL_KEY, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                dwFlags: if up {
                    KEYEVENTF_KEYUP
                } else {
                    KEYBD_EVENT_FLAGS(0)
                },
                ..Default::default()
            },
        },
    };
    let inputs = [
        input(VK_LWIN, false),
        input(VIRTUAL_KEY(0x48), false),
        input(VIRTUAL_KEY(0x48), true),
        input(VK_LWIN, true),
    ];
    if unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) } != inputs.len() as u32 {
        return Err("Open Windows voice typing with Windows + H".into());
    }
    Ok(())
}

pub fn install_selection_shortcut(app: tauri::AppHandle) {
    use tauri::Manager;
    use windows::Win32::UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*};
    std::thread::spawn(move || unsafe {
        let companion_available =
            RegisterHotKey(None, 0x4244, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 0x42).is_ok();
        let goal_available =
            RegisterHotKey(None, 0x4247, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 0x47).is_ok();
        if let Ok(mut inner) = app.state::<crate::commands::AppState>().inner.lock() {
            inner.companion.view.shortcut_available = companion_available;
        }
        if !companion_available && !goal_available {
            return;
        }
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).0 > 0 {
            if message.message != WM_HOTKEY || crate::collector::foreground_fullscreen() {
                continue;
            }
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                continue;
            }
            let handle = app.clone();
            let window = hwnd.0 as usize;
            let as_goal = message.wParam.0 == 0x4247;
            tauri::async_runtime::spawn(async move {
                let allowed = handle
                    .state::<crate::commands::AppState>()
                    .inner
                    .lock()
                    .is_ok_and(|inner| {
                        inner
                            .storage
                            .user_settings()
                            .is_ok_and(|s| s.onboarding.completed)
                    });
                if !allowed {
                    return;
                }
                let result =
                    tauri::async_runtime::spawn_blocking(move || context(window, true)).await;
                let (text, mut notice) = match result {
                    Ok(Ok(text)) if !text.trim().is_empty() => (text, None),
                    _ => (String::new(), Some("Selected text is unavailable in this app. Paste it into Buddy instead.".to_string())),
                };
                if as_goal && !text.is_empty() {
                    match crate::core_capture::receive(&handle, &text) {
                        Ok(()) => return,
                        Err(error) => notice = Some(error),
                    }
                }
                let state = handle.state::<crate::commands::AppState>();
                if let Ok(mut inner) = state.inner.lock() {
                    inner.companion.view.notice = notice;
                    inner.companion.view.seed = text;
                    inner.companion.view.intent = "selection".into();
                    inner.companion.view.chat_open = true;
                    let _ = crate::buddy::sync(&handle, &mut inner);
                }
                if let Some(window) = handle.get_webview_window("buddy") {
                    let _ = window.set_focus();
                }
            });
        }
        let _ = UnregisterHotKey(None, 0x4244);
        let _ = UnregisterHotKey(None, 0x4247);
    });
}
