# Buddy AI, Tavily and tracking — 0.19.0

This implements the current Developer 2 scope on top of the 0.17.1 signing bridge and preserves the Goals / Today workflow. Long-term learning, autonomous external actions and generated research reports remain outside this release.

## Setup and consent

In Settings → AI and web connections, save a Nebius key and test the saved connection. Tavily is optional and has its own key and connection test. Keys remain in Windows Credential Manager; they are never included in the frontend bundle or repository. Provider connection status distinguishes a configured key from a successful connection test.

AI assistance, Today-goal context and conditional web research default to on for new preferences in production and demo. Previously saved opt-outs remain off. New goals are analyzed automatically after onboarding; recent chat messages and chosen attachments are sent when asking Buddy. These controls remain available in Settings. Disabling consent or changing the goal while a request is running discards its result. Legacy companion requests use the same policy. Activity tracking and screen sampling have separate permissions.

Ask Buddy opens the shared conversation directly. Import notes sends the reviewed draft after the global AI permission; it no longer requires a second sharing checkbox. Both paths keep the draft when a request fails.

## Goal Analyzer contract

Newly created/imported goals enter a durable local analysis queue. Jobs interrupted by a restart recover; existing pre-upgrade goals are not uploaded retroactively. Cached suggestions survive step acceptance. Retry is available after a failure, and reconnecting a provider resumes failed jobs. Manual Improve / Research remains optional.

`analyze_core_goal` accepts the existing `GoalAnalysisInput` from `src/core/analysis.tsx`; `onImprove` and `onResearch` are wired in the desktop app. It does not write goals. The existing title/step acceptance controls still perform explicit revision-checked updates.

1. Nebius classifies the goal as research, procedural, personal or ambiguous.
2. Personal and ambiguous goals cannot trigger Tavily. Research and procedural goals may produce a bounded query if external information is useful.
3. With web consent, Tavily performs advanced general search with at most five bounded snippets. Missing keys, invalid keys or network failures produce a visible research notice and allow unsourced planning to continue.
4. Nebius returns a title suggestion, 3–5 concrete steps, up to three grounded relevant resources and prerequisite warnings. Resource and warning URLs must exactly match returned search sources. Factual prerequisite warnings without a source are removed. Ambiguous goals may return clarification questions instead.
5. Duration and difficulty need exact evidence in the supplied goal description or retrieved snippets. Only a supported numeric duration range is displayed; single-value or unsupported duration is omitted and difficulty is unknown. This is a conservative guard, not a guarantee that every model interpretation is correct.

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
  activityMatch: { goalId: string | null; confidence: number; reason?: string };
}
```

Window/tab titles are bounded. Existing browser collection intentionally keeps domains rather than full URLs; paths and query parameters are not reconstructed or invented. Existing interval rules exclude idle, sleep, excluded applications and gaps, and prevent attribution across goal/window/tab changes.

Tracking consent and the user's tracking request are persisted. Switching focus restores that choice, while pausing remains effective across goal changes and application restarts. Collection failures appear as an error in Settings. History migrations preserve old cumulative totals without inventing historical segments.

Today selects a focus automatically. No manual focus timer is required in the UI; existing timer records and the legacy API remain intact. Pauses, opt-outs and No plan today are respected. A confident match can follow another open Today goal.

A conservative local matcher uses distinctive goal/unfinished-step terms in window or page titles, or an app explicitly marked Work for that goal. Default role presets alone do not establish relevance. Distraction rules, ties and insufficient evidence do not add progress. Confidence scores are rule weights, not calibrated model probabilities. `relevant_seconds` is authoritative for progress, summaries and coaching; `tracked_seconds` remains a separate observed total. New relevant totals start at zero rather than inventing relevance for old history.

Progress includes a local timestamped timeline of the latest 500 intervals with apps, page/window titles, available browser domains and relevance reasons. Aggregate totals remain available beyond that bounded timeline. Chat shares Today titles, steps, progress and relevant app totals when goal context is on; window/page titles, screenshots and profile stay out.

Completing a goal persists its outcome, stops attribution to it and emits `buddy://goal-completed` plus a `goal.completed` Buddy event with `{ goalId, completedAt, activeMinutes }`. Another open Today goal can become active; explicit tracking pause remains effective. The daily summary counts completed goals separately from completed steps and shows unfinished goals and relevant time. The evening offer can appear after every Today goal is finished.

## Midday help and coaching

Set Expected minutes in the active goal's chat context. At 1.5 times that estimate, relevant active time produces a measured overrun. An open goal older than three hours with fewer than ten relevant minutes today and no step completion in the last three hours can also receive help. Explicit overdue deadlines remain supported; no completion is inferred from elapsed time. Completed goals are suppressed.

During the midday window, an overdue or overrun goal can receive a single daily offer after startup delay. Accepting opens Buddy; it never changes or completes a goal. Existing quiet hours, working hours, DND, meetings/fullscreen suppression, dismissal cooldown and the shared three-per-day budget remain in force. The user can ask for help at any time. Buddy asks about an unclear blocker or proposes 1–3 next steps, with web research only when needed.

Observed activity is not proof of productive work. Persisted acceptance/rejection counts, completion rate and average completion elapsed time adjust cooldown conservatively between the configured minimum and four hours. Quiet hours and the shared three-per-day cap remain in force; this is rule-based adaptation, not long-term model learning.

Classifier, goal synthesis and chat validate their responses and allow one repair request for malformed/incomplete output. After that, user-facing guidance offers retry or clarification while preserving drafts. Technical diagnostics contain only operation, category, known HTTP status and failure type; provider bodies, user text and credentials are never logged.

## Voice

Import uses local Windows `System.Speech` recognizers. The UI lists installed languages and offers Russian, English or automatic/mixed recognition. An unavailable selected language is rejected before recording. Automatic recognition compares installed Russian and English phrase candidates, rejects confidence below 0.65 and removes overlapping competing transcriptions. Empty/noisy recognition produces a retry/paste fallback. Temporary WAV files are removed after processing; audio is not sent to Nebius or Tavily.

Mini chat uses Windows voice typing (Windows+H); Windows+Space switches the input language. Its network/offline behavior follows Windows settings and is separate from the local WAV importer. Transcripts remain editable before sending.

Both Russian and English speech packs are required to exercise local mixed-language recognition. This development computer currently exposes only `en-US`, so Russian audio quality needs validation on a computer with the Russian recognizer installed. Phrase-selection tests do not replace microphone/audio testing.

## Verification and release boundary

Run `npm test`, `npm run build`, `npm run test:release` and `cargo test --locked --manifest-path src-tauri/Cargo.toml`. Backend tests cover real HTTP request construction against isolated test servers, source/evidence filtering, revoked consent, persistent conversation, tracking attribution and stuck triggers. Browser QA uses mock IPC and an isolated history store, never the production database.

The source version is 0.20.0. An explicitly run live smoke test uses one synthetic goal and no production database: it verifies a title, 3–5 steps, grounded Tavily sources and a persisted Buddy chat reply. Native installation/update and microphone quality remain separate checks. A local installer does not become a GitHub update until its signed release assets are published.

References: [Tavily search API](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Nebius API documentation](https://api.tokenfactory.nebius.com/docs), [Microsoft speech recognition](https://learn.microsoft.com/en-us/windows/apps/develop/input/speech-recognition).


## Developer 1 integration

The 0.20.0 UX integration preserves automatic goal analysis and relevant progress. Separate cloud activity-matching consent enables Nebius attribution; otherwise the local matcher remains active. Cloud matches use bounded foreground titles and feed the same relevant-progress and activity-timeline storage. See [Daily UX and automatic matching](UX_ONBOARDING_GOALS_SETTINGS.md) for the sharing limits and controls.

Import `analyzeGoal`, `getGoalProgress`, `sendBuddyMessage`, `GoalAIResult`, `GoalProgress`, `ActivityMatch`, `BrowserActivity` and `GoalCompletedEvent` from `src/ai/contracts.ts`. IDs are strings at this boundary and validated positive integers at IPC. `analyzeGoal` reuses ready cached suggestions; progress returns relevant minutes and retained app/browser/document aggregates. `sendBuddyMessage(message, { goalId })` can select saved goal context without changing tracking. Goal mutation still needs explicit acceptance through revision-checked Core APIs.

Nebius structured output is configured both in `response_format` and in the system schema instruction, following the [official JSON guide](https://docs.tokenfactory.nebius.com/ai-models-inference/json). Models/endpoints have runtime defaults, while each computer keeps its own provider credentials. `DEMO_MODE` simulates activity; only `AI_MOCK` replaces provider responses.
