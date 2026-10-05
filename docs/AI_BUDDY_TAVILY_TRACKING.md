# Buddy AI, Tavily and tracking — 0.18.0

This implements the current Developer 2 scope on top of the 0.17.1 signing bridge and preserves the Goals / Today workflow. Long-term learning, autonomous external actions and generated research reports remain outside this release.

## Setup and consent

In Settings → AI and web connections, save a Nebius key and test the saved connection. Tavily is optional and has its own key and connection test. Keys remain in Windows Credential Manager; they are never included in the frontend bundle or repository. Provider connection status distinguishes a configured key from a successful connection test.

Enable Buddy AI assistance once to send explicit requests, recent chat messages and chosen attachments to Nebius. Separately enable selected-goal context and Tavily research if wanted. All three permissions default to off. Disabling consent or changing the goal while a request is running discards its result. Legacy companion requests use the same policy. Activity tracking and screen sampling have separate permissions.

Ask Buddy opens the shared conversation directly. Import notes sends the reviewed draft after the global AI permission; it no longer requires a second sharing checkbox. Both paths keep the draft when a request fails.

## Goal Analyzer contract

`analyze_core_goal` accepts the existing `GoalAnalysisInput` from `src/core/analysis.tsx`; `onImprove` and `onResearch` are wired in the desktop app. It does not write goals. The existing title/step acceptance controls still perform explicit revision-checked updates.

1. Nebius classifies the goal as research, procedural, personal or ambiguous.
2. Personal and ambiguous goals cannot trigger Tavily. Research and procedural goals may produce a bounded query if external information is useful.
3. With web consent, Tavily performs advanced general search with at most five bounded snippets. Missing keys, invalid keys or network failures produce a visible research notice and allow unsourced planning to continue.
4. Nebius returns an improved title, concrete steps, relevant resources and prerequisite warnings. Resource and warning URLs must exactly match returned search sources. Factual prerequisite warnings without a source are removed. Ambiguous goals may return clarification questions instead.
5. Duration and difficulty need exact evidence in the supplied goal description or retrieved snippets. Unsupported duration is omitted and difficulty is unknown. This is a conservative guard, not a guarantee that every model interpretation is correct.

Previously opened resources are stored per goal, supplied as exclusions to the model, and filtered from recommendations. Their snippets may still support prerequisites. Search results and attachments are untrusted data. Provider refusals, malformed responses and truncated responses fail safely without echoing the provider body.

## Conversation and attachments

One locally persisted SQLite conversation is shared across goals, including requests with no active goal. Retention is capped at the newest 100 messages (complete user/assistant turns), and the latest 12 messages are sent as conversation context. History survives closing Buddy and restarting the application. The user can clear it explicitly; general history retention also applies.

User messages appear on the right and Buddy messages on the left. The conversation scrolls independently of the composer. Ctrl+Enter sends, Enter inserts a newline, and IME composition does not submit. An in-flight guard prevents duplicate sends. Local tasks and the saved-for-later inbox remain available without AI.

The attachment entry point reads text, Markdown and text PDFs locally. Attachment content is sent only when the user sends the message. Images and scanned PDFs direct the user to the existing reviewed vision import. Links open only through explicit user actions. No emails, files outside the chosen attachment, screen contents or profile are automatically added to chat.

## Activity contract and time

`get_activity_segments(goalId?)` returns up to 500 recent segments:

```ts
ActivitySegment {
  goalId: string;
  app: string;
  title: string | null;
  domain: string | null;
  url: null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  state: string;
}
```

Window/tab titles are bounded. Existing browser collection intentionally keeps domains rather than full URLs; paths and query parameters are not reconstructed or invented. Existing interval rules exclude idle, sleep, excluded applications and gaps, and prevent attribution across goal/window/tab changes.

Tracking consent and the user's tracking request are persisted. Switching focus restores that choice, while pausing remains effective across goal changes and application restarts. Collection failures appear as an error in Settings. History migrations preserve old cumulative totals without inventing historical segments.

The Core snapshot exposes `tracked_seconds` for observed activity separately from `focused_seconds`/timer seconds. Progress displays minutes and hours without adding the overlapping measurements together. Chat receives only aggregate totals if goal-context sharing is enabled, not the underlying window titles.

## Midday help and coaching

Set Expected minutes in the active goal's chat context. At 1.5 times that estimate, observed active time produces a measurable overrun. A past explicit deadline is the other automatic stuck trigger; goals with no estimate/deadline do not receive invented lateness judgments. Completed goals are suppressed.

During the midday window, an overdue or overrun goal can receive a single daily offer after startup delay. Accepting opens Buddy; it never changes or completes a goal. Existing quiet hours, working hours, DND, meetings/fullscreen suppression, dismissal cooldown and the shared three-per-day budget remain in force. The user can ask for help at any time. Buddy asks about an unclear blocker or proposes 1–3 next steps, with web research only when needed.

Observed foreground activity is not proof of productive work. Coaching explicitly distinguishes it from the timer and user expectations; it does not implement long-term learning.

## Voice

Import uses local Windows `System.Speech` recognizers. The UI lists installed languages and offers Russian, English or automatic/mixed recognition. An unavailable selected language is rejected before recording. Automatic recognition compares installed Russian and English phrase candidates, rejects confidence below 0.65 and removes overlapping competing transcriptions. Empty/noisy recognition produces a retry/paste fallback. Temporary WAV files are removed after processing; audio is not sent to Nebius or Tavily.

Mini chat uses Windows voice typing (Windows+H); Windows+Space switches the input language. Its network/offline behavior follows Windows settings and is separate from the local WAV importer. Transcripts remain editable before sending.

Both Russian and English speech packs are required to exercise local mixed-language recognition. This development computer currently exposes only `en-US`, so Russian audio quality needs validation on a computer with the Russian recognizer installed. Phrase-selection tests do not replace microphone/audio testing.

## Verification and release boundary

Run `npm test`, `npm run build`, `npm run test:release` and `cargo test --locked --manifest-path src-tauri/Cargo.toml`. Backend tests cover real HTTP request construction against isolated test servers, source/evidence filtering, revoked consent, persistent conversation, tracking attribution and stuck triggers. Browser QA uses mock IPC and an isolated history store, never the production database.

Live Nebius/Tavily responses, microphone quality and the installed native UI require a separate smoke check with configured providers and suitable speech packs. The source version is 0.18.0 because this adds features. Existing published update manifests remain at 0.17.1 until a new installer is built, signed and published; do not replace that delivered version.

References: [Tavily search API](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Nebius API documentation](https://api.tokenfactory.nebius.com/docs), [Microsoft speech recognition](https://learn.microsoft.com/en-us/windows/apps/develop/input/speech-recognition).
