//! Physical screen geometry. Cards may move; the mascot rectangle is immutable.
use serde::Serialize;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
impl Rect {
    pub fn right(self) -> i64 {
        self.x as i64 + self.width as i64
    }
    pub fn bottom(self) -> i64 {
        self.y as i64 + self.height as i64
    }
    fn contains(self, other: Self) -> bool {
        other.x >= self.x
            && other.y >= self.y
            && other.right() <= self.right()
            && other.bottom() <= self.bottom()
    }
    fn intersects(self, other: Self) -> bool {
        (self.x as i64) < other.right()
            && (other.x as i64) < self.right()
            && (self.y as i64) < other.bottom()
            && (other.y as i64) < self.bottom()
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    Above,
    Left,
    Right,
    Below,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Placement {
    pub rect: Rect,
    pub side: Side,
}
/// Bounds include the fixed avatar canvas and action bar, not the transparent margins.
pub fn obstacle(mascot: Rect, scale: f64) -> Rect {
    let px = |n: f64| (n * scale).ceil() as u32;
    Rect {
        x: mascot.x + px(36.0) as i32,
        y: mascot.y + px(23.0) as i32,
        width: px(88.0),
        height: px(124.0),
    }
}
pub fn place(
    work: Rect,
    mascot: Rect,
    scale: f64,
    chat: bool,
    desired_height: u32,
    previous: Option<Side>,
) -> Option<Placement> {
    if !scale.is_finite() || scale <= 0.0 {
        return None;
    }
    let px = |n: f64| (n * scale).ceil() as u32;
    let gap = px(12.0) as i64;
    let min_w = px(if chat { 320.0 } else { 248.0 });
    let min_h = px(if chat { 260.0 } else { 140.0 });
    let preferred_w = px(if chat { 440.0 } else { 328.0 });
    let preferred_h = px(if chat {
        520.0
    } else {
        desired_height.clamp(140, 640) as f64
    });
    if !chat && preferred_h > work.height {
        return None;
    }
    let body = obstacle(mascot, scale);
    let candidate = |side: Side, adapt: bool| -> Option<Placement> {
        let mut width = preferred_w.min(work.width);
        let mut height = preferred_h.min(work.height);
        let available = match side {
            Side::Above => body.y as i64 - gap - work.y as i64,
            Side::Below => work.bottom() - body.bottom() - gap,
            Side::Left => body.x as i64 - gap - work.x as i64,
            Side::Right => work.right() - body.right() - gap,
        }
        .max(0) as u32;
        match side {
            Side::Above | Side::Below => {
                if adapt && chat {
                    height = height.min(available);
                } else if height > available {
                    return None;
                }
            }
            Side::Left | Side::Right => {
                if adapt {
                    width = width.min(available);
                } else if width > available {
                    return None;
                }
            }
        }
        if width < min_w || height < min_h {
            return None;
        }
        let centered_x = body.x as i64 + (body.width as i64 - width as i64) / 2;
        let centered_y = body.y as i64 + (body.height as i64 - height as i64) / 2;
        let x = match side {
            Side::Left => body.x as i64 - gap - width as i64,
            Side::Right => body.right() + gap,
            _ => centered_x.clamp(work.x as i64, work.right() - width as i64),
        };
        let y = match side {
            Side::Above => body.y as i64 - gap - height as i64,
            Side::Below => body.bottom() + gap,
            _ => centered_y.clamp(work.y as i64, work.bottom() - height as i64),
        };
        let rect = Rect {
            x: i32::try_from(x).ok()?,
            y: i32::try_from(y).ok()?,
            width,
            height,
        };
        (work.contains(rect) && !body.intersects(rect)).then_some(Placement { rect, side })
    };
    // Keep the current side while typing, even when internal scrolling becomes necessary.
    if let Some(side) = previous {
        if let Some(p) = candidate(side, true) {
            return Some(p);
        }
    }
    for adapt in [false, true] {
        for side in [Side::Above, Side::Left, Side::Right, Side::Below] {
            if let Some(p) = candidate(side, adapt) {
                return Some(p);
            }
        }
    }
    None
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cards_never_move_the_mascot_or_overlap_it_across_edges_scales_and_monitors() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            for (x, y, w, h) in [
                (0, 0, 1440, 900),
                (-1920, -200, 1920, 1080),
                (100, 100, 720, 600),
                (0, 0, 400, 300),
            ] {
                let work = Rect {
                    x,
                    y,
                    width: w,
                    height: h,
                };
                for dx in [0, w / 4, w / 2, w.saturating_sub((160.0 * scale) as u32)] {
                    for dy in [0, h / 4, h / 2, h.saturating_sub((152.0 * scale) as u32)] {
                        let mascot = Rect {
                            x: x + dx as i32,
                            y: y + dy as i32,
                            width: (160.0 * scale) as u32,
                            height: (152.0 * scale) as u32,
                        };
                        let original = mascot;
                        for chat in [false, true] {
                            for height in [140, 240, 320, 640] {
                                if let Some(p) = place(work, mascot, scale, chat, height, None) {
                                    assert!(work.contains(p.rect));
                                    assert!(!obstacle(mascot, scale).intersects(p.rect));
                                    assert_eq!(mascot, original);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    #[test]
    fn prefers_above_and_uses_other_sides_without_shifting_the_anchor() {
        let work = Rect {
            x: 0,
            y: 0,
            width: 1440,
            height: 900,
        };
        let mut m = Rect {
            x: 650,
            y: 730,
            width: 160,
            height: 152,
        };
        assert_eq!(
            place(work, m, 1.0, true, 320, None).unwrap().side,
            Side::Above
        );
        m.y = 0;
        assert_eq!(
            place(work, m, 1.0, true, 320, None).unwrap().side,
            Side::Left
        );
        m.x = 0;
        assert_eq!(
            place(work, m, 1.0, true, 320, None).unwrap().side,
            Side::Right
        );
        let narrow = Rect { width: 400, ..work };
        assert_eq!(
            place(narrow, m, 1.0, true, 320, None).unwrap().side,
            Side::Below
        );
    }
    #[test]
    fn content_growth_keeps_its_side_and_an_impossible_layout_uses_workspace_fallback() {
        let work = Rect {
            x: 0,
            y: 0,
            width: 800,
            height: 650,
        };
        let m = Rect {
            x: 320,
            y: 420,
            width: 160,
            height: 152,
        };
        let first = place(work, m, 1.0, true, 160, None).unwrap();
        let taller = place(work, m, 1.0, true, 640, Some(first.side)).unwrap();
        assert_eq!(first.side, taller.side);
        assert!(taller.rect.height < 640);
        // Reminder text and its actions must fit without an internal scrollbar.
        assert!(place(Rect { width: 400, ..work }, m, 1.0, false, 640, None).is_none());
        assert!(place(
            Rect {
                width: 200,
                height: 180,
                ..work
            },
            m,
            1.0,
            true,
            320,
            None
        )
        .is_none());
        assert!(place(work, m, f64::NAN, true, 320, None).is_none());
    }
}
