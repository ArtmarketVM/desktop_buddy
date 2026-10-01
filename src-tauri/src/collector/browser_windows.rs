use crate::browser::{sanitize_domain, BrowserActivityProvider};
use std::{
    sync::mpsc,
    time::{Duration, Instant},
};
use windows::{
    core::Interface,
    Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    },
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
    process: String,
    title: String,
}
struct Reply {
    window: usize,
    title: String,
    domain: Option<String>,
    media: bool,
}

/// One bounded worker owns all COM objects. A hung accessibility provider can
/// never create unbounded tasks or hold the application state mutex indefinitely.
pub struct WindowsBrowserProvider {
    requests: mpsc::SyncSender<Request>,
    replies: mpsc::Receiver<Reply>,
    pending: bool,
}
impl Default for WindowsBrowserProvider {
    fn default() -> Self {
        let (requests, input) = mpsc::sync_channel::<Request>(1);
        let (output, replies) = mpsc::sync_channel::<Reply>(1);
        std::thread::spawn(move || unsafe {
            if CoInitializeEx(None, COINIT_MULTITHREADED).is_err() {
                return;
            }
            {
                let automation: Option<IUIAutomation2> =
                    CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER).ok();
                if let Some(a) = &automation {
                    let _ = a.SetConnectionTimeout(150);
                    let _ = a.SetTransactionTimeout(150);
                }
                let media = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                    .ok()
                    .and_then(|a| a.get().ok());
                while let Ok(request) = input.recv() {
                    let window = HWND(request.window as *mut _);
                    let mut domain = None;
                    if crate::browser::browser_name(&request.process).is_some()
                        && GetForegroundWindow() == window
                    {
                        if let Some(a) = &automation {
                            domain = address_domain(a, window);
                        }
                    }
                    let playing = media
                        .as_ref()
                        .is_some_and(|m| media_playing(m, &request.process));
                    if GetForegroundWindow() != window {
                        domain = None;
                    }
                    if output
                        .send(Reply {
                            window: request.window,
                            title: request.title,
                            domain,
                            media: playing,
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
            requests,
            replies,
            pending: false,
        }
    }
}
impl BrowserActivityProvider for WindowsBrowserProvider {
    fn metadata(&mut self, window: usize, process: &str, title: &str) -> (Option<String>, bool) {
        // Never reuse a late result: a tab may change without a title change.
        while self.replies.try_recv().is_ok() {
            self.pending = false;
        }
        if self.pending {
            return (None, false);
        }
        if self
            .requests
            .try_send(Request {
                window,
                process: process.into(),
                title: title.into(),
            })
            .is_err()
        {
            return (None, false);
        }
        self.pending = true;
        if let Ok(reply) = self.replies.recv_timeout(Duration::from_millis(180)) {
            self.pending = false;
            if reply.window == window && reply.title == title {
                return (reply.domain, reply.media);
            }
        }
        (None, false)
    }
}

unsafe fn address_domain(automation: &IUIAutomation2, window: HWND) -> Option<String> {
    let a: IUIAutomation = automation.cast().ok()?;
    let root = a.ElementFromHandle(window).ok()?;
    let walker = a.ControlViewWalker().ok()?;
    let mut stack = vec![(root, 0usize)];
    let deadline = Instant::now() + Duration::from_millis(120);
    let mut visited = 0;
    while let Some((element, depth)) = stack.pop() {
        visited += 1;
        if visited > 100 || Instant::now() >= deadline {
            break;
        }
        let control = element.CurrentControlType().ok()?;
        // Do not traverse web document trees or inspect form fields.
        if control == UIA_DocumentControlTypeId {
            continue;
        }
        if control == UIA_EditControlTypeId {
            let id = element
                .CurrentAutomationId()
                .ok()
                .map(|s| s.to_string())
                .unwrap_or_default();
            let name = element
                .CurrentName()
                .ok()
                .map(|s| s.to_string().to_lowercase())
                .unwrap_or_default();
            let known = id == "urlbar-input"
                || [
                    "address and search bar",
                    "search or enter web address",
                    "address and search",
                    "адресная строка и строка поиска",
                    "адрес и поиск",
                    "שורת הכתובת והחיפוש",
                ]
                .contains(&name.as_str());
            if known
                && !element.CurrentIsPassword().ok()?.as_bool()
                && !element.CurrentHasKeyboardFocus().ok()?.as_bool()
                && !element.CurrentIsOffscreen().ok()?.as_bool()
            {
                let pattern: IUIAutomationValuePattern =
                    element.GetCurrentPatternAs(UIA_ValuePatternId).ok()?;
                return sanitize_domain(&pattern.CurrentValue().ok()?.to_string());
            }
            continue;
        }
        if depth >= 7 {
            continue;
        }
        let mut child = walker.GetFirstChildElement(&element).ok();
        let mut siblings = 0;
        while let Some(element) = child {
            if siblings >= 40 || Instant::now() >= deadline {
                break;
            }
            siblings += 1;
            child = walker.GetNextSiblingElement(&element).ok();
            stack.push((element, depth + 1));
        }
    }
    None
}

fn media_playing(
    manager: &GlobalSystemMediaTransportControlsSessionManager,
    process: &str,
) -> bool {
    let Ok(sessions) = manager.GetSessions() else {
        return false;
    };
    let process = process.to_ascii_lowercase();
    (0..sessions.Size().unwrap_or(0)).any(|i| {
        let Ok(session) = sessions.GetAt(i) else {
            return false;
        };
        let source = session
            .SourceAppUserModelId()
            .map(|s| s.to_string().to_ascii_lowercase())
            .unwrap_or_default();
        // Exact executable identity only, no title-based video guesses.
        source.rsplit(['/', '\\']).next() == Some(process.as_str())
            && session
                .GetPlaybackInfo()
                .and_then(|info| info.PlaybackStatus())
                .is_ok_and(|s| {
                    s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
                })
    })
}
