# Chat timeout investigation and desktop UI fixes

> Historical milestone / design record. This file describes its recorded source and may contain superseded UI, models, permissions or commands. For current behavior and diagrams, use the [documentation index](README.md) and [architecture](AI_ARCHITECTURE.md). Historical test results are not current live verification.


Date: 2026-10-20. Installed app inspected: 0.37.0. These changes have not been installed or published.

## Evidence

The sidebar showed an expired access check. This is not evidence that the saved key was removed or rejected. Connection tests check authentication/model access, not completion of the interactive generation pipeline.

The installed app's content-free runtime diagnostics showed successful background Nemotron requests. A manual synthetic inference health check passed in 504 ms. All nine isolated real-provider action checks passed (create goal, create steps, deletion preview, deletion confirmation, completion, rename, Park, Resume, and remaining work), in roughly 9–19 seconds each. The installed English synthetic create-goal dialogue case also passed in 19,106 ms. These checks used disposable synthetic state, not the user's failed message or goals.

The supplied screenshot reports a timeout/network error. The exact historical transport failure could not be reproduced or recovered from the available journal; the checks above do not prove its root cause or eliminate intermittent provider/network failures.

## Change

Default structured chat planning, mutation authorization, and answer review now give Kimi up to ten seconds. On timeout, network failure or server unavailability, they try the default primary Nemotron model once, with thinking disabled and exactly the same messages and JSON schema, for up to ten seconds. This fits within the existing 25-second review limit. Explicit model overrides retain their existing routing. Authentication, billing, quota, invalid JSON and request/configuration errors do not trigger this fallback.

Only model generation is retried on a different model; execution and confirmation are unchanged. Every proposal still goes through existing parsing, scope, authorization, ownership, revision and skill validation. An executed action is never repeated by this fallback. Ordinary prose generation keeps its existing behavior. This cannot recover an offline connection. No production prompt, credential implementation or privacy code was changed.

The mascot uses a consistent bottom anchor across native window sizes. Screen-edge clamping is compensated in the avatar's local offset so expanding the chat does not move it sideways. The compact header starts native dragging, moving the chat and mascot as one window; interactive controls remain clickable. Other UI changes add accessible sidebar connection refresh controls, hide the unused start-coaching section in ordinary chats while preserving active sessions, and use an envelope icon for Feedback.

## Verification scope

Tests cover anchor preservation at screen edges, negative monitor coordinates, scale factors, and dragging; native header drag dispatch; expired sidebar refresh; inactive/active coaching visibility; and bounded model fallback without replaying prompts on auth/quota/format errors. Native drag behavior and installation on macOS and Windows still require device verification. The chat was visually inspected in the browser at 440 × 660, including the gap above the mascot and the controls below it. An obsolete chat-only bottom/right CSS rule was removed after this inspection exposed its override. Browser preview does not establish native window dragging or installation behavior. No updated installation is claimed.

Verification completed: 232 frontend tests passed across 43 files; production build passed; the full locked Rust suite passed 576 tests with two existing ignored tests. After the final transport attempt-limit and fractional-scale adjustments, five planning/transport tests and the anchor regression passed again. Rust formatting and Git whitespace checks passed. Earlier attempts under severe host load hit unrelated frontend time limits; the final frontend run passed with one worker.

Suggested separate commit: `fix(desktop): stabilize mascot chat and AI connection recovery`. The preceding accuracy-check and coaching-history work is already committed as `7d9089e`; the desktop/timeout changes remain uncommitted for review.
