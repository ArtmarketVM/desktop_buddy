//! Platform-independent capture geometry and frame checks shared by the native adapters.
//! Keeping these pure lets every platform's test suite verify the occlusion and crop policy.
#![cfg_attr(
    not(windows),
    allow(
        dead_code,
        reason = "only the Windows adapter captures raw frames; every platform runs the tests"
    )
)]

/// Screen-space rectangle in physical pixels; `right`/`bottom` are exclusive.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct Rect {
    pub(crate) left: i32,
    pub(crate) top: i32,
    pub(crate) right: i32,
    pub(crate) bottom: i32,
}
impl Rect {
    pub(crate) const fn new(left: i32, top: i32, right: i32, bottom: i32) -> Self {
        Self {
            left,
            top,
            right,
            bottom,
        }
    }
    pub(crate) fn width(&self) -> i32 {
        self.right.saturating_sub(self.left)
    }
    pub(crate) fn height(&self) -> i32 {
        self.bottom.saturating_sub(self.top)
    }
    pub(crate) fn is_empty(&self) -> bool {
        self.width() <= 0 || self.height() <= 0
    }
    /// True when the two rectangles share at least one pixel.
    pub(crate) fn intersects(&self, other: &Rect) -> bool {
        !self.is_empty()
            && !other.is_empty()
            && self.left < other.right
            && self.right > other.left
            && self.top < other.bottom
            && self.bottom > other.top
    }
    pub(crate) fn contains(&self, other: &Rect) -> bool {
        !other.is_empty()
            && other.left >= self.left
            && other.top >= self.top
            && other.right <= self.right
            && other.bottom <= self.bottom
    }
}

/// A top-level window that sits above the target on the guarded screen-copy fallback path.
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct Candidate {
    pub(crate) visible: bool,
    pub(crate) minimized: bool,
    /// DWM-cloaked windows (suspended store apps, other virtual desktops) draw no pixels.
    pub(crate) cloaked: bool,
    /// sumi's own always-on-top windows are not another application's content.
    pub(crate) own_process: bool,
    pub(crate) rect: Rect,
}

/// True when a window above the target could contribute another application's pixels to a
/// screen copy of `target`. Transparent regions are not detectable, so any overlap counts.
pub(crate) fn occludes(candidate: &Candidate, target: &Rect) -> bool {
    candidate.visible
        && !candidate.minimized
        && !candidate.cloaked
        && !candidate.own_process
        && candidate.rect.intersects(target)
}

/// Client-area crop inside a captured window frame of `frame_width`×`frame_height` pixels.
/// Only applies when the frame maps 1:1 onto `window` (within `tolerance` pixels) and the
/// client area lies fully inside it; otherwise the whole frame is kept.
pub(crate) fn client_crop(
    frame_width: i32,
    frame_height: i32,
    window: &Rect,
    client: &Rect,
    tolerance: i32,
) -> Option<Rect> {
    if frame_width <= 0
        || frame_height <= 0
        || (frame_width - window.width()).abs() > tolerance
        || (frame_height - window.height()).abs() > tolerance
    {
        return None;
    }
    let crop = Rect::new(
        client.left - window.left,
        client.top - window.top,
        client.right - window.left,
        client.bottom - window.top,
    );
    Rect::new(0, 0, frame_width, frame_height)
        .contains(&crop)
        .then_some(crop)
}

/// Output dimensions bounded to `max_edge` on the longest side, never upscaled.
pub(crate) fn scaled_size(width: u32, height: u32, max_edge: u32) -> (u32, u32) {
    let longest = width.max(height);
    if longest <= max_edge || longest == 0 {
        return (width.max(1), height.max(1));
    }
    let scale = f64::from(max_edge) / f64::from(longest);
    (
        ((f64::from(width) * scale).round() as u32).max(1),
        ((f64::from(height) * scale).round() as u32).max(1),
    )
}

/// True when every pixel equals the first one, i.e. the frame carries no content.
pub(crate) fn uniform(pixels: &[u8], bytes_per_pixel: usize) -> bool {
    if bytes_per_pixel == 0 || pixels.len() < bytes_per_pixel {
        return true;
    }
    let first = &pixels[..bytes_per_pixel];
    pixels.chunks_exact(bytes_per_pixel).all(|p| p == first)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn candidate(rect: Rect) -> Candidate {
        Candidate {
            visible: true,
            minimized: false,
            cloaked: false,
            own_process: false,
            rect,
        }
    }
    #[test]
    fn overlapping_third_party_windows_block_the_guarded_screen_copy() {
        let target = Rect::new(100, 100, 900, 700);
        // A floating meeting panel partially over the client area.
        assert!(occludes(
            &candidate(Rect::new(800, 600, 1100, 800)),
            &target
        ));
        // A window that only touches the edge shares no pixel.
        assert!(!occludes(
            &candidate(Rect::new(900, 100, 1200, 700)),
            &target
        ));
        assert!(!occludes(&candidate(Rect::new(0, 0, 100, 100)), &target));
        // Zero-area and far-away windows never block.
        assert!(!occludes(
            &candidate(Rect::new(300, 300, 300, 500)),
            &target
        ));
        assert!(!occludes(
            &candidate(Rect::new(2000, 100, 2400, 700)),
            &target
        ));
    }
    #[test]
    fn own_cloaked_hidden_and_minimized_windows_do_not_block() {
        let target = Rect::new(100, 100, 900, 700);
        let over = Rect::new(700, 500, 1000, 900);
        assert!(occludes(&candidate(over), &target));
        assert!(!occludes(
            &Candidate {
                own_process: true,
                ..candidate(over)
            },
            &target
        ));
        assert!(!occludes(
            &Candidate {
                cloaked: true,
                ..candidate(over)
            },
            &target
        ));
        assert!(!occludes(
            &Candidate {
                visible: false,
                ..candidate(over)
            },
            &target
        ));
        assert!(!occludes(
            &Candidate {
                minimized: true,
                ..candidate(over)
            },
            &target
        ));
    }
    #[test]
    fn client_crop_applies_only_to_frames_matching_the_window_rectangle() {
        let window = Rect::new(100, 50, 1100, 850);
        let client = Rect::new(108, 81, 1092, 842);
        assert_eq!(
            client_crop(1000, 800, &window, &client, 2),
            Some(Rect::new(8, 31, 992, 792))
        );
        assert_eq!(
            client_crop(1001, 799, &window, &client, 2),
            Some(Rect::new(8, 31, 992, 792))
        );
        // A frame of another size (DPI mismatch or resize) keeps the whole frame.
        assert_eq!(client_crop(2000, 1600, &window, &client, 2), None);
        assert_eq!(client_crop(0, 800, &window, &client, 2), None);
        // A client rectangle outside the frame is never trusted.
        let outside = Rect::new(90, 81, 1092, 842);
        assert_eq!(client_crop(1000, 800, &window, &outside, 2), None);
        // Borderless windows map the client area onto the entire frame.
        assert_eq!(
            client_crop(1000, 800, &window, &window, 0),
            Some(Rect::new(0, 0, 1000, 800))
        );
    }
    #[test]
    fn output_size_is_bounded_without_upscaling() {
        assert_eq!(scaled_size(640, 480, 1280), (640, 480));
        assert_eq!(scaled_size(2560, 1440, 1280), (1280, 720));
        assert_eq!(scaled_size(1000, 3000, 1280), (427, 1280));
        assert_eq!(scaled_size(0, 0, 1280), (1, 1));
    }
    #[test]
    fn uniform_frames_are_detected() {
        assert!(uniform(&[0, 0, 0, 0, 0, 0], 3));
        assert!(uniform(&[9, 8, 7, 9, 8, 7, 9, 8, 7], 3));
        assert!(!uniform(&[9, 8, 7, 9, 8, 6], 3));
        assert!(uniform(&[], 3));
        assert!(uniform(&[1, 2], 3));
    }
}
