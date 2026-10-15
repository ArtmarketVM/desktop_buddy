# Desktop Buddy 0.31.1

Available for Windows x64 and Apple Silicon Macs running macOS 14.5 or later.

- Fixed chat planning that could read conversation history instead of carrying
  out a self-contained web-research request.
- The configured response model, Kimi K3 by default, now also plans explicit
  chat actions. Nemotron continues background work-state and completion analysis.
  Existing explicit model overrides remain supported.
- A separate structured authorization checks general search intent and query
  relevance before Tavily receives a query. Reading history alone never grants
  search permission; the existing web-research preference still applies.
- Failed answer verification no longer displays an internal history-read
  receipt as if it answered the user's question. Verified mutation and
  confirmation receipts are preserved.
- Added regression checks for search authorization, privacy controls and
  read-to-research continuation, plus an opt-in real-provider web-search check.

No database migration, credential-storage change or updater trust change.
This patch follows a real UI failure found during the 0.31.0 post-install audit;
the original 0.31.0 release assets are preserved.
