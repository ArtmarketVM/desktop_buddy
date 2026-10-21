//! Windows client-area capture. Reject occlusion instead of reading another window's pixels.
use base64::Engine;
use windows::Win32::{
    Foundation::{HWND, LPARAM, RECT},
    Graphics::Gdi::*,
    UI::WindowsAndMessaging::*,
};
struct Bounds {
    target: HWND,
    rect: RECT,
    blocked: bool,
    reached_target: bool,
}
unsafe extern "system" fn overlaps(window: HWND, data: LPARAM) -> windows::core::BOOL {
    let b = &mut *(data.0 as *mut Bounds);
    if window == b.target {
        b.reached_target = true;
        return false.into();
    } // All subsequent windows are behind the target.
    if IsWindowVisible(window).as_bool() && !IsIconic(window).as_bool() {
        let mut r = RECT::default();
        if GetWindowRect(window, &mut r).is_ok()
            && r.left < b.rect.right
            && r.right > b.rect.left
            && r.top < b.rect.bottom
            && r.bottom > b.rect.top
        {
            b.blocked = true;
        }
    }
    true.into()
}
pub(super) fn capture(id: u64) -> Result<String, String> {
    unsafe {
        let hwnd = HWND(id as usize as *mut _);
        if !crate::collector::session_active()
            || GetForegroundWindow() != hwnd
            || IsIconic(hwnd).as_bool()
        {
            return Err("Foreground changed".into());
        }
        let mut rect = RECT::default();
        GetClientRect(hwnd, &mut rect).map_err(|_| "Client area unavailable")?;
        let mut origin = windows::Win32::Foundation::POINT::default();
        if !ClientToScreen(hwnd, &mut origin).as_bool() {
            return Err("Window bounds unavailable".into());
        }
        let mut bounds = Bounds {
            target: hwnd,
            rect: RECT {
                left: origin.x,
                top: origin.y,
                right: origin.x + rect.right,
                bottom: origin.y + rect.bottom,
            },
            blocked: false,
            reached_target: false,
        };
        let _ = EnumWindows(Some(overlaps), LPARAM(&mut bounds as *mut _ as isize));
        if !bounds.reached_target
            || bounds.blocked
            || !(1..=10000).contains(&rect.right)
            || !(1..=10000).contains(&rect.bottom)
        {
            return Err("Safe unoccluded window unavailable".into());
        }
        let scale = (1280.0 / f64::from(rect.right.max(rect.bottom))).min(1.0);
        let w = (f64::from(rect.right) * scale).max(1.0) as i32;
        let h = (f64::from(rect.bottom) * scale).max(1.0) as i32;
        let source = GetDC(Some(hwnd));
        if source.is_invalid() {
            return Err("Window pixels unavailable".into());
        }
        let dc = CreateCompatibleDC(Some(source));
        let bitmap = CreateCompatibleBitmap(source, w, h);
        let old = SelectObject(dc, bitmap.into());
        let copied = StretchBlt(
            dc,
            0,
            0,
            w,
            h,
            Some(source),
            0,
            0,
            rect.right,
            rect.bottom,
            SRCCOPY,
        )
        .as_bool();
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; (w * h * 4) as usize];
        SelectObject(dc, old);
        let read = GetDIBits(
            dc,
            bitmap,
            0,
            h as u32,
            Some(pixels.as_mut_ptr().cast()),
            &mut info,
            DIB_RGB_COLORS,
        );
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(dc);
        let _ = ReleaseDC(Some(hwnd), source);
        let mut after = Bounds {
            target: hwnd,
            rect: bounds.rect,
            blocked: false,
            reached_target: false,
        };
        let _ = EnumWindows(Some(overlaps), LPARAM(&mut after as *mut _ as isize));
        if !copied
            || read != h
            || !after.reached_target
            || after.blocked
            || !crate::collector::session_active()
            || GetForegroundWindow() != hwnd
        {
            return Err("Capture context changed".into());
        }
        let rgb: Vec<u8> = pixels
            .as_chunks::<4>()
            .0
            .iter()
            .flat_map(|p| [p[2], p[1], p[0]])
            .collect();
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 65)
            .encode(&rgb, w as u32, h as u32, image::ExtendedColorType::Rgb8)
            .map_err(|_| "Image encoding unavailable")?;
        if jpeg.len() > 300000 {
            return Err("Image exceeds the context budget".into());
        }
        Ok(base64::engine::general_purpose::STANDARD.encode(jpeg))
    }
}
