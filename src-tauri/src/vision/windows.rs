//! Windows active-window capture.
//!
//! Primary path: Windows Graphics Capture reads the target window's own composition surface,
//! so pixels of overlapping applications (floating panels, sumi's own always-on-top windows)
//! never enter the image. Fallback path for systems without that API: a guarded GDI screen
//! copy that still rejects any other application's visible window above the target. Only
//! sumi's own windows and DWM-cloaked windows, which contribute no third-party pixels, are
//! exempt from that guard.
use super::geometry::{self, Candidate, Rect};
use super::{CaptureFailure as Failure, CaptureFailureKind as Kind};
use base64::Engine;
use std::time::{Duration, Instant};
use windows::Win32::{
    Foundation::{E_ACCESSDENIED, HWND, LPARAM, POINT, RECT},
    Graphics::{
        Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS},
        Gdi::*,
    },
    System::Threading::GetCurrentProcessId,
    UI::WindowsAndMessaging::*,
};

/// Bounded wait for the first composition frame.
const FRAME_WAIT: Duration = Duration::from_secs(3);
const MAX_EDGE: u32 = 1280;
/// Sanity bound for any window dimension in physical pixels.
const MAX_DIMENSION: i32 = 10_000;
/// Sanity bound for the pixel count of one frame.
const MAX_PIXELS: i64 = 16_777_216;

/// Validated frame or window dimensions in physical pixels.
fn dimensions(width: i32, height: i32, detail: &'static str) -> Result<(u32, u32), Failure> {
    if !(1..=MAX_DIMENSION).contains(&width)
        || !(1..=MAX_DIMENSION).contains(&height)
        || i64::from(width) * i64::from(height) > MAX_PIXELS
    {
        return Err(Failure::new(Kind::WindowUnavailable, detail));
    }
    Ok((width as u32, height as u32))
}

fn rect(r: RECT) -> Rect {
    Rect::new(r.left, r.top, r.right, r.bottom)
}
fn cloaked(hwnd: HWND) -> bool {
    let mut value = 0u32;
    unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            (&mut value as *mut u32).cast(),
            std::mem::size_of::<u32>() as u32,
        )
        .is_ok()
            && value != 0
    }
}
/// Visible frame bounds (without invisible resize borders) when DWM reports them.
fn frame_bounds(hwnd: HWND) -> Option<Rect> {
    let mut r = RECT::default();
    unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            (&mut r as *mut RECT).cast(),
            std::mem::size_of::<RECT>() as u32,
        )
        .ok()
        .map(|()| rect(r))
    }
}
fn window_rect(hwnd: HWND) -> Option<Rect> {
    let mut r = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut r).ok().map(|()| rect(r)) }
}

/// The foreground window selected by the collector, validated immediately before capture.
struct Target {
    hwnd: HWND,
    /// Full window rectangle including invisible borders.
    window: Rect,
    /// DWM frame bounds, when available.
    frame: Option<Rect>,
    /// Client area in screen coordinates.
    client: Rect,
}
impl Target {
    fn resolve(hwnd: HWND) -> Result<Self, Failure> {
        unsafe {
            if !crate::collector::session_active() {
                return Err(Failure::new(
                    Kind::SessionInactive,
                    "input_desktop_inactive",
                ));
            }
            if hwnd.0.is_null() || !IsWindow(Some(hwnd)).as_bool() {
                return Err(Failure::new(
                    Kind::WindowUnavailable,
                    "window_handle_invalid",
                ));
            }
            if GetForegroundWindow() != hwnd {
                return Err(Failure::new(
                    Kind::ForegroundChanged,
                    "foreground_window_differs",
                ));
            }
            if IsIconic(hwnd).as_bool() {
                return Err(Failure::new(Kind::WindowMinimized, "window_iconic"));
            }
            if !IsWindowVisible(hwnd).as_bool() || cloaked(hwnd) {
                return Err(Failure::new(
                    Kind::WindowUnavailable,
                    "window_hidden_or_cloaked",
                ));
            }
            // Windows that opted out of capture render black or are excluded by the system.
            let mut affinity = 0u32;
            if GetWindowDisplayAffinity(hwnd, &mut affinity).is_ok() && affinity != WDA_NONE.0 {
                return Err(Failure::new(Kind::ProtectedContent, "display_affinity_set"));
            }
            let mut client = RECT::default();
            GetClientRect(hwnd, &mut client)
                .map_err(|_| Failure::new(Kind::WindowUnavailable, "client_rect_unavailable"))?;
            let mut origin = POINT::default();
            if !ClientToScreen(hwnd, &mut origin).as_bool() {
                return Err(Failure::new(
                    Kind::WindowUnavailable,
                    "client_origin_unavailable",
                ));
            }
            let client = Rect::new(
                origin.x,
                origin.y,
                origin.x.saturating_add(client.right),
                origin.y.saturating_add(client.bottom),
            );
            dimensions(
                client.width(),
                client.height(),
                "client_bounds_out_of_range",
            )?;
            let window = window_rect(hwnd).ok_or(Failure::new(
                Kind::WindowUnavailable,
                "window_rect_unavailable",
            ))?;
            Ok(Self {
                hwnd,
                window,
                frame: frame_bounds(hwnd),
                client,
            })
        }
    }
    /// A frame is evidence only while the same window is still the live, visible foreground.
    fn still_current(&self) -> Result<(), Failure> {
        unsafe {
            if !crate::collector::session_active() {
                return Err(Failure::new(
                    Kind::SessionInactive,
                    "input_desktop_inactive_after_capture",
                ));
            }
            if GetForegroundWindow() != self.hwnd {
                return Err(Failure::new(
                    Kind::ForegroundChanged,
                    "foreground_changed_after_capture",
                ));
            }
            if IsIconic(self.hwnd).as_bool() {
                return Err(Failure::new(
                    Kind::WindowMinimized,
                    "window_iconic_after_capture",
                ));
            }
            // A moved or resized window invalidates the client crop and the frame itself.
            if window_rect(self.hwnd) != Some(self.window) {
                return Err(Failure::new(
                    Kind::ForegroundChanged,
                    "window_bounds_changed_after_capture",
                ));
            }
        }
        Ok(())
    }
    /// Crop that isolates the client area when the frame maps 1:1 onto a known rectangle.
    fn client_crop(&self, width: u32, height: u32) -> Option<Rect> {
        [Some(self.window), self.frame]
            .into_iter()
            .flatten()
            .find_map(|bounds| {
                geometry::client_crop(width as i32, height as i32, &bounds, &self.client, 2)
            })
    }
}

/// Tightly packed RGB pixels of the target only.
struct Frame {
    width: u32,
    height: u32,
    rgb: Vec<u8>,
}

pub(super) fn capture(id: u64) -> Result<String, Failure> {
    let target = Target::resolve(HWND(id as usize as *mut _))?;
    let frame = match graphics_capture::capture(&target) {
        Err(failure) if failure.kind == Kind::Unsupported => gdi::capture(&target)?,
        other => other?,
    };
    target.still_current()?;
    encode(frame)
}

fn encode(frame: Frame) -> Result<String, Failure> {
    if geometry::uniform(&frame.rgb, 3) {
        return Err(Failure::new(Kind::BlankFrame, "uniform_pixels"));
    }
    let image = image::RgbImage::from_raw(frame.width, frame.height, frame.rgb)
        .ok_or(Failure::new(Kind::Encoding, "frame_dimensions_mismatch"))?;
    let (width, height) = geometry::scaled_size(frame.width, frame.height, MAX_EDGE);
    let image = if (width, height) == (frame.width, frame.height) {
        image
    } else {
        image::imageops::resize(&image, width, height, image::imageops::FilterType::Triangle)
    };
    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 65)
        .encode(
            image.as_raw(),
            width,
            height,
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|_| Failure::new(Kind::Encoding, "jpeg_encoding_failed"))?;
    if jpeg.len() > super::MAX_JPEG_BYTES {
        return Err(Failure::new(Kind::ImageTooLarge, "jpeg_over_budget"));
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(jpeg))
}

/// Windows Graphics Capture of one HWND. The composition surface contains only the target.
mod graphics_capture {
    use super::*;
    use std::sync::mpsc::{channel, Receiver};
    use windows::{
        core::{h, Interface},
        Foundation::{Metadata::ApiInformation, TypedEventHandler},
        Graphics::{
            Capture::{
                Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureAccess,
                GraphicsCaptureAccessKind, GraphicsCaptureItem, GraphicsCaptureSession,
            },
            DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
        },
        Win32::{
            Foundation::HMODULE,
            Graphics::{
                Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP},
                Direct3D11::*,
                Dxgi::{Common::DXGI_FORMAT_B8G8R8A8_UNORM, IDXGIDevice},
            },
            System::WinRT::{
                Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
                Graphics::Capture::IGraphicsCaptureItemInterop,
                RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED,
            },
        },
    };

    /// Balanced WinRT initialization on the worker thread; an already initialized
    /// apartment of another mode is used as is.
    struct Apartment(bool);
    impl Apartment {
        fn enter() -> Self {
            Self(unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.is_ok())
        }
    }
    impl Drop for Apartment {
        fn drop(&mut self) {
            if self.0 {
                unsafe { RoUninitialize() };
            }
        }
    }
    fn api(kind: Kind, detail: &'static str) -> impl Fn(windows::core::Error) -> Failure {
        move |_| Failure::new(kind, detail)
    }
    /// Access refusals are a permission category; anything else keeps the stage detail.
    fn api_or_denied(kind: Kind, detail: &'static str) -> impl Fn(windows::core::Error) -> Failure {
        move |error| {
            if error.code() == E_ACCESSDENIED {
                Failure::new(Kind::PermissionUnavailable, "capture_access_denied")
            } else {
                Failure::new(kind, detail)
            }
        }
    }
    /// Frames hold a composition surface; close them on every path.
    struct Captured(Direct3D11CaptureFrame);
    impl Drop for Captured {
        fn drop(&mut self) {
            let _ = self.0.Close();
        }
    }
    /// Per-window capture items need Windows 10 1903 (UniversalApiContract 8).
    fn supported() -> bool {
        ApiInformation::IsApiContractPresentByMajor(
            h!("Windows.Foundation.UniversalApiContract"),
            8,
        )
        .unwrap_or(false)
            && GraphicsCaptureSession::IsSupported().unwrap_or(false)
    }
    fn device() -> Result<(ID3D11Device, ID3D11DeviceContext, IDirect3DDevice), Failure> {
        let mut device = None;
        let mut context = None;
        for driver in [D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP] {
            let created = unsafe {
                D3D11CreateDevice(
                    None,
                    driver,
                    HMODULE::default(),
                    D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                    None,
                    D3D11_SDK_VERSION,
                    Some(&mut device),
                    None,
                    Some(&mut context),
                )
            };
            if created.is_ok() && device.is_some() && context.is_some() {
                break;
            }
            device = None;
            context = None;
        }
        let (Some(device), Some(context)) = (device, context) else {
            return Err(Failure::new(Kind::ApiError, "direct3d_device_unavailable"));
        };
        let dxgi: IDXGIDevice = device
            .cast()
            .map_err(api(Kind::ApiError, "dxgi_device_unavailable"))?;
        let winrt: IDirect3DDevice = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi) }
            .map_err(api(Kind::ApiError, "winrt_device_unavailable"))?
            .cast()
            .map_err(api(Kind::ApiError, "winrt_device_unavailable"))?;
        Ok((device, context, winrt))
    }
    /// Cursor and the system capture border are cosmetic; every refusal is tolerated.
    fn configure(session: &GraphicsCaptureSession) {
        let name = h!("Windows.Graphics.Capture.GraphicsCaptureSession");
        if ApiInformation::IsPropertyPresent(name, h!("IsCursorCaptureEnabled")).unwrap_or(false) {
            let _ = session.SetIsCursorCaptureEnabled(false);
        }
        if ApiInformation::IsPropertyPresent(name, h!("IsBorderRequired")).unwrap_or(false) {
            // Unpackaged desktop apps receive borderless access without a prompt.
            if let Ok(request) =
                GraphicsCaptureAccess::RequestAccessAsync(GraphicsCaptureAccessKind::Borderless)
            {
                let _ = request.get();
            }
            let _ = session.SetIsBorderRequired(false);
        }
    }
    fn wait_frame(
        pool: &Direct3D11CaptureFramePool,
        arrived: &Receiver<()>,
    ) -> Result<Direct3D11CaptureFrame, Failure> {
        let deadline = Instant::now() + FRAME_WAIT;
        loop {
            if let Ok(frame) = pool.TryGetNextFrame() {
                return Ok(frame);
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() || arrived.recv_timeout(remaining).is_err() {
                return Err(Failure::new(Kind::Timeout, "frame_wait_timed_out"));
            }
        }
    }
    pub(super) fn capture(target: &Target) -> Result<Frame, Failure> {
        if !supported() {
            return Err(Failure::new(
                Kind::Unsupported,
                "graphics_capture_api_missing",
            ));
        }
        let _apartment = Apartment::enter();
        let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
            .map_err(api(Kind::ApiError, "capture_item_factory_unavailable"))?;
        let item: GraphicsCaptureItem = unsafe { interop.CreateForWindow(target.hwnd) }.map_err(
            api_or_denied(Kind::WindowUnavailable, "capture_item_for_window_rejected"),
        )?;
        let size = item
            .Size()
            .map_err(api(Kind::ApiError, "capture_item_size_unavailable"))?;
        dimensions(size.Width, size.Height, "capture_item_size_out_of_range")?;
        let (device, context, winrt_device) = device()?;
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &winrt_device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            1,
            size,
        )
        .map_err(api(Kind::ApiError, "frame_pool_unavailable"))?;
        let session = pool
            .CreateCaptureSession(&item)
            .map_err(api(Kind::ApiError, "capture_session_unavailable"))?;
        configure(&session);
        let (sender, arrived) = channel::<()>();
        let token = pool
            .FrameArrived(&TypedEventHandler::new(move |_, _| {
                let _ = sender.send(());
                Ok(())
            }))
            .map_err(api(Kind::ApiError, "frame_event_unavailable"))?;
        let frame = match session.StartCapture() {
            Ok(()) => wait_frame(&pool, &arrived).map(Captured),
            Err(error) => Err(api_or_denied(Kind::ApiError, "capture_start_rejected")(
                error,
            )),
        };
        // Release the session before reading so the border and the stream end promptly.
        let _ = pool.RemoveFrameArrived(token);
        let _ = session.Close();
        let _ = pool.Close();
        let frame = frame?;
        target.still_current()?;
        read(&device, &context, &frame.0, target)
    }
    fn read(
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        frame: &Direct3D11CaptureFrame,
        target: &Target,
    ) -> Result<Frame, Failure> {
        let content = frame
            .ContentSize()
            .map_err(api(Kind::ApiError, "frame_content_size_unavailable"))?;
        let surface = frame
            .Surface()
            .map_err(api(Kind::ApiError, "frame_surface_unavailable"))?;
        let access: IDirect3DDxgiInterfaceAccess = surface
            .cast()
            .map_err(api(Kind::ApiError, "frame_surface_access_unavailable"))?;
        let texture: ID3D11Texture2D = unsafe { access.GetInterface() }
            .map_err(api(Kind::ApiError, "frame_texture_unavailable"))?;
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { texture.GetDesc(&mut desc) };
        if desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM {
            return Err(Failure::new(Kind::ApiError, "frame_format_unexpected"));
        }
        let (width, height) = dimensions(
            content.Width.min(desc.Width as i32),
            content.Height.min(desc.Height as i32),
            "frame_content_empty",
        )?;
        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: desc.Format,
            SampleDesc: desc.SampleDesc,
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };
        let mut staging: Option<ID3D11Texture2D> = None;
        unsafe { device.CreateTexture2D(&staging_desc, None, Some(&mut staging)) }
            .map_err(api(Kind::ApiError, "staging_texture_unavailable"))?;
        let staging = staging.ok_or(Failure::new(Kind::ApiError, "staging_texture_unavailable"))?;
        let region = D3D11_BOX {
            left: 0,
            top: 0,
            front: 0,
            right: width,
            bottom: height,
            back: 1,
        };
        unsafe { context.CopySubresourceRegion(&staging, 0, 0, 0, 0, &texture, 0, Some(&region)) };
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe { context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)) }
            .map_err(api(Kind::ApiError, "frame_map_failed"))?;
        let pitch = mapped.RowPitch as usize;
        if mapped.pData.is_null() || pitch < width as usize * 4 {
            unsafe { context.Unmap(&staging, 0) };
            return Err(Failure::new(Kind::ApiError, "frame_layout_unexpected"));
        }
        let crop = target.client_crop(width, height).unwrap_or(Rect::new(
            0,
            0,
            width as i32,
            height as i32,
        ));
        let data = unsafe {
            std::slice::from_raw_parts(mapped.pData as *const u8, pitch * height as usize)
        };
        let mut rgb = Vec::with_capacity((crop.width() * crop.height() * 3) as usize);
        for y in crop.top..crop.bottom {
            let row = &data[y as usize * pitch..];
            for x in crop.left..crop.right {
                let p = &row[x as usize * 4..x as usize * 4 + 4];
                rgb.extend_from_slice(&[p[2], p[1], p[0]]);
            }
        }
        unsafe { context.Unmap(&staging, 0) };
        Ok(Frame {
            width: crop.width() as u32,
            height: crop.height() as u32,
            rgb,
        })
    }
}

/// Guarded GDI screen copy for systems without Windows Graphics Capture. A screen copy
/// contains whatever is drawn above the target, so any other application's visible window
/// over the client area rejects the capture before and after the copy.
mod gdi {
    use super::*;
    struct Scan {
        target: HWND,
        area: Rect,
        own_process: u32,
        blocked: bool,
        reached_target: bool,
    }
    unsafe extern "system" fn above(window: HWND, data: LPARAM) -> windows::core::BOOL {
        let scan = &mut *(data.0 as *mut Scan);
        if window == scan.target {
            scan.reached_target = true;
            return false.into(); // All subsequent windows are behind the target.
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(window, Some(&mut pid));
        let candidate = Candidate {
            visible: IsWindowVisible(window).as_bool(),
            minimized: IsIconic(window).as_bool(),
            cloaked: cloaked(window),
            own_process: pid == scan.own_process,
            rect: frame_bounds(window)
                .or_else(|| window_rect(window))
                .unwrap_or_default(),
        };
        if geometry::occludes(&candidate, &scan.area) {
            scan.blocked = true;
        }
        true.into()
    }
    fn unoccluded(target: &Target, detail: &'static str) -> Result<(), Failure> {
        let mut scan = Scan {
            target: target.hwnd,
            area: target.client,
            own_process: unsafe { GetCurrentProcessId() },
            blocked: false,
            reached_target: false,
        };
        let _ = unsafe { EnumWindows(Some(above), LPARAM(&mut scan as *mut _ as isize)) };
        if !scan.reached_target {
            return Err(Failure::new(
                Kind::WindowUnavailable,
                "target_not_enumerated",
            ));
        }
        if scan.blocked {
            return Err(Failure::new(Kind::Occluded, detail));
        }
        Ok(())
    }
    pub(super) fn capture(target: &Target) -> Result<Frame, Failure> {
        unoccluded(target, "other_window_above_target")?;
        let (w, h) = (target.client.width(), target.client.height());
        unsafe {
            let source = GetDC(Some(target.hwnd));
            if source.is_invalid() {
                return Err(Failure::new(Kind::ApiError, "window_dc_unavailable"));
            }
            let dc = CreateCompatibleDC(Some(source));
            let bitmap = CreateCompatibleBitmap(source, w, h);
            let old = SelectObject(dc, bitmap.into());
            let copied = BitBlt(dc, 0, 0, w, h, Some(source), 0, 0, SRCCOPY).is_ok();
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
            let _ = ReleaseDC(Some(target.hwnd), source);
            if !copied || read != h {
                return Err(Failure::new(Kind::ApiError, "gdi_copy_failed"));
            }
            // Nothing may have appeared above the target while the screen copy ran.
            unoccluded(target, "other_window_appeared_during_copy")?;
            let rgb = pixels
                .as_chunks::<4>()
                .0
                .iter()
                .flat_map(|p| [p[2], p[1], p[0]])
                .collect();
            Ok(Frame {
                width: w as u32,
                height: h as u32,
                rgb,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capture_rejects_invalid_or_excessive_dimensions() {
        for (w, h) in [(0, 100), (-1, 100), (10_001, 100), (100, 0), (8192, 8192)] {
            let failure = dimensions(w, h, "stage").unwrap_err();
            assert_eq!(
                (failure.kind, failure.detail),
                (Kind::WindowUnavailable, "stage")
            );
        }
        assert_eq!(dimensions(1920, 1080, "stage").unwrap(), (1920, 1080));
    }
    #[test]
    fn capture_encodes_a_bounded_decodable_jpeg_and_rejects_blank_frames() {
        let (width, height) = (2560u32, 1440u32);
        let rgb: Vec<u8> = (0..height)
            .flat_map(|y| (0..width).flat_map(move |x| [(x % 256) as u8, (y % 256) as u8, 128]))
            .collect();
        let encoded = encode(Frame { width, height, rgb }).unwrap();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .unwrap();
        assert!(bytes.len() <= super::super::MAX_JPEG_BYTES);
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (1280, 720));
        let blank = encode(Frame {
            width: 64,
            height: 64,
            rgb: vec![7; 64 * 64 * 3],
        })
        .unwrap_err();
        assert_eq!(
            (blank.kind, blank.detail),
            (Kind::BlankFrame, "uniform_pixels")
        );
    }
}

#[cfg(test)]
mod native_tests;
