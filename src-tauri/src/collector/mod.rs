use crate::models::ActivitySnapshot;
use chrono::Utc;
#[cfg(windows)]
mod windows;

pub trait ActivityCollector: Send {
    fn collect(&mut self) -> Result<ActivitySnapshot, String>;
}

#[derive(Default)]
pub struct DurationTracker {
    previous: Option<(String, String, std::time::Instant, std::time::Duration)>,
}
impl DurationTracker {
    pub fn update(&mut self, process: &str, title: &str, idle: u64) -> u64 {
        let now = std::time::Instant::now();
        let duration = self
            .previous
            .as_ref()
            .map(|(p, t, last, accumulated)| {
                let elapsed = now.duration_since(*last);
                if p == process
                    && t == title
                    && idle < 60
                    && elapsed <= std::time::Duration::from_secs(15)
                {
                    *accumulated + elapsed
                } else {
                    std::time::Duration::ZERO
                }
            })
            .unwrap_or_default();
        self.previous = Some((process.into(), title.into(), now, duration));
        duration.as_secs()
    }
}
pub fn process_basename(path: &str) -> String {
    path.rsplit(['\\', '/'])
        .next()
        .unwrap_or("Unknown")
        .to_string()
}
pub fn create(demo: bool) -> Box<dyn ActivityCollector> {
    if demo {
        return Box::new(DemoCollector { step: 0 });
    }
    #[cfg(windows)]
    {
        Box::new(windows::WindowsCollector::default())
    }
    #[cfg(not(windows))]
    {
        Box::new(UnsupportedCollector)
    }
}
#[cfg(not(windows))]
struct UnsupportedCollector;
#[cfg(not(windows))]
impl ActivityCollector for UnsupportedCollector {
    fn collect(&mut self) -> Result<ActivitySnapshot, String> {
        Err("Live activity collection requires Windows".into())
    }
}
struct DemoCollector {
    step: usize,
}
impl ActivityCollector for DemoCollector {
    fn collect(&mut self) -> Result<ActivitySnapshot, String> {
        let items = [
            ("POWERPNT.EXE", "Hackathon.pptx — PowerPoint", 600),
            ("chrome.exe", "Nebius Docs", 300),
            ("chrome.exe", "YouTube — Recommended videos", 420),
        ];
        let (process, title, seconds) = items[(self.step / 5).min(2)];
        self.step += 1;
        Ok(ActivitySnapshot {
            timestamp: Utc::now().to_rfc3339(),
            process_name: process.into(),
            window_title: title.into(),
            idle_seconds: 0,
            active_seconds: seconds,
        })
    }
}
/// Extension point. No screen capture is performed or persisted.
pub fn capture_screenshot_on_demand() -> Result<Vec<u8>, String> {
    Err("Screenshot capture is not implemented in this MVP".into())
}
/// Future UI Automation adapters should return only explicitly requested text.
#[allow(dead_code)]
pub trait AccessibleContext {
    fn foreground_context(&self) -> Result<String, String>;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_process_name() {
        assert_eq!(process_basename(r"C:\Program Files\App\app.exe"), "app.exe");
    }
    #[test]
    fn tracks_contiguous_active_duration() {
        let mut tracker = DurationTracker {
            previous: Some((
                "app".into(),
                "title".into(),
                std::time::Instant::now() - std::time::Duration::from_secs(3),
                std::time::Duration::from_secs(6),
            )),
        };
        assert_eq!(tracker.update("app", "title", 0), 9);
        assert_eq!(tracker.update("other", "title", 0), 0);
    }
    #[test]
    fn idle_resets_duration() {
        let mut tracker = DurationTracker {
            previous: Some((
                "app".into(),
                "title".into(),
                std::time::Instant::now(),
                std::time::Duration::from_secs(6),
            )),
        };
        assert_eq!(tracker.update("app", "title", 90), 0);
    }
}
