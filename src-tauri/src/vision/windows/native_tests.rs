//! Explicit interactive regression; captures only synthetic windows owned by this test.
use super::*;
use std::sync::mpsc;
use windows::{
    core::w,
    Win32::{
        Foundation::{COLORREF, LPARAM, LRESULT, POINT, WPARAM},
        System::Threading::{AttachThreadInput, GetCurrentThreadId},
    },
};

// Interactive tests are launched by a background shell. Temporarily share the
// foreground input queue to activate our fixture, then detach before capturing.
fn activate(hwnd: HWND) {
    unsafe {
        let current = GetCurrentThreadId();
        let foreground = GetWindowThreadProcessId(GetForegroundWindow(), None);
        let attached =
            current != foreground && AttachThreadInput(current, foreground, true).as_bool();
        let _ = SetForegroundWindow(hwnd);
        if attached {
            let _ = AttachThreadInput(current, foreground, false);
        }
    }
}

unsafe extern "system" fn paint(hwnd: HWND, message: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    match message {
        WM_PAINT => {
            let mut paint = PAINTSTRUCT::default();
            let dc = unsafe { BeginPaint(hwnd, &mut paint) };
            // Target is blue; the non-activating covering window is red.
            let color = if unsafe { GetWindowLongPtrW(hwnd, GWLP_USERDATA) } == 1 {
                0x000000ff
            } else {
                0x00ff0000
            };
            let brush = unsafe { CreateSolidBrush(COLORREF(color)) };
            unsafe {
                FillRect(dc, &paint.rcPaint, brush);
                let _ = DeleteObject(brush.into());
                let _ = EndPaint(hwnd, &paint);
            }
            LRESULT(0)
        }
        WM_DESTROY => {
            unsafe { PostQuitMessage(0) };
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, message, w, l) },
    }
}

struct Fixture {
    target: usize,
    overlay: usize,
    previous: usize,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        unsafe {
            let _ = PostMessageW(
                Some(HWND(self.target as *mut _)),
                WM_CLOSE,
                WPARAM(0),
                LPARAM(0),
            );
            if self.previous != 0 {
                let _ = SetForegroundWindow(HWND(self.previous as *mut _));
            }
        }
        if let Some(thread) = self.thread.take() {
            thread.join().unwrap();
        }
    }
}
fn fixture() -> Fixture {
    let previous = unsafe { GetForegroundWindow() }.0 as usize;
    let (sender, receiver) = mpsc::sync_channel(1);
    let thread = std::thread::spawn(move || unsafe {
        // A null instance is valid for this process-local window class.
        let class = WNDCLASSW {
            lpfnWndProc: Some(paint),
            lpszClassName: w!("SumiCaptureRegression"),
            ..Default::default()
        };
        assert_ne!(RegisterClassW(&class), 0);
        let target = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            w!("SumiCaptureRegression"),
            w!("Synthetic capture target"),
            WS_POPUP,
            80,
            80,
            360,
            240,
            None,
            None,
            None,
            None,
        )
        .unwrap();
        let overlay = CreateWindowExW(
            WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST,
            w!("SumiCaptureRegression"),
            w!("Synthetic capture overlay"),
            WS_POPUP,
            160,
            140,
            180,
            120,
            None,
            None,
            None,
            None,
        )
        .unwrap();
        SetWindowLongPtrW(overlay, GWLP_USERDATA, 1);
        let _ = ShowWindow(target, SW_SHOW);
        activate(target);
        let _ = ShowWindow(overlay, SW_SHOWNOACTIVATE);
        let _ = RedrawWindow(Some(target), None, None, RDW_INVALIDATE | RDW_UPDATENOW);
        let _ = RedrawWindow(Some(overlay), None, None, RDW_INVALIDATE | RDW_UPDATENOW);
        sender
            .send((target.0 as usize, overlay.0 as usize))
            .unwrap();
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        let _ = DestroyWindow(overlay);
        let _ = UnregisterClassW(w!("SumiCaptureRegression"), None);
    });
    let (target, overlay) = receiver.recv_timeout(Duration::from_secs(5)).unwrap();
    Fixture {
        target,
        overlay,
        previous,
        thread: Some(thread),
    }
}

#[test]
#[ignore = "Interactive Windows desktop; creates and captures only synthetic test windows"]
fn window_capture_excludes_overlay_and_rejects_changed_or_protected_target() {
    let fixture = fixture();
    let target = HWND(fixture.target as *mut _);
    let overlay = HWND(fixture.overlay as *mut _);
    let deadline = Instant::now() + Duration::from_secs(2);
    while unsafe { GetForegroundWindow() } != target && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(
        unsafe { GetForegroundWindow() },
        target,
        "Test desktop did not grant foreground activation"
    );
    assert_eq!(
        unsafe { WindowFromPoint(POINT { x: 260, y: 200 }) },
        overlay,
        "Synthetic overlay must visibly cover the target before testing capture isolation"
    );
    let encoded = capture(fixture.target as u64).expect("Window-specific capture failed");
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .unwrap();
    let image = image::load_from_memory(&bytes).unwrap().to_rgb8();
    let pixel = image.get_pixel(image.width() / 2, image.height() / 2);
    assert!(
        pixel[2] > 220 && pixel[0] < 25,
        "Captured another window's red pixels: {pixel:?}"
    );
    let original = Target::resolve(target).unwrap();
    unsafe {
        SetWindowPos(
            target,
            None,
            90,
            80,
            360,
            240,
            SWP_NOZORDER | SWP_NOACTIVATE,
        )
        .unwrap();
    }
    assert_eq!(
        original.still_current().unwrap_err().kind,
        Kind::ForegroundChanged
    );
    unsafe {
        SetWindowDisplayAffinity(target, WDA_EXCLUDEFROMCAPTURE).unwrap();
    }
    assert_eq!(
        capture(fixture.target as u64).unwrap_err().kind,
        Kind::ProtectedContent
    );
    unsafe {
        SetWindowDisplayAffinity(target, WDA_NONE).unwrap();
    }
    activate(overlay);
    assert_eq!(
        capture(fixture.target as u64).unwrap_err().kind,
        Kind::ForegroundChanged
    );
}
