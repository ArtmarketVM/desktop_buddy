# Personal AI observation workflow

Implementation follows the approved product plan (revision 5). The interface and primary acceptance fixtures are English; explicit chat statements can be in other languages supported by the configured models.

## Observation and permissions

The existing foreground collector uses macOS Accessibility or Windows UI Automation for any application exposing those interfaces. There is no application allowlist. It cannot see closed tabs, hidden conversations or every change made in an application. Unavailable interface text is reported in Personal AI Engine. Short-lived result toasts can be missed between samples.

Tracking, AI assistance and on-screen task detection must be enabled. Excluded apps, recognized private windows, away/locked states and revoked permissions prevent disclosure. Quiet mode suppresses proactive bubbles; it does not turn off permitted observation. Tracking and companion pause stop observation.

Optional **Privacy → Use screenshots** is off by default and persists separately from OS permissions. Apple Silicon macOS uses ScreenCaptureKit for one desktop-independent window. Windows captures the active client area and rejects detected occlusion or incomplete window enumeration. macOS resolves the Accessibility identity to one unique capture window using owner, title and bounds. Fresh foreground metadata is checked around capture. Images are bounded to 1280 pixels on their longest side and 300 KB JPEG; at most one capture attempt per two minutes. Permitted images and bounded interface samples are retained encrypted until the corresponding Daily summary is successfully saved. Failed/missed summaries retain evidence across restart; explicit history deletion removes it. Capture remains conditional, so some activities have no screenshot. Secret/private detection is heuristic, not a guarantee. A transmitted image cannot be revoked from the provider; switching off prevents subsequent transmission and rejects stale responses. See [Daily activity review](DAILY_ACTIVITY_REVIEW.md) for key storage, limits and the atomic save/cleanup lifecycle.

The configured vision candidate is `nvidia/Nemotron-3.5-Super-VL`, overridable with `NEBIUS_VISION_MODEL_ID`. Account/API compatibility requires a real-provider check; a configured ID does not prove model availability. Vision descriptions improve activity understanding but do not qualify as verbatim completion receipts. Text remains usable if capture or the vision provider is unavailable.

## Shared loop and resource limits

Collector → measured interval and permitted encrypted review evidence → shared redacted sample → relevant Personal Memory/WorkContext → structured specialist proposal → Rust validation → authorized mutation → persisted result/Undo and Daily summary.

The existing AgentRuntime dispatches observation work and due daily reviews. Goal matching keeps its explicit-focus/local-rule/local-relevance/recent-context cascade, but selected goals and remembered app lanes require supporting context; generic unknown windows stay pending. Matching and completion share one Accessibility read for the same window/consent epoch for up to 60 seconds. A single existing provider mutex prevents simultaneous background jobs. Text checks use a 60-second cooldown and skip unchanged successful samples. Unlisted-work detection requires sustained observed use and uses its existing five-minute cooldown. Observation, vision, receipt verification and final review share a maximum of 24 attempted disclosures per rolling hour. Interactive chat is outside that budget. Quartz session state on macOS and the active input desktop on Windows block observation in locked/secure sessions; physical lock testing remains a platform acceptance item. Every cloud disclosure is guarded; new vision/receipt/review requests have local cancellation checks. No new event is enqueued just because memory was written.

Background goal/event checks read a lightweight current-work snapshot without rebuilding seven-day Progress charts. The UI retains its full analytics.

These are bounded policies, not measured battery or RAM guarantees. Native permissions, foreground races, long sessions and real provider latency require platform testing.

## Decisions and evidence

- A current result tied to an exact unfinished step can produce a completion proposal.
- **Automatically complete verified work** is a separate opt-in, off by default. Automatic completion requires confidence ≥0.95, a literal Accessibility receipt, an independent current-receipt/criterion check, and unchanged goal/plan/privacy/foreground state. It uses the existing Rust mutation path.
- Time, app names, a draft, a quote, old sent-folder history and a vision description alone are not completion evidence. Model confidence is a self-report, not a measured probability. The model can still misclassify evidence; Undo and user review remain important.
- Automatically finishing the final step does not silently complete a wider goal. A nonempty goal completion criterion requires its own result evidence.
- New work is never added automatically. Ongoing work offers **Add to Today / Skip / Chat**. An independently verified result offers **Add completed / Skip / Chat**. Today also retains the review while the app is running.
- Accepted work links to its observation event, preserves observed time and moves existing time intervals rather than duplicating them. Result receipts are deduplicated; raw screen quotes/images are not stored in the journal.
- Undo survives restart in Progress → Day → Work journal. A changed plan rejects stale Undo instead of overwriting subsequent edits. Reopening an accepted completed item preserves the user's recorded task.

## Personal knowledge

Explicit facts about main work, side projects, typical tasks and preferences live in existing Personal Memory. Direct, verbatim human self-statements can be saved through the shared dialogue path without a second confirmation. Screen text, attachments and assistant drafts cannot use that path. Explicit corrections can archive an exact prior personal-memory item; both old and current data remain inspectable. Memory settings also allow adding, editing, pinning and forgetting personal knowledge.

A repeated task pattern is inferred only from distinct user-confirmed outcomes across multiple days using existing memory evidence rules. New task patterns are archived for review, excluded from retrieval until the user chooses **Use this pattern**. Identity and employer are never inferred from a single message/signature. Existing maintenance preserves pinned facts and archives unsupported/stale inferences.

Memory OFF blocks new personal knowledge and provider retrieval; it does not erase independent activity history. Clear personal memory preserves goals and the work journal. Clear local history and retention cover the work journal as well as existing activity history.

## Grounded Progress and review

`work_events` stores minimal titles, app, timestamps, source, optional goal/step links, deduplication keys and reversible plan state. It is separate from raw window history and Personal Memory. Accepted observations are shown once, with their status and provenance. Daily continuity merges these facts with existing goal/step events, checkpoints, waiting states and next actions. It does not invent accomplishments or infer completion from elapsed time.

Personal AI Engine exposes interface-text capability, screenshot state, configured vision model, automatic-completion consent and the rolling observation budget. It shows operational events, not hidden chain-of-thought, API keys, raw prompts or images.

## Platform acceptance

Automated tests distinguish synthetic provider fixtures from live-provider/native permission checks. Before a shared release, validate both Windows x64 and Apple Silicon macOS 14.5+, reviewed visual changes, real-provider vision compatibility, capture OFF/ON revocation, foreground switching, excluded apps, DND, restart, Undo and multi-lane continuity. Never label a mocked test as a live screen-monitoring pass.

Vision API reference: [Nebius announcement and exact model ID](https://nebius.com/blog/posts/three-new-open-weight-models-from-us-companies-give-builders-more-choice).
