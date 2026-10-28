//! Capture only the foreground HWND's surface, independent of overlapping windows.
//! No desktop/GDI fallback: a failed window capture must never expose its neighbours.
use base64::Engine;
use std::{
    sync::mpsc,
    time::{Duration, Instant},
};
use windows::{
    core::Interface,
    Foundation::TypedEventHandler,
    Graphics::{
        Capture::{
            Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem,
            GraphicsCaptureSession,
        },
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
        SizeInt32,
    },
    Win32::{
        Foundation::{E_ACCESSDENIED, HMODULE, HWND, RECT},
        Graphics::{
            Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP},
            Direct3D11::*,
            Dxgi::{Common::DXGI_FORMAT_B8G8R8A8_UNORM, IDXGIDevice, DXGI_ERROR_WAS_STILL_DRAWING},
        },
        System::WinRT::{
            Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
            Graphics::Capture::IGraphicsCaptureItemInterop,
            RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED,
        },
        UI::WindowsAndMessaging::*,
    },
};

const TIMEOUT: Duration = Duration::from_secs(5);
const PIXELS_UNAVAILABLE: &str = "Window pixels unavailable";

fn capture_error(error: windows::core::Error, fallback: &str) -> String {
    if error.code() == E_ACCESSDENIED {
        "Capture access denied".into()
    } else {
        fallback.into()
    }
}

struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}
// WinRT reference counting alone does not stop capture. Close on every error path.
struct CaptureResources {
    pool: Direct3D11CaptureFramePool,
    session: Option<GraphicsCaptureSession>,
    token: Option<i64>,
}
impl Drop for CaptureResources {
    fn drop(&mut self) {
        if let Some(session) = &self.session {
            let _ = session.Close();
        }
        if let Some(token) = self.token {
            let _ = self.pool.RemoveFrameArrived(token);
        }
        let _ = self.pool.Close();
    }
}
struct Frame(Direct3D11CaptureFrame);
impl Drop for Frame {
    fn drop(&mut self) {
        let _ = self.0.Close();
    }
}

fn dimensions(size: SizeInt32) -> Result<(u32, u32), String> {
    if !(1..=10000).contains(&size.Width)
        || !(1..=10000).contains(&size.Height)
        || i64::from(size.Width) * i64::from(size.Height) > 16_777_216
    {
        return Err("Window bounds unavailable".into());
    }
    Ok((size.Width as u32, size.Height as u32))
}

fn context(hwnd: HWND, expected: Option<RECT>) -> Result<RECT, String> {
    unsafe {
        if !crate::collector::session_active() {
            return Err("Desktop session is inactive or locked".into());
        }
        if !IsWindow(Some(hwnd)).as_bool()
            || !IsWindowVisible(hwnd).as_bool()
            || IsIconic(hwnd).as_bool()
            || GetForegroundWindow() != hwnd
        {
            return Err("Capture foreground changed".into());
        }
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).map_err(|_| "Window bounds unavailable")?;
        if expected.is_some_and(|r| r != rect) {
            return Err("Capture foreground changed".into());
        }
        let mut affinity = 0;
        // Cross-process windows may not expose affinity. WGC still enforces their
        // protection; never retry those surfaces through desktop pixels.
        if GetWindowDisplayAffinity(hwnd, &mut affinity).is_ok() && affinity != WDA_NONE.0 {
            return Err("Window excludes capture".into());
        }
        Ok(rect)
    }
}

fn device() -> Result<(ID3D11Device, ID3D11DeviceContext, IDirect3DDevice), String> {
    for driver in [D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP] {
        let mut device = None;
        let mut context = None;
        let result = unsafe {
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
        if result.is_err() {
            continue;
        }
        let device = device.ok_or(PIXELS_UNAVAILABLE)?;
        let context = context.ok_or(PIXELS_UNAVAILABLE)?;
        let dxgi: IDXGIDevice = device.cast().map_err(|_| PIXELS_UNAVAILABLE)?;
        let runtime = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi) }
            .and_then(|d| d.cast())
            .map_err(|_| PIXELS_UNAVAILABLE)?;
        return Ok((device, context, runtime));
    }
    Err("Capture graphics device unavailable".into())
}

// Drivers can pad each BGRA row. Validate layout before accessing mapped memory.
fn pixel_layout(width: u32, height: u32, pitch: u32) -> Result<(usize, usize), String> {
    dimensions(SizeInt32 {
        Width: width as i32,
        Height: height as i32,
    })?;
    let row = width as usize * 4;
    if (pitch as usize) < row || pitch > 262144 {
        return Err(PIXELS_UNAVAILABLE.into());
    }
    Ok((row, (height as usize - 1) * pitch as usize + row))
}

fn read_frame(
    frame: &Frame,
    size: SizeInt32,
    device: &ID3D11Device,
    gpu: &ID3D11DeviceContext,
    hwnd: HWND,
    bounds: RECT,
    deadline: Instant,
) -> Result<image::RgbaImage, String> {
    let current = frame.0.ContentSize().map_err(|_| PIXELS_UNAVAILABLE)?;
    if current != size {
        return Err("Capture foreground changed".into());
    }
    let surface = frame.0.Surface().map_err(|_| PIXELS_UNAVAILABLE)?;
    let access: IDirect3DDxgiInterfaceAccess = surface.cast().map_err(|_| PIXELS_UNAVAILABLE)?;
    let texture: ID3D11Texture2D =
        unsafe { access.GetInterface() }.map_err(|_| PIXELS_UNAVAILABLE)?;
    let mut desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { texture.GetDesc(&mut desc) };
    let (width, height) = dimensions(size)?;
    if desc.Width != width || desc.Height != height || desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM {
        return Err(PIXELS_UNAVAILABLE.into());
    }
    desc.Usage = D3D11_USAGE_STAGING;
    desc.BindFlags = 0;
    desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
    desc.MiscFlags = 0;
    let mut staging = None;
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut staging)) }
        .map_err(|_| PIXELS_UNAVAILABLE)?;
    let staging = staging.ok_or(PIXELS_UNAVAILABLE)?;
    unsafe { gpu.CopyResource(&staging, &texture) };
    unsafe { gpu.Flush() };
    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    loop {
        context(hwnd, Some(bounds))?;
        if Instant::now() >= deadline {
            return Err("Window capture timed out".into());
        }
        match unsafe {
            gpu.Map(
                &staging,
                0,
                D3D11_MAP_READ,
                D3D11_MAP_FLAG_DO_NOT_WAIT.0 as u32,
                Some(&mut mapped),
            )
        } {
            Ok(()) => break,
            Err(e) if e.code() == DXGI_ERROR_WAS_STILL_DRAWING => {
                std::thread::sleep(Duration::from_millis(10))
            }
            Err(_) => return Err(PIXELS_UNAVAILABLE.into()),
        }
    }
    let result = (|| {
        let (row, length) = pixel_layout(width, height, mapped.RowPitch)?;
        if mapped.pData.is_null() {
            return Err(PIXELS_UNAVAILABLE.into());
        }
        // The staging texture is mapped, format/extent checked, and the driver
        // owns RowPitch bytes per row. Copy before Unmap or returning the frame.
        let bytes = unsafe { std::slice::from_raw_parts(mapped.pData.cast::<u8>(), length) };
        let mut rgba = Vec::with_capacity(row * height as usize);
        for y in 0..height as usize {
            for pixel in bytes[y * mapped.RowPitch as usize..][..row]
                .as_chunks::<4>()
                .0
            {
                rgba.extend_from_slice(&[pixel[2], pixel[1], pixel[0], 255]);
            }
        }
        image::RgbaImage::from_raw(width, height, rgba).ok_or_else(|| PIXELS_UNAVAILABLE.into())
    })();
    unsafe { gpu.Unmap(&staging, 0) };
    result
}

fn encode(image: image::RgbaImage) -> Result<String, String> {
    let scale = (1280.0 / f64::from(image.width().max(image.height()))).min(1.0);
    let resized = image::imageops::resize(
        &image,
        (f64::from(image.width()) * scale).max(1.0) as u32,
        (f64::from(image.height()) * scale).max(1.0) as u32,
        image::imageops::FilterType::Triangle,
    );
    let rgb = image::DynamicImage::ImageRgba8(resized).to_rgb8();
    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 65)
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|_| "Image encoding unavailable")?;
    if jpeg.len() > 300000 {
        return Err("Image exceeds the context budget".into());
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(jpeg))
}

pub(super) fn capture(id: u64) -> Result<String, String> {
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(|_| "Capture runtime unavailable")?;
    let _apartment = Apartment;
    let deadline = Instant::now() + TIMEOUT;
    let hwnd = HWND(id as usize as *mut _);
    let bounds = context(hwnd, None)?;
    if !GraphicsCaptureSession::IsSupported().unwrap_or(false) {
        return Err("Window capture is unsupported".into());
    }
    let factory = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
        .map_err(|_| "Window capture is unsupported")?;
    let item: GraphicsCaptureItem = unsafe { factory.CreateForWindow(hwnd) }
        .map_err(|e| capture_error(e, "Capture source lookup failed"))?;
    let size = item.Size().map_err(|_| "Window bounds unavailable")?;
    dimensions(size)?;
    let (device, gpu, runtime) = device()?;
    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        &runtime,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        1,
        size,
    )
    .map_err(|_| "Capture graphics device unavailable")?;
    let mut capture = CaptureResources {
        pool,
        session: None,
        token: None,
    };
    let (sender, receiver) = mpsc::sync_channel(1);
    capture.token = Some(
        capture
            .pool
            .FrameArrived(&TypedEventHandler::new(move |_, _| {
                let _ = sender.try_send(());
                Ok(())
            }))
            .map_err(|_| PIXELS_UNAVAILABLE)?,
    );
    capture.session = Some(
        capture
            .pool
            .CreateCaptureSession(&item)
            .map_err(|_| PIXELS_UNAVAILABLE)?,
    );
    let session = capture.session.as_ref().ok_or(PIXELS_UNAVAILABLE)?;
    // Older supported Windows versions lack this optional interface.
    let _ = session.SetIsCursorCaptureEnabled(false);
    session
        .StartCapture()
        .map_err(|e| capture_error(e, "Capture start failed"))?;
    let pixels = loop {
        context(hwnd, Some(bounds))?;
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .ok_or("Window capture timed out")?;
        match receiver.recv_timeout(remaining.min(Duration::from_millis(50))) {
            Ok(()) => {
                let frame = Frame(
                    capture
                        .pool
                        .TryGetNextFrame()
                        .map_err(|_| PIXELS_UNAVAILABLE)?,
                );
                break read_frame(&frame, size, &device, &gpu, hwnd, bounds, deadline)?;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(_) => return Err(PIXELS_UNAVAILABLE.into()),
        }
    };
    drop(capture);
    context(hwnd, Some(bounds))?;
    let image = encode(pixels)?;
    context(hwnd, Some(bounds))?;
    Ok(image)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capture_rejects_invalid_or_excessive_surfaces_and_row_layouts() {
        for (w, h) in [(0, 100), (-1, 100), (10001, 100), (8192, 8192)] {
            assert!(dimensions(SizeInt32 {
                Width: w,
                Height: h
            })
            .is_err());
        }
        assert_eq!(pixel_layout(3, 2, 16).unwrap(), (12, 28));
        assert!(pixel_layout(3, 2, 8).is_err());
        assert!(pixel_layout(3, 2, u32::MAX).is_err());
    }
    #[test]
    fn capture_encodes_a_bounded_decodable_jpeg() {
        let encoded = encode(image::RgbaImage::from_pixel(
            2560,
            1440,
            image::Rgba([10, 90, 180, 255]),
        ))
        .unwrap();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .unwrap();
        assert!(bytes.len() <= 300000);
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (1280, 720));
    }
}

#[cfg(test)]
mod native_tests;
