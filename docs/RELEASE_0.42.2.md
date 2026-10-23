# Desktop Buddy 0.42.2

## Stable desktop chat and conservative browser recognition

- Keep the Windows mascot and mini-chat visible when hover and click-through handling change. Explicitly opened chat receives keyboard focus; background reminders remain non-activating.
- Pause recognition progress during browser metadata gaps of at most six seconds from the first missing sample. Resume only after fresh matching window, title, browser, page-title and domain metadata; other contexts and longer gaps restart recognition.
- Keep unknown browser intervals unassigned. Discard previous goal matches, suggestions and page-text caches during gaps, and reject stale AI responses and in-flight text reads. Recognition timing never restores an old address or old page evidence.
- Keep the existing 30-second local and 60-second AI recognition gates, provider cooldowns, capture permissions and time aggregation.

The six-second bound is provisional, based on two sampling cycles. Synthetic regressions verify its behavior and safety boundaries; they do not establish an empirical optimum or a measured real-world tracking improvement.

Available for Windows x64 and Apple Silicon macOS 14.5 or later.
